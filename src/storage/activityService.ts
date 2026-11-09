import { db, withDbRetry } from './db';
import { ActivityRecord, DailySummary, StreakRecord, ActionType, PlatformType } from '../types';
import { formatDateString, isValidTimestamp } from '../utils/dateUtils';
import { calculateBaseScore, aggregateDailySummary } from '../score/scoringEngine';
import { calculateStreaks } from '../score/streakEngine';
import { getSettings } from './settingsService';

/**
 * 新規アクティビティ作成用パラメータ
 */
export interface NewActivityParams {
  platform: PlatformType;
  actionType: ActionType;
  targetId?: string;
  title?: string;
  durationMinutes?: number;
  timestamp?: number;
}

/**
 * アクティビティを保存し、日次サマリーおよびストリークを更新する
 */
export async function addActivity(params: NewActivityParams): Promise<ActivityRecord | null> {
  return await withDbRetry(async () => {
    const rawTs = params.timestamp;
    const timestamp = isValidTimestamp(rawTs) ? rawTs : Date.now();
    const dateString = formatDateString(timestamp);

    // 重複排除チェック（同一アクション・同一ターゲットIDが5秒以内に存在すれば無視）
    if (params.targetId) {
      const recentDuplicate = await db.activities
        .where('targetId')
        .equals(params.targetId)
        .and((a) => a.actionType === params.actionType && Math.abs(a.timestamp - timestamp) < 5000)
        .first();

      if (recentDuplicate) {
        return null;
      }
    }

    const settings = await getSettings();
    const score = calculateBaseScore(params.actionType, params.durationMinutes, settings.customWeights);

    const newRecord: ActivityRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      platform: params.platform,
      actionType: params.actionType,
      targetId: params.targetId,
      title: params.title,
      durationMinutes: params.durationMinutes,
      score: isNaN(score) ? 0 : score,
      timestamp,
      dateString,
    };

    await db.activities.put(newRecord);

    // その日の日次集計を再計算・更新
    await refreshDailySummary(dateString);

    // ストリーク情報を更新
    await refreshStreaks();

    return newRecord;
  });
}

/**
 * 指定日のアクティビティを全件再集計して daily_summaries テーブルを更新する
 */
export async function refreshDailySummary(dateString: string): Promise<DailySummary> {
  return await withDbRetry(async () => {
    const activities = await db.activities.where('dateString').equals(dateString).toArray();
    const settings = await getSettings();
    const summary = aggregateDailySummary(dateString, activities, settings.customWeights);

    await db.daily_summaries.put(summary);
    return summary;
  });
}

/**
 * 複数日付の日次集計を一括で安全・高速に再計算する（トランザクション過多による接続切断を防止）
 */
export async function refreshDailySummariesBatch(dates: string[]): Promise<void> {
  if (dates.length === 0) return;

  await withDbRetry(async () => {
    // 対象日付のアクティビティを一度にまとめて取得
    const allActivities = await db.activities
      .where('dateString')
      .anyOf(dates)
      .toArray();

    const settings = await getSettings();

    // 日付ごとにグループ化
    const activitiesByDate = new Map<string, ActivityRecord[]>();
    for (const d of dates) {
      activitiesByDate.set(d, []);
    }
    for (const act of allActivities) {
      const list = activitiesByDate.get(act.dateString);
      if (list) {
        list.push(act);
      } else {
        activitiesByDate.set(act.dateString, [act]);
      }
    }

    // 各日付のサマリーをメモリ上で一括計算
    const summariesToPut: DailySummary[] = [];
    for (const [dateStr, acts] of activitiesByDate.entries()) {
      const summary = aggregateDailySummary(dateStr, acts, settings.customWeights);
      summariesToPut.push(summary);
    }

    // 1回の bulkPut で一括書き込み
    if (summariesToPut.length > 0) {
      await db.daily_summaries.bulkPut(summariesToPut);
    }
  });
}

/**
 * ストリーク記録を再計算して streaks テーブルを更新する
 */
export async function refreshStreaks(): Promise<StreakRecord> {
  return await withDbRetry(async () => {
    const summaries = await db.daily_summaries.toArray();
    const streak = calculateStreaks(summaries);
    await db.streaks.put(streak);
    return streak;
  });
}

