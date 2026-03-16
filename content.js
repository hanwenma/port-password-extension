// content.js
(function() {
  let savingInProgress = false;

  function getTargetForm() {
    const forms = document.forms;
    for (let form of forms) {
      if (form.querySelector('input[type="password"]')) {
        return form;
      }
    }
    return forms.length > 0 ? forms[0] : null;
  }

  function captureFromForm(form) {
    if (!form) return [];
    const inputs = form.querySelectorAll('input[type="text"], input[type="password"]');
    const fields = [];
    inputs.forEach((input, index) => {
      const value = input.value.trim();
      if (value) {
        fields.push({ index, value });
      }
    });
    return fields;
  }

  function saveFields(fields, callback) {
    if (fields.length === 0) {
      if (callback) callback();
      return;
    }
    const url = window.location.href; // 传递完整 URL
    chrome.runtime.sendMessage(
      { type: 'SAVE_FIELDS', payload: { url, fields } },
      callback
    );
  }

  function captureAndSave(form) {
    if (savingInProgress) return;
    savingInProgress = true;
    const fields = captureFromForm(form);
    saveFields(fields, () => {
      savingInProgress = false;
    });
  }

  function isLoginButton(element) {
    if (!element) return false;
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'button' || (tagName === 'input' && ['submit', 'button'].includes(element.type))) {
      const text = (element.innerText || element.value || '').toLowerCase().trim();
      const keywords = ['登录', '登入', 'sign in', 'login', 'log in', 'submit'];
      return keywords.some(keyword => text.includes(keyword));
    }
    return false;
  }

  function fillFields(fields) {
    if (!fields || fields.length === 0) return;
    const form = getTargetForm();
    if (!form) return;
    const inputs = form.querySelectorAll('input[type="text"], input[type="password"]');
    fields.forEach(item => {
      const input = inputs[item.index];
      if (input) {
        input.value = item.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function requestAutofill(retryCount = 0) {
    if (!document.querySelector('input[type="password"]')) {
      if (retryCount < 3) {
        setTimeout(() => requestAutofill(retryCount + 1), 1000);
      }
      return;
    }
    chrome.runtime.sendMessage(
      { type: 'REQUEST_AUTOFILL', url: window.location.href },
      (response) => {
        if (response && response.fields) {
          fillFields(response.fields);
        }
      }
    );
  }

  // 监听点击登录按钮
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (isLoginButton(target)) {
      const form = target.closest('form') || getTargetForm();
      if (form && form.querySelector('input[type="password"]')) {
        console.log("click login buuton = ", form);
        captureAndSave(form);
      }
    }
  }, true);

  // 自动填充
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAutofill());
  } else {
    requestAutofill();
  }

  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTOFILL') {
      fillFields(message.payload.fields);
      sendResponse({ success: true });
    } else if (message.type === 'CAPTURE_FORM') {
      const form = getTargetForm();
      if (!form) {
        sendResponse({ success: false, error: '页面上没有找到表单' });
        return;
      }
      const fields = captureFromForm(form);
      if (fields.length === 0) {
        sendResponse({ success: false, error: '没有捕获到任何非空字段' });
        return;
      }
      saveFields(fields, () => {
        sendResponse({ success: true, fields });
      });
      return true;
    }
  });
})();