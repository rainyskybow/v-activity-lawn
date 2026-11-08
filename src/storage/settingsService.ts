import { db } from './db';
import { UserSettings, ThemeColorName } from '../types';

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'config',
  themeColor: 'green',
  weekStartDay: 0, // 0: 日曜日始まり
  privacyMaskingDefault: false,
  darkMode: false,
};

/**
 * ユーザー設定を取得する（存在しない場合は初期値を保存して返却）
 */
export async function getSettings(): Promise<UserSettings> {
  try {
    const existing = await db.settings.get('config');
    if (existing) {
      return existing;
    }
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.warn('Failed to load settings from DB, using defaults', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * ユーザー設定を部分更新する
 */
export async function updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const merged: UserSettings = {
    ...current,
    ...updates,
    id: 'config',
  };
  await db.settings.put(merged);
  return merged;
}

/**
 * テーマカラーを更新する
 */
export async function setThemeColor(themeColor: ThemeColorName): Promise<void> {
  await updateSettings({ themeColor });
}
