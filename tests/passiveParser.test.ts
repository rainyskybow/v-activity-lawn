import { describe, it, expect } from 'vitest';
import { extractYouTubePassiveActivities, extractYouTubePrivateTargetIds, isYouTubeItemPrivate } from '../src/sync/youtubePassiveParser';
import { extractXPassiveActivities } from '../src/sync/xPassiveParser';

describe('passiveParser', () => {
  describe('extractYouTubePassiveActivities', () => {
    it('YouTube Studioのbrowseレスポンスから過去動画およびShortsを正確に抽出すること', () => {
      const mockResponse = {
        contents: {
          twoColumnBrowseResultsRenderer: {
            tabs: [
              {
                tabRenderer: {
                  content: {
                    sectionListRenderer: {
                      contents: [
                        {
                          itemSectionRenderer: {
                            contents: [
                              {
                                gridVideoRenderer: {
                                  videoId: 'yt-past-1',
                                  title: { simpleText: '過去のゲーム実況配信アーカイブ' },
                                  releaseTimeMs: '1700000000000',
                                  lengthSeconds: '7200',
                                  badges: [{ metadataBadgeRenderer: { label: 'LIVE' } }],
                                },
                              },
                              {
                                videoRenderer: {
                                  videoId: 'yt-past-2',
                                  title: { runs: [{ text: '最新の自己紹介動画 #Shorts' }] },
                                  creationTimeMs: '1700100000000',
                                  lengthSeconds: '45',
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      };

      const items = extractYouTubePassiveActivities(mockResponse);
      expect(items.length).toBe(2);

      expect(items[0].platform).toBe('youtube');
      expect(items[0].targetId).toBe('yt-past-1');
      expect(items[0].actionType).toBe('stream_end');
      expect(items[0].durationMinutes).toBe(120);
      expect(items[0].timestamp).toBe(1700000000000);

      expect(items[1].platform).toBe('youtube');
      expect(items[1].targetId).toBe('yt-past-2');
      expect(items[1].actionType).toBe('shorts_publish');
      expect(items[1].timestamp).toBe(1700100000000);
    });

    it('YouTube Studioコンテンツの投稿タブ（コミュニティ投稿・アンケート）を正確に抽出すること', () => {
      const mockPostResponse = {
        contents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      backstagePostThreadRenderer: {
                        post: {
                          backstagePostRenderer: {
                            postId: 'post-100',
                            contentText: { runs: [{ text: '明日の配信予定アンケートです！' }] },
                            creationTimeMs: '1700200000000',
                            pollAttachment: { choices: [{ text: '19時' }, { text: '21時' }] },
                          },
                        },
                      },
                    },
                    {
                      communityPostRenderer: {
                        postId: 'post-200',
                        contentText: { simpleText: 'チャンネル登録者1万人ありがとうございます！' },
                        publishedTimeText: { runs: [{ text: '3日前' }] },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      };

      const items = extractYouTubePassiveActivities(mockPostResponse);
      expect(items.length).toBe(2);

      expect(items[0].platform).toBe('youtube');
      expect(items[0].targetId).toBe('post-100');
      expect(items[0].actionType).toBe('community_post');
      expect(items[0].title).toBe('[アンケート] 明日の配信予定アンケートです！');
      expect(items[0].timestamp).toBe(1700200000000);

      expect(items[1].platform).toBe('youtube');
      expect(items[1].targetId).toBe('post-200');
      expect(items[1].actionType).toBe('community_post');
      expect(items[1].title).toBe('チャンネル登録者1万人ありがとうございます！');
    });

    it('YouTube Studio Creator API (list_creator_videos) の実データ形式を正確に抽出すること', () => {
      const mockCreatorVideosResponse = {
        videos: [
          {
            videoId: 'video-studio-1',
            title: '【初配信】自己紹介と今後の予定',
            timePublishedSeconds: '1700500000',
            lengthSeconds: '3600',
            contentType: 'CREATOR_CONTENT_TYPE_VIDEO',
            origin: 'VIDEO_ORIGIN_UPLOAD',
          },
          {
            videoId: 'shorts-studio-2',
            title: 'おすすめ挨拶 #Shorts',
            timePublishedSeconds: '1700510000',
            lengthSeconds: '50',
            contentType: 'CREATOR_CONTENT_TYPE_SHORTS',
          },
          {
            videoId: 'stream-studio-3',
            title: '深夜の雑談配信枠',
            timePublishedSeconds: '1700520000',
            lengthSeconds: '7200',
            origin: 'VIDEO_ORIGIN_LIVESTREAM',
          },
        ],
      };

      const items = extractYouTubePassiveActivities(mockCreatorVideosResponse);
      expect(items.length).toBe(3);

      expect(items[0].targetId).toBe('video-studio-1');
      expect(items[0].actionType).toBe('video_publish');
      expect(items[0].durationMinutes).toBe(60);
      expect(items[0].timestamp).toBe(1700500000000);

      expect(items[1].targetId).toBe('shorts-studio-2');
      expect(items[1].actionType).toBe('shorts_publish');

      expect(items[2].targetId).toBe('stream-studio-3');
      expect(items[2].actionType).toBe('stream_end');
      expect(items[2].durationMinutes).toBe(120);
    });

    it('YouTube Studio Creator API (list_creator_posts) の実データ形式を正確に抽出すること', () => {
      const mockCreatorPostsResponse = {
        posts: [
          {
            postId: 'post-studio-1',
            contentText: { runs: [{ text: '明日のコラボ配信について告知！' }] },
            publishTime: '1700600000',
            attachment: { attachmentType: 'POST_ATTACHMENT_TYPE_ENUM_POLL' },
          },
          // 動画リンクが添付された投稿（動画扱いになってはいけない）
          {
            postId: 'post-studio-video-link',
            contentText: { runs: [{ text: '新曲のMVを公開しました！ぜひ見てね！' }] },
            publishTime: '1700610000',
            attachment: {
              attachmentType: 'POST_ATTACHMENT_TYPE_ENUM_VIDEO_LINK',
              videoLinkAttachment: { videoId: 'attached-video-999' },
            },
          },
        ],
        // 同一レスポンスに関連動画が含まれていても posts が優先されること
        videos: [
          {
            videoId: 'attached-video-999',
            title: '新曲MV',
            timePublishedSeconds: '1700610000',
          },
        ],
      };

      const items = extractYouTubePassiveActivities(mockCreatorPostsResponse, 'https://studio.youtube.com/youtubei/v1/post/list_creator_posts');
      expect(items.length).toBe(2);

      expect(items[0].platform).toBe('youtube');
      expect(items[0].actionType).toBe('community_post');
      expect(items[0].targetId).toBe('post-studio-1');
      expect(items[0].title).toBe('[アンケート] 明日のコラボ配信について告知！');
      expect(items[0].timestamp).toBe(1700600000000);

      // 動画添付投稿も必ず community_post として抽出されること
      expect(items[1].platform).toBe('youtube');
      expect(items[1].actionType).toBe('community_post');
      expect(items[1].targetId).toBe('post-studio-video-link');
      expect(items[1].title).toBe('[動画共有] 新曲のMVを公開しました！ぜひ見てね！');
      expect(items[1].timestamp).toBe(1700610000000);
    });

    it('非公開（PRIVATE）の動画・アイテムは除外され、非公開ID一覧として抽出されること', () => {
      const mockStudioResponse = {
        videos: [
          {
            videoId: 'pub-vid-1',
            title: '公開されている動画',
            timePublishedSeconds: 1700000000,
            contentType: 'CREATOR_CONTENT_TYPE_VIDEO',
            privacy: 'PUBLIC',
          },
          {
            videoId: 'priv-vid-2',
            title: '非公開のテスト動画',
            timePublishedSeconds: 1700100000,
            contentType: 'CREATOR_CONTENT_TYPE_VIDEO',
            privacy: 'PRIVATE',
          },
          {
            videoId: 'priv-vid-3',
            title: 'ステータスが非公開の動画',
            timePublishedSeconds: 1700200000,
            contentType: 'CREATOR_CONTENT_TYPE_VIDEO',
            status: { privacyStatus: 'PRIVATE' },
          },
          {
            videoId: 'priv-vid-4',
            title: '日本語で非公開と指定された動画',
            timePublishedSeconds: 1700300000,
            contentType: 'CREATOR_CONTENT_TYPE_VIDEO',
            visibility: '非公開',
          },
        ],
      };

      // 1. パッシブ抽出では非公開動画が除外され、公開動画のみ返ること
      const items = extractYouTubePassiveActivities(mockStudioResponse, 'https://studio.youtube.com/youtubei/v1/creator/list_creator_videos');
      expect(items.length).toBe(1);
      expect(items[0].targetId).toBe('pub-vid-1');

      // 2. 非公開動画ID抽出ヘルパーで3件の非公開IDが抽出されること
      const privateIds = extractYouTubePrivateTargetIds(mockStudioResponse);
      expect(privateIds).toEqual(['priv-vid-2', 'priv-vid-3', 'priv-vid-4']);

      // 3. ヘルパー関数の単体判定
      expect(isYouTubeItemPrivate({ privacy: 'PRIVATE' })).toBe(true);
      expect(isYouTubeItemPrivate({ privacyStatus: 'PRIVACY_STATUS_PRIVATE' })).toBe(true);
      expect(isYouTubeItemPrivate({ badges: [{ label: '非公開' }] })).toBe(true);
      expect(isYouTubeItemPrivate({ privacy: 'PUBLIC' })).toBe(false);
    });

    it('不正または空のレスポンスに対して安全に空配列を返すこと', () => {
      expect(extractYouTubePassiveActivities({})).toEqual([]);
      expect(extractYouTubePassiveActivities({ error: 'invalid' })).toEqual([]);
    });
  });

  describe('extractXPassiveActivities', () => {
    it('XのUserTweetsレスポンスからポスト・リプライ・リポストを正確に抽出すること', () => {
      const mockUrl = 'https://x.com/i/api/graphql/xxx/UserTweets';
      const mockResponse = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelineAddEntries',
                      entries: [
                        {
                          entryId: 'tweet-100',
                          content: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: 'tweet-100',
                                  legacy: {
                                    full_text: '過去の配信告知ポストです',
                                    created_at: 'Sun Nov 08 12:00:00 +0000 2026',
                                  },
                                },
                              },
                            },
                          },
                        },
                        {
                          entryId: 'tweet-200',
                          content: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: 'tweet-200',
                                  legacy: {
                                    full_text: '@fan ファンへの返信です',
                                    in_reply_to_status_id_str: 'status-999',
                                    created_at: 'Sun Nov 08 13:00:00 +0000 2026',
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const items = extractXPassiveActivities(mockUrl, mockResponse);
      expect(items.length).toBe(2);

      expect(items[0].platform).toBe('x');
      expect(items[0].actionType).toBe('tweet_post');
      expect(items[0].targetId).toBe('tweet-100');
      expect(items[0].title).toBe('過去の配信告知ポストです');

      expect(items[1].platform).toBe('x');
      expect(items[1].actionType).toBe('tweet_reply');
      expect(items[1].targetId).toBe('tweet-200');
    });

    it('/Likesエンドポイントの場合はtweet_likeとして抽出すること', () => {
      const mockUrl = 'https://x.com/i/api/graphql/xxx/Likes';
      const mockResponse = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      entries: [
                        {
                          content: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: 'liked-999',
                                  legacy: {
                                    full_text: '素敵なファンアートをいいねしました',
                                    created_at: 'Sun Nov 08 14:00:00 +0000 2026',
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const items = extractXPassiveActivities(mockUrl, mockResponse);
      expect(items.length).toBe(1);
      expect(items[0].actionType).toBe('tweet_like');
      expect(items[0].targetId).toBe('liked-999');
    });

    it('会話スレッド（VerticalConversation）において他人の親ツイートが除外され本人のポストのみ抽出されること', () => {
      const mockUrl = 'https://x.com/i/api/graphql/xxx/UserRepliesTimeline';
      const myUserId = '1756157928246255616';
      const otherUserId = '1751084265851555840';

      const mockResponse = {
        data: {
          user: {
            result: {
              timeline: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelineAddEntries',
                      entries: [
                        {
                          entryId: 'conversation-thread-1',
                          content: {
                            entryType: 'TimelineTimelineModule',
                            displayType: 'VerticalConversation',
                            items: [
                              // 1. 他人の親ポスト（除外されるべき）
                              {
                                item: {
                                  itemContent: {
                                    tweet_results: {
                                      result: {
                                        rest_id: 'other-parent-tweet',
                                        legacy: {
                                          user_id_str: otherUserId,
                                          full_text: '日翠蓮歌さんの元ポストです',
                                          created_at: 'Sun Nov 08 10:00:00 +0000 2026',
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                              // 2. 本人の返信ポスト（抽出されるべき）
                              {
                                item: {
                                  itemContent: {
                                    tweet_results: {
                                      result: {
                                        rest_id: 'my-reply-tweet',
                                        legacy: {
                                          user_id_str: myUserId,
                                          full_text: '@hisui_renka_v 雨空ゆみの返信です！',
                                          in_reply_to_status_id_str: 'other-parent-tweet',
                                          created_at: 'Sun Nov 08 10:05:00 +0000 2026',
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      };

      // 本人の userId を指定して抽出
      const items = extractXPassiveActivities(mockUrl, mockResponse, myUserId);
      expect(items.length).toBe(1);
      expect(items[0].targetId).toBe('my-reply-tweet');
      expect(items[0].actionType).toBe('tweet_reply');
      expect(items[0].title).toBe('@hisui_renka_v 雨空ゆみの返信です！');
    });

    it('HomeTimelineなどの他人のタイムラインエンドポイントは完全に拒否されること', () => {
      const mockHomeUrl = 'https://x.com/i/api/graphql/xxx/HomeTimeline';
      const mockResponse = {
        data: {
          home: {
            home_timeline_entry: {
              itemContent: {
                tweet_results: {
                  result: {
                    rest_id: 'stranger-tweet',
                    legacy: { full_text: 'おすすめに流れてきた見知らぬ人のツイート' },
                  },
                },
              },
            },
          },
        },
      };

      const items = extractXPassiveActivities(mockHomeUrl, mockResponse);
      expect(items).toEqual([]);
    });
  });
});
