import {
  getDailySummariesMap,
  getStreakRecord,
  getOverallStats,
  getActivitiesByDate,
  bulkImportActivities,
  getAvailableYears,
  cleanInvalidTestActivities,
} from '../storage/activityService';
import { getSettings, updateSettings } from '../storage/settingsService';
import { renderLawnSvg, COLOR_PALETTES } from '../components/lawnGraph';
import { renderTimeline } from '../components/timeline';
import { exportShareCardImage } from '../components/shareCard';
import { fetchYouTubeChannelRss } from '../sync/youtubeRss';
import { parseUploadedYouTubeArchive } from '../sync/youtubeArchive';
import { parseUploadedXArchive } from '../sync/xArchive';
import { generatePast53WeeksGrid, generateYearGrid, formatDateString } from '../utils/dateUtils';
import { ThemeColorName, ViewFilterType, DailySummary } from '../types';

let currentFilter: ViewFilterType = 'all';
let currentTheme: ThemeColorName = 'green';
let isDarkMode = false;
let currentWeekStartDay: 0 | 1 = 0;
let annualSummariesMap = new Map<string, DailySummary>();
let availableYears: number[] = [];
let selectedYear: number | 'recent' = 'recent';
let currentGridDates: string[] = [];

/**
 * 現在の選択状態（直近1年または特定年）に応じた53週グリッド日付配列を取得する
 */
function getDatesForCurrentSelection(): string[] {
  if (selectedYear === 'recent') {
    return generatePast53WeeksGrid(formatDateString(), currentWeekStartDay);
  }
  return generateYearGrid(selectedYear, currentWeekStartDay);
}

/**
 * 前年・翌年送りボタンの活性／非活性状態を更新する
 */
function updatePrevNextButtons() {
  const btnPrev = document.getElementById('btn-prev-year') as HTMLButtonElement | null;
  const btnNext = document.getElementById('btn-next-year') as HTMLButtonElement | null;

  const currentYearNum = selectedYear === 'recent'
    ? new Date().getFullYear()
    : selectedYear;

  const oldestYear = availableYears.length > 0
    ? availableYears[availableYears.length - 1]
    : currentYearNum - 1;

  const newestYear = availableYears.length > 0
    ? availableYears[0]
    : currentYearNum;

  if (btnPrev) {
    btnPrev.disabled = currentYearNum <= oldestYear;
    btnPrev.classList.toggle('opacity-40', currentYearNum <= oldestYear);
    btnPrev.classList.toggle('cursor-not-allowed', currentYearNum <= oldestYear);
  }

  if (btnNext) {
    btnNext.disabled = selectedYear === 'recent' || currentYearNum >= newestYear;
    btnNext.classList.toggle('opacity-40', selectedYear === 'recent' || currentYearNum >= newestYear);
    btnNext.classList.toggle('cursor-not-allowed', selectedYear === 'recent' || currentYearNum >= newestYear);
  }
}

/**
 * GitHub風 年度選択ボタン群を動的生成・更新する
 */
function renderYearSelector() {
  const container = document.getElementById('year-selector-container');
  if (!container) return;
  container.innerHTML = '';

  // 1. 「直近1年」ボタン
  const recentBtn = document.createElement('button');
  recentBtn.className = `year-btn px-2.5 py-1 rounded-md text-xs font-semibold transition ${
    selectedYear === 'recent'
      ? 'bg-green-600 text-white shadow-sm'
      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750'
  }`;
  recentBtn.textContent = '直近1年間';
  recentBtn.addEventListener('click', async () => {
    if (selectedYear === 'recent') return;
    selectedYear = 'recent';
    await updateYearView();
  });
  container.appendChild(recentBtn);

  // 2. 各年度ボタン (2026年, 2025年, 2024年...)
  for (const year of availableYears) {
    const btn = document.createElement('button');
    btn.className = `year-btn px-2.5 py-1 rounded-md text-xs font-semibold transition ${
      selectedYear === year
        ? 'bg-green-600 text-white shadow-sm'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750'
    }`;
    btn.textContent = `${year}年`;
    btn.addEventListener('click', async () => {
      if (selectedYear === year) return;
      selectedYear = year;
      await updateYearView();
    });
    container.appendChild(btn);
  }

  updatePrevNextButtons();
}

/**
 * 選択年度に応じた草グラフおよび統計サマリーの再集計と描画
 */
