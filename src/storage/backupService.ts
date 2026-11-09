import { db, withDbRetry } from './db';
import { getSettings, updateSettings } from './settingsService';
import { bulkImportActivities } from './activityService';
import { ActivityRecord, UserSettings } from '../types';
import { formatDateString } from '../utils/dateUtils';

/**
 * バックアップJSONのデータ構造
 */
export interface BackupPayload {
  version: number;
  app: 'v-activity-lawn';
  exportedAt: string;
  activities: ActivityRecord[];
  settings?: UserSettings;
}

/**
 * バックアップ用JSON文字列を解析・検証する純粋関数
 */
export function parseBackupJson(jsonString: string): {
  activities: ActivityRecord[];
  settings?: UserSettings;
} {
  if (!jsonString || typeof jsonString !== 'string') {
    throw new Error('バックアップデータが空です。');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('無効なJSONフォーマットです。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('無効なバックアップデータ形式です。');
  }

  let rawActivities: unknown[] = [];
  let settings: UserSettings | undefined;

  // 1. 配列形式（ActivityRecord[] そのまま）の場合
  if (Array.isArray(parsed)) {
    rawActivities = parsed;
  }
  // 2. オブジェクト形式（BackupPayload）の場合
  else {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.activities)) {
      rawActivities = obj.activities;
    } else {
      throw new Error('アクティビティデータ（activities）が見つかりませんでした。');
    }

    if (obj.settings && typeof obj.settings === 'object') {
      settings = obj.settings as UserSettings;
    }
  }

  // アクティビティレコードのバリデーションとサニタイズ
  const validActivities: ActivityRecord[] = [];
  for (const item of rawActivities) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;

    // 必須属性の存在確認
    if (!r.platform || !r.actionType) continue;

    const safeTimestamp =
      typeof r.timestamp === 'number' && !isNaN(r.timestamp) && r.timestamp > 0
        ? r.timestamp
        : Date.now();

    const safeDateString =
      typeof r.dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dateString)
        ? r.dateString
        : formatDateString(safeTimestamp);

    const safeRecord: ActivityRecord = {
      id: typeof r.id === 'string' && r.id ? r.id : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      platform: r.platform as ActivityRecord['platform'],
      actionType: r.actionType as ActivityRecord['actionType'],
      targetId: typeof r.targetId === 'string' ? r.targetId : undefined,
      title: typeof r.title === 'string' ? r.title : '',
      durationMinutes: typeof r.durationMinutes === 'number' ? r.durationMinutes : undefined,
      score: typeof r.score === 'number' && !isNaN(r.score) ? r.score : 0,
      timestamp: safeTimestamp,
      dateString: safeDateString,
    };

    validActivities.push(safeRecord);
  }

  if (validActivities.length === 0) {
    throw new Error('復元可能な有効なアクティビティが含まれていません。');
  }

  return { activities: validActivities, settings };
}

/**
 * 全アクティビティおよび設定を取得し、BackupPayload オブジェクトを生成する
 */
export async function createBackupPayload(): Promise<BackupPayload> {
  return await withDbRetry(async () => {
    const activities = await db.activities.toArray();
    const settings = await getSettings();

    return {
      version: 1,
      app: 'v-activity-lawn',
      exportedAt: new Date().toISOString(),
      activities,
      settings,
    };
  });
}

/**
 * ブラウザ上で Blob をファイルとしてダウンロードさせるヘルパー関数
 */
export function triggerFileDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * データをエクスポートし、JSONファイルとしてダウンロードをトリガーする
 */
export async function exportBackupData(): Promise<{ count: number; filename: string }> {
  const payload = await createBackupPayload();
  const dateStr = formatDateString();
  const filename = `v-activity-lawn-backup-${dateStr}.json`;
  const jsonString = JSON.stringify(payload, null, 2);

  triggerFileDownload(jsonString, filename);

  return {
    count: payload.activities.length,
    filename,
  };
}

/**
 * 選択されたJSONファイルからバックアップデータを復元し、DBおよびサマリーを更新する
 */
export async function importBackupData(file: File): Promise<{ count: number; hasSettings: boolean }> {
  const text = await file.text();
  const { activities, settings } = parseBackupJson(text);

  // アクティビティを一括安全保存＆日次集計・ストリーク再計算
  const count = await bulkImportActivities(activities);

  // 設定情報が存在する場合は復元
  let hasSettings = false;
  if (settings && typeof settings === 'object') {
    await updateSettings(settings);
    hasSettings = true;
  }

  return { count, hasSettings };
}