/**
 * 指定された targetId 配列に一致するアクティビティを削除し、影響を受けた日付の日次サマリーおよびストリークを再計算する
 * （YouTubeの非公開化対応など）
 */
export async function removeActivitiesByTargetIds(
  targetIds: string[],
  platform: PlatformType = 'youtube'
): Promise<number> {
  if (!targetIds || targetIds.length === 0) return 0;

  return await withDbRetry(async () => {
    // 該当するレコードを検索
    const matching = await db.activities
      .where('targetId')
      .anyOf(targetIds)
      .and((a) => a.platform === platform)
      .toArray();

    if (matching.length === 0) return 0;

    const idsToDelete = matching.map((a) => a.id);
    const affectedDates = Array.from(new Set(matching.map((a) => a.dateString)));

    await db.activities.bulkDelete(idsToDelete);
    await refreshDailySummariesBatch(affectedDates);
    await refreshStreaks();

    return idsToDelete.length;
  });
}

/**
 * 指定した日付のアクティビティ一覧を取得する（タイムスタンプ昇順）
 */
export async function getActivitiesByDate(dateString: string): Promise<ActivityRecord[]> {
  return await withDbRetry(async () => {
    return await db.activities
      .where('dateString')
      .equals(dateString)
      .sortBy('timestamp');
  });
}

/**
 * 期間指定で日次サマリー一覧を取得する（Map形式で返却）
 */
export async function getDailySummariesMap(dates: string[]): Promise<Map<string, DailySummary>> {
  if (dates.length === 0) return new Map();

  return await withDbRetry(async () => {
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const list = await db.daily_summaries
      .where('date')
      .between(minDate, maxDate, true, true)
      .toArray();

    const map = new Map<string, DailySummary>();
    for (const item of list) {
      map.set(item.date, item);
    }
    return map;
  });
}

/**
 * 本日の日次サマリーを取得する
 */
export async function getTodaySummary(): Promise<DailySummary> {
  const today = formatDateString();
  return await withDbRetry(async () => {
    const existing = await db.daily_summaries.get(today);
    if (existing) {
      return existing;
    }
    return await refreshDailySummary(today);
  });
}

/**
 * 現在のストリーク記録を取得する
 */
export async function getStreakRecord(): Promise<StreakRecord> {
  return await withDbRetry(async () => {
    const existing = await db.streaks.get('current_streak');
    if (existing) {
      return existing;
    }
    return await refreshStreaks();
  });
}

/**
 * 複数のアクティビティを一括登録する（RSS同期、Xアーカイブ取込、スクロール時パッシブ自動吸い上げ用）
 */
export async function bulkImportActivities(records: ActivityRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  return await withDbRetry(async () => {
    const affectedDates = new Set<string>();
    const toUpsert: ActivityRecord[] = [];
    const seenBatchIds = new Set<string>();

    for (const rec of records) {
      // タイムスタンプと日付の安全検証
      const safeTimestamp = (typeof rec.timestamp === 'number' && !isNaN(rec.timestamp) && rec.timestamp > 0)
        ? rec.timestamp
        : Date.now();
      const safeDateString = rec.dateString && rec.dateString !== 'NaN-NaN-NaN'
        ? rec.dateString
        : formatDateString(safeTimestamp);

      const safeRecord: ActivityRecord = {
        ...rec,
        timestamp: safeTimestamp,
        dateString: safeDateString,
        score: isNaN(rec.score) ? 0 : rec.score,
      };

      // 同一バッチ内のID重複を排除
      if (seenBatchIds.has(safeRecord.id)) {
        continue;
      }
      seenBatchIds.add(safeRecord.id);

      toUpsert.push(safeRecord);
      affectedDates.add(safeDateString);
    }

    if (toUpsert.length > 0) {
      // bulkPut で一括安全挿入・更新
      await db.activities.bulkPut(toUpsert);

      // 影響を受けた日付の日次集計を一括バッチ再計算（高速・非ブロッキング）
      const dateArray = Array.from(affectedDates);
      await refreshDailySummariesBatch(dateArray);

      // ストリーク情報を更新
      await refreshStreaks();
    }

    return toUpsert.length;
  });
}

/**
 * 全期間または指定期間の総合統計サマリーを計算する
 */
