import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  parseDateToTimestamp,
  parseStudioTableCsv,
  parseTakeoutPostsCsv,
} from '../src/sync/youtubeArchive';

describe('youtubeArchive', () => {
  describe('parseCsvText', () => {
    it('引用符内のカンマや改行、BOMを安全にパースすること', () => {
      const csv = `\uFEFF動画 ID,動画のタイトル,公開日\r\n"id-1","タイトル, カンマあり","2024/05/01"\r\n"id-2","タイトル\n改行あり","2024/05/02"`;
      const rows = parseCsvText(csv);
      expect(rows.length).toBe(3);
      expect(rows[1][0]).toBe('id-1');
      expect(rows[1][1]).toBe('タイトル, カンマあり');
      expect(rows[2][1]).toBe('タイトル\n改行あり');
    });
  });

  describe('parseStudioTableCsv', () => {
    it('YouTube Studio詳細モードの表データCSVから動画とShortsを正確に抽出すること', () => {
      const sampleCsv = `動画,動画 ID,公開日,長さ,視聴回数
"【通常長尺】ゲーム実況プレイ","video-abc","2024/05/01 19:00:00","1:05:30",1000
"自己紹介ショート動画 #Shorts","shorts-def","2024/05/02 12:00:00","0:45",5000
合計,,,"1:06:15",6000`;

      const records = parseStudioTableCsv(sampleCsv);
      expect(records.length).toBe(2);

      // 通常長尺動画
      expect(records[0].platform).toBe('youtube');
      expect(records[0].actionType).toBe('video_publish');
      expect(records[0].targetId).toBe('video-abc');
      expect(records[0].title).toBe('【通常長尺】ゲーム実況プレイ');
      expect(records[0].score).toBe(15);
      expect(records[0].dateString).toBe('2024-05-01');

      // ショート動画
      expect(records[1].actionType).toBe('shorts_publish');
      expect(records[1].targetId).toBe('shorts-def');
      expect(records[1].score).toBe(6);
      expect(records[1].dateString).toBe('2024-05-02');
    });

    it('英語ヘッダーのTable data CSVにも対応すること', () => {
      const enCsv = `Content,Video ID,Video publish time,Duration,Views
"Weekly Stream","stream-xyz","May 10, 2024","2:00:00",300`;

      const records = parseStudioTableCsv(enCsv);
      expect(records.length).toBe(1);
      expect(records[0].targetId).toBe('stream-xyz');
      expect(records[0].title).toBe('Weekly Stream');
    });
  });

  describe('parseTakeoutPostsCsv', () => {
    it('Google Takeoutの投稿.csvからコミュニティ投稿およびアンケートを抽出すること', () => {
      const samplePostsCsv = `投稿 ID,テキスト,タイムスタンプ,添付
"post-100","今夜の配信について告知です","2024-05-03T10:00:00Z",""
"post-200","配信時間アンケート！","2024-05-04T12:00:00Z","POLL: 19時, 21時"`;

      const records = parseTakeoutPostsCsv(samplePostsCsv);
      expect(records.length).toBe(2);

      expect(records[0].actionType).toBe('community_post');
      expect(records[0].targetId).toBe('post-100');
      expect(records[0].title).toBe('今夜の配信について告知です');
      expect(records[0].score).toBe(4);
      expect(records[0].dateString).toBe('2024-05-03');

      expect(records[1].actionType).toBe('community_post');
      expect(records[1].targetId).toBe('post-200');
      expect(records[1].title).toBe('[アンケート] 配信時間アンケート！');
      expect(records[1].score).toBe(4);
      expect(records[1].dateString).toBe('2024-05-04');
    });
  });
});
