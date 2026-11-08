import { InterceptEventMessage, RuntimeMessage } from '../types';

/**
 * YouTube 用 ISOLATED World コンテンツスクリプト
 * MAIN World に injected-yt.js を注入し、postMessage を受信して Service Worker へ転送する
 */
(() => {
  // MAIN World スクリプトの注入
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected-yt.js');
    script.onload = () => {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.error('[v-activity-lawn] Failed to inject YouTube monitor script:', err);
  }

  // MAIN World からの postMessage を受信
  window.addEventListener('message', (event) => {
    // 送信元が自ウィンドウかつ指定のプレフィックスであることを検証
    if (event.source !== window || !event.data || event.data.source !== 'v-activity-lawn-injected') {
      return;
    }

    const msg = event.data as InterceptEventMessage;
    if (msg.platform !== 'youtube') return;

    const runtimeMsg: RuntimeMessage = {
      type: 'RECORD_ACTIVITY',
      platform: 'youtube',
      actionType: msg.actionType,
      targetId: msg.payload?.targetId,
      title: msg.payload?.title,
      durationMinutes: msg.payload?.durationMinutes,
      timestamp: msg.payload?.timestamp || Date.now(),
    };

    chrome.runtime.sendMessage(runtimeMsg).catch(() => {
      // Service Worker が停止・再起動中の場合などのエラーハンドリング
    });
  });
})();
