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
 * YouTube の動画/投稿アイテムが非公開（PRIVATE）または未公開かどうかを判定する
 */
export function isYouTubeItemPrivate(item: Record<string, unknown>): boolean {
  if (!item || typeof item !== 'object') return false;

  // 0. 明示的な公開（PUBLIC）判定（最優先ホワイトリスト）
  // YouTube Studio API では公開動画であっても draftStatus: 'DRAFT_STATUS_NONE' が設定されるため、
  // 公開設定が明示されている場合は非公開と判定しない。
  const privStr = String(item.privacy ?? item.privacyStatus ?? '').toUpperCase();
  const visObj =
    typeof item.visibility === 'object' && item.visibility !== null
      ? (item.visibility as Record<string, unknown>)
      : {};
  const userSetVis = String(visObj.userSetVisibility ?? '').toUpperCase();
  const effVis = String(visObj.effectiveVisibility ?? '').toUpperCase();

  const isExplicitlyPublic =
    privStr === 'VIDEO_PRIVACY_PUBLIC' ||
    privStr === 'PUBLIC' ||
    userSetVis === 'VIDEO_USER_SET_VISIBILITY_PUBLIC' ||
    userSetVis === 'PUBLIC' ||
    effVis === 'VIDEO_EFFECTIVE_VISIBILITY_PUBLIC';

  // 下書きや非公開・限定公開の文字列判定関数
  const isPrivateOrDraftString = (val: unknown): boolean => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    const upper = trimmed.toUpperCase();

    // DRAFT_STATUS_NONE は「下書きではない（＝公開・確定）」状態を表すため非公開と判定しない
    if (upper === 'DRAFT_STATUS_NONE') {
      return false;
    }

    if (
      upper.includes('PRIVATE') ||
      upper.includes('UNLISTED') ||
      upper === 'DRAFT' ||
      upper.startsWith('DRAFT_') ||
      upper.endsWith('_DRAFT') ||
      trimmed === '非公開' ||
      trimmed === '限定公開' ||
      trimmed === '下書き'
    ) {
      return true;
    }

    return false;
  };

  // もし明示的に公開（PUBLIC）であり、直接のフィールドに非公開/限定公開/下書き指定がなければ公開（false）とする
  if (isExplicitlyPublic) {
    const directPrivate =
      isPrivateOrDraftString(item.privacy) ||
      isPrivateOrDraftString(item.privacyStatus) ||
      isPrivateOrDraftString(visObj.userSetVisibility) ||
      isPrivateOrDraftString(visObj.effectiveVisibility);
    if (!directPrivate) {
      return false;
    }
  }

  // 1. 直下文字列フィールドの判定
  const privacyFields = [
    item.privacy,
    item.privacyStatus,
    item.visibility,
    item.privacyState,
    item.visibilityStatus,
    item.draftStatus,
  ];

  for (const val of privacyFields) {
    if (isPrivateOrDraftString(val)) {
      return true;
    }
  }

  // 2. ネストオブジェクト（status や visibility）の判定
  if (item.status && typeof item.status === 'object') {
    const statusObj = item.status as Record<string, unknown>;
    const pStatus = statusObj.privacyStatus || statusObj.privacy || statusObj.status;
    if (isPrivateOrDraftString(pStatus)) {
      return true;
    }
  }

  if (item.visibility && typeof item.visibility === 'object') {
    const vStatusFields = [
      visObj.userSetVisibility,
      visObj.effectiveVisibility,
      visObj.effectiveStatus,
      visObj.privacyStatus,
      visObj.privacy,
      visObj.type,
    ];

    for (const vStatus of vStatusFields) {
      if (isPrivateOrDraftString(vStatus)) {
        return true;
      }
    }
  }

  // 3. badges や label の検査
  if (Array.isArray(item.badges)) {
    const badgesStr = JSON.stringify(item.badges);
    if (badgesStr.includes('非公開') || badgesStr.includes('限定公開') || /PRIVATE|UNLISTED/i.test(badgesStr)) {
      return true;
    }
  }

  // 4. timePublishedSeconds が "0"（または 0）で、かつ明示的に PUBLIC ではない動画（未公開・テスト枠・非公開）
  const pubSecStr = String(item.timePublishedSeconds ?? '').trim();
  if (pubSecStr === '0') {
    const privUpper = String(item.privacy ?? '').toUpperCase();
    if (!privUpper.includes('PUBLIC')) {
      return true;
    }
  }

  return false;
}

