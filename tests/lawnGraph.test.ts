import { describe, it, expect } from 'vitest';
import { filterSummary } from '../src/components/lawnGraph';
import { DailySummary } from '../src/types';

describe('lawnGraph filterSummary', () => {
  const sampleSummary: DailySummary = {
    date: '2024-05-01',
    totalScore: 50,
    level: 3,
    hasSpecialMilestone: true,
    breakdown: {
      videoPublishCount: 1,      // 15pt
      streamCount: 1,            // 8pt
      streamDurationTotalMinutes: 60, // 2pt
      shortsPublishCount: 1,     // 6pt
      communityPostCount: 2,     // 2 * 4 = 8pt (YouTube投稿)
      commentReplyCount: 3,      // 3pt
      creatorHeartCount: 2,      // 2pt
      tweetPostCount: 2,         // 4pt
      tweetReplyCount: 1,        // 1pt
      tweetRetweetCount: 0,
      tweetLikeCount: 1,         // 1pt
    },
    byPlatform: {
      youtubeScore: 44,
      xScore: 6,
    },
  };

  it('all フィルタでは総合活動スコアが返ること', () => {
    const result = filterSummary(sampleSummary, 'all');
    expect(result.score).toBe(50);
    expect(result.level).toBe(3);
    expect(result.hasSpecialMilestone).toBe(true);
  });

  it('works フィルタでは動画・配信・Shortsのみのスコアが返ること', () => {
    const result = filterSummary(sampleSummary, 'works');
    // video(15) + stream(8+2) + shorts(6) = 31pt
    expect(result.score).toBe(31);
    expect(result.hasSpecialMilestone).toBe(true);
  });

  it('interactions（YouTube投稿のみ）フィルタではコミュニティ投稿のみが反映され、返信やXポスト等は除外されること', () => {
    const result = filterSummary(sampleSummary, 'interactions');
    // communityPostCount: 2 * 4 = 8pt
    expect(result.score).toBe(8);
    expect(result.hasSpecialMilestone).toBe(false);
  });

  it('コミュニティ投稿が0件の日の interactions フィルタはスコア0となること', () => {
    const noPostSummary: DailySummary = {
      ...sampleSummary,
      breakdown: {
        ...sampleSummary.breakdown,
        communityPostCount: 0,
      },
    };
    const result = filterSummary(noPostSummary, 'interactions');
    expect(result.score).toBe(0);
    expect(result.level).toBe(0);
  });
});
