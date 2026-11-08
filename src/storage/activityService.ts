import { db } from './db';
import { ActivityRecord, DailySummary, StreakRecord, ActionType, PlatformType } from '../types';
import { formatDateString } from '../utils/dateUtils';
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
  const timestamp = params.timestamp ?? Date.now();
  const dateString = formatDateString(timestamp);

  // 重複排除チェック（同一アクション・同一ターゲットIDが5秒以内に存在すれば無視）
  if (params.targetId) {
    const recentDuplicate = await db.activities
      .where('targetId')
      .equals(params.targetId)
      .and((a) => a.actionType === params.actionType && Math.abs(a.timestamp - timestamp) < 5000)
      .first();

    if (recentDuplicate) {
      console.log('Duplicate activity ignored:', params.actionType, params.targetId);
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
    score,
    timestamp,
    dateString,
  };

  await db.activities.add(newRecord);

  // その日の日次集計を再計算・更新
  await refreshDailySummary(dateString);

  // ストリーク情報を更新
  await refreshStreaks();

  return newRecord;
}

/**
 * 指定日のアクティビティを全件再集計して daily_summaries テーブルを更新する
 */
export async function refreshDailySummary(dateString: string): Promise<DailySummary> {
  const activities = await db.activities.where('dateString').equals(dateString).toArray();
  const settings = await getSettings();
  const summary = aggregateDailySummary(dateString, activities, settings.customWeights);

  await db.daily_summaries.put(summary);
  return summary;
}

/**
 * ストリーク記録を再計算して streaks テーブルを更新する
 */
export async function refreshStreaks(): Promise<StreakRecord> {
  const summaries = await db.daily_summaries.toArray();
  const streak = calculateStreaks(summaries);
  await db.streaks.put(streak);
  return streak;
}

/**
 * 指定した日付のアクティビティ一覧を取得する（タイムスタンプ昇順）
 */
export async function getActivitiesByDate(dateString: string): Promise<ActivityRecord[]> {
  return await db.activities
    .where('dateString')
    .equals(dateString)
    .sortBy('timestamp');
}

/**
 * 期間指定で日次サマリー一覧を取得する（Map形式で返却）
 */
export async function getDailySummariesMap(dates: string[]): Promise<Map<string, DailySummary>> {
  if (dates.length === 0) return new Map();

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
}

/**
 * 本日の日次サマリーを取得する
 */
export async function getTodaySummary(): Promise<DailySummary> {
  const today = formatDateString();
  const existing = await db.daily_summaries.get(today);
  if (existing) {
    return existing;
  }
  return await refreshDailySummary(today);
}

/**
 * 現在のストリーク記録を取得する
 */
export async function getStreakRecord(): Promise<StreakRecord> {
  const existing = await db.streaks.get('current_streak');
  if (existing) {
    return existing;
  }
  return await refreshStreaks();
}

/**
 * 複数のアクティビティを一括登録する（RSS同期やXアーカイブ取込時用）
 */
export async function bulkImportActivities(records: ActivityRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  // 既存のIDや重複を避けて一括挿入
  const affectedDates = new Set<string>();
  const toInsert: ActivityRecord[] = [];

  for (const rec of records) {
    // 既存重複のチェック
    let duplicate = false;
    if (rec.targetId) {
      const found = await db.activities
        .where('targetId')
        .equals(rec.targetId)
        .and((a) => a.actionType === rec.actionType)
        .first();
      if (found) {
        duplicate = true;
      }
    }

    if (!duplicate) {
      toInsert.push(rec);
      affectedDates.add(rec.dateString);
    }
  }

  if (toInsert.length > 0) {
    await db.activities.bulkAdd(toInsert);

    // 影響を受けた日付の日次集計を再計算
    for (const d of affectedDates) {
      await refreshDailySummary(d);
    }

    await refreshStreaks();
  }

  return toInsert.length;
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
}
