// 方案A增强版：支持域名白名单

// 检查当前域名是否在白名单中
function isDomainAllowed() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['allowedDomains'], (result) => {
      const allowed = result.allowedDomains || [];
      const currentDomain = window.location.hostname;
      
      // 如果白名单为空，默认对所有网站生效
      if (allowed.length === 0) {
        resolve(true);
        return;
      }
      
      // 检查当前域名是否匹配白名单中的任一域名
      const isAllowed = allowed.some(domain => {
        // 支持子域名匹配：example.com 匹配 video.example.com
        return currentDomain === domain || currentDomain.endsWith('.' + domain);
      });
      
      resolve(isAllowed);
    });
  });
}

// 清除遮罩的核心函数
function removeRandomOverlays() {
  // 先检查域名是否允许
  isDomainAllowed().then((allowed) => {
    if (!allowed) {
      console.log('⛔ 当前域名不在白名单中，跳过清除');
      return;
    }

    console.log('✅ 域名已通过白名单检查，开始清除遮罩...');

    // 1. 清除所有 body 直接子元素中的固定定位遮罩
    const allChildren = document.body.children;
    const toRemove = [];
    
    for (let el of allChildren) {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex);
      
      if ((style.position === 'fixed' || style.position === 'absolute') && 
          !isNaN(zIndex) && zIndex >= 50) {
        if (el.tagName.toLowerCase() !== 'video') {
          toRemove.push(el);
        }
      }
    }
    
    toRemove.forEach(el => {
      el.remove();
      console.log('🗑️ 已移除遮罩元素:', el.tagName.toLowerCase());
    });

    // 2. 正则匹配随机标签
    const whiteList = ['div', 'span', 'p', 'a', 'img', 'video', 'section', 'article', 
                       'header', 'footer', 'nav', 'main', 'aside', 'ul', 'ol', 'li',
                       'button', 'input', 'form', 'table', 'tr', 'td', 'th', 'body',
                       'html', 'head', 'meta', 'link', 'script', 'style', 'canvas',
                       'svg', 'path', 'circle', 'rect'];
    
    const directChildren = Array.from(document.body.children);
    directChildren.forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (!whiteList.includes(tag) && /^[a-z]{3,8}$/.test(tag)) {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute') {
          el.remove();
          console.log('🗑️ 已移除随机标签遮罩:', tag);
        }
      }
    });

    // 3. 强制恢复视频控制权
    const videos = document.querySelectorAll('video');
    videos.forEach((video, index) => {
      video.style.zIndex = '999999';
      video.style.position = 'fixed';
      video.style.top = '50%';
      video.style.left = '50%';
      video.style.transform = 'translate(-50%, -50%)';
      video.style.width = '80%';
      video.style.maxHeight = '90vh';
      video.controls = true;
      video.style.pointerEvents = 'auto';
      video.style.display = 'block';
      console.log('✅ 已解锁视频 #' + (index + 1));
    });

    if (videos.length === 0) {
      console.log('⚠️ 未检测到视频元素');
    } else {
      console.log('📊 共处理 ' + videos.length + ' 个视频');
    }
  });
}

// 页面加载完成后执行
window.addEventListener('load', () => {
  setTimeout(removeRandomOverlays, 500);
});

// DOM变化时自动重新检测
let observerTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(observerTimer);
  observerTimer = setTimeout(removeRandomOverlays, 300);
});
observer.observe(document.body, { 
  childList: true, 
  subtree: false
});

// 供background.js调用
window.removeOverlays = removeRandomOverlays;

console.log('🚀 视频遮罩清除器已启动（域名白名单版）');
