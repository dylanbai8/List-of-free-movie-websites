// popup.js - 扩展弹窗逻辑（增强域名检测）
(function() {
  'use strict';

  var statusDisplay = document.getElementById('statusDisplay');
  var whitelistInput = document.getElementById('whitelistInput');
  var saveBtn = document.getElementById('saveSettingsBtn');
  var clearBtn = document.getElementById('clearSettingsBtn');
  var settingsStatus = document.getElementById('settingsStatus');
  var domainCount = document.getElementById('domainCount');
  var whitelistStatus = document.getElementById('whitelistStatus');
  var reloadHint = document.getElementById('reloadHint');
  var suggestionContent = document.getElementById('suggestionContent');

  var statusTimeout = null;
  var detectedDomains = [];

  // ===== 域名匹配函数 =====
  function matchDomain(hostname, pattern) {
    if (pattern === '*') return true;
    if (pattern === hostname) return true;
    if (pattern.startsWith('*.')) {
      var suffix = pattern.substring(1);
      return hostname.endsWith(suffix);
    }
    return false;
  }

  // ===== 获取主域名（去掉子域名前缀） =====
  function getMainDomain(hostname) {
    var parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    // 对于三级以上域名，尝试保留最后两级
    // 但要注意 .com.cn 这类特殊情况，这里简化处理
    return parts.slice(-2).join('.');
  }

  // ===== 检测当前页面的视频来源域名 =====
  function detectVideoDomains() {
    suggestionContent.innerHTML = '<span class="loading">⏳ 正在分析当前页面的视频来源...</span>';

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0] || !tabs[0].id) {
        suggestionContent.innerHTML = '<span class="no-suggestion">❌ 无法获取当前页面信息</span>';
        return;
      }

      // 向页面注入脚本获取视频信息
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: function() {
          var domains = [];
          var seen = new Set();

          // 从 URL 提取域名
          function extractDomain(url) {
            try {
              var urlObj = new URL(url);
              return urlObj.hostname;
            } catch (e) {
              return null;
            }
          }

          // 递归遍历所有 frame
          function collectVideos(root) {
            try {
              // 1. 收集所有 video 元素
              var videos = root.querySelectorAll ? root.querySelectorAll('video') : [];
              for (var i = 0; i < videos.length; i++) {
                var video = videos[i];
                // 检查 src
                var src = video.src || video.currentSrc || '';
                if (src && src.startsWith('blob:')) {
                  // blob: 协议无法直接提取域名，跳过
                } else if (src) {
                  var domain = extractDomain(src);
                  if (domain && !seen.has(domain)) {
                    seen.add(domain);
                    domains.push(domain);
                  }
                }
                // 检查 data-src 等属性
                var dataSrc = video.getAttribute('data-src') || video.getAttribute('data-url') || '';
                if (dataSrc) {
                  var domain2 = extractDomain(dataSrc);
                  if (domain2 && !seen.has(domain2)) {
                    seen.add(domain2);
                    domains.push(domain2);
                  }
                }
              }

              // 2. 检查所有 iframe（包括跨域 iframe，从 src 属性提取）
              var iframes = root.querySelectorAll ? root.querySelectorAll('iframe') : [];
              for (var j = 0; j < iframes.length; j++) {
                var iframe = iframes[j];
                var iframeSrc = iframe.src || '';
                if (iframeSrc && !iframeSrc.startsWith('about:') && !iframeSrc.startsWith('javascript:')) {
                  var domain3 = extractDomain(iframeSrc);
                  if (domain3 && !seen.has(domain3)) {
                    seen.add(domain3);
                    domains.push(domain3);
                  }
                }
                // 尝试访问 iframe 内部（同源）
                try {
                  if (iframe.contentDocument) {
                    collectVideos(iframe.contentDocument);
                  }
                } catch (e) {
                  // 跨域 iframe 无法访问内部，但已经通过 src 提取了域名
                }
              }

              // 3. 检查所有 object 和 embed 元素（视频可能嵌入在这里）
              var objects = root.querySelectorAll ? root.querySelectorAll('object, embed') : [];
              for (var k = 0; k < objects.length; k++) {
                var obj = objects[k];
                var dataUrl = obj.data || obj.src || '';
                if (dataUrl) {
                  var domain4 = extractDomain(dataUrl);
                  if (domain4 && !seen.has(domain4)) {
                    seen.add(domain4);
                    domains.push(domain4);
                  }
                }
              }

              // 4. 检查页面中所有包含视频相关关键词的链接
              var links = root.querySelectorAll ? root.querySelectorAll('a[href*=".mp4"], a[href*=".m3u8"], a[href*=".ts"]') : [];
              for (var l = 0; l < links.length; l++) {
                var href = links[l].href || '';
                if (href) {
                  var domain5 = extractDomain(href);
                  if (domain5 && !seen.has(domain5)) {
                    seen.add(domain5);
                    domains.push(domain5);
                  }
                }
              }

            } catch (e) { /* 忽略 */ }
          }

          collectVideos(document);

          // 获取当前页面主域名
          var mainHost = window.location.hostname;
          if (mainHost && !seen.has(mainHost)) {
            domains.unshift(mainHost);
          }

          // 添加主域名的二级域名建议（例如 z01.zgtv.online → zgtv.online）
          if (mainHost) {
            var mainDomain = mainHost.split('.').slice(-2).join('.');
            if (mainDomain && mainDomain !== mainHost && !seen.has(mainDomain)) {
              domains.push(mainDomain);
            }
          }

          return domains;
        }
      }, function(results) {
        if (chrome.runtime.lastError) {
          suggestionContent.innerHTML = '<span class="no-suggestion">⚠️ 无法分析页面: ' + chrome.runtime.lastError.message + '</span>';
          return;
        }

        if (results && results[0] && results[0].result) {
          detectedDomains = results[0].result;
          // 去重
          var unique = [];
          var seen2 = new Set();
          for (var i = 0; i < detectedDomains.length; i++) {
            if (!seen2.has(detectedDomains[i])) {
              seen2.add(detectedDomains[i]);
              unique.push(detectedDomains[i]);
            }
          }
          detectedDomains = unique;
          renderSuggestions(detectedDomains);
        } else {
          suggestionContent.innerHTML = '<span class="no-suggestion">📭 未检测到视频或 iframe 中的视频来源</span>';
        }
      });
    });
  }

  // ===== 渲染建议 =====
  function renderSuggestions(domains) {
    if (!domains || domains.length === 0) {
      suggestionContent.innerHTML = '<span class="no-suggestion">📭 未检测到视频来源域名</span>';
      return;
    }

    // 过滤无效域名
    var uniqueDomains = [];
    var seen = new Set();
    for (var i = 0; i < domains.length; i++) {
      var d = domains[i];
      // 过滤掉无效域名
      if (d && !seen.has(d) && d.length > 3 && d.indexOf('.') > 0) {
        seen.add(d);
        uniqueDomains.push(d);
      }
    }

    if (uniqueDomains.length === 0) {
      suggestionContent.innerHTML = '<span class="no-suggestion">📭 未检测到有效的视频来源域名</span>';
      return;
    }

    // 获取当前白名单
    chrome.storage.sync.get(['whitelist'], function(result) {
      var whitelist = result.whitelist || [];

      var html = '<div class="domain-list">';
      for (var j = 0; j < uniqueDomains.length; j++) {
        var domain = uniqueDomains[j];
        var isInWhitelist = whitelist.some(function(w) {
          return matchDomain(domain, w);
        });
        var selectedClass = isInWhitelist ? ' selected' : '';
        var checkMark = isInWhitelist ? ' ✅' : '';
        html += '<span class="domain-tag' + selectedClass + '" data-domain="' + domain + '">' +
                domain + checkMark +
                '<span class="add-icon">+</span>' +
                '</span>';
      }
      html += '</div>';

      html += '<div class="hint-text">💡 点击域名标签可添加/移除白名单，然后点击下方保存</div>';

      // 计算未在白名单中的域名
      var notInWhitelist = uniqueDomains.filter(function(d) {
        return !whitelist.some(function(w) { return matchDomain(d, w); });
      });
      if (notInWhitelist.length > 0) {
        html += '<button class="btn-add-suggestions" id="addAllSuggestions">➕ 一键添加所有建议 (' + notInWhitelist.length + '个)</button>';
      }

      suggestionContent.innerHTML = html;

      // 绑定点击事件
      var tags = suggestionContent.querySelectorAll('.domain-tag');
      for (var k = 0; k < tags.length; k++) {
        (function(tag) {
          tag.addEventListener('click', function() {
            var domain = this.dataset.domain;
            toggleDomainInWhitelist(domain, this);
          });
        })(tags[k]);
      }

      // 绑定一键添加按钮
      var addAllBtn = document.getElementById('addAllSuggestions');
      if (addAllBtn) {
        addAllBtn.addEventListener('click', function() {
          var tags = suggestionContent.querySelectorAll('.domain-tag:not(.selected)');
          for (var m = 0; m < tags.length; m++) {
            var domain = tags[m].dataset.domain;
            addDomainToWhitelist(domain, tags[m]);
          }
          // 更新计数
          updateDomainCountAfterAdd();
        });
      }
    });
  }

  // ===== 切换域名白名单状态 =====
  function toggleDomainInWhitelist(domain, tagElement) {
    chrome.storage.sync.get(['whitelist'], function(result) {
      var whitelist = result.whitelist || [];
      var index = whitelist.indexOf(domain);
      
      if (index > -1) {
        whitelist.splice(index, 1);
        tagElement.classList.remove('selected');
        tagElement.textContent = domain + ' +';
        showSettingsStatus('❌ 已从白名单移除: ' + domain, 'success');
      } else {
        whitelist.push(domain);
        tagElement.classList.add('selected');
        tagElement.textContent = domain + ' ✅ +';
        showSettingsStatus('✅ 已添加到白名单: ' + domain, 'success');
      }

      whitelistInput.value = whitelist.join('\n');
      updateDomainCount(whitelist);
      updateFooterStatus(whitelist);
      updateCurrentStatus(whitelist);

      chrome.storage.sync.set({ whitelist: whitelist }, function() {
        notifyTabs();
      });

      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(function() {
        settingsStatus.className = 'settings-status';
      }, 2000);
    });
  }

  // ===== 添加域名到白名单 =====
  function addDomainToWhitelist(domain, tagElement) {
    chrome.storage.sync.get(['whitelist'], function(result) {
      var whitelist = result.whitelist || [];
      if (whitelist.indexOf(domain) === -1) {
        whitelist.push(domain);
        if (tagElement) {
          tagElement.classList.add('selected');
          tagElement.textContent = domain + ' ✅ +';
        }
        whitelistInput.value = whitelist.join('\n');
        updateDomainCount(whitelist);
        updateFooterStatus(whitelist);
        updateCurrentStatus(whitelist);
        chrome.storage.sync.set({ whitelist: whitelist }, function() {
          notifyTabs();
        });
      }
    });
  }

  // ===== 更新白名单计数 =====
  function updateDomainCountAfterAdd() {
    chrome.storage.sync.get(['whitelist'], function(result) {
      var whitelist = result.whitelist || [];
      updateDomainCount(whitelist);
      updateFooterStatus(whitelist);
      updateCurrentStatus(whitelist);
      whitelistInput.value = whitelist.join('\n');
      renderSuggestions(detectedDomains);
      showSettingsStatus('✅ 已添加所有建议域名', 'success');
      setTimeout(function() {
        settingsStatus.className = 'settings-status';
      }, 2000);
    });
  }

  // ===== 通知所有标签页 =====
  function notifyTabs() {
    chrome.tabs.query({}, function(tabs) {
      for (var i = 0; i < tabs.length; i++) {
        try {
          chrome.tabs.sendMessage(tabs[i].id, { type: 'whitelistUpdated' }).catch(function() {});
        } catch (e) {}
      }
    });
  }

  // ===== 加载设置 =====
  function loadSettings() {
    chrome.storage.sync.get(['whitelist'], function(result) {
      var whitelist = result.whitelist || [];
      whitelistInput.value = whitelist.join('\n');
      updateDomainCount(whitelist);
      updateCurrentStatus(whitelist);
      updateFooterStatus(whitelist);
      reloadHint.className = 'reload-hint';
    });
  }

  // ===== 保存设置 =====
  function saveSettings() {
    var text = whitelistInput.value;
    var domains = text.split('\n')
      .map(function(line) { return line.trim(); })
      .filter(function(line) { return line.length > 0; })
      .filter(function(line) { return !line.startsWith('#'); });

    var invalidDomains = domains.filter(function(d) {
      if (d === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(d)) return false;
      if (/^\*\.[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(d)) return false;
      if (/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(d)) return false;
      return true;
    });

    if (invalidDomains.length > 0) {
      showSettingsStatus('❌ 域名格式无效: ' + invalidDomains.join(', '), 'error');
      return;
    }

    saveBtn.textContent = '⏳ 保存中...';
    saveBtn.disabled = true;

    chrome.storage.sync.set({ whitelist: domains }, function() {
      saveBtn.textContent = '💾 保存设置';
      saveBtn.disabled = false;

      if (chrome.runtime.lastError) {
        showSettingsStatus('❌ 保存失败: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      var msg = domains.length > 0 ? 
        '✅ 已保存 (' + domains.length + ' 个域名)' : 
        '✅ 已保存 (全局生效)';
      showSettingsStatus(msg, 'success');
      updateDomainCount(domains);
      updateCurrentStatus(domains);
      updateFooterStatus(domains);

      reloadHint.className = 'reload-hint show';
      notifyTabs();

      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(function() {
        settingsStatus.className = 'settings-status';
      }, 3000);

      if (detectedDomains.length > 0) {
        renderSuggestions(detectedDomains);
      }
    });
  }

  // ===== 更新显示 =====

  function updateDomainCount(whitelist) {
    if (whitelist.length === 0) {
      domainCount.textContent = '🌍 全局生效';
    } else {
      domainCount.textContent = '📋 ' + whitelist.length + ' 个域名';
    }
  }

  function updateFooterStatus(whitelist) {
    if (whitelist.length === 0) {
      whitelistStatus.textContent = '🌍 全局生效';
    } else {
      whitelistStatus.textContent = '📋 ' + whitelist.length + ' 个域名';
    }
  }

  function updateCurrentStatus(whitelist) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0] || !tabs[0].url) {
        statusDisplay.textContent = '✅ 扩展运行中';
        statusDisplay.className = 'status';
        return;
      }

      try {
        var url = new URL(tabs[0].url);
        var hostname = url.hostname;

        if (whitelist.length === 0) {
          statusDisplay.innerHTML = '✅ <strong>全局生效</strong> (' + hostname + ')';
          statusDisplay.className = 'status';
          return;
        }

        var isInWhitelist = whitelist.some(function(domain) {
          return matchDomain(hostname, domain);
        });

        if (isInWhitelist) {
          statusDisplay.innerHTML = '✅ <span class="domain">' + hostname + '</span> 已启用';
          statusDisplay.className = 'status';
        } else {
          statusDisplay.innerHTML = '⛔ <span class="domain">' + hostname + '</span> 不在白名单中';
          statusDisplay.className = 'status disabled';
        }
      } catch (e) {
        statusDisplay.textContent = '✅ 扩展运行中';
        statusDisplay.className = 'status';
      }
    });
  }

  function showSettingsStatus(message, type) {
    settingsStatus.textContent = message;
    settingsStatus.className = 'settings-status ' + type;
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
  }

  // ===== 初始化 =====

  function init() {
    loadSettings();
    detectVideoDomains();

    saveBtn.addEventListener('click', saveSettings);
    
    clearBtn.addEventListener('click', function() {
      whitelistInput.value = '';
      saveSettings();
    });

    chrome.storage.onChanged.addListener(function(changes) {
      if (changes.whitelist) {
        var newWhitelist = changes.whitelist.newValue || [];
        whitelistInput.value = newWhitelist.join('\n');
        updateDomainCount(newWhitelist);
        updateCurrentStatus(newWhitelist);
        updateFooterStatus(newWhitelist);
        reloadHint.className = 'reload-hint show';
        if (detectedDomains.length > 0) {
          renderSuggestions(detectedDomains);
        }
      }
    });

    console.log('✅ [Popup] 已加载 (增强域名检测版)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();