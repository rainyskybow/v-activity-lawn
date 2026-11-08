/**
 * プラットフォーム種別
 */
export type PlatformType = 'youtube' | 'x';

/**
 * アクティビティのアクション種別
 */
export type ActionType =
  | 'video_publish'      // 長尺動画公開 (YouTube)
  | 'shorts_publish'     // ショート動画公開 (YouTube)
  | 'stream_start'       // ライブ配信開始 (YouTube)
  | 'stream_end'         // ライブ配信終了 (YouTube)
  | 'stream_schedule'    // 配信枠作成 (YouTube)
  | 'community_post'     // コミュニティ投稿 / アンケート (YouTube)
  | 'creator_reply'      // コメント返信 (YouTube)
  | 'creator_heart'      // クリエイターハート付与 (YouTube)
  | 'metadata_update'    // サムネイル・メタデータ更新 (YouTube)
  | 'tweet_post'         // X通常ポスト / 告知ポスト (X)
  | 'tweet_reply'        // Xリプライ (X)
  | 'tweet_retweet'      // Xリポスト (X)
  | 'tweet_like';        // Xいいね (X)

/**
 * 生アクティビティログレコード
 */
export interface ActivityRecord {
  id: string;                      // 一意なID (UUIDまたは一意識別子)
  platform: PlatformType;          // プラットフォーム
  actionType: ActionType;          // アクション種別
  targetId?: string;               // 動画ID、ポストID、コメントID等
  title?: string;                  // 動画タイトル、ポスト本文（先頭文字抜粋）
  durationMinutes?: number;        // 配信時間（分）
  score: number;                   // 本アクションによる獲得スコア
  timestamp: number;               // 発生時刻（エポックミリ秒）
  dateString: string;              // "YYYY-MM-DD" 形式（日次集計用ローカル日付）
}

/**
 * 日次集計データ
 */
export interface DailySummary {
  date: string;                    // "YYYY-MM-DD" (主キー)
  totalScore: number;              // 本日の合計活動スコア
  level: 0 | 1 | 2 | 3 | 4;        // 草の濃淡レベル (0〜4)
  hasSpecialMilestone: boolean;    // 長尺動画公開または配信実施の有無
  breakdown: {                     // アクション別内訳
    videoPublishCount: number;
    streamCount: number;
    streamDurationTotalMinutes: number;
    shortsPublishCount: number;
    communityPostCount: number;
    commentReplyCount: number;
    creatorHeartCount: number;
    tweetPostCount: number;
    tweetReplyCount: number;
    tweetRetweetCount: number;
    tweetLikeCount: number;
  };
  byPlatform: {
    youtubeScore: number;
    xScore: number;
  };
}

/**
 * 連続活動日数記録
 */
export interface StreakRecord {
  id: 'current_streak';
  currentStreakDays: number;       // 現在の連続活動日数
  longestStreakDays: number;       // 過去最長の連続活動日数
  lastActiveDate: string;          // 最終活動日 "YYYY-MM-DD"
}

/**
 * 推し色テーマ種別
 */
export type ThemeColorName = 'green' | 'pink' | 'cyan' | 'purple' | 'red' | 'yellow';

/**
 * ユーザー設定
 */
export interface UserSettings {
  id: 'config';
  themeColor: ThemeColorName;
  weekStartDay: 0 | 1;             // 0: 日曜日始まり, 1: 月曜日始まり
  customWeights?: Partial<Record<ActionType, number>>; // スコア重みのカスタム配点
  privacyMaskingDefault: boolean;  // 画像エクスポート時のマスキング標準有効化
  darkMode: boolean;               // ダークモードフラグ
}

/**
 * 表示フィルタ種別
 */
export type ViewFilterType =
  | 'all'              // 総合稼働草
  | 'works'            // 動画・配信（作品）のみ
  | 'interactions'     // ファン交流（返信・ハート・Xポスト）のみ
  | 'youtube'          // YouTubeのみ
  | 'x';               // Xのみ

/**
 * メインスクリプトからコンテンツスクリプトへのpostMessageデータ型
 */
export interface InterceptEventMessage {
  source: 'v-activity-lawn-injected';
  platform: PlatformType;
  actionType: ActionType;
  payload: {
    targetId?: string;
    title?: string;
    durationMinutes?: number;
    timestamp?: number;
    rawMeta?: Record<string, unknown>;
  };
}

/**
 * コンテンツスクリプトからService Workerへのchrome.runtimeメッセージ型
 */
export interface RuntimeMessage {
  type: 'RECORD_ACTIVITY';
  platform: PlatformType;
  actionType: ActionType;
  targetId?: string;
  title?: string;
  durationMinutes?: number;
  timestamp?: number;
}
