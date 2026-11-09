import Dexie, { type Table } from 'dexie';
import { ActivityRecord, DailySummary, StreakRecord, UserSettings } from '../types';

/**
 * v-activity-lawn 用 IndexedDB データベースクラス
 */
export class ActivityLawnDatabase extends Dexie {
  activities!: Table<ActivityRecord, string>;
  daily_summaries!: Table<DailySummary, string>;
  streaks!: Table<StreakRecord, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super('v_activity_lawn_db');

    this.version(1).stores({
      activities: 'id, platform, actionType, dateString, timestamp, targetId',
      daily_summaries: 'date, level, hasSpecialMilestone',
      streaks: 'id',
      settings: 'id',
    });
  }
}

export const db = new ActivityLawnDatabase();

/**
 * DB接続が有効であることを保証し、Service Worker のスリープ等で切断されている場合は安全に再接続する
 */
export async function ensureDbOpen(): Promise<ActivityLawnDatabase> {
  if (!db.isOpen()) {
    try {
      await db.open();
    } catch (err) {
      console.warn('[v-activity-lawn] Reopening Dexie DB after close/abort:', err);
      try {
        db.close();
      } catch {}
      await db.open();
    }
  }
  return db;
}

/**
 * DB操作で接続切断（The connection was closed / AbortError）が発生した際に、
 * 自動で再接続して1回リトライするラッパー関数
 */
export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  await ensureDbOpen();
  try {
    return await operation();
  } catch (err: unknown) {
    const errMsg = String(err);
    if (
      errMsg.includes('connection was closed') ||
      errMsg.includes('DatabaseClosedError') ||
      errMsg.includes('AbortError')
    ) {
      console.warn('[v-activity-lawn] DB connection was closed. Reconnecting and retrying operation...', err);
      try {
        db.close();
      } catch {}
      await db.open();
      return await operation();
    }
    throw err;
  }
}
