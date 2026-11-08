import { ActivityRecord } from '../types';
import { formatDateString } from '../utils/dateUtils';
import { calculateBaseScore } from '../score/scoringEngine';

/**
 * YouTube 公開 RSS フィード (XML) をパースし、ActivityRecord 配列を生成する
 * DOMParser が利用可能な環境では DOMParser を利用し、利用できない環境（Service Worker / Node）では正規表現で安全にフォールバックパースする
 * @param xmlText YouTube RSS フィード XML 文字列
 */
export function parseYouTubeRssXml(xmlText: string): ActivityRecord[] {
  const records: ActivityRecord[] = [];

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const entries = xmlDoc.getElementsByTagName('entry');

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const videoIdEl = entry.getElementsByTagName('yt:videoId')[0];
      const titleEl = entry.getElementsByTagName('title')[0];
      const publishedEl = entry.getElementsByTagName('published')[0];

      const videoId = videoIdEl?.textContent?.trim() || `rss-${i}-${Date.now()}`;
      const title = titleEl?.textContent?.trim() || '動画';
      const publishedIso = publishedEl?.textContent?.trim();

      if (!publishedIso) continue;
      const rec = buildRecordFromEntry(videoId, title, publishedIso);
      if (rec) records.push(rec);
    }
    return records;
  }

  // DOMParser がない場合のフォールバック（正規表現ベース）
  const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
  const matches = xmlText.match(entryRegex) || [];

  for (let i = 0; i < matches.length; i++) {
    const entryBlock = matches[i];
    const videoIdMatch = entryBlock.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/i);
    const titleMatch = entryBlock.match(/<title>([\s\S]*?)<\/title>/i);
    const publishedMatch = entryBlock.match(/<published>([\s\S]*?)<\/published>/i);

    const videoId = videoIdMatch ? videoIdMatch[1].trim() : `rss-${i}-${Date.now()}`;
    const title = titleMatch ? titleMatch[1].trim() : '動画';
    const publishedIso = publishedMatch ? publishedMatch[1].trim() : '';

    if (!publishedIso) continue;
    const rec = buildRecordFromEntry(videoId, title, publishedIso);
    if (rec) records.push(rec);
  }

  return records;
}

function buildRecordFromEntry(videoId: string, title: string, publishedIso: string): ActivityRecord | null {
  const publishedDate = new Date(publishedIso);
  if (isNaN(publishedDate.getTime())) return null;

  const timestamp = publishedDate.getTime();
  const dateString = formatDateString(timestamp);
  const isShorts = Boolean(/#shorts/i.test(title));
  const actionType = isShorts ? 'shorts_publish' : 'video_publish';
  const score = calculateBaseScore(actionType);

  return {
    id: `yt-rss-${videoId}`,
    platform: 'youtube',
    actionType,
    targetId: videoId,
    title,
    score,
    timestamp,
    dateString,
  };
}

/**
 * チャンネルIDまたはURLから YouTube RSS フィードを取得してパースする
 * @param channelId チャンネルID (例: UC...)
 */
export async function fetchYouTubeChannelRss(channelId: string): Promise<ActivityRecord[]> {
  const cleanId = channelId.trim().replace(/^.*\/channel\//, '').replace(/^.*@/, '');
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${cleanId}`;

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`RSSフィードの取得に失敗しました (Status: ${response.status})`);
  }

  const xmlText = await response.text();
  return parseYouTubeRssXml(xmlText);
}
