import { ActivityRecord, DailySummary } from '../types';

/**
 * アクション種別の日本語表示名とバッジ色の定義
 */
export const ACTION_TYPE_LABELS: Record<string, { label: string; badgeClass: string }> = {
  video_publish: { label: '長尺動画公開', badgeClass: 'bg-red-500 text-white' },
  shorts_publish: { label: 'Shorts公開', badgeClass: 'bg-orange-500 text-white' },
  stream_start: { label: '配信開始', badgeClass: 'bg-purple-600 text-white' },
  stream_end: { label: '配信終了', badgeClass: 'bg-purple-700 text-white' },
  stream_schedule: { label: '配信枠作成', badgeClass: 'bg-indigo-500 text-white' },
  community_post: { label: 'コミュニティ投稿', badgeClass: 'bg-blue-500 text-white' },
  creator_reply: { label: 'コメント返信', badgeClass: 'bg-teal-500 text-white' },
  creator_heart: { label: 'クリエイターハート', badgeClass: 'bg-pink-500 text-white' },
  metadata_update: { label: 'メタデータ更新', badgeClass: 'bg-gray-500 text-white' },
  tweet_post: { label: 'Xポスト', badgeClass: 'bg-sky-500 text-white' },
  tweet_reply: { label: 'Xリプライ', badgeClass: 'bg-sky-600 text-white' },
  tweet_retweet: { label: 'Xリポスト', badgeClass: 'bg-emerald-500 text-white' },
  tweet_like: { label: 'Xいいね', badgeClass: 'bg-rose-400 text-white' },
};

/**
 * タイムラインコンポーネントを描画する
 */
export function renderTimeline(
  container: HTMLElement,
  date: string,
  summary: DailySummary | undefined,
  activities: ActivityRecord[],
  onClose?: () => void
): void {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-5 w-full';

  // ヘッダー部分
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3 mb-4';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'flex items-center space-x-3';

  const dateEl = document.createElement('h3');
  dateEl.className = 'text-lg font-bold text-gray-900 dark:text-white';
  dateEl.textContent = `${date} の活動詳細`;

  const scoreBadge = document.createElement('span');
  scoreBadge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  scoreBadge.textContent = `${summary ? summary.totalScore : 0} pt (Level ${summary ? summary.level : 0})`;

  titleGroup.appendChild(dateEl);
  titleGroup.appendChild(scoreBadge);

  if (onClose) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-medium px-2 py-1 rounded';
    closeBtn.textContent = '閉じる';
    closeBtn.addEventListener('click', onClose);
    header.appendChild(titleGroup);
    header.appendChild(closeBtn);
  } else {
    header.appendChild(titleGroup);
  }

  card.appendChild(header);

  // アクティビティリスト
  if (activities.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'text-center py-8 text-gray-400 dark:text-gray-500 text-sm';
    emptyMsg.textContent = 'この日の記録されたアクティビティはありません。';
    card.appendChild(emptyMsg);
    container.appendChild(card);
    return;
  }

  const list = document.createElement('div');
  list.className = 'space-y-3 max-h-80 overflow-y-auto pr-1';

  for (const act of activities) {
    const item = document.createElement('div');
    item.className = 'flex items-start space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 transition';

    const info = ACTION_TYPE_LABELS[act.actionType] || { label: act.actionType, badgeClass: 'bg-gray-500 text-white' };

    // バッジ
    const badge = document.createElement('span');
    badge.className = `px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap ${info.badgeClass}`;
    badge.textContent = info.label;

    // 本文・メタ情報
    const content = document.createElement('div');
    content.className = 'flex-1 min-w-0';

    const titleText = document.createElement('p');
    titleText.className = 'text-sm text-gray-800 dark:text-gray-200 truncate font-medium';
    titleText.textContent = act.title || '(タイトルなし)';

    const metaRow = document.createElement('div');
    metaRow.className = 'flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5';

    const timeStr = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeSpan = document.createElement('span');
    timeSpan.textContent = timeStr;

    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = `+${act.score} pt`;

    metaRow.appendChild(timeSpan);
    metaRow.appendChild(document.createTextNode('•'));
    metaRow.appendChild(scoreSpan);

    if (act.durationMinutes) {
      metaRow.appendChild(document.createTextNode('•'));
      const durationSpan = document.createElement('span');
      durationSpan.textContent = `配信時間: ${act.durationMinutes}分`;
      metaRow.appendChild(durationSpan);
    }

    content.appendChild(titleText);
    content.appendChild(metaRow);

    item.appendChild(badge);
    item.appendChild(content);
    list.appendChild(item);
  }

  card.appendChild(list);
  container.appendChild(card);
}
