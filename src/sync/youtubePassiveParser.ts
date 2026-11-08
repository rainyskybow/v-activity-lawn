import { BulkActivityItem } from '../types';

/**
 * YouTube Studio / YouTube の browse や video_manager レスポンスから過去動画一覧を安全に抽出する純粋関数
 * @param responseData APIレスポンスオブジェクト
 */
export function extractYouTubePassiveActivities(responseData: Record<string, unknown>): BulkActivityItem[] {
  const results: BulkActivityItem[] = [];
  if (!responseData || typeof responseData !== 'object') {
    return results;
  }

  const seenIds = new Set<string>();

  // 汎用深さ制限探索 (最大深度15)
  function searchItems(node: unknown, depth: number) {
    if (!node || typeof node !== 'object' || depth > 15) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        searchItems(item, depth + 1);
      }
      return;
    }

    const obj = node as Record<string, unknown>;

    // 1. videoRenderer / gridVideoRenderer / compactVideoRenderer の検知
    const renderer = (obj.videoRenderer || obj.gridVideoRenderer || obj.compactVideoRenderer || obj.videoManagerVideoItemRenderer) as Record<string, unknown> | undefined;
    if (renderer) {
      const item = parseSingleVideoRenderer(renderer);
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

function parseSingleVideoRenderer(r: Record<string, unknown>): BulkActivityItem | null {
  const videoId = (r.videoId as string) || (r.encryptedVideoId as string);
  if (!videoId) return null;

  // タイトルの抽出
  let title = '動画';
  if (r.title) {
    const t = r.title as { runs?: Array<{ text: string }>; simpleText?: string };
    if (t.runs && t.runs.length > 0) {
      title = t.runs.map((x) => x.text).join('');
    } else if (t.simpleText) {
      title = t.simpleText;
    }
  }

  // 日時の抽出 (releaseTimeMs, creationTimeMs, または publishedTimeText)
  let timestamp = Date.now();
  if (r.releaseTimeMs) {
    timestamp = Number(r.releaseTimeMs);
  } else if (r.creationTimeMs) {
    timestamp = Number(r.creationTimeMs);
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
