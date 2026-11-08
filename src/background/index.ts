import { addActivity, bulkImportActivities, getTodaySummary, refreshStreaks } from '../storage/activityService';
import { getSettings } from '../storage/settingsService';
import { fetchYouTubeChannelRss } from '../sync/youtubeRss';
import { RuntimeMessage, ActivityRecord } from '../types';
import { formatDateString } from '../utils/dateUtils';
import { calculateBaseScore } from '../score/scoringEngine';

/**
 * バックグラウンド Service Worker
 * メッセージ受信によるアクティビティ保存、バッジ更新、YouTube RSS定期自動同期を管理
 */

/**
 * アイコンのバッジテキストを更新する
 */
async function updateBadge() {
  try {
    const todaySummary = await getTodaySummary();
    const score = todaySummary.totalScore;
    if (score > 0) {
      chrome.action.setBadgeText({ text: `${Math.round(score)}` });
      chrome.action.setBadgeBackgroundColor({ color: '#216e39' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.warn('[v-activity-lawn] Failed to update badge:', err);
  }
}

/**
 * YouTube公開RSSフィードのバックグラウンド自動同期処理
 */
async function syncYouTubeRssInBackground() {
  try {
    const settings = await getSettings();
    if (!settings.youtubeChannelId) return;

    console.log('[v-activity-lawn] Background RSS sync started for channel:', settings.youtubeChannelId);
    const records = await fetchYouTubeChannelRss(settings.youtubeChannelId);
    if (records.length > 0) {
      const count = await bulkImportActivities(records);
      console.log(`[v-activity-lawn] Background RSS sync completed: ${count} activities updated.`);
    }
  } catch (err) {
    console.warn('[v-activity-lawn] Background RSS sync failed:', err);
  }
}

// 拡張機能インストール・更新時の初期化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[v-activity-lawn] Extension installed/updated.');
  // 60分ごとの定期日次メンテナンスおよびRSS自動取得アラームを設定
  chrome.alarms.create('DAILY_MAINTENANCE_ALARM', {
    periodInMinutes: 60,
  });
  updateBadge();
  syncYouTubeRssInBackground();
});

// 定期アラームの受信
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'DAILY_MAINTENANCE_ALARM') {
    await syncYouTubeRssInBackground();
    await refreshStreaks();
    await updateBadge();
  }
});

// コンテンツスクリプトやUIからのメッセージ受信
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === 'RECORD_ACTIVITY') {
    (async () => {
      try {
        const record = await addActivity({
          platform: message.platform,
          actionType: message.actionType,
          targetId: message.targetId,
          title: message.title,
          durationMinutes: message.durationMinutes,
          timestamp: message.timestamp,
        });

        await updateBadge();
        sendResponse({ success: true, record });
      } catch (err) {
        console.error('[v-activity-lawn] Failed to record activity:', err);
        sendResponse({ success: false, error: String(err) });
      }
    })();
    return true;
  }

  // スクロール時などのパッシブ一括アクティビティ記録
  if (message.type === 'RECORD_BULK_ACTIVITIES') {
    (async () => {
      try {
        if (!message.items || !Array.isArray(message.items) || message.items.length === 0) {
          sendResponse({ success: true, count: 0 });
          return;
        }

        const settings = await getSettings();
        const records: ActivityRecord[] = message.items.map((item) => {
          const rawTs = Number(item.timestamp);
          const safeTs = !isNaN(rawTs) && rawTs > 0 ? rawTs : Date.now();
          const score = calculateBaseScore(item.actionType, item.durationMinutes, settings.customWeights);
          const dateString = formatDateString(safeTs);
          const targetId = item.targetId || `bulk-${safeTs}-${Math.random().toString(36).substring(2, 7)}`;

          return {
            id: `${item.platform}-${targetId}`,
            platform: item.platform,
            actionType: item.actionType,
            targetId,
            title: item.title || '',
            durationMinutes: item.durationMinutes,
            score: isNaN(score) ? 0 : score,
            timestamp: safeTs,
            dateString,
          };
        });

        const count = await bulkImportActivities(records);
        await updateBadge();
        sendResponse({ success: true, count });
      } catch (err) {
        const errorDetail = err instanceof Error ? (err.stack || err.message) : (typeof err === 'object' ? JSON.stringify(err) : String(err));
        console.error('[v-activity-lawn] Failed to record bulk activities:', errorDetail);
        sendResponse({ success: false, error: errorDetail });
      }
    })();
    return true;
  }
});
