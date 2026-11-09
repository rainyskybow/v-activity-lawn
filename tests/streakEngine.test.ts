import { describe, it, expect } from 'vitest';
import { calculateStreaks } from '../src/score/streakEngine';
import { DailySummary } from '../src/types';

function createDummySummary(date: string, score: number): DailySummary {
  return {
    date,
    totalScore: score,
    level: score > 0 ? 1 : 0,
    hasSpecialMilestone: false,
    breakdown: {
      videoPublishCount: 0,
      streamCount: 0,
      streamDurationTotalMinutes: 0,
      shortsPublishCount: 0,
      communityPostCount: 0,
      commentReplyCount: 0,
      creatorHeartCount: 0,
      tweetPostCount: 0,
      tweetReplyCount: 0,
      tweetRetweetCount: 0,
      tweetLikeCount: 0,
    },
    byPlatform: { youtubeScore: score, xScore: 0 },
  };
}

describe('streakEngine', () => {
  it('活動記録がない場合はすべて0を返すこと', () => {
    const streak = calculateStreaks([], '2026-11-08');
    expect(streak.currentStreakDays).toBe(0);
    expect(streak.longestStreakDays).toBe(0);
    expect(streak.lastActiveDate).toBe('');
  });

  it('今日活動がある場合の連続日数を正しく計算すること', () => {
    const summaries = [
      createDummySummary('2026-11-06', 5),
      createDummySummary('2026-11-07', 2),
      createDummySummary('2026-11-08', 10),
    ];

    const streak = calculateStreaks(summaries, '2026-11-08');
    expect(streak.currentStreakDays).toBe(3);
    expect(streak.longestStreakDays).toBe(3);
    expect(streak.lastActiveDate).toBe('2026-11-08');
  });

  it('今日まだ活動がなくても、昨日まで活動していた場合はストリークが継続すること', () => {
    const summaries = [
      createDummySummary('2026-11-05', 5),
      createDummySummary('2026-11-06', 4),
      createDummySummary('2026-11-07', 3),
      // 2026-11-08 はまだ活動なし (score: 0)
      createDummySummary('2026-11-08', 0),
    ];

    const streak = calculateStreaks(summaries, '2026-11-08');
    expect(streak.currentStreakDays).toBe(3);
    expect(streak.longestStreakDays).toBe(3);
    expect(streak.lastActiveDate).toBe('2026-11-07');
  });

  it('過去の最長ストリークを正しく保持・更新すること', () => {
    const summaries = [
      // 過去に5日連続活動
      createDummySummary('2026-10-01', 5),
      createDummySummary('2026-10-02', 5),
      createDummySummary('2026-10-03', 5),
      createDummySummary('2026-10-04', 5),
      createDummySummary('2026-10-05', 5),
      // 中断
      createDummySummary('2026-10-06', 0),
      // 現在は2日連続活動
      createDummySummary('2026-11-07', 3),
      createDummySummary('2026-11-08', 4),
    ];

    const streak = calculateStreaks(summaries, '2026-11-08');
    expect(streak.currentStreakDays).toBe(2);
    expect(streak.longestStreakDays).toBe(5);
  });
});
