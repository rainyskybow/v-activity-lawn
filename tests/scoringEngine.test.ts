import { describe, it, expect } from 'vitest';
import {
  calculateBaseScore,
  calculateLawnLevel,
  aggregateDailySummary,
  DEFAULT_WEIGHTS,
} from '../src/score/scoringEngine';
import { ActivityRecord } from '../src/types';

describe('scoringEngine', () => {
  describe('calculateBaseScore', () => {
    it('デフォルトの基礎配点を正確に返却すること', () => {
      expect(calculateBaseScore('video_publish')).toBe(15);
      expect(calculateBaseScore('shorts_publish')).toBe(6);
      expect(calculateBaseScore('community_post')).toBe(4);
      expect(calculateBaseScore('stream_schedule')).toBe(3);
      expect(calculateBaseScore('tweet_post')).toBe(2);
      expect(calculateBaseScore('creator_reply')).toBe(1);
      expect(calculateBaseScore('creator_heart')).toBe(0.5);
      expect(calculateBaseScore('tweet_like')).toBe(0.2);
    });

    it('配信終了時の時間加算（1時間につき+2pt、上限15pt）が正しく計算されること', () => {
      // 基礎 8pt + 0時間 = 8pt
      expect(calculateBaseScore('stream_end', 30)).toBe(8);
      // 基礎 8pt + 1時間(60分) = 10pt
      expect(calculateBaseScore('stream_end', 60)).toBe(10);
      // 基礎 8pt + 2時間(120分) = 12pt
      expect(calculateBaseScore('stream_end', 120)).toBe(12);
      // 基礎 8pt + 3時間(180分) = 14pt
      expect(calculateBaseScore('stream_end', 180)).toBe(14);
      // 基礎 8pt + 4時間(240分) = 16pt だが 上限15pt
      expect(calculateBaseScore('stream_end', 240)).toBe(15);
    });

    it('カスタム配点が優先されること', () => {
      const custom = { video_publish: 20 };
      expect(calculateBaseScore('video_publish', undefined, custom)).toBe(20);
    });
  });

  describe('calculateLawnLevel', () => {
    it('スコアに応じた5段階レベルを正しく判定すること', () => {
      expect(calculateLawnLevel(0)).toBe(0);
      expect(calculateLawnLevel(1)).toBe(1);
      expect(calculateLawnLevel(4)).toBe(1);
      expect(calculateLawnLevel(5)).toBe(2);
      expect(calculateLawnLevel(9)).toBe(2);
      expect(calculateLawnLevel(10)).toBe(3);
      expect(calculateLawnLevel(14)).toBe(3);
      expect(calculateLawnLevel(15)).toBe(4);
      expect(calculateLawnLevel(50)).toBe(4);
    });

    it('長尺動画公開実績がある場合はスコアに関わらずLevel 4を確定すること', () => {
      expect(calculateLawnLevel(1, true)).toBe(4);
      expect(calculateLawnLevel(15, true)).toBe(4);
    });
  });

  describe('aggregateDailySummary', () => {
    it('アクション一覧から日次集計、上限キャップ、特別マイルストーンを正確に計算すること', () => {
      const date = '2026-11-08';
      const activities: ActivityRecord[] = [
        {
          id: '1',
          platform: 'youtube',
          actionType: 'video_publish',
          title: '新作長尺動画',
          score: 15,
          timestamp: 1000,
          dateString: date,
        },
        {
          id: '2',
          platform: 'x',
          actionType: 'tweet_post',
          title: '告知ポスト',
          score: 2,
          timestamp: 2000,
          dateString: date,
        },
      ];

      const summary = aggregateDailySummary(date, activities);

      expect(summary.date).toBe(date);
      expect(summary.totalScore).toBe(17);
      expect(summary.level).toBe(4);
      expect(summary.hasSpecialMilestone).toBe(true);
      expect(summary.breakdown.videoPublishCount).toBe(1);
      expect(summary.breakdown.tweetPostCount).toBe(1);
      expect(summary.byPlatform.youtubeScore).toBe(15);
      expect(summary.byPlatform.xScore).toBe(2);
    });

    it('コメント返信やいいねの日次上限キャップが適用されること', () => {
      const date = '2026-11-08';
      // 12件のコメント返信（1件1pt、上限10pt）
      const replies: ActivityRecord[] = Array.from({ length: 12 }, (_, i) => ({
        id: `reply-${i}`,
        platform: 'youtube',
        actionType: 'creator_reply',
        score: 1,
        timestamp: 1000 + i,
        dateString: date,
      }));

      // 30件のXいいね（1件0.2pt = 6pt、上限5pt）
      const likes: ActivityRecord[] = Array.from({ length: 30 }, (_, i) => ({
        id: `like-${i}`,
        platform: 'x',
        actionType: 'tweet_like',
        score: 0.2,
        timestamp: 2000 + i,
        dateString: date,
      }));

      const summary = aggregateDailySummary(date, [...replies, ...likes]);

      expect(summary.breakdown.commentReplyCount).toBe(12);
      expect(summary.breakdown.tweetLikeCount).toBe(30);
      expect(summary.byPlatform.youtubeScore).toBe(10); // 上限10pt
      expect(summary.byPlatform.xScore).toBe(5); // 上限5pt
      expect(summary.totalScore).toBe(15);
      expect(summary.level).toBe(4);
    });
  });
});
