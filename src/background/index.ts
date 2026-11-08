import { addActivity, getTodaySummary, refreshStreaks } from '../storage/activityService';
import { RuntimeMessage } from '../types';

/**
 * バックグラウンド Service Worker
 * メッセージ受信によるアクティビティ保存、バッジ更新、日次アラームを管理
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

// 拡張機能インストール・更新時の初期化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[v-activity-lawn] Extension installed/updated.');
  // 60分ごとの定期日次メンテナンスアラームを設定
  chrome.alarms.create('DAILY_MAINTENANCE_ALARM', {
    periodInMinutes: 60,
  });
  updateBadge();
});

// 定期アラームの受信
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'DAILY_MAINTENANCE_ALARM') {
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

    // 非同期応答のため true を返却
    return true;
  }
});