export async function getOverallStats(targetDates?: string[]): Promise<{
  totalScore: number;
  totalVideos: number;
  totalStreams: number;
  totalStreamMinutes: number;
  totalShorts: number;
  totalCommunityPosts: number;
  totalTweets: number;
  totalReplies: number;
  totalHeartsAndLikes: number;
  activeDaysCount: number;
}> {
  return await withDbRetry(async () => {
    let summaries: DailySummary[] = [];
    if (targetDates && targetDates.length > 0) {
      const map = await getDailySummariesMap(targetDates);
      summaries = Array.from(map.values());
    } else {
      summaries = await db.daily_summaries.toArray();
    }

    let totalScore = 0;
    let totalVideos = 0;
    let totalStreams = 0;
    let totalStreamMinutes = 0;
    let totalShorts = 0;
    let totalCommunityPosts = 0;
    let totalTweets = 0;
    let totalReplies = 0;
    let totalHeartsAndLikes = 0;
    let activeDaysCount = 0;

    for (const s of summaries) {
      if (s.totalScore > 0) {
        activeDaysCount += 1;
      }
      totalScore += s.totalScore;
      totalVideos += s.breakdown.videoPublishCount;
      totalStreams += s.breakdown.streamCount;
      totalStreamMinutes += s.breakdown.streamDurationTotalMinutes;
      totalShorts += s.breakdown.shortsPublishCount;
      totalCommunityPosts += s.breakdown.communityPostCount;
      totalTweets += s.breakdown.tweetPostCount + s.breakdown.tweetRetweetCount;
      totalReplies += s.breakdown.commentReplyCount + s.breakdown.tweetReplyCount;
      totalHeartsAndLikes += s.breakdown.creatorHeartCount + s.breakdown.tweetLikeCount;
    }

    return {
      totalScore: Math.round(totalScore * 10) / 10,
      totalVideos,
      totalStreams,
      totalStreamMinutes,
      totalShorts,
      totalCommunityPosts,
      totalTweets,
      totalReplies,
      totalHeartsAndLikes,
      activeDaysCount,
    };
  });
}

/**
 * DB内に存在するアクティビティまたは日次サマリーから、記録のある年度リスト（降順、例: [2026, 2025, 2024]）を取得する
 */
export async function getAvailableYears(): Promise<number[]> {
  return await withDbRetry(async () => {
    const currentYear = new Date().getFullYear();
    const yearsSet = new Set<number>();
    yearsSet.add(currentYear);

    // daily_summaries から年度を収集
    const summaries = await db.daily_summaries.toArray();
    for (const s of summaries) {
      if (s.date) {
        const y = parseInt(s.date.split('-')[0], 10);
        if (!isNaN(y) && y >= 2005 && y <= currentYear + 1) {
          yearsSet.add(y);
        }
      }
    }

    // activities テーブルからも年度を収集
    const oldestActivity = await db.activities.orderBy('timestamp').first();
    if (oldestActivity && oldestActivity.dateString) {
      const y = parseInt(oldestActivity.dateString.split('-')[0], 10);
      if (!isNaN(y) && y >= 2005 && y <= currentYear + 1) {
        yearsSet.add(y);
      }
    }

    // 過去最低でも前年は常に選択肢に含める
    yearsSet.add(currentYear - 1);

    return Array.from(yearsSet).sort((a, b) => b - a);
  });
}

/**
 * 過去に誤登録された非公開テスト配信・仮枠アクティビティを一括検知・安全に削除し、日次集計とストリークを再計算する
 */
export async function cleanInvalidTestActivities(): Promise<number> {
  return await withDbRetry(async () => {
    // 誤登録されやすい非公開テスト配信・空枠タイトルの正規表現
    const testPattern = /(?:テスト|test|【\s*】|自分の配信|仮枠立て|負荷テスト|引っ越し後|直前テスト|ビットレート)/i;

    const allActivities = await db.activities.toArray();
    const toDeleteIds: string[] = [];
    const affectedDates = new Set<string>();

    for (const act of allActivities) {
      if (act.platform === 'youtube') {
        const title = act.title || '';
        if (!title.trim() || testPattern.test(title)) {
          toDeleteIds.push(act.id);
          affectedDates.add(act.dateString);
        }
      }
    }

    if (toDeleteIds.length === 0) return 0;

    await db.activities.bulkDelete(toDeleteIds);
    await refreshDailySummariesBatch(Array.from(affectedDates));
    await refreshStreaks();

    return toDeleteIds.length;
  });
}
