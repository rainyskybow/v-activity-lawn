import { InterceptEventMessage, RuntimeMessage } from '../types';

/**
 * X (旧Twitter) 用 ISOLATED World コンテンツスクリプト
 * MAIN World (injected-x.js) からの postMessage を受信し、chrome.runtime で Service Worker へ安全に中継する
 */
(() => {
  console.log('[v-activity-lawn] X ISOLATED World listener ready.');

  // MAIN World からの postMessage を受信
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'v-activity-lawn-injected') {
      return;
    }

    const msg = event.data as InterceptEventMessage;
    if (msg.platform !== 'x') return;

    // パッシブ一括アクティビティ受信時（過去ログ自動吸い上げ）
    if (msg.isBulk && msg.bulkItems && msg.bulkItems.length > 0) {
      const runtimeMsg: RuntimeMessage = {
        type: 'RECORD_BULK_ACTIVITIES',
        items: msg.bulkItems,
      };
      chrome.runtime.sendMessage(runtimeMsg).catch(() => {});
      return;
    }

    // 単体アクティビティ受信時
    if (msg.actionType) {
      const runtimeMsg: RuntimeMessage = {
        type: 'RECORD_ACTIVITY',
        platform: 'x',
        actionType: msg.actionType,
        targetId: msg.payload?.targetId,
        title: msg.payload?.title,
        durationMinutes: msg.payload?.durationMinutes,
        timestamp: msg.payload?.timestamp || Date.now(),
      };
      chrome.runtime.sendMessage(runtimeMsg).catch(() => {});
    }
  });
})();
