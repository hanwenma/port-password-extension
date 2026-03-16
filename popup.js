// popup.js
let currentTabUrl = null;
let currentMode = 'origin';

// 获取当前标签页的 URL
async function getCurrentTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || null;
}

// 根据 URL 和模式生成存储键
function getStorageKey(urlString, mode) {
  try {
    const url = new URL(urlString);
    if (mode === 'origin') {
      return url.origin; // 例如 http://localhost:8080
    } else {
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

// 加载配置（使用当前 URL 和模式）
async function loadConfig() {
  if (!currentTabUrl) return { fields: [] };
  const key = getStorageKey(currentTabUrl, currentMode);
  if (!key) return { fields: [] };
  const result = await chrome.storage.local.get(key);
  return result[key] || { fields: [] };
}

// 保存配置
async function saveConfig(config) {
  if (!currentTabUrl) return;
  const key = getStorageKey(currentTabUrl, currentMode);
  if (!key) return;
  await chrome.storage.local.set({ [key]: config });
}

// 加载模式设置
async function loadMode() {
  const result = await chrome.storage.local.get('matchMode');
  currentMode = result.matchMode || 'origin';
  // 设置 radio 状态
  document.querySelectorAll('input[name="matchMode"]').forEach(radio => {
    radio.checked = (radio.value === currentMode);
  });
}

// 保存模式设置
async function saveMode(mode) {
  await chrome.storage.local.set({ matchMode: mode });
  currentMode = mode;
  // 刷新列表
  refresh();
}

// 转义HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 渲染字段列表（可编辑）
function renderFields(fields) {
  if (!Array.isArray(fields)) fields = [];
  const container = document.getElementById('fieldsContainer');
  container.innerHTML = '';
  fields.forEach((field) => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.setAttribute('data-original-index', field.index);
    row.innerHTML = `
      <span style="dispaly: inline-block;margin-right: 10px;">input_${field.index}：</span>
      <input type="text" class="field-value" value="${escapeHtml(field.value)}" placeholder="填充值">
      <button class="remove-field">✖</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.remove-field').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.field-row');
      row.remove();
    });
  });
}

// 从UI收集字段
function collectFieldsFromUI() {
  const rows = document.querySelectorAll('#fieldsContainer .field-row');
  const fields = [];
  rows.forEach(row => {
    const originalIndex = row.getAttribute('data-original-index');
    const value = row.querySelector('.field-value').value.trim();
    if (originalIndex !== null && value) {
      fields.push({ index: parseInt(originalIndex, 10), value });
    }
  });
  fields.sort((a, b) => a.index - b.index);
  return fields;
}

function showMessage(text, isError = false) {
  const msgDiv = document.getElementById('message');
  msgDiv.textContent = text;
  msgDiv.style.color = isError ? 'red' : 'green';
  setTimeout(() => { msgDiv.textContent = ''; }, 3000);
}

async function refresh() {
  const config = await loadConfig();
  renderFields(config.fields);
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  currentTabUrl = await getCurrentTabUrl();
  if (!currentTabUrl) {
    document.body.innerHTML = '<p>❌ 无法获取当前页面地址，请刷新后重试</p>';
    return;
  }

  // 显示简化的页面标识
  try {
    const url = new URL(currentTabUrl);
    document.getElementById('originDisplay').textContent = `📍 当前页面: ${url.host}${url.pathname}`;
  } catch (e) {
    document.getElementById('originDisplay').textContent = `📍 当前页面: 未知`;
  }

  await loadMode();
  await refresh();

  // 监听模式切换
  document.querySelectorAll('input[name="matchMode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      await saveMode(e.target.value);
    });
  });

  // 监听存储变化，自动刷新
  chrome.storage.onChanged.addListener((changes, areaName) => {
    const key = getStorageKey(currentTabUrl, currentMode);
    if (areaName === 'local' && key && changes[key]) {
      refresh();
    }
  });

  // 捕获当前表单
  document.getElementById('captureBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_FORM' }, (response) => {
      if (response?.success) {
        showMessage('✅ 捕获成功');
        refresh();
      } else {
        showMessage('❌ 捕获失败：' + (response?.error || '未知错误'), true);
      }
    });
  });

  // 保存修改
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const fields = collectFieldsFromUI();
    await saveConfig({ fields });
    showMessage('✅ 保存成功');
  });

  // 立即填充
  document.getElementById('fillBtn').addEventListener('click', async () => {
    const fields = collectFieldsFromUI();
    await saveConfig({ fields });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL', payload: { fields } });
    showMessage('⚡ 填充指令已发送');
  });

  // 刷新列表
  document.getElementById('refreshBtn').addEventListener('click', refresh);
});