async function updateYearView() {
  const labelSelectedYear = document.getElementById('label-selected-year');
  if (labelSelectedYear) {
    labelSelectedYear.textContent = selectedYear === 'recent' ? '直近1年間' : `${selectedYear}年`;
  }

  // グリッド配列の生成
  currentGridDates = getDatesForCurrentSelection();

  // 選択期間のサマリーマップを取得
  annualSummariesMap = await getDailySummariesMap(currentGridDates);

  // 統計サマリー更新
  const stats = await getOverallStats(currentGridDates);
  const streak = await getStreakRecord();

  const statTotalScore = document.getElementById('stat-total-score');
  const statCurrentStreak = document.getElementById('stat-current-streak');
  const statStreamHours = document.getElementById('stat-stream-hours');
  const statVideoCount = document.getElementById('stat-video-count');

  if (statTotalScore) statTotalScore.textContent = `${Math.round(stats.totalScore)}`;
  if (statCurrentStreak) statCurrentStreak.textContent = `${streak.currentStreakDays}`;
  if (statStreamHours) statStreamHours.textContent = `${Math.round((stats.totalStreamMinutes / 60) * 10) / 10}`;
  if (statVideoCount) statVideoCount.textContent = `${stats.totalVideos + stats.totalShorts}`;

  renderYearSelector();
  renderGraph();
}

async function loadData() {
  // 誤登録されたテスト配信の安全なクリーンアップ
  try {
    await cleanInvalidTestActivities();
  } catch {}

  const settings = await getSettings();
  currentTheme = settings.themeColor;
  isDarkMode = settings.darkMode;
  currentWeekStartDay = settings.weekStartDay;

  if (isDarkMode) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  const selectTheme = document.getElementById('select-theme') as HTMLSelectElement | null;
  if (selectTheme) {
    selectTheme.value = currentTheme;
  }

  const inputChannelId = document.getElementById('input-channel-id') as HTMLInputElement | null;
  if (inputChannelId && settings.youtubeChannelId) {
    inputChannelId.value = settings.youtubeChannelId;
  }

  availableYears = await getAvailableYears();
  await updateYearView();
  renderLegend();
}

function renderGraph() {
  const container = document.getElementById('annual-lawn-container');
  if (!container) return;

  renderLawnSvg(container, {
    summariesMap: annualSummariesMap,
    themeColor: currentTheme,
    darkMode: isDarkMode,
    weekStartDay: currentWeekStartDay,
    filter: currentFilter,
    dates: currentGridDates,
    weeksCount: 53,
    onCellClick: async (date, summary) => {
      await showTimeline(date, summary);
    },
  });
}

function renderLegend() {
  const legendContainer = document.getElementById('legend-levels');
  if (!legendContainer) return;
  legendContainer.innerHTML = '';

  const palette = COLOR_PALETTES[currentTheme] || COLOR_PALETTES.green;
  const colors = isDarkMode ? palette.dark : palette.light;

  for (let lvl = 0; lvl <= 4; lvl++) {
    const box = document.createElement('span');
    box.className = 'inline-block w-2.5 h-2.5 rounded-sm border border-gray-300 dark:border-gray-600';
    box.style.backgroundColor = colors[lvl];
    box.title = `Level ${lvl}`;
    legendContainer.appendChild(box);
  }
}

