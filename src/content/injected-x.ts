/**
 * X (旧Twitter) MAIN World 通信インターセプトスクリプト
 * GraphQL API への fetch をフックし、クリエイターのアクティビティを postMessage で通知する
 */
(() => {
  // 多重注入防止
  if ((window as unknown as { __V_ACTIVITY_LAWN_X_INJECTED__?: boolean }).__V_ACTIVITY_LAWN_X_INJECTED__) {
    return;
  }
  (window as unknown as { __V_ACTIVITY_LAWN_X_INJECTED__?: boolean }).__V_ACTIVITY_LAWN_X_INJECTED__ = true;

  const originalFetch = window.fetch;

  /**
   * postMessage で ISOLATED World へイベントを通知する
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

  // fetch のモンキーパッチ
  window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      if (!response.ok) {
        return response;
      }

      const clonedResponse = response.clone();
      clonedResponse.json().then((data) => {
        analyzeXResponse(url, args[1], data);
      }).catch(() => {
        // 非JSONレスポンスはスキップ
      });
    } catch {
      // 解析例外は握りつぶす
    }

    return response;
  };

  /**
   * X の GraphQL 通信解析
   */
  function analyzeXResponse(url: string, init?: RequestInit, responseData?: Record<string, unknown>) {
    try {
      const reqBodyStr = typeof init?.body === 'string' ? init.body : '';
      let reqBody: Record<string, unknown> = {};
      if (reqBodyStr) {
        try {
          reqBody = JSON.parse(reqBodyStr);
        } catch {
          // JSONパース失敗時はスキップ
        }
      }

      const variables = (reqBody.variables as Record<string, unknown>) || {};

      // 1. ツイート作成・リプライ (/CreateTweet)
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

      // 2. リポスト (/CreateRetweet)
      if (url.includes('/CreateRetweet')) {
        const sourceTweetId = (variables.tweet_id as string) || `retweet-${Date.now()}`;
        emitActivity('tweet_retweet', {
          targetId: sourceTweetId,
          title: 'リポスト',
        });
        return;
      }

      // 3. いいね (/FavoriteTweet)
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
