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
