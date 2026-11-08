import { describe, it, expect } from 'vitest';
import { extractYouTubePassiveActivities } from '../src/sync/youtubePassiveParser';
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
  });
});
