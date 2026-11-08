import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { bulkImportActivities, getTodaySummary, getActivitiesByDate } from '../src/storage/activityService';
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
});
