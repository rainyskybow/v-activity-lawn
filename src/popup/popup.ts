import { getTodaySummary, getStreakRecord, getDailySummariesMap } from '../storage/activityService';
import { getSettings } from '../storage/settingsService';
import { renderLawnSvg } from '../components/lawnGraph';
import { generatePast53WeeksGrid, formatDateString } from '../utils/dateUtils';

const LEVEL_NAMES: Record<number, string> = {
  0: 'Level 0 (オフ日)',
  1: 'Level 1 (軽微な交流)',
  2: 'Level 2 (まとまった活動)',
  3: 'Level 3 (活発な活動)',
  4: 'Level 4 (超高負荷稼働)',
};

async function initPopup() {
  const settings = await getSettings();
  if (settings.darkMode) {
    document.documentElement.classList.add('dark');
  }

  // 本日サマリーの取得と反映
  const todaySummary = await getTodaySummary();
  const todayScoreEl = document.getElementById('today-score');
  const todayLevelBadgeEl = document.getElementById('today-level-badge');

  if (todayScoreEl) {
    todayScoreEl.textContent = `${todaySummary.totalScore}`;
  }

  if (todayLevelBadgeEl) {
    todayLevelBadgeEl.textContent = LEVEL_NAMES[todaySummary.level] || 'Level 0';
    if (todaySummary.level >= 3) {
      todayLevelBadgeEl.className = 'px-2.5 py-1 text-xs font-bold rounded-md bg-green-600 text-white';
    } else if (todaySummary.level >= 1) {
      todayLevelBadgeEl.className = 'px-2.5 py-1 text-xs font-bold rounded-md bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
  }

  // ストリーク情報の反映
  const streak = await getStreakRecord();
  const streakBadge = document.getElementById('streak-badge');
  if (streakBadge) {
    streakBadge.textContent = `継続 ${streak.currentStreakDays} 日`;
  }

  // 内訳カウンターの反映
  const b = todaySummary.breakdown;
  const countVideosEl = document.getElementById('count-videos');
  const countStreamsEl = document.getElementById('count-streams');
  const countShortsEl = document.getElementById('count-shorts');
  const countTweetsEl = document.getElementById('count-tweets');
  const countRepliesEl = document.getElementById('count-replies');
  const countHeartsEl = document.getElementById('count-hearts');

  if (countVideosEl) countVideosEl.textContent = `${b.videoPublishCount} 本`;
  if (countStreamsEl) countStreamsEl.textContent = `${b.streamCount} 回${b.streamDurationTotalMinutes > 0 ? ` (${b.streamDurationTotalMinutes}分)` : ''}`;
  if (countShortsEl) countShortsEl.textContent = `${b.shortsPublishCount} 本`;
  if (countTweetsEl) countTweetsEl.textContent = `${b.tweetPostCount + b.tweetRetweetCount} 件`;
  if (countRepliesEl) countRepliesEl.textContent = `${b.commentReplyCount + b.tweetReplyCount} 件`;
  if (countHeartsEl) countHeartsEl.textContent = `${b.creatorHeartCount + b.tweetLikeCount} 件`;

  // 直近4週間のミニ草描画
  const miniContainer = document.getElementById('mini-lawn-container');
  if (miniContainer) {
    const allDates = generatePast53WeeksGrid(formatDateString(), settings.weekStartDay);
    const recent28Dates = allDates.slice(-(4 * 7));
    const summariesMap = await getDailySummariesMap(recent28Dates);

    renderLawnSvg(miniContainer, {
      summariesMap,
      themeColor: settings.themeColor,
      darkMode: settings.darkMode,
      weekStartDay: settings.weekStartDay,
      filter: 'all',
      weeksCount: 4,
    });
  }

  // ダッシュボードを開くボタン
  const dashboardBtn = document.getElementById('btn-open-dashboard');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
      const dashboardUrl = chrome.runtime.getURL('src/dashboard/index.html');
      chrome.tabs.create({ url: dashboardUrl });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initPopup().catch((err) => console.error('[v-activity-lawn] Popup init error:', err));
});
