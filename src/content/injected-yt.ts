import { extractYouTubePassiveActivities } from '../sync/youtubePassiveParser';
import { BulkActivityItem } from '../types';

/**
 * YouTube Studio / YouTube MAIN World 通信インターセプトスクリプト
 * fetch および XMLHttpRequest の両方を安全にフックし、クリエイター操作およびスクロール時の過去ログを受動的に検知して postMessage で中継する
 */
(() => {
  if ((window as unknown as { __V_ACTIVITY_LAWN_YT_INJECTED__?: boolean }).__V_ACTIVITY_LAWN_YT_INJECTED__) {
    return;
  }
  (window as unknown as { __V_ACTIVITY_LAWN_YT_INJECTED__?: boolean }).__V_ACTIVITY_LAWN_YT_INJECTED__ = true;

  console.log('[v-activity-lawn] YouTube MAIN World monitor initialized.');

  /**
   * 単体アクティビティを postMessage で通知
   */
  function emitActivity(actionType: string, payload: Record<string, unknown>) {
    try {
      window.postMessage(
        {
          source: 'v-activity-lawn-injected',
          platform: 'youtube',
          actionType,
          payload,
        },
        '*'
      );
    } catch {
      // ログ等の失敗はホストに影響を与えないよう握りつぶす
    }
  }

  /**
   * スクロール時等のパッシブ一括アクティビティを postMessage で通知
   */
  function emitBulkActivities(items: BulkActivityItem[]) {
    if (items.length === 0) return;
    try {
      window.postMessage(
        {
          source: 'v-activity-lawn-injected',
          platform: 'youtube',
          isBulk: true,
          bulkItems: items,
        },
        '*'
      );
    } catch {
      // 例外は握りつぶす
    }
  }

  // 1. fetch のモンキーパッチ
  const originalFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      if (!response.ok) {
        return response;
      }

      const clonedResponse = response.clone();
      clonedResponse.json().then((data) => {
        analyzeYouTubeResponse(url, args[1]?.body, data);
      }).catch(() => {});
    } catch {
      // 例外は握りつぶす
    }

    return response;
  };

  // 2. XMLHttpRequest (XHR) のモンキーパッチ
  const OriginalXHR = window.XMLHttpRequest;
  class HookedXHR extends OriginalXHR {
    private _url: string = '';
    private _reqBody: unknown = null;

    open(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null): void {
      this._url = typeof url === 'string' ? url : url.toString();
      super.open(method, url, async, username, password);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      this._reqBody = body;
      this.addEventListener('load', () => {
        try {
          if (this.status >= 200 && this.status < 300) {
            const responseText = this.responseText;
            if (responseText && (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json')) {
              let data: Record<string, unknown> | null = null;
              if (typeof this.response === 'object' && this.response !== null) {
                data = this.response as Record<string, unknown>;
              } else {
                try {
                  data = JSON.parse(responseText);
                } catch {}
              }
              if (data) {
                analyzeYouTubeResponse(this._url, this._reqBody, data);
              }
            }
          }
        } catch {}
      });
      super.send(body);
    }
  }
  window.XMLHttpRequest = HookedXHR;

  /**
   * YouTube API 通信の解析
   */
  function analyzeYouTubeResponse(url: string, reqBodyInput?: unknown, responseData?: Record<string, unknown>) {
    try {
      if (!responseData) return;

      let reqBody: Record<string, unknown> = {};
      if (typeof reqBodyInput === 'string') {
        try {
          reqBody = JSON.parse(reqBodyInput);
        } catch {}
      } else if (typeof reqBodyInput === 'object' && reqBodyInput !== null) {
        reqBody = reqBodyInput as Record<string, unknown>;
      }

      // 1. スクロール時・コンテンツ一覧表示時の過去動画・配信・Shorts・投稿のパッシブ自動検知
      if (
        url.includes('/youtubei/v1/browse') ||
        url.includes('/video_manager') ||
        url.includes('/channel_page') ||
        url.includes('/get_table') ||
        url.includes('/creator')
      ) {
        const pastItems = extractYouTubePassiveActivities(responseData);
        if (pastItems.length > 0) {
          emitBulkActivities(pastItems);
        }
      }

      // 2. 動画・Shorts公開 / メタデータ更新
      if (url.includes('/youtubei/v1/entity_update/update_video_metadata') || url.includes('/video_metadata/update')) {
        const privacy = reqBody.privacy || reqBody.privacyStatus;
        const videoId = (reqBody.videoId as string) || (reqBody.encryptedVideoId as string);
        const title = (reqBody.title as string) || (reqBody.metadata as { title?: string })?.title;
        const isShorts = Boolean(
          reqBody.isShorts ||
          (reqBody.videoDurationSeconds && Number(reqBody.videoDurationSeconds) <= 60) ||
          (title && /#shorts/i.test(title))
        );

        if (privacy === 'PUBLIC' || responseData.privacyStatus === 'PUBLIC') {
          if (isShorts) {
            emitActivity('shorts_publish', { targetId: videoId, title: title || 'ショート動画' });
          } else {
            emitActivity('video_publish', { targetId: videoId, title: title || '通常動画' });
          }
        } else {
          emitActivity('metadata_update', { targetId: videoId, title });
        }
        return;
      }

      // 3. ライブ配信枠の作成 (create_broadcast)
      if (url.includes('/youtubei/v1/live_video/create_broadcast')) {
        const videoId = (responseData.videoId as string) || (reqBody.videoId as string);
        const title = (reqBody.title as string) || '配信枠';
        emitActivity('stream_schedule', { targetId: videoId, title });
        return;
      }

      // 4. ライブ配信開始・終了 (transition_broadcast)
      if (url.includes('/youtubei/v1/live_video/transition_broadcast')) {
        const broadcastStatus = (reqBody.broadcastStatus as string) || (reqBody.status as string);
        const videoId = (reqBody.videoId as string) || (reqBody.broadcastId as string);
        if (broadcastStatus === 'LIVE') {
          emitActivity('stream_start', { targetId: videoId, title: 'ライブ配信開始' });
        } else if (broadcastStatus === 'COMPLETE') {
          const durationMinutes = reqBody.durationMinutes ? Number(reqBody.durationMinutes) : undefined;
          emitActivity('stream_end', { targetId: videoId, title: 'ライブ配信終了', durationMinutes });
        }
        return;
      }

      // 5. コミュニティ投稿 / アンケート作成
      if (url.includes('/youtubei/v1/backstage/create_post')) {
        const postText = (reqBody.postText as string) || 'コミュニティ投稿';
        const hasPoll = Boolean(reqBody.pollAttachment || reqBody.poll);
        const postId = (responseData.postId as string) || `post-${Date.now()}`;
        emitActivity('community_post', {
          targetId: postId,
          title: hasPoll ? `[アンケート] ${postText.slice(0, 30)}` : postText.slice(0, 30),
        });
        return;
      }

      // 6. コメント返信
      if (url.includes('/youtubei/v1/comment/create_comment_reply')) {
        const replyText = (reqBody.commentText as string) || '';
        const targetId = (reqBody.parentCommentId as string) || `reply-${Date.now()}`;
        emitActivity('creator_reply', { targetId, title: replyText.slice(0, 30) });
        return;
      }

      // 7. クリエイターハート付与
      if (url.includes('/youtubei/v1/comment/perform_comment_action')) {
        const actions = (reqBody.actions as string[]) || [];
        if (actions.includes('ACTION_HEART')) {
          const targetId = (reqBody.commentId as string) || `heart-${Date.now()}`;
          emitActivity('creator_heart', { targetId, title: 'クリエイターハート付与' });
        }
        return;
      }

      // 8. サムネイル保存
      if (url.includes('/youtubei/v1/video_metadata/save_custom_thumbnail')) {
        const videoId = (reqBody.videoId as string) || `thumb-${Date.now()}`;
        emitActivity('metadata_update', { targetId: videoId, title: 'カスタムサムネイル更新' });
        return;
      }
    } catch {
      // 解析例外は握りつぶす
    }
  }
})();
