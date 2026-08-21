document.addEventListener('DOMContentLoaded', () => {
  const domainsTextarea = document.getElementById('domains');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusDiv = document.getElementById('status');
  const domainDisplay = document.getElementById('domainDisplay');

  // 显示当前页面域名
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        domainDisplay.textContent = url.hostname;
      } catch {
        domainDisplay.textContent = '无法获取';
      }
    }
  });

  // 加载已保存的白名单
  chrome.storage.sync.get(['allowedDomains'], (result) => {
    const domains = result.allowedDomains || [];
    domainsTextarea.value = domains.join('\n');
  });

  // 保存设置
  saveBtn.addEventListener('click', () => {
    const rawText = domainsTextarea.value;
    // 按行分割，过滤空行，去除首尾空格
    const domains = rawText
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);

    chrome.storage.sync.set({ allowedDomains: domains }, () => {
      showStatus('✅ 白名单已保存！共 ' + domains.length + ' 个域名', 'success');
      
      // 通知当前页面重新检查
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              if (typeof window.removeOverlays === 'function') {
                window.removeOverlays();
              }
            }
          });
        }
      });
    });
  });

  // 清空白名单
  clearBtn.addEventListener('click', () => {
    chrome.storage.sync.set({ allowedDomains: [] }, () => {
      domainsTextarea.value = '';
      showStatus('🗑️ 白名单已清空，将对所有网站生效', 'success');
      
      // 通知当前页面重新检查
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              if (typeof window.removeOverlays === 'function') {
                window.removeOverlays();
              }
            }
          });
        }
      });
    });
  });

  // 状态提示
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
});
