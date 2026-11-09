import { ActionType, ActivityRecord, DailySummary } from '../types';

/**
 * デフォルトの基礎配点テーブル
 */
export const DEFAULT_WEIGHTS: Record<ActionType, number> = {
  video_publish: 15,
  stream_start: 8,
  stream_end: 8,
  shorts_publish: 6,
  community_post: 4,
  stream_schedule: 3,
  metadata_update: 2,
  tweet_post: 2,
  tweet_retweet: 2,
  creator_reply: 1,
  tweet_reply: 1,
  creator_heart: 0.5,
  tweet_like: 0.2,
};

/**
 * 1日あたりの上限ポイントテーブル（該当アクションのみ）
 */
export const DAILY_CAPS: Partial<Record<ActionType, number>> = {
  creator_reply: 10,
  tweet_reply: 10,
  creator_heart: 5,
  tweet_like: 5,
};

/**
 * 単体アクションの基礎スコアを算出する
 * @param actionType アクション種別
 * @param durationMinutes 配信時間（分単位、ライブ配信時のみ）
 * @param customWeights カスタム配点設定
 */
export function calculateBaseScore(
  actionType: ActionType,
  durationMinutes?: number,
  customWeights?: Partial<Record<ActionType, number>>
): number {
  const base = customWeights?.[actionType] ?? DEFAULT_WEIGHTS[actionType] ?? 0;

  // 配信終了時の時間加算（8pt + 1時間あたり+2pt、上限15pt）
  if (actionType === 'stream_end' || actionType === 'stream_start') {
    if (durationMinutes && durationMinutes > 0) {
      const hours = durationMinutes / 60;
      const additional = Math.floor(hours) * 2;
      return Math.min(15, base + additional);
    }
  }

  return base;
}

/**
 * 日次スコアから草の濃淡レベル（0〜4）を算出する
 * @param totalScore 日次合計活動スコア
 * @param hasVideoPublish 長尺動画公開実績があるかどうか（即座にLevel 4確定）
 */
export function calculateLawnLevel(totalScore: number, hasVideoPublish: boolean = false): 0 | 1 | 2 | 3 | 4 {
  if (hasVideoPublish && totalScore > 0) {
    return 4;
  }
  if (totalScore <= 0) {
    return 0;
  }
  if (totalScore < 5) {
    return 1;
  }
  if (totalScore < 10) {
    return 2;
  }
  if (totalScore < 15) {
    return 3;
  }
  return 4;
}

/**
 * 対象日の全アクティビティから日次集計サマリーを計算する（キャップ・重み付け・内訳・特別マイルストーン反映）
 * @param date 日付文字列 (YYYY-MM-DD)
 * @param activities その日のアクティビティレコード一覧
 * @param customWeights カスタム配点設定
 */
export function aggregateDailySummary(
  date: string,
  activities: ActivityRecord[],
  customWeights?: Partial<Record<ActionType, number>>
): DailySummary {
  const breakdown = {
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
  };

  let youtubeScore = 0;
  let xScore = 0;

  // 上限管理用の一時集計
  let commentReplyRawScore = 0;
  let tweetReplyRawScore = 0;
  let creatorHeartRawScore = 0;
  let tweetLikeRawScore = 0;

  let hasSpecialMilestone = false;
  let hasVideoPublish = false;

  for (const act of activities) {
    const rawScore = calculateBaseScore(act.actionType, act.durationMinutes, customWeights);

    switch (act.actionType) {
      case 'video_publish':
        breakdown.videoPublishCount += 1;
        youtubeScore += rawScore;
        hasSpecialMilestone = true;
        hasVideoPublish = true;
        break;
      case 'stream_start':
      case 'stream_end':
        breakdown.streamCount += 1;
        if (act.durationMinutes) {
          breakdown.streamDurationTotalMinutes += act.durationMinutes;
        }
        youtubeScore += rawScore;
        hasSpecialMilestone = true;
        break;
      case 'shorts_publish':
        breakdown.shortsPublishCount += 1;
        youtubeScore += rawScore;
        break;
      case 'community_post':
        breakdown.communityPostCount += 1;
        youtubeScore += rawScore;
        break;
      case 'stream_schedule':
      case 'metadata_update':
        youtubeScore += rawScore;
        break;
      case 'creator_reply':
        breakdown.commentReplyCount += 1;
        commentReplyRawScore += rawScore;
        break;
      case 'creator_heart':
        breakdown.creatorHeartCount += 1;
        creatorHeartRawScore += rawScore;
        break;
      case 'tweet_post':
        breakdown.tweetPostCount += 1;
        xScore += rawScore;
        break;
      case 'tweet_reply':
        breakdown.tweetReplyCount += 1;
        tweetReplyRawScore += rawScore;
        break;
      case 'tweet_retweet':
        breakdown.tweetRetweetCount += 1;
        xScore += rawScore;
        break;
      case 'tweet_like':
        breakdown.tweetLikeCount += 1;
        tweetLikeRawScore += rawScore;
        break;
    }
  }

  // キャップの適用
  const cappedCommentReply = Math.min(DAILY_CAPS.creator_reply ?? 10, commentReplyRawScore);
  const cappedCreatorHeart = Math.min(DAILY_CAPS.creator_heart ?? 5, creatorHeartRawScore);
  const cappedTweetReply = Math.min(DAILY_CAPS.tweet_reply ?? 10, tweetReplyRawScore);
  const cappedTweetLike = Math.min(DAILY_CAPS.tweet_like ?? 5, tweetLikeRawScore);

  youtubeScore += cappedCommentReply + cappedCreatorHeart;
  xScore += cappedTweetReply + cappedTweetLike;

  const totalScore = Math.round((youtubeScore + xScore) * 10) / 10;
  const level = calculateLawnLevel(totalScore, hasVideoPublish);

  return {
    date,
    totalScore,
    level,
    hasSpecialMilestone,
    breakdown,
    byPlatform: {
      youtubeScore: Math.round(youtubeScore * 10) / 10,
      xScore: Math.round(xScore * 10) / 10,
    },
  };
}
