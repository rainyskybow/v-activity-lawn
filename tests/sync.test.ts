import { describe, it, expect } from 'vitest';
import { parseYouTubeRssXml } from '../src/sync/youtubeRss';
import { extractJsonFromJsString, parseTweetsArray, parseLikesArray } from '../src/sync/xArchive';

describe('sync', () => {
  describe('youtubeRss', () => {
    it('YouTube公開RSSのXMLテキストを正確にActivityRecord配列に変換すること', () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>testVideo123</yt:videoId>
    <title>【初配信】はじめまして！VTuberデビュー！</title>
    <published>2026-11-08T12:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>shorts456</yt:videoId>
    <title>おすすめの挨拶 #shorts</title>
    <published>2026-11-07T08:30:00+00:00</published>
  </entry>
</feed>`;

      const records = parseYouTubeRssXml(sampleXml);
      expect(records.length).toBe(2);

      const rec1 = records[0];
      expect(rec1.platform).toBe('youtube');
      expect(rec1.actionType).toBe('video_publish');
      expect(rec1.targetId).toBe('testVideo123');
      expect(rec1.title).toBe('【初配信】はじめまして！VTuberデビュー！');
      expect(rec1.score).toBe(15);

      const rec2 = records[1];
      expect(rec2.actionType).toBe('shorts_publish');
      expect(rec2.targetId).toBe('shorts456');
      expect(rec2.score).toBe(6);
    });
  });

  describe('xArchive', () => {
    it('window.YTD.tweets.part0 形式のJS文字列から配列を正しく抽出すること', () => {
      const jsContent = `window.YTD.tweets.part0 = [
        {
          "tweet": {
            "id_str": "1234567890",
            "full_text": "今夜21時から配信やります！",
            "created_at": "Sun Nov 08 12:00:00 +0000 2026"
          }
        }
      ];`;

      const extracted = extractJsonFromJsString(jsContent);
      expect(Array.isArray(extracted)).toBe(true);
      expect(extracted.length).toBe(1);

      const records = parseTweetsArray(extracted);
      expect(records.length).toBe(1);
      expect(records[0].platform).toBe('x');
      expect(records[0].actionType).toBe('tweet_post');
      expect(records[0].targetId).toBe('1234567890');
      expect(records[0].title).toBe('今夜21時から配信やります！');
      expect(records[0].score).toBe(2);
    });

    it('リプライおよびリポストを正確に分類すること', () => {
      const items = [
        {
          tweet: {
            id_str: 'reply-1',
            full_text: '@fan コメントありがとうございます！',
            in_reply_to_status_id_str: 'fan-tweet-1',
            created_at: 'Sun Nov 08 13:00:00 +0000 2026',
          },
        },
        {
          tweet: {
            id_str: 'rt-1',
            full_text: 'RT @collab: 明日のコラボ告知！',
            created_at: 'Sun Nov 08 14:00:00 +0000 2026',
          },
        },
      ];

      const records = parseTweetsArray(items);
      expect(records[0].actionType).toBe('tweet_reply');
      expect(records[0].score).toBe(1);

      expect(records[1].actionType).toBe('tweet_retweet');
      expect(records[1].score).toBe(2);
    });

    it('like.js の配列をパースすること', () => {
      const likes = [
        {
          like: {
            tweetId: 'liked-tweet-1',
            fullText: '素敵なファンアートです！',
          },
        },
      ];

      const records = parseLikesArray(likes);
      expect(records.length).toBe(1);
      expect(records[0].actionType).toBe('tweet_like');
      expect(records[0].targetId).toBe('liked-tweet-1');
      expect(records[0].score).toBe(0.2);
    });
  });
});
