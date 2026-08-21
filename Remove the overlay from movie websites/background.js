chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (typeof window.removeOverlays === 'function') {
        window.removeOverlays();
        // 显示通知（不阻塞页面）
        chrome.runtime.sendMessage({ type: 'showNotification', message: '✅ 遮罩已清除！' });
      } else {
        // 备用方案
        chrome.storage.sync.get(['allowedDomains'], (result) => {
          const allowed = result.allowedDomains || [];
          const currentDomain = window.location.hostname;
          
          if (allowed.length > 0) {
            const isAllowed = allowed.some(domain => 
              currentDomain === domain || currentDomain.endsWith('.' + domain)
            );
            if (!isAllowed) {
              alert('⛔ 当前域名不在白名单中');
              return;
            }
          }
          
          // 执行清除...
          const allChildren = document.body.children;
          const toRemove = [];
          for (let el of allChildren) {
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex);
            if ((style.position === 'fixed' || style.position === 'absolute') && 
                !isNaN(zIndex) && zIndex >= 50) {
              const tag = el.tagName.toLowerCase();
              if (tag !== 'video' && /^[a-z]{3,8}$/.test(tag)) {
                toRemove.push(el);
              }
            }
          }
          toRemove.forEach(el => el.remove());
          
          document.querySelectorAll('video').forEach(v => {
            v.style.zIndex = '999999';
            v.style.position = 'fixed';
            v.style.top = '50%';
            v.style.left = '50%';
            v.style.transform = 'translate(-50%, -50%)';
            v.style.width = '80%';
            v.style.maxHeight = '90vh';
            v.controls = true;
            v.style.pointerEvents = 'auto';
          });
          alert('✅ 已清除 ' + toRemove.length + ' 个遮罩元素！');
        });
      }
    }
  });
});

// 监听来自popup的通知请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'showNotification') {
    // 可以扩展为更友好的通知方式
    console.log('通知:', message.message);
    sendResponse({ success: true });
  }
});
