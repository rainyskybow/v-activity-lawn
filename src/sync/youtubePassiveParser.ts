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
 * @param url リクエストURL（任意）
 */
export function extractYouTubePassiveActivities(
  responseData: Record<string, unknown>,
  url: string = ''
): BulkActivityItem[] {
  const results: BulkActivityItem[] = [];
  if (!responseData || typeof responseData !== 'object') {
    return results;
  }

  const seenIds = new Set<string>();
  const isPostEndpoint = url.includes('/list_creator_posts') || url.includes('/post/');

  // 1. YouTube Studio の Creator API レスポンスの直接抽出
  // 【重要】投稿タブ（posts）の判定を最優先に行う。
  // 投稿に動画が添付されている場合でも、投稿が動画として誤認されるのを完全に防止する。
  if (isPostEndpoint || Array.isArray(responseData.posts)) {
    if (Array.isArray(responseData.posts)) {
      for (const p of responseData.posts) {
        if (p && typeof p === 'object') {
          const item = parseCreatorPostItem(p as Record<string, unknown>);
          if (item && item.targetId && !seenIds.has(item.targetId)) {
            seenIds.add(item.targetId);
            results.push(item);
          }
        }
      }
    }
    // 投稿エンドポイントの場合は、添付動画が紛れ込んでいても動画としては抽出せず、投稿のみを返却
    if (results.length > 0 || isPostEndpoint) {
      return results;
    }
  }

  // 動画一覧 (/list_creator_videos) の抽出
  if (Array.isArray(responseData.videos)) {
    for (const v of responseData.videos) {
      if (v && typeof v === 'object') {
        const item = parseCreatorVideoItem(v as Record<string, unknown>);
        if (item && item.targetId && !seenIds.has(item.targetId)) {
          seenIds.add(item.targetId);
          results.push(item);
        }
      }
    }
    if (results.length > 0) return results;
  }

  // 2. 一般向け YouTube や Studio 内旧UIの深層再帰探索
  function searchItems(node: unknown, depth: number) {
    if (!node || typeof node !== 'object' || depth > 18) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        searchItems(item, depth + 1);
      }
      return;
    }

    const obj = node as Record<string, unknown>;

    // コンテンツタブの「投稿（コミュニティ投稿）」アイテムを動画より優先して検知
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
      // 投稿ブロックの配下にある添付動画が動画として誤カウントされないよう、子要素の動画探索はスキップ
      return;
    }

    // 動画・ショート・ライブ配信アイテムの検知
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
 * YouTube Studio Creator API の動画オブジェクトパース (/list_creator_videos)
 */
function parseCreatorVideoItem(v: Record<string, unknown>): BulkActivityItem | null {
  const videoId = v.videoId as string;
  if (!videoId) return null;

  const title = (v.title as string) || '動画';
  const timePublishedSec = v.timePublishedSeconds || v.timeCreatedSeconds;
  let timestamp = Date.now();
  if (timePublishedSec) {
    const parsedSec = Number(timePublishedSec);
    if (!isNaN(parsedSec) && parsedSec > 0) {
      timestamp = parsedSec * 1000;
    }
  }

  const contentType = v.contentType as string;
  const origin = v.origin as string;
  const isShorts = contentType === 'CREATOR_CONTENT_TYPE_SHORTS' || /#shorts/i.test(title);
  const isStream = origin === 'VIDEO_ORIGIN_LIVESTREAM' || Boolean(v.livestream);

  let actionType: 'video_publish' | 'shorts_publish' | 'stream_end' = 'video_publish';
  if (isStream) {
    actionType = 'stream_end';
  } else if (isShorts) {
    actionType = 'shorts_publish';
  }

  let durationMinutes: number | undefined;
  if (v.lengthSeconds) {
    durationMinutes = Math.floor(Number(v.lengthSeconds) / 60);
  } else if (v.videoDurationMs) {
    durationMinutes = Math.floor(Number(v.videoDurationMs) / (60 * 1000));
  }

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
 * YouTube Studio Creator API の投稿オブジェクトパース (/list_creator_posts)
 */
function parseCreatorPostItem(p: Record<string, unknown>): BulkActivityItem | null {
  const postId = p.postId as string;
  if (!postId) return null;

  const contentText = extractText(p.contentText) || 'コミュニティ投稿';
  const publishTimeSec = p.publishTime || p.lastUpdateTimeSec;
  let timestamp = Date.now();
  if (publishTimeSec) {
    const parsedSec = Number(publishTimeSec);
    if (!isNaN(parsedSec) && parsedSec > 0) {
      timestamp = parsedSec * 1000;
    }
  }

  const attachment = p.attachment as Record<string, unknown> | undefined;
  const attachType = attachment?.attachmentType as string | undefined;

  let prefix = '';
  if (attachType === 'POST_ATTACHMENT_TYPE_ENUM_POLL') {
    prefix = '[アンケート] ';
  } else if (attachType === 'POST_ATTACHMENT_TYPE_ENUM_VIDEO_LINK') {
    prefix = '[動画共有] ';
  } else if (attachType === 'POST_ATTACHMENT_TYPE_ENUM_IMAGE') {
    prefix = '[画像投稿] ';
  }

  const title = `${prefix}${contentText}`.trim().slice(0, 50);

  // 【最重要】動画リンクが添付されていても、必ず community_post として登録する
  return {
    platform: 'youtube',
    actionType: 'community_post',
    targetId: postId,
    title: title || 'コミュニティ投稿',
    timestamp,
  };
}

/**
 * 一般YouTube用動画系レンダラーのパース
 */
function parseSingleVideoRenderer(r: Record<string, unknown>): BulkActivityItem | null {
  const videoId = (r.videoId as string) || (r.encryptedVideoId as string);
  if (!videoId) return null;

  const title = extractText(r.title) || extractText(r.headline) || '動画';

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
 * 一般YouTube用投稿レンダラーのパース
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