/**
 * YouTube Studio レスポンスから非公開（PRIVATE）の動画IDを抽出する
 */
export function extractYouTubePrivateTargetIds(responseData: Record<string, unknown>): string[] {
  const privateIds: string[] = [];
  if (!responseData || typeof responseData !== 'object') return privateIds;

  const seen = new Set<string>();

  // Studio の videos 配列
  if (Array.isArray(responseData.videos)) {
    for (const v of responseData.videos) {
      if (v && typeof v === 'object') {
        const vObj = v as Record<string, unknown>;
        const videoId = vObj.videoId as string;
        if (videoId && isYouTubeItemPrivate(vObj) && !seen.has(videoId)) {
          seen.add(videoId);
          privateIds.push(videoId);
        }
      }
    }
  }

  return privateIds;
}

/**
 * YouTube Studio / YouTube のレスポンスから過去動画・配信・Shortsおよび「コンテンツタブ投稿」を安全に抽出する純粋関数
 * （※非公開動画は自動的に除外されます）
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

  // 【最重要】非公開（PRIVATE）または未公開・下書きの動画は除外する
  if (isYouTubeItemPrivate(v)) {
    return null;
  }

  // 有効な正の秒数タイムスタンプを安全にパース
  const parseValidSec = (val: unknown): number => {
    if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
    if (typeof val === 'string') {
      const n = Number(val.trim());
      if (!isNaN(n) && n > 0) return n;
    }
    return 0;
  };

  const pubSec = parseValidSec(v.timePublishedSeconds);
  const createSec = parseValidSec(v.timeCreatedSeconds);
  const validSec = pubSec > 0 ? pubSec : createSec;

  // 有効な正の公開日時または作成日時が一切取得できない場合は Date.now() にフォールバックせず除外する
  // （非公開・未公開動画が今日の日付に化けて草に登録されるのを完全に防止）
  if (validSec <= 0) {
    return null;
  }

  const timestamp = validSec * 1000;
  const title = (v.title as string) || '動画';
  const contentType = v.contentType as string;
  const origin = v.origin as string;
  const isShorts = contentType === 'CREATOR_CONTENT_TYPE_SHORTS' || /#shorts/i.test(title);
  const isStream =
    origin === 'VIDEO_ORIGIN_LIVESTREAM' ||
    Boolean(v.livestream) ||
    contentType === 'CREATOR_CONTENT_TYPE_LIVE_STREAM';

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

  // 下書きや非公開の投稿は除外
  if (p.publishingStatus && typeof p.publishingStatus === 'string') {
    const upper = p.publishingStatus.toUpperCase();
    if (upper.includes('DRAFT') || upper.includes('PRIVATE')) {
      return null;
    }
  }
  if (isYouTubeItemPrivate(p)) {
    return null;
  }

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

  // 【最重要】非公開の動画は除外する
  if (isYouTubeItemPrivate(r)) {
    return null;
  }

  const title = extractText(r.title) || extractText(r.headline) || '動画';

  let timestamp = 0;
  if (r.releaseTimeMs && Number(r.releaseTimeMs) > 0) {
    timestamp = Number(r.releaseTimeMs);
  } else if (r.creationTimeMs && Number(r.creationTimeMs) > 0) {
    timestamp = Number(r.creationTimeMs);
  } else if (r.publishedTimeText) {
    const text = extractText(r.publishedTimeText);
    if (text) {
      timestamp = parseRelativeTimeString(text);
    }
  }

  // 有効なタイムスタンプが一切ない場合は除外
  if (!timestamp || timestamp <= 0) {
    return null;
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
