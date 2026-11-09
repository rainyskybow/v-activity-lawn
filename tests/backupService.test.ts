import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseBackupJson,
  createBackupPayload,
  importBackupData,
} from '../src/storage/backupService';
import { db } from '../src/storage/db';
import { getSettings } from '../src/storage/settingsService';
import { ActivityRecord } from '../src/types';

describe('backupService', () => {
  beforeEach(async () => {
    await db.activities.clear();
    await db.daily_summaries.clear();
    await db.streaks.clear();
    await db.settings.clear();
  });

  describe('parseBackupJson', () => {
    it('正規のBackupPayload形式JSONを正確にパースすること', () => {
      const mockPayload = {
        version: 1,
        app: 'v-activity-lawn',
        exportedAt: '2026-11-09T00:00:00.000Z',
        activities: [
          {
            id: 'act-1',
            platform: 'youtube',
            actionType: 'video_publish',
            title: '動画タイトル',
            score: 15,
            timestamp: 1700000000000,
            dateString: '2023-11-14',
          },
        ],
        settings: {
          id: 'config',
          themeColor: 'purple',
          weekStartDay: 1,
          privacyMaskingDefault: false,
          darkMode: true,
        },
      };

      const result = parseBackupJson(JSON.stringify(mockPayload));
      expect(result.activities.length).toBe(1);
      expect(result.activities[0].id).toBe('act-1');
      expect(result.activities[0].platform).toBe('youtube');
      expect(result.settings?.themeColor).toBe('purple');
      expect(result.settings?.darkMode).toBe(true);
    });

    it('配列形式（ActivityRecord[] 単体）のJSONも互換性を持ってパースすること', () => {
      const mockList: Partial<ActivityRecord>[] = [
        {
          id: 'act-array-1',
          platform: 'x',
          actionType: 'tweet_post',
          title: 'ツイート内容',
          timestamp: 1700000000000,
          dateString: '2023-11-14',
        },
      ];

      const result = parseBackupJson(JSON.stringify(mockList));
      expect(result.activities.length).toBe(1);
      expect(result.activities[0].id).toBe('act-array-1');
      expect(result.activities[0].platform).toBe('x');
      expect(result.settings).toBeUndefined();
    });

    it('不正なデータに対して適切なエラーを投げること', () => {
      expect(() => parseBackupJson('')).toThrow('バックアップデータが空です。');
      expect(() => parseBackupJson('invalid json string')).toThrow('無効なJSONフォーマットです。');
      expect(() => parseBackupJson('{}')).toThrow('アクティビティデータ（activities）が見つかりませんでした。');
      expect(() => parseBackupJson(JSON.stringify({ activities: [] }))).toThrow('復元可能な有効なアクティビティが含まれていません。');
    });

    it('欠損のあるレコードや無効なタイムスタンプを安全に補正すること', () => {
      const mockData = {
        activities: [
          {
            // idが空
            platform: 'youtube',
            actionType: 'shorts_publish',
            title: 'Shorts動画',
            timestamp: NaN,
            dateString: 'invalid-date',
          },
        ],
      };

      const result = parseBackupJson(JSON.stringify(mockData));
      expect(result.activities.length).toBe(1);
      expect(result.activities[0].id).toBeTruthy();
      expect(result.activities[0].timestamp).toBeGreaterThan(0);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(result.activities[0].dateString)).toBe(true);
    });
  });

  describe('createBackupPayload', () => {
    it('DB内のアクティビティと設定を取得して正しいPayloadを生成すること', async () => {
      await db.activities.put({
        id: 'act-db-1',
        platform: 'youtube',
        actionType: 'video_publish',
        title: 'DB保存動画',
        score: 15,
        timestamp: 1700000000000,
        dateString: '2023-11-14',
      });

      const payload = await createBackupPayload();
      expect(payload.version).toBe(1);
      expect(payload.app).toBe('v-activity-lawn');
      expect(payload.activities.length).toBe(1);
      expect(payload.activities[0].id).toBe('act-db-1');
      expect(payload.settings).toBeDefined();
    });
  });

  describe('importBackupData', () => {
    it('Fileオブジェクトからバックアップデータを読み込みDBに反映・集計すること', async () => {
      const backupJson = JSON.stringify({
        version: 1,
        app: 'v-activity-lawn',
        exportedAt: '2026-11-09T00:00:00.000Z',
        activities: [
          {
            id: 'imported-act-1',
            platform: 'youtube',
            actionType: 'stream_end',
            title: '復元された配信枠',
            durationMinutes: 60,
            score: 20,
            timestamp: 1700000000000,
            dateString: '2023-11-14',
          },
        ],
        settings: {
          id: 'config',
          themeColor: 'cyan',
          weekStartDay: 0,
          privacyMaskingDefault: false,
          darkMode: false,
        },
      });

      // ブラウザ互換の File モック（text メソッド付き）
      const mockFile = {
        name: 'test-backup.json',
        text: async () => backupJson,
      } as unknown as File;

      const result = await importBackupData(mockFile);
      expect(result.count).toBe(1);
      expect(result.hasSettings).toBe(true);

      // DBにアクティビティが書き込まれ、日次集計が生成されたことを確認
      const act = await db.activities.get('imported-act-1');
      expect(act).toBeDefined();
      expect(act?.title).toBe('復元された配信枠');

      const summary = await db.daily_summaries.get('2023-11-14');
      expect(summary).toBeDefined();
      expect(summary?.totalScore).toBeGreaterThan(0);

      // 設定が更新されたことを確認
      const currentSettings = await getSettings();
      expect(currentSettings.themeColor).toBe('cyan');
    });
  });
});
