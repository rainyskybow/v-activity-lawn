import JSZip from 'jszip';
import { ActivityRecord } from '../types';
import { formatDateString } from '../utils/dateUtils';
import { calculateBaseScore } from '../score/scoringEngine';

/**
 * CSVテキストをパースして2次元配列（行×列）に変換する軽量・堅牢パーサー
 * （引用符内のカンマ・改行・エスケープおよびUTF-8 BOMに対応）
 */
export function parseCsvText(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // エスケープされたダブルクォート
          currentField += '"';
          i++;
        } else {
          // 引用終了
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

/**
 * 様々な日付文字列形式をミリ秒タイムスタンプに変換する
 */
export function parseDateToTimestamp(dateStr: string): number {
  if (!dateStr) return Date.now();
  const trimmed = dateStr.trim();

  // 数値のみ（秒またはミリ秒エポック）
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return num > 1e11 ? num : num * 1000;
  }

  // YYYY/MM/DD または YYYY-MM-DD
  const isoFormatted = trimmed.replace(/\//g, '-');
  const parsed = Date.parse(isoFormatted);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return Date.now();
}

/**
 * YouTube Studio アナリティクス「表データ.csv」または「Table data.csv」をパースする
 */
export function parseStudioTableCsv(csvText: string): ActivityRecord[] {
  const rows = parseCsvText(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const videoIdIndex = header.findIndex((h) => h.includes('動画 id') || h.includes('video id'));
  const titleIndex = header.findIndex((h) => h === '動画' || h.includes('title') || h === 'content');
  const publishTimeIndex = header.findIndex((h) => h.includes('公開日') || h.includes('publish time') || h.includes('date'));
  const durationIndex = header.findIndex((h) => h === '長さ' || h.includes('duration'));
  const privacyIndex = header.findIndex(
    (h) =>
      !h.includes('公開日') &&
      !h.includes('publish time') &&
      (h.includes('公開') || h.includes('visibility') || h.includes('privacy') || h.includes('状態') || h.includes('status'))
  );

  if (videoIdIndex === -1 && publishTimeIndex === -1) {
    return [];
  }

  const records: ActivityRecord[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || !row[0]) continue;

    const videoId = videoIdIndex !== -1 ? row[videoIdIndex] : `studio-csv-${r}`;
    if (!videoId || videoId === '合計' || videoId === 'Total') continue;

    // 非公開（PRIVATE / 非公開）の動画は除外
    if (privacyIndex !== -1 && row[privacyIndex]) {
      const priv = row[privacyIndex].trim().toLowerCase();
      if (priv === '非公開' || priv === 'private') {
        continue;
      }
    }

    const title = titleIndex !== -1 ? row[titleIndex] : '動画';
    const dateStr = publishTimeIndex !== -1 ? row[publishTimeIndex] : '';
    const timestamp = parseDateToTimestamp(dateStr);
    const dateString = formatDateString(timestamp);

    // 長さの秒数判定
    let lengthSeconds = 0;
    if (durationIndex !== -1 && row[durationIndex]) {
      const dStr = row[durationIndex];
      if (dStr.includes(':')) {
        const parts = dStr.split(':').map(Number);
        if (parts.length === 2) lengthSeconds = parts[0] * 60 + parts[1];
        if (parts.length === 3) lengthSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else {
        lengthSeconds = Number(dStr) || 0;
      }
    }

    const isShorts = Boolean(
      (lengthSeconds > 0 && lengthSeconds <= 60) ||
      /#shorts/i.test(title)
    );
    const actionType = isShorts ? 'shorts_publish' : 'video_publish';
    const score = calculateBaseScore(actionType);

    records.push({
      id: `youtube-${videoId}`,
      platform: 'youtube',
      actionType,
      targetId: videoId,
      title: title.slice(0, 50),
      durationMinutes: lengthSeconds > 0 ? Math.floor(lengthSeconds / 60) : undefined,
      score,
      timestamp,
      dateString,
    });
  }

  return records;
}

/**
 * Google Takeout の「投稿.csv」または「posts.csv」をパースする
 */
export function parseTakeoutPostsCsv(csvText: string): ActivityRecord[] {
  const rows = parseCsvText(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const postIdIndex = header.findIndex((h) => h.includes('投稿 id') || h.includes('post id') || h === 'id');
  const textIndex = header.findIndex((h) => h.includes('テキスト') || h.includes('text') || h.includes('content'));
  const timeIndex = header.findIndex((h) => h.includes('タイムスタンプ') || h.includes('timestamp') || h.includes('date') || h.includes('日時'));
  const attachIndex = header.findIndex((h) => h.includes('添付') || h.includes('attachment'));

  const records: ActivityRecord[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || !row[0]) continue;

    const postId = postIdIndex !== -1 ? row[postIdIndex] : `post-${r}-${Date.now()}`;
    const text = textIndex !== -1 ? row[textIndex] : 'コミュニティ投稿';
    const dateStr = timeIndex !== -1 ? row[timeIndex] : '';
    const timestamp = parseDateToTimestamp(dateStr);
    const dateString = formatDateString(timestamp);

    const attach = attachIndex !== -1 ? row[attachIndex] : '';
    const isPoll = attach.includes('POLL') || attach.includes('アンケート');
    const isVideo = attach.includes('VIDEO') || attach.includes('動画');

    let prefix = '';
    if (isPoll) prefix = '[アンケート] ';
    else if (isVideo) prefix = '[動画共有] ';

    const title = `${prefix}${text}`.trim().slice(0, 50) || 'コミュニティ投稿';
    const score = calculateBaseScore('community_post');

    records.push({
      id: `youtube-post-${postId}`,
      platform: 'youtube',
      actionType: 'community_post',
      targetId: postId,
      title,
      score,
      timestamp,
      dateString,
    });
  }

  return records;
}

/**
 * アップロードされた YouTube エクスポートファイル（Google Takeout ZIP、Studio CSV等）をパースして ActivityRecord 一覧を返す
 */
export async function parseUploadedYouTubeArchive(file: File): Promise<ActivityRecord[]> {
  const fileName = file.name.toLowerCase();

  // ZIPファイルの場合（Google Takeout または Studio エクスポートZIP）
  if (fileName.endsWith('.zip')) {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);
    const allRecords: ActivityRecord[] = [];

    for (const relativePath of Object.keys(zipContent.files)) {
      const lower = relativePath.toLowerCase();

      // 1. コミュニティ投稿 CSV (投稿.csv, posts.csv, community_posts.csv)
      if (lower.includes('post') && lower.endsWith('.csv') || lower.includes('投稿') && lower.endsWith('.csv') || lower.includes('community') && lower.endsWith('.csv')) {
        const text = await zipContent.files[relativePath].async('string');
        allRecords.push(...parseTakeoutPostsCsv(text));
      }

      // 2. Studio 詳細モード「表データ.csv」または「Table data.csv」または動画CSV
      if (lower.endsWith('表データ.csv') || lower.endsWith('table data.csv') || (lower.includes('video') && lower.endsWith('.csv')) || (lower.includes('動画') && lower.endsWith('.csv'))) {
        const text = await zipContent.files[relativePath].async('string');
        allRecords.push(...parseStudioTableCsv(text));
      }

      // 3. 動画メタデータ JSON (Takeout の [タイトル]-[id].json)
      if (lower.endsWith('.json') && !lower.includes('metadata') && !lower.includes('setting')) {
        try {
          const jsonText = await zipContent.files[relativePath].async('string');
          const data = JSON.parse(jsonText);
          if (data && (data.videoId || data.id) && (data.title || data.snippet?.title)) {
            const vId = (data.videoId as string) || (data.id as string);
            const title = (data.title as string) || (data.snippet?.title as string) || '動画';

            // 非公開動画は除外
            const privacy = data.privacy || data.status?.privacyStatus || data.snippet?.privacyStatus || data.visibility;
            if (typeof privacy === 'string') {
              const pLower = privacy.toLowerCase();
              if (pLower === 'private' || pLower === '非公開') {
                continue;
              }
            }

            const uploadTime = data.uploadDate || data.publishedAt || data.snippet?.publishedAt;
            const timestamp = parseDateToTimestamp(uploadTime);
            const isShorts = Boolean(/#shorts/i.test(title));
            const actionType = isShorts ? 'shorts_publish' : 'video_publish';

            allRecords.push({
              id: `youtube-${vId}`,
              platform: 'youtube',
              actionType,
              targetId: vId,
              title: title.slice(0, 50),
              score: calculateBaseScore(actionType),
              timestamp,
              dateString: formatDateString(timestamp),
            });
          }
        } catch {}
      }
    }

    return allRecords;
  }

  // 単体 CSV ファイルの場合
  const fileText = await file.text();
  const firstLine = fileText.split('\n')[0].toLowerCase();

  if (firstLine.includes('投稿') || firstLine.includes('post')) {
    return parseTakeoutPostsCsv(fileText);
  }
  return parseStudioTableCsv(fileText);
}
