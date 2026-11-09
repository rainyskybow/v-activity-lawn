import { DailySummary, ThemeColorName, ViewFilterType } from '../types';
import { generatePast53WeeksGrid, formatDateString } from '../utils/dateUtils';
import { calculateLawnLevel } from '../score/scoringEngine';

/**
 * 推し色テーマのカラーパレット定義
 */
export const COLOR_PALETTES: Record<
  ThemeColorName,
  {
    light: [string, string, string, string, string]; // Level 0, 1, 2, 3, 4
    dark: [string, string, string, string, string];
  }
> = {
  green: {
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
  pink: {
    light: ['#ebedf0', '#fbcfe8', '#f472b6', '#db2777', '#9d174d'],
    dark: ['#161b22', '#4a142e', '#831843', '#db2777', '#f472b6'],
  },
  cyan: {
    light: ['#ebedf0', '#bae6fd', '#38bdf8', '#0284c7', '#075985'],
    dark: ['#161b22', '#0c354d', '#0369a1', '#38bdf8', '#7dd3fc'],
  },
  purple: {
    light: ['#ebedf0', '#e9d5ff', '#c084fc', '#9333ea', '#581c87'],
    dark: ['#161b22', '#2e1065', '#6b21a8', '#a855f7', '#c084fc'],
  },
  red: {
    light: ['#ebedf0', '#fecaca', '#f87171', '#dc2626', '#991b1b'],
    dark: ['#161b22', '#450a0a', '#991b1b', '#ef4444', '#f87171'],
  },
  yellow: {
    light: ['#ebedf0', '#fef08a', '#facc15', '#ca8a04', '#854d0e'],
    dark: ['#161b22', '#422006', '#854d0e', '#eab308', '#facc15'],
  },
};

/**
 * フィルタに応じた実効スコア・レベル・特別マイルストーンを計算する
 */
export function filterSummary(
  summary: DailySummary | undefined,
  filter: ViewFilterType
): { score: number; level: 0 | 1 | 2 | 3 | 4; hasSpecialMilestone: boolean } {
  if (!summary || summary.totalScore === 0) {
    return { score: 0, level: 0, hasSpecialMilestone: false };
  }

  if (filter === 'all') {
    return {
      score: summary.totalScore,
      level: summary.level,
      hasSpecialMilestone: summary.hasSpecialMilestone,
    };
  }

  if (filter === 'youtube') {
    const score = summary.byPlatform.youtubeScore;
    const hasSpecial = summary.breakdown.videoPublishCount > 0 || summary.breakdown.streamCount > 0;
    return {
      score,
      level: calculateLawnLevel(score, summary.breakdown.videoPublishCount > 0),
      hasSpecialMilestone: hasSpecial,
    };
  }

  if (filter === 'x') {
    const score = summary.byPlatform.xScore;
    return {
      score,
      level: calculateLawnLevel(score, false),
      hasSpecialMilestone: false,
    };
  }

  if (filter === 'works') {
    // 動画・配信のみ
    const videoScore = summary.breakdown.videoPublishCount * 15;
    const streamScore = summary.breakdown.streamCount * 8 + Math.floor(summary.breakdown.streamDurationTotalMinutes / 60) * 2;
    const shortsScore = summary.breakdown.shortsPublishCount * 6;
    const score = videoScore + streamScore + shortsScore;
    const hasSpecial = summary.breakdown.videoPublishCount > 0 || summary.breakdown.streamCount > 0;
    return {
      score,
      level: calculateLawnLevel(score, summary.breakdown.videoPublishCount > 0),
      hasSpecialMilestone: hasSpecial,
    };
  }

  if (filter === 'interactions') {
    // YouTube投稿のみ（コミュニティ投稿・アンケート）
    const score = summary.breakdown.communityPostCount * 4;
    return {
      score,
      level: calculateLawnLevel(score, false),
      hasSpecialMilestone: false,
    };
  }

  return { score: summary.totalScore, level: summary.level, hasSpecialMilestone: summary.hasSpecialMilestone };
}

export interface RenderLawnOptions {
  summariesMap: Map<string, DailySummary>;
  themeColor: ThemeColorName;
  darkMode: boolean;
  weekStartDay: 0 | 1;
  filter: ViewFilterType;
  onCellClick?: (date: string, summary?: DailySummary) => void;
  weeksCount?: number; // 指定なしは 53週（年間）
}

/**
 * SVG コントリビューショングラフを描画してコンテナ要素に挿入する
 */
export function renderLawnSvg(
  container: HTMLElement,
  options: RenderLawnOptions
): SVGSVGElement {
  container.innerHTML = '';

  const { summariesMap, themeColor, darkMode, weekStartDay, filter, onCellClick } = options;
  const weeksCount = options.weeksCount || 53;
  const cellSize = 10;
  const cellGap = 2.5;
  const step = cellSize + cellGap;

  const palette = COLOR_PALETTES[themeColor] || COLOR_PALETTES.green;
  const colors = darkMode ? palette.dark : palette.light;

  // 日付グリッド配列を生成（53週 × 7日 = 371日分）
  const allDates = generatePast53WeeksGrid(formatDateString(), weekStartDay);
  // 表示週数に合わせて切り出し
  const dates = allDates.slice(-(weeksCount * 7));

  const totalWeeks = Math.ceil(dates.length / 7);
  const leftLabelWidth = 24;
  const topLabelHeight = 16;
  const svgWidth = leftLabelWidth + totalWeeks * step + 10;
  const svgHeight = topLabelHeight + 7 * step + 10;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.maxHeight = `${svgHeight * 1.5}px`;
  svg.classList.add('select-none', 'overflow-visible');

  // 曜日ラベル（月・水・金を表示）
  const dayNamesSundayStart = ['', '月', '', '水', '', '金', ''];
  const dayNamesMondayStart = ['月', '', '水', '', '金', '', ''];
  const dayLabels = weekStartDay === 0 ? dayNamesSundayStart : dayNamesMondayStart;

  for (let d = 0; d < 7; d++) {
    const label = dayLabels[d];
    if (label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '4');
      text.setAttribute('y', String(topLabelHeight + d * step + cellSize - 1));
      text.setAttribute('font-size', '8');
      text.setAttribute('fill', darkMode ? '#8b949e' : '#57606a');
      text.textContent = label;
      svg.appendChild(text);
    }
  }

  // 月ラベルの描画
  let lastRenderedMonth = -1;
  for (let w = 0; w < totalWeeks; w++) {
    const dateOfFirstDayOfWeek = dates[w * 7];
    if (!dateOfFirstDayOfWeek) continue;

    const month = new Date(`${dateOfFirstDayOfWeek}T00:00:00`).getMonth() + 1;
    if (month !== lastRenderedMonth) {
      lastRenderedMonth = month;
      const monthText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      monthText.setAttribute('x', String(leftLabelWidth + w * step));
      monthText.setAttribute('y', '10');
      monthText.setAttribute('font-size', '8');
      monthText.setAttribute('fill', darkMode ? '#8b949e' : '#57606a');
      monthText.textContent = `${month}月`;
      svg.appendChild(monthText);
    }
  }

  // 各セルの描画
  const gCells = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gCells.setAttribute('transform', `translate(${leftLabelWidth}, ${topLabelHeight})`);

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = col * step;
    const y = row * step;

    const summary = summariesMap.get(dateStr);
    const { score, level, hasSpecialMilestone } = filterSummary(summary, filter);
    const fillColor = colors[level];

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(cellSize));
    rect.setAttribute('height', String(cellSize));
    rect.setAttribute('rx', '2');
    rect.setAttribute('ry', '2');
    rect.setAttribute('fill', fillColor);
    rect.setAttribute('data-date', dateStr);
    rect.setAttribute('data-score', String(score));
    rect.classList.add('cursor-pointer', 'transition-all', 'duration-150');

    // ツールチップ用 title 要素
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${dateStr}: ${score} pt (${level > 0 ? `Level ${level}` : '活動なし'})`;
    rect.appendChild(title);

    // 特別マイルストーン（動画公開または配信実施）のハイライト枠線装飾
    if (hasSpecialMilestone) {
      rect.setAttribute('stroke', '#f59e0b'); // アンバー/ゴールド枠線
      rect.setAttribute('stroke-width', '1.5');
    } else {
      rect.setAttribute('stroke', darkMode ? '#30363d' : '#e1e4e8');
      rect.setAttribute('stroke-width', '0.5');
    }

    if (onCellClick) {
      rect.addEventListener('click', () => {
        onCellClick(dateStr, summary);
      });
    }

    gCells.appendChild(rect);

    // 特別マイルストーンのアクセントドット（右上の極小インジケーター）
    if (hasSpecialMilestone) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(x + cellSize - 1.5));
      dot.setAttribute('cy', String(y + 1.5));
      dot.setAttribute('r', '1.2');
      dot.setAttribute('fill', '#f59e0b');
      dot.style.pointerEvents = 'none';
      gCells.appendChild(dot);
    }
  }

  svg.appendChild(gCells);
  container.appendChild(svg);
  return svg;
}
