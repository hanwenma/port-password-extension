// background.js
// 从 URL 和存储的模式获取存储键
async function getStorageKeyFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const result = await chrome.storage.local.get('matchMode');
    const mode = result.matchMode || 'origin'; // 默认 origin
    if (mode === 'origin') {
      return url.origin; // 例如 http://localhost:8080
    } else {
      // 仅按端口：协议 + 端口，忽略主机名
      let port = url.port;
      if (!port) {
        port = url.protocol === 'https:' ? '443' : '80';
      }
      return `${url.protocol}//:${port}`; // 例如 http://:8080
    }
  } catch (e) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_AUTOFILL') {
    getStorageKeyFromUrl(message.url).then(key => {
      if (!key) {
        sendResponse({ fields: [] });
        return;
      }
      chrome.storage.local.get(key, (result) => {
        const data = result[key] || { fields: [] };
        sendResponse({ fields: data.fields });
      });
    });
    return true; // 异步响应
  } else if (message.type === 'SAVE_FIELDS') {
    const { url, fields } = message.payload;
    getStorageKeyFromUrl(url).then(key => {
      if (!key) {
        sendResponse({ success: false });
        return;
      }
      chrome.storage.local.set({ [key]: { fields } }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
});