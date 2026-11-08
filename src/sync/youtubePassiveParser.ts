import { BulkActivityItem } from '../types';

/**
 * 相対時間文字列（例: "3時間前", "2日前", "1か月前", "1年前"）からタイムスタンプ（ミリ秒）を推定する
 */
export function parseRelativeTimeString(text: string): number {
  const now = Date.now();
  const trimmed = text.trim();

  const minuteMatch = trimmed.match(/(\d+)\s*分前/);
  if (minuteMatch) return now - Number(minuteMatch[1]) * 60 * 1000;

  const hourMatch = trimmed.match(/(\d+)\s*時間前/);
  if (hourMatch) return now - Number(hourMatch[1]) * 60 * 60 * 1000;

  const dayMatch = trimmed.match(/(\d+)\s*日前/);
  if (dayMatch) return now - Number(dayMatch[1]) * 24 * 60 * 60 * 1000;

  const weekMatch = trimmed.match(/(\d+)\s*週間前/);
  if (weekMatch) return now - Number(weekMatch[1]) * 7 * 24 * 60 * 60 * 1000;

  const monthMatch = trimmed.match(/(\d+)\s*か?月前/);
  if (monthMatch) return now - Number(monthMatch[1]) * 30 * 24 * 60 * 60 * 1000;

  const yearMatch = trimmed.match(/(\d+)\s*年前/);
  if (yearMatch) return now - Number(yearMatch[1]) * 365 * 24 * 60 * 60 * 1000;

  // 日付文字列 (例: "2026/11/08", "2026-11-08") のパース試行
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) return parsed;

  return now;
}

/**
 * runs や simpleText から文字列を取り出すヘルパー
 */
function extractText(obj: unknown): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object') {
    const o = obj as { runs?: Array<{ text: string }>; simpleText?: string };
    if (o.runs && Array.isArray(o.runs) && o.runs.length > 0) {
      return o.runs.map((r) => r.text).join('');
    }
    if (o.simpleText) {
      return o.simpleText;
    }
  }
  return '';
}

/**
 * YouTube Studio / YouTube のレスポンスから過去動画・配信・Shortsおよび「コンテンツタブ投稿」を安全に抽出する純粋関数
 * @param responseData APIレスポンスオブジェクト
 */
export function extractYouTubePassiveActivities(responseData: Record<string, unknown>): BulkActivityItem[] {
  const results: BulkActivityItem[] = [];
  if (!responseData || typeof responseData !== 'object') {
    return results;
  }

  const seenIds = new Set<string>();

  // 汎用深さ制限探索 (最大深度18)
  function searchItems(node: unknown, depth: number) {
    if (!node || typeof node !== 'object' || depth > 18) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        searchItems(item, depth + 1);
      }
      return;
    }

    const obj = node as Record<string, unknown>;

    // 1. 動画・ショート・ライブ配信アイテムの検知
    const videoRenderer = (
      obj.videoRenderer ||
      obj.gridVideoRenderer ||
      obj.compactVideoRenderer ||
      obj.videoManagerVideoItemRenderer ||
      obj.contentTableItemRenderer ||
      obj.creatorVideoItemRenderer ||
      obj.videoRowRenderer
    ) as Record<string, unknown> | undefined;

    if (videoRenderer) {
      const item = parseSingleVideoRenderer(videoRenderer);
      if (item && item.targetId && !seenIds.has(item.targetId)) {
        seenIds.add(item.targetId);
        results.push(item);
      }
    }

    // 2. コンテンツタブの「投稿（コミュニティ投稿）」アイテムの検知
    const postRenderer = (
      obj.backstagePostRenderer ||
      obj.postRenderer ||
      obj.communityPostRenderer ||
      obj.sharedPostRenderer ||
      obj.backstagePostThreadRenderer
    ) as Record<string, unknown> | undefined;

    if (postRenderer) {
      const actualPost = (postRenderer.post as Record<string, unknown>)?.backstagePostRenderer || postRenderer;
      const item = parseSinglePostRenderer(actualPost as Record<string, unknown>);
      if (item && item.targetId && !seenIds.has(item.targetId)) {
        seenIds.add(item.targetId);
        results.push(item);
      }
    }

    // すべての子オブジェクト・配列を走査
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        searchItems(val, depth + 1);
      }
    }
  }

  try {
    searchItems(responseData, 0);
  } catch (err) {
    console.warn('[v-activity-lawn] Error parsing passive YouTube data:', err);
  }

  return results;
}

/**
 * 動画系レンダラーのパース
 */
function parseSingleVideoRenderer(r: Record<string, unknown>): BulkActivityItem | null {
  const videoId = (r.videoId as string) || (r.encryptedVideoId as string);
  if (!videoId) return null;

  const title = extractText(r.title) || extractText(r.headline) || '動画';

  // 日時の抽出 (releaseTimeMs, creationTimeMs, publishedTimeText)
  let timestamp = Date.now();
  if (r.releaseTimeMs) {
    timestamp = Number(r.releaseTimeMs);
  } else if (r.creationTimeMs) {
    timestamp = Number(r.creationTimeMs);
  } else if (r.publishedTimeText) {
    const text = extractText(r.publishedTimeText);
    if (text) {
      timestamp = parseRelativeTimeString(text);
    }
  }

  // Shorts / 配信 / 通常動画の判定
  const isShorts = Boolean(/#shorts/i.test(title) || (r.lengthSeconds && Number(r.lengthSeconds) <= 60));
  const isStream = Boolean(r.upcomingEventData || (r.badges && JSON.stringify(r.badges).includes('LIVE')));

  let actionType: 'video_publish' | 'shorts_publish' | 'stream_end' = 'video_publish';
  if (isStream) {
    actionType = 'stream_end';
  } else if (isShorts) {
    actionType = 'shorts_publish';
  }

  const durationMinutes = r.lengthSeconds ? Math.floor(Number(r.lengthSeconds) / 60) : undefined;

  return {
    platform: 'youtube',
    actionType,
    targetId: videoId,
    title: title.slice(0, 50),
    durationMinutes,
    timestamp,
  };
}

/**
 * コンテンツタブ「投稿（コミュニティ投稿）」レンダラーのパース
 */
function parseSinglePostRenderer(r: Record<string, unknown>): BulkActivityItem | null {
  const postId = (r.postId as string) || (r.id as string);
  if (!postId) return null;

  const contentText = extractText(r.contentText) || extractText(r.postText) || 'コミュニティ投稿';
  const hasPoll = Boolean(r.pollAttachment || r.poll || (r.attachment as Record<string, unknown>)?.pollAttachment);

  let timestamp = Date.now();
  if (r.creationTimeMs) {
    timestamp = Number(r.creationTimeMs);
  } else if (r.publishedTimeText) {
    const text = extractText(r.publishedTimeText);
    if (text) {
      timestamp = parseRelativeTimeString(text);
    }
  }

  const title = hasPoll ? `[アンケート] ${contentText.slice(0, 40)}` : contentText.slice(0, 40);

  return {
    platform: 'youtube',
    actionType: 'community_post',
    targetId: postId,
    title,
    timestamp,
  };
}
