import { BulkActivityItem } from '../types';

/**
 * X (旧Twitter) の UserTweets, UserTweetsAndReplies, Likes レスポンスから過去アクティビティを抽出する純粋関数
 * @param url リクエストURL
 * @param responseData GraphQLレスポンスオブジェクト
 */
export function extractXPassiveActivities(url: string, responseData: Record<string, unknown>): BulkActivityItem[] {
  const results: BulkActivityItem[] = [];
  if (!responseData || typeof responseData !== 'object') {
    return results;
  }

  const isLikesEndpoint = url.includes('/Likes');
  const seenIds = new Set<string>();

  function searchTweets(node: unknown, depth: number) {
    if (!node || typeof node !== 'object' || depth > 15) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        searchTweets(item, depth + 1);
      }
      return;
    }

    const obj = node as Record<string, unknown>;

    // tweet_results.result の検知
    if (obj.tweet_results && typeof obj.tweet_results === 'object') {
      const res = (obj.tweet_results as { result?: Record<string, unknown> }).result;
      if (res) {
        const item = parseSingleTweetResult(res, isLikesEndpoint);
        if (item && item.targetId && !seenIds.has(item.targetId)) {
          seenIds.add(item.targetId);
          results.push(item);
        }
      }
    }

    // すべての子オブジェクト・配列を走査
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        searchTweets(val, depth + 1);
      }
    }
  }

  try {
    searchTweets(responseData, 0);
  } catch (err) {
    console.warn('[v-activity-lawn] Error parsing passive X data:', err);
  }

  return results;
}

function parseSingleTweetResult(res: Record<string, unknown>, isLikesEndpoint: boolean): BulkActivityItem | null {
  const actualTweet = (res.tweet as Record<string, unknown>) || res;
  const tweetId = (actualTweet.rest_id as string) || (actualTweet.id_str as string);
  const legacy = (actualTweet.legacy as Record<string, unknown>) || actualTweet;

  if (!tweetId) return null;

  const text = (legacy.full_text as string) || (legacy.text as string) || '';
  const createdAtStr = legacy.created_at as string;

  let timestamp = Date.now();
  if (createdAtStr) {
    const parsed = Date.parse(createdAtStr);
    if (!isNaN(parsed)) {
      timestamp = parsed;
    }
  }

  if (isLikesEndpoint) {
    return {
      platform: 'x',
      actionType: 'tweet_like',
      targetId: tweetId,
      title: text.slice(0, 40) || 'いいね',
      timestamp,
    };
  }

  const isReply = Boolean(legacy.in_reply_to_status_id_str || legacy.in_reply_to_user_id_str);
  const isRetweet = Boolean(legacy.retweeted_status_result || text.startsWith('RT @'));

  let actionType: 'tweet_post' | 'tweet_reply' | 'tweet_retweet' = 'tweet_post';
  if (isRetweet) {
    actionType = 'tweet_retweet';
  } else if (isReply) {
    actionType = 'tweet_reply';
  }

  return {
    platform: 'x',
    actionType,
    targetId: tweetId,
    title: text.slice(0, 40),
    timestamp,
  };
}
