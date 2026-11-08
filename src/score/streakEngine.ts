import { DailySummary, StreakRecord } from '../types';
import { formatDateString, diffDays } from '../utils/dateUtils';

/**
 * 日次サマリー一覧からストリーク記録を算出する純粋関数
 * @param summaries 日付昇順（または降順）のDailySummary配列
 * @param todayStr 今日の日付文字列 (YYYY-MM-DD)
 */
export function calculateStreaks(
  summaries: DailySummary[],
  todayStr: string = formatDateString()
): StreakRecord {
  // 活動実績のある日（スコア > 0）のみを抽出して日付文字列をソート（昇順）
  const activeDates = Array.from(
    new Set(
      summaries
        .filter((s) => s.totalScore > 0)
        .map((s) => s.date)
    )
  ).sort();

  if (activeDates.length === 0) {
    return {
      id: 'current_streak',
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastActiveDate: '',
    };
  }

  // 最長ストリークおよび各区間のストリークを算出
  let longestStreak = 1;
  let tempStreak = 1;

  for (let i = 1; i < activeDates.length; i++) {
    const prev = activeDates[i - 1];
    const curr = activeDates[i];
    const diff = diffDays(prev, curr);

    if (diff === 1) {
      tempStreak += 1;
    } else {
      tempStreak = 1;
    }

    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
  }

  // 現在のストリーク（Current Streak）を算出
  const lastActive = activeDates[activeDates.length - 1];
  const daysSinceLastActive = diffDays(lastActive, todayStr);

  let currentStreak = 0;
  // 最終活動日が今日、または昨日であればストリークは有効
  if (daysSinceLastActive === 0 || daysSinceLastActive === 1) {
    currentStreak = 1;
    for (let i = activeDates.length - 1; i > 0; i--) {
      const curr = activeDates[i];
      const prev = activeDates[i - 1];
      if (diffDays(prev, curr) === 1) {
        currentStreak += 1;
      } else {
        break;
      }
    }
  }

  return {
    id: 'current_streak',
    currentStreakDays: currentStreak,
    longestStreakDays: Math.max(longestStreak, currentStreak),
    lastActiveDate: lastActive,
  };
}
