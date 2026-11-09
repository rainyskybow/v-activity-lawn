import { InterceptEventMessage, RuntimeMessage } from '../types';

/**
 * X (旧Twitter) 用 ISOLATED World コンテンツスクリプト
 * MAIN World (injected-x.js) からの postMessage を受信し、chrome.runtime で Service Worker へ安全に中継する
 */
(() => {
  console.log('[v-activity-lawn] X ISOLATED World listener ready.');

  /**
   * 拡張機能コンテキスト（拡張機能のリロードや更新による無効化）を安全に判定
   */
  function isExtensionContextValid(): boolean {
    try {
      return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  const handleMessage = (event: MessageEvent) => {
    // 拡張機能のコンテキストが無効化されている場合はリスナーを解除して終了
    if (!isExtensionContextValid()) {
      window.removeEventListener('message', handleMessage);
      return;
    }

    if (event.source !== window || !event.data || event.data.source !== 'v-activity-lawn-injected') {
      return;
    }

    const msg = event.data as InterceptEventMessage;
    if (msg.platform !== 'x') return;

    try {
      if (!isExtensionContextValid()) {
        window.removeEventListener('message', handleMessage);
        return;
      }

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
    } catch (err) {
      // Extension context invalidated 例外の完全な安全捕捉と後始末
      window.removeEventListener('message', handleMessage);
    }
  };

  window.addEventListener('message', handleMessage);
})();
