import { extractXPassiveActivities } from '../sync/xPassiveParser';
import { BulkActivityItem } from '../types';

/**
 * X (旧Twitter) MAIN World 通信インターセプトスクリプト
 * fetch および XMLHttpRequest の両方をフックし、クリエイターのアクティビティおよびスクロール時の過去ログを postMessage で通知する
 */
(() => {
  if ((window as unknown as { __V_ACTIVITY_LAWN_X_INJECTED__?: boolean }).__V_ACTIVITY_LAWN_X_INJECTED__) {
    return;
  }
  (window as unknown as { __V_ACTIVITY_LAWN_X_INJECTED__?: boolean }).__V_ACTIVITY_LAWN_X_INJECTED__ = true;

  console.log('[v-activity-lawn] X MAIN World monitor initialized.');

  /**
   * 単体アクティビティを postMessage で通知
   */
  function emitActivity(actionType: string, payload: Record<string, unknown>) {
    try {
      window.postMessage(
        {
          source: 'v-activity-lawn-injected',
          platform: 'x',
          actionType,
          payload,
        },
        '*'
      );
    } catch {
      // ホストサイトに影響を与えないよう握りつぶす
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
          platform: 'x',
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
        analyzeXResponse(url, args[1]?.body, data);
      }).catch(() => {});
    } catch {
      // 解析例外は握りつぶす
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
                analyzeXResponse(this._url, this._reqBody, data);
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
   * 現在ログイン中のXユーザー情報（数値ユーザーIDおよびスクリーンネーム）を取得する
   */
  function getCurrentXUserInfo(): { userId: string | null; screenName: string | null } {
    let userId: string | null = null;
    let screenName: string | null = null;

    try {
      // 1. document.cookie 内の twid=u%3D[userId] からログインユーザー本人の数値IDを抽出
      const twidMatch = document.cookie.match(/(?:^|;\s*)twid=(?:u%3D|u=)(\d+)/);
      if (twidMatch && twidMatch[1]) {
        userId = twidMatch[1];
      }
    } catch {}

    try {
      // 2. DOM の a[data-testid="AppTabBar_Profile_Link"] から本人のスクリーンネームを抽出
      const profileLink = document.querySelector<HTMLAnchorElement>('a[data-testid="AppTabBar_Profile_Link"]');
      if (profileLink) {
        const href = profileLink.getAttribute('href') || '';
        const handle = href.replace(/^\//, '').split('/')[0].split('?')[0];
        if (handle && !['home', 'explore', 'notifications', 'messages', 'i'].includes(handle.toLowerCase())) {
          screenName = handle;
        }
      }
    } catch {}

    return { userId, screenName };
  }

  /**
   * X の GraphQL 通信解析
   */
  function analyzeXResponse(url: string, reqBodyInput?: unknown, responseData?: Record<string, unknown>) {
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

      const variables = (reqBody.variables as Record<string, unknown>) || {};
      const targetUserId = (variables.userId as string) || (variables.rest_id as string);

      // 1. 自分自身のプロフィール画面閲覧・スクロール時の過去ログパッシブ自動検知
      // 【最重要】/HomeTimeline や /HomeLatestTimeline（他人のポストが流れるホーム）は完全に除外
      const isProfileTimeline =
        url.includes('/UserOriginalsTimeline') ||
        url.includes('/UserRepliesTimeline') ||
        url.includes('/UserTweets') ||
        url.includes('/UserTweetsAndReplies') ||
        url.includes('/Likes');

      if (isProfileTimeline) {
        const userInfo = getCurrentXUserInfo();

        // ログインユーザー本人のIDが判明しており、他人のプロフィールを閲覧している場合は吸い上げを行わない
        if (userInfo.userId && targetUserId && targetUserId !== userInfo.userId) {
          return;
        }

        const myUserId = userInfo.userId || targetUserId;
        const myScreenName = userInfo.screenName || undefined;

        const pastItems = extractXPassiveActivities(url, responseData, myUserId, myScreenName);
        if (pastItems.length > 0) {
          emitBulkActivities(pastItems);
        }
      }

      // 2. ツイート作成・リプライ (/CreateTweet)
      if (url.includes('/CreateTweet')) {
        const tweetText = (variables.tweet_text as string) || '';
        const replyInfo = variables.reply as { in_reply_to_tweet_id?: string } | undefined;
        const resData = responseData?.data as { create_tweet?: { tweet_results?: { result?: { rest_id?: string } } } };
        const tweetId = resData?.create_tweet?.tweet_results?.result?.rest_id || `tweet-${Date.now()}`;

        if (replyInfo?.in_reply_to_tweet_id) {
          emitActivity('tweet_reply', {
            targetId: tweetId,
            title: tweetText.slice(0, 30),
          });
        } else {
          emitActivity('tweet_post', {
            targetId: tweetId,
            title: tweetText.slice(0, 30),
          });
        }
        return;
      }

      // 3. リポスト (/CreateRetweet)
      if (url.includes('/CreateRetweet')) {
        const sourceTweetId = (variables.tweet_id as string) || `retweet-${Date.now()}`;
        emitActivity('tweet_retweet', {
          targetId: sourceTweetId,
          title: 'リポスト',
        });
        return;
      }

      // 4. いいね (/FavoriteTweet)
      if (url.includes('/FavoriteTweet')) {
        const tweetId = (variables.tweet_id as string) || `like-${Date.now()}`;
        emitActivity('tweet_like', {
          targetId: tweetId,
          title: 'いいね',
        });
        return;
      }
    } catch {
      // 解析例外は握りつぶす
    }
  }
})();
