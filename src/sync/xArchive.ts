import JSZip from 'jszip';
import { ActivityRecord } from '../types';
import { formatDateString } from '../utils/dateUtils';
import { calculateBaseScore } from '../score/scoringEngine';

/**
 * window.YTD.xxx.part0 = [...] 形式のJS文字列または生JSONからオブジェクト配列を取り出す
 */
export function extractJsonFromJsString(text: string): unknown[] {
  const trimmed = text.trim();
  // 先頭の変数代入部分を削除 (例: window.YTD.tweets.part0 = [ ... ])
  const jsonStartIndex = trimmed.indexOf('[');
  const jsonEndIndex = trimmed.lastIndexOf(']');

  if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
    const jsonStr = trimmed.substring(jsonStartIndex, jsonEndIndex + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (err) {
      console.warn('JSON parse error from JS array:', err);
    }
  }

  // オブジェクト単体形式のフォールバック
  try {
    const obj = JSON.parse(trimmed);
    return Array.isArray(obj) ? obj : [obj];
  } catch {
    return [];
  }
}

/**
 * tweets.js の生データ配列をパースして ActivityRecord 配列に変換する
 */
export function parseTweetsArray(items: unknown[]): ActivityRecord[] {
  const records: ActivityRecord[] = [];

  for (const item of items) {
    const tweetObj = (item as { tweet?: Record<string, unknown> })?.tweet || (item as Record<string, unknown>);
    if (!tweetObj) continue;

    const id = (tweetObj.id_str as string) || (tweetObj.id as string) || `tweet-${Date.now()}`;
    const text = (tweetObj.full_text as string) || (tweetObj.text as string) || '';
    const createdAtStr = tweetObj.created_at as string;

    let timestamp = Date.now();
    if (createdAtStr) {
      const parsedTime = Date.parse(createdAtStr);
      if (!isNaN(parsedTime)) {
        timestamp = parsedTime;
      }
    }

    const isReply = Boolean(tweetObj.in_reply_to_status_id_str || tweetObj.in_reply_to_status_id);
    const isRetweet = Boolean(text.startsWith('RT @'));

    let actionType: 'tweet_post' | 'tweet_reply' | 'tweet_retweet' = 'tweet_post';
    if (isRetweet) {
      actionType = 'tweet_retweet';
    } else if (isReply) {
      actionType = 'tweet_reply';
    }

    const score = calculateBaseScore(actionType);
    const dateString = formatDateString(timestamp);

    records.push({
      id: `x-${id}`,
      platform: 'x',
      actionType,
      targetId: id,
      title: text.slice(0, 40),
      score,
      timestamp,
      dateString,
    });
  }

  return records;
}

/**
 * like.js の生データ配列をパースして ActivityRecord 配列に変換する
 */
export function parseLikesArray(items: unknown[]): ActivityRecord[] {
  const records: ActivityRecord[] = [];

  for (const item of items) {
    const likeObj = (item as { like?: Record<string, unknown> })?.like || (item as Record<string, unknown>);
    if (!likeObj) continue;

    const tweetId = (likeObj.tweetId as string) || (likeObj.tweet_id as string) || `like-${Date.now()}`;
    const fullText = (likeObj.fullText as string) || 'いいね';

    const timestamp = Date.now();
    const dateString = formatDateString(timestamp);
    const score = calculateBaseScore('tweet_like');

    records.push({
      id: `x-like-${tweetId}`,
      platform: 'x',
      actionType: 'tweet_like',
      targetId: tweetId,
      title: fullText.slice(0, 40),
      score,
      timestamp,
      dateString,
    });
  }

  return records;
}

/**
 * アップロードされたファイル（zip、js、またはjson）をパースして ActivityRecord 一覧を返す
 */
export async function parseUploadedXArchive(file: File): Promise<ActivityRecord[]> {
  const fileName = file.name.toLowerCase();

  // ZIPファイルの場合
  if (fileName.endsWith('.zip')) {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);
    const allRecords: ActivityRecord[] = [];

    // tweets.js または data/tweets.js を検索
    for (const relativePath of Object.keys(zipContent.files)) {
      const lower = relativePath.toLowerCase();
      if (lower.endsWith('tweets.js') || lower.endsWith('tweet.js')) {
        const text = await zipContent.files[relativePath].async('string');
        const items = extractJsonFromJsString(text);
        allRecords.push(...parseTweetsArray(items));
      } else if (lower.endsWith('like.js')) {
        const text = await zipContent.files[relativePath].async('string');
        const items = extractJsonFromJsString(text);
        allRecords.push(...parseLikesArray(items));
      }
    }

    return allRecords;
  }

  // 単体 JS / JSON ファイルの場合
  const fileText = await file.text();
  const items = extractJsonFromJsString(fileText);

  if (fileName.includes('like')) {
    return parseLikesArray(items);
  }
  return parseTweetsArray(items);
}
