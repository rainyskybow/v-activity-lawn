import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { bulkImportActivities, getTodaySummary, getActivitiesByDate, removeActivitiesByTargetIds, getAvailableYears } from '../src/storage/activityService';
import { db } from '../src/storage/db';
import { ActivityRecord } from '../src/types';

describe('activityService bulkImportActivities', () => {
  beforeEach(async () => {
    await db.activities.clear();
    await db.daily_summaries.clear();
    await db.streaks.clear();
  });

  it('同一バッチ内に重複するIDが存在してもエラーにならず安全にupsertされること', async () => {
    const records: ActivityRecord[] = [
      {
        id: 'youtube-video-1',
        platform: 'youtube',
        actionType: 'video_publish',
        targetId: 'video-1',
        title: '動画タイトル',
        score: 15,
        timestamp: 1700000000000,
        dateString: '2023-11-14',
      },
      // 同一IDの重複レコード
      {
        id: 'youtube-video-1',
        platform: 'youtube',
        actionType: 'video_publish',
        targetId: 'video-1',
        title: '動画タイトル更新版',
        score: 15,
        timestamp: 1700000000000,
        dateString: '2023-11-14',
      },
    ];

    const count = await bulkImportActivities(records);
    expect(count).toBe(1);

    const saved = await getActivitiesByDate('2023-11-14');
    expect(saved.length).toBe(1);
    expect(saved[0].id).toBe('youtube-video-1');
  });

  it('タイムスタンプがNaNなどの不正値であっても安全に補正されて保存されること', async () => {
    const records: ActivityRecord[] = [
      {
        id: 'youtube-invalid-time',
        platform: 'youtube',
        actionType: 'community_post',
        targetId: 'post-invalid',
        title: 'タイムスタンプ不正投稿',
        score: 4,
        timestamp: NaN as unknown as number,
        dateString: 'NaN-NaN-NaN',
      },
    ];

    const count = await bulkImportActivities(records);
    expect(count).toBe(1);

    const all = await db.activities.toArray();
    expect(all.length).toBe(1);
    expect(all[0].dateString).not.toBe('NaN-NaN-NaN');
    expect(typeof all[0].timestamp).toBe('number');
    expect(!isNaN(all[0].timestamp)).toBe(true);
  });

  it('複数日付のアクティビティを高速・安全にバッチ再計算できること', async () => {
    const records: ActivityRecord[] = [
      {
        id: 'rec-day-1',
        platform: 'youtube',
        actionType: 'video_publish',
        targetId: 'v-1',
        title: '動画1',
        score: 15,
        timestamp: 1700000000000,
        dateString: '2023-11-14',
      },
      {
        id: 'rec-day-2',
        platform: 'x',
        actionType: 'tweet_post',
        targetId: 't-1',
        title: 'ポスト1',
        score: 2,
        timestamp: 1700100000000,
        dateString: '2023-11-15',
      },
    ];

    const count = await bulkImportActivities(records);
    expect(count).toBe(2);

    const summaries = await db.daily_summaries.toArray();
    expect(summaries.length).toBe(2);
    expect(summaries.find((s) => s.date === '2023-11-14')?.totalScore).toBe(15);
    expect(summaries.find((s) => s.date === '2023-11-15')?.totalScore).toBe(2);
  });

  it('removeActivitiesByTargetIdsで非公開・削除対象のアクティビティが安全に削除され日次集計が再計算されること', async () => {
    const records: ActivityRecord[] = [
      {
        id: 'youtube-pub-del',
        platform: 'youtube',
        actionType: 'video_publish',
        targetId: 'to-delete-1',
        title: '非公開化される動画',
        score: 15,
        timestamp: 1700500000000,
        dateString: '2023-11-20',
      },
    ];
    await bulkImportActivities(records);
    let summary = await db.daily_summaries.get('2023-11-20');
    expect(summary?.totalScore).toBe(15);

    // 削除実行
    const removedCount = await removeActivitiesByTargetIds(['to-delete-1'], 'youtube');
    expect(removedCount).toBe(1);

    const afterAct = await db.activities.get('youtube-pub-del');
    expect(afterAct).toBeUndefined();

    summary = await db.daily_summaries.get('2023-11-20');
    expect(summary?.totalScore).toBe(0);
  });

  it('getAvailableYearsで記録されている年度リストが降順で正しく取得できること', async () => {
    const records: ActivityRecord[] = [
      {
        id: 'rec-2022',
        platform: 'youtube',
        actionType: 'video_publish',
        targetId: 'v-2022',
        title: '2022年の動画',
        score: 15,
        timestamp: 1650000000000,
        dateString: '2022-04-15',
      },
    ];
    await bulkImportActivities(records);

    const years = await getAvailableYears();
    const currentYear = new Date().getFullYear();
    expect(years.includes(currentYear)).toBe(true);
    expect(years.includes(2022)).toBe(true);
    // 降順ソートされていること
    expect(years[0]).toBeGreaterThanOrEqual(years[years.length - 1]);
  });
});