async function showTimeline(date: string, summary?: DailySummary) {
  const timelineSection = document.getElementById('timeline-section');
  if (!timelineSection) return;

  timelineSection.classList.remove('hidden');
  const activities = await getActivitiesByDate(date);

  renderTimeline(timelineSection, date, summary, activities, () => {
    timelineSection.classList.add('hidden');
  });

  timelineSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setupEventListeners() {
  // フィルタ切り替えボタン
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const filter = target.getAttribute('data-filter') as ViewFilterType;
      if (!filter) return;

      currentFilter = filter;
      filterButtons.forEach((b) => {
        b.classList.remove('active-filter', 'bg-white', 'dark:bg-gray-800', 'shadow-sm', 'text-green-600', 'dark:text-green-400');
        b.classList.add('text-gray-500', 'dark:text-gray-400');
      });
      target.classList.add('active-filter', 'bg-white', 'dark:bg-gray-800', 'shadow-sm', 'text-green-600', 'dark:text-green-400');
      target.classList.remove('text-gray-500', 'dark:text-gray-400');

      renderGraph();
    });
  });

  // 初期アクティブフィルタのスタイル適用
  const activeBtn = document.querySelector('.filter-btn.active-filter');
  if (activeBtn) {
    activeBtn.classList.add('bg-white', 'dark:bg-gray-800', 'shadow-sm', 'text-green-600', 'dark:text-green-400');
  }

  // 推し色テーマ切り替え
  const selectTheme = document.getElementById('select-theme') as HTMLSelectElement | null;
  if (selectTheme) {
    selectTheme.addEventListener('change', async () => {
      currentTheme = selectTheme.value as ThemeColorName;
      await updateSettings({ themeColor: currentTheme });
      renderGraph();
      renderLegend();
    });
  }

  // ダークモード切替ボタン
  const btnToggleDark = document.getElementById('btn-toggle-dark');
  if (btnToggleDark) {
    btnToggleDark.addEventListener('click', async () => {
      isDarkMode = !isDarkMode;
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      await updateSettings({ darkMode: isDarkMode });
      renderGraph();
      renderLegend();
    });
  }

  // 前年・翌年切り替えボタン
  const btnPrevYear = document.getElementById('btn-prev-year');
  if (btnPrevYear) {
    btnPrevYear.addEventListener('click', async () => {
      const currentYearNum = selectedYear === 'recent'
        ? new Date().getFullYear()
        : selectedYear;
      const targetYear = currentYearNum - 1;
      if (!availableYears.includes(targetYear)) {
        availableYears.push(targetYear);
        availableYears.sort((a, b) => b - a);
      }
      selectedYear = targetYear;
      await updateYearView();
    });
  }

  const btnNextYear = document.getElementById('btn-next-year');
  if (btnNextYear) {
    btnNextYear.addEventListener('click', async () => {
      if (selectedYear === 'recent') return;
      const currentYearNum = new Date().getFullYear();
      if (selectedYear >= currentYearNum) {
        selectedYear = 'recent';
      } else {
        selectedYear = selectedYear + 1;
      }
      await updateYearView();
    });
  }

  // SNS共有画像エクスポートボタン
  const btnExportCard = document.getElementById('btn-export-card');
  if (btnExportCard) {
    btnExportCard.addEventListener('click', async () => {
      const streak = await getStreakRecord();
      const stats = await getOverallStats(currentGridDates);

      await exportShareCardImage({
        summariesMap: annualSummariesMap,
        streak,
        totalScore: stats.totalScore,
        themeColor: currentTheme,
        darkMode: isDarkMode,
        masking: false,
        period: 'year',
      });
    });
  }

  // YouTube RSS同期
  const btnSyncRss = document.getElementById('btn-sync-rss');
  const inputChannelId = document.getElementById('input-channel-id') as HTMLInputElement | null;
  const rssStatus = document.getElementById('rss-sync-status');

  if (btnSyncRss && inputChannelId && rssStatus) {
    btnSyncRss.addEventListener('click', async () => {
      const channelId = inputChannelId.value.trim();
      if (!channelId) {
        rssStatus.textContent = 'チャンネルIDを入力してください。';
        rssStatus.className = 'text-xs mt-2 text-red-500';
        return;
      }

      rssStatus.textContent = '同期中...';
      rssStatus.className = 'text-xs mt-2 text-gray-500';

      try {
        const records = await fetchYouTubeChannelRss(channelId);
        const importedCount = await bulkImportActivities(records);
        await updateSettings({ youtubeChannelId: channelId });
        rssStatus.textContent = `同期完了: ${importedCount} 件を取り込みました。チャンネルIDを保存し、1時間ごとの自動同期を有効化しました。`;
        rssStatus.className = 'text-xs mt-2 text-green-600 dark:text-green-400';
        await loadData();
      } catch (err) {
        rssStatus.textContent = `エラー: ${String(err)}`;
        rssStatus.className = 'text-xs mt-2 text-red-500';
      }
    });
  }

  // YouTubeアーカイブ・CSVインポート
  const inputYtArchive = document.getElementById('input-youtube-archive') as HTMLInputElement | null;
  const ytStatus = document.getElementById('yt-import-status');

  if (inputYtArchive && ytStatus) {
    inputYtArchive.addEventListener('change', async () => {
      const files = inputYtArchive.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      ytStatus.textContent = 'ファイル解析中...';
      ytStatus.className = 'text-xs mt-2 text-gray-500';

      try {
        const records = await parseUploadedYouTubeArchive(file);
        const importedCount = await bulkImportActivities(records);
        ytStatus.textContent = `取込完了: ${importedCount} 件のアクティビティを反映しました。`;
        ytStatus.className = 'text-xs mt-2 text-green-600 dark:text-green-400';
        await loadData();
      } catch (err) {
        ytStatus.textContent = `取込エラー: ${String(err)}`;
        ytStatus.className = 'text-xs mt-2 text-red-500';
      }
    });
  }

  // Xアーカイブインポート
  const inputXArchive = document.getElementById('input-x-archive') as HTMLInputElement | null;
  const xStatus = document.getElementById('x-import-status');

  if (inputXArchive && xStatus) {
    inputXArchive.addEventListener('change', async () => {
      const files = inputXArchive.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      xStatus.textContent = 'アーカイブ解析中...';
      xStatus.className = 'text-xs mt-2 text-gray-500';

      try {
        const records = await parseUploadedXArchive(file);
        const importedCount = await bulkImportActivities(records);
        xStatus.textContent = `取込完了: ${importedCount} 件のアクティビティを登録しました。`;
        xStatus.className = 'text-xs mt-2 text-green-600 dark:text-green-400';
        await loadData();
      } catch (err) {
        xStatus.textContent = `取込エラー: ${String(err)}`;
        xStatus.className = 'text-xs mt-2 text-red-500';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadData().catch((err) => console.error('[v-activity-lawn] Dashboard load error:', err));
});
