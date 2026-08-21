// content.js - 支持通配符白名单 + iframe 跨域兼容
(function() {
    'use strict';

    console.log('🔧 [自动全屏] 加载 (通配符白名单版)');

    // ===== 状态 =====
    let isWhitelisted = true;
    let currentHost = window.location.hostname;

    // ===== 域名匹配函数（支持通配符） =====
    function matchDomain(hostname, pattern) {
        if (pattern === '*') return true;
        if (pattern === hostname) return true;
        // 支持 *.example.com 匹配子域名
        if (pattern.startsWith('*.')) {
            var suffix = pattern.substring(1); // .example.com
            return hostname.endsWith(suffix);
        }
        return false;
    }

    // ===== 白名单检查 =====
    function checkWhitelist(callback) {
        chrome.storage.sync.get(['whitelist'], function(result) {
            var whitelist = result.whitelist || [];
            
            if (whitelist.length === 0) {
                isWhitelisted = true;
                console.log('📋 [白名单] 为空，全局生效');
            } else {
                isWhitelisted = whitelist.some(function(domain) {
                    return matchDomain(currentHost, domain);
                });
                
                if (isWhitelisted) {
                    console.log('📋 [白名单] ✅ ' + currentHost + ' 在白名单中，扩展已启用');
                } else {
                    console.log('📋 [白名单] ❌ ' + currentHost + ' 不在白名单中，扩展已禁用');
                }
            }
            
            if (typeof callback === 'function') {
                callback(isWhitelisted);
            }
        });
    }

    checkWhitelist();

    const CONFIG = {
        scanPhases: [
            { interval: 500,  duration: 3000,  label: '高频' },
            { interval: 1000, duration: 5000,  label: '中频' },
            { interval: 3000, duration: 12000, label: '低频' }
        ],
        maxScanTime: 20000,
        idleCheckInterval: 8000
    };

    let scanTimer = null;
    let phaseIndex = 0;
    let phaseStartTime = Date.now();
    let totalScanStartTime = Date.now();
    let isScanning = false;
    let isIdle = false;
    let boundCount = 0;
    let observerTimer = null;
    let idleCheckTimer = null;
    let isProcessing = false;

    const boundVideos = new WeakSet();

    // ===== 递归查找所有视频（包括 Shadow DOM 和 iframe） =====

    function findAllVideos(root) {
        root = root || document;
        var videos = [];

        try {
            // 1. 当前文档中的 video
            var directVideos = root.querySelectorAll ? root.querySelectorAll('video') : [];
            for (var i = 0; i < directVideos.length; i++) {
                videos.push(directVideos[i]);
            }

            // 2. Shadow DOM
            var allElements = root.querySelectorAll ? root.querySelectorAll('*') : [];
            for (var j = 0; j < allElements.length; j++) {
                var el = allElements[j];
                if (el.shadowRoot) {
                    var shadowVideos = findAllVideos(el.shadowRoot);
                    for (var k = 0; k < shadowVideos.length; k++) {
                        videos.push(shadowVideos[k]);
                    }
                }
            }

            // 3. iframe（同源才能访问）
            var iframes = root.querySelectorAll ? root.querySelectorAll('iframe') : [];
            for (var l = 0; l < iframes.length; l++) {
                try {
                    if (iframes[l].contentDocument) {
                        var iframeVideos = findAllVideos(iframes[l].contentDocument);
                        for (var m = 0; m < iframeVideos.length; m++) {
                            videos.push(iframeVideos[m]);
                        }
                    }
                } catch (e) {
                    // 跨域 iframe 无法访问，但因为我们设置了 all_frames: true，
                    // content script 已经在 iframe 中运行了，所以这里只是补充
                }
            }

        } catch (e) { /* 忽略 */ }

        return videos;
    }

    function uniqueVideos(videos) {
        var seen = new Set();
        var unique = [];
        for (var i = 0; i < videos.length; i++) {
            if (!seen.has(videos[i])) {
                seen.add(videos[i]);
                unique.push(videos[i]);
            }
        }
        return unique;
    }

    // ===== 核心功能 =====

    function requestFullscreen(element) {
        if (!element) return;
        if (document.fullscreenElement) return;

        // 检查当前 iframe 的域名是否在白名单中
        // 注意：每个 iframe 中的 content script 都会独立检查自己的域名
        if (!isWhitelisted) {
            console.log('[全屏] 当前域名 (' + currentHost + ') 不在白名单中，跳过');
            return;
        }

        try {
            var method = element.requestFullscreen || 
                          element.webkitRequestFullscreen || 
                          element.mozRequestFullScreen || 
                          element.msRequestFullscreen;
            
            if (method) {
                method.call(element).catch(function(err) {
                    if (err.name === 'NotAllowedError') {
                        console.log('[全屏] 需要用户手势，已忽略');
                    } else {
                        console.log('[全屏] 请求失败:', err.message);
                    }
                });
            }
        } catch (e) { /* 静默 */ }
    }

    function exitFullscreen() {
        if (!document.fullscreenElement) return;
        try {
            var method = document.exitFullscreen || 
                          document.webkitExitFullscreen || 
                          document.mozCancelFullScreen || 
                          document.msExitFullscreen;
            if (method) {
                method.call(document).catch(function() {});
            }
        } catch (e) { /* 静默 */ }
    }

    // ===== 绑定视频 =====

    function bindVideo(video) {
        if (!video) return false;
        if (typeof video.tagName !== 'string') return false;
        if (video.tagName.toLowerCase() !== 'video') return false;
        if (boundVideos.has(video)) return true;

        try {
            console.log('📹 [绑定 #' + (++boundCount) + ']', video);
            boundVideos.add(video);

            video.addEventListener('play', function onPlay() {
                console.log('▶️ [播放] (域名: ' + currentHost + ')');
                if (!document.fullscreenElement) {
                    requestFullscreen(video);
                }
            });

            video.addEventListener('pause', function onPause() {
                console.log('⏸️ [暂停]');
                if (document.fullscreenElement) {
                    exitFullscreen();
                }
            });

            video.addEventListener('ended', function onEnded() {
                console.log('⏹️ [结束]');
                if (document.fullscreenElement) {
                    exitFullscreen();
                }
            });

            return true;

        } catch (e) {
            console.warn('[绑定] 失败:', e.message);
            boundVideos.delete(video);
            return false;
        }
    }

    // ===== 处理新视频 =====

    function processNewVideos() {
        if (isProcessing) return;
        if (!isWhitelisted) {
            // 不在白名单中，跳过处理（但会记录一次）
            if (document.querySelectorAll('video').length > 0) {
                console.log('[处理] 当前域名 ' + currentHost + ' 不在白名单中，跳过');
            }
            return;
        }

        isProcessing = true;

        try {
            var allVideos = findAllVideos(document);
            var unique = uniqueVideos(allVideos);
            
            var total = unique.length;
            var bound = 0;

            for (var i = 0; i < unique.length; i++) {
                var video = unique[i];
                if (boundVideos.has(video)) {
                    bound++;
                    continue;
                }
                if (bindVideo(video)) {
                    bound++;
                }
            }

            var unbounded = total - bound;
            
            if (total > 0) {
                console.log('📊 [处理] 总数: ' + total + ', 已绑定: ' + bound + ', 未绑定: ' + unbounded + ' (域名: ' + currentHost + ')');
            }

            if (total > 0 && unbounded === 0) {
                console.log('✅ [处理] 所有 ' + total + ' 个视频已绑定 (域名: ' + currentHost + ')');
                if (isScanning) {
                    stopScanning();
                    enterIdleMode();
                }
            }

        } catch (e) {
            console.warn('[处理] 异常:', e.message);
        } finally {
            isProcessing = false;
        }
    }

    // ===== 扫描管理 =====

    function performScan() {
        if (!isWhitelisted) return;
        
        if (isIdle) {
            var allVideos = findAllVideos(document);
            var unique = uniqueVideos(allVideos);
            var unbounded = [];
            for (var i = 0; i < unique.length; i++) {
                if (!boundVideos.has(unique[i])) {
                    unbounded.push(unique[i]);
                }
            }
            if (unbounded.length > 0) {
                console.log('🔍 [空闲扫描] 发现 ' + unbounded.length + ' 个未绑定视频 (域名: ' + currentHost + ')');
                processNewVideos();
            }
            return;
        }
        processNewVideos();
    }

    function switchPhase() {
        if (phaseIndex >= CONFIG.scanPhases.length) {
            console.log('💤 [扫描] 所有阶段完成 (域名: ' + currentHost + ')');
            if (isScanning) {
                stopScanning();
                enterIdleMode();
            }
            return;
        }

        var phase = CONFIG.scanPhases[phaseIndex];
        console.log('⏱️ [扫描] ' + phase.label + ' (间隔 ' + phase.interval + 'ms) (域名: ' + currentHost + ')');
        
        phaseStartTime = Date.now();
        performScan();
        
        scanTimer = setInterval(function() {
            performScan();
            if (Date.now() - phaseStartTime > phase.duration) {
                clearInterval(scanTimer);
                scanTimer = null;
                phaseIndex++;
                switchPhase();
            }
        }, phase.interval);
    }

    function stopScanning() {
        if (scanTimer) {
            clearInterval(scanTimer);
            scanTimer = null;
        }
        isScanning = false;
        console.log('🛑 [扫描] 已停止 (域名: ' + currentHost + ')');
    }

    function enterIdleMode() {
        if (isIdle) return;
        isIdle = true;
        console.log('💤 [空闲模式] 已进入 (域名: ' + currentHost + ')');
        
        if (idleCheckTimer) clearInterval(idleCheckTimer);
        idleCheckTimer = setInterval(function() {
            if (!isWhitelisted) return;
            
            var allVideos = findAllVideos(document);
            var unique = uniqueVideos(allVideos);
            var unbounded = [];
            for (var i = 0; i < unique.length; i++) {
                if (!boundVideos.has(unique[i])) {
                    unbounded.push(unique[i]);
                }
            }
            if (unbounded.length > 0) {
                console.log('🔄 [空闲检查] 发现 ' + unbounded.length + ' 个未绑定视频 (域名: ' + currentHost + ')');
                isIdle = false;
                processNewVideos();
                setTimeout(function() {
                    var allVideos2 = findAllVideos(document);
                    var unique2 = uniqueVideos(allVideos2);
                    var remaining = [];
                    for (var j = 0; j < unique2.length; j++) {
                        if (!boundVideos.has(unique2[j])) {
                            remaining.push(unique2[j]);
                        }
                    }
                    if (remaining.length === 0) {
                        isIdle = true;
                    } else {
                        isIdle = false;
                        if (!isScanning) {
                            totalScanStartTime = Date.now();
                            phaseIndex = 0;
                            isScanning = true;
                            switchPhase();
                        }
                    }
                }, 1000);
            }
        }, CONFIG.idleCheckInterval);
        console.log('💤 [空闲检查] 间隔 ' + CONFIG.idleCheckInterval + 'ms (域名: ' + currentHost + ')');
    }

    // ===== Observer =====

    function setupObserver() {
        var observer = new MutationObserver(function() {
            if (!isWhitelisted) return;
            
            clearTimeout(observerTimer);
            observerTimer = setTimeout(function() {
                var allVideos = findAllVideos(document);
                var unique = uniqueVideos(allVideos);
                var unbounded = [];
                for (var i = 0; i < unique.length; i++) {
                    if (!boundVideos.has(unique[i])) {
                        unbounded.push(unique[i]);
                    }
                }
                if (unbounded.length > 0) {
                    console.log('🔄 [Observer] 发现 ' + unbounded.length + ' 个新视频 (域名: ' + currentHost + ')');
                    processNewVideos();
                }
            }, 300);
        });

        var target = document.body || document.documentElement;
        if (target) {
            observer.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });
            console.log('👀 [Observer] 已启动 (域名: ' + currentHost + ')');
        }
    }

    // ===== 监听白名单更新 =====

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
            if (message.type === 'whitelistUpdated') {
                console.log('📋 [消息] 收到白名单更新通知，重新检查 (域名: ' + currentHost + ')');
                checkWhitelist(function(updated) {
                    if (updated) {
                        console.log('📋 [消息] 白名单更新后扩展已启用，重新扫描 (域名: ' + currentHost + ')');
                        if (!isScanning && !isIdle) {
                            totalScanStartTime = Date.now();
                            phaseIndex = 0;
                            isScanning = true;
                            switchPhase();
                        }
                        processNewVideos();
                    } else {
                        console.log('📋 [消息] 白名单更新后扩展仍处于禁用状态 (域名: ' + currentHost + ')');
                    }
                });
                sendResponse({ status: 'ok' });
            }
            return true;
        });
    }

    // ===== 初始化 =====

    function init() {
        console.log('🚀 [自动全屏] 初始化 (域名: ' + currentHost + ')');
        setupObserver();
        setupMessageListener();
        
        totalScanStartTime = Date.now();
        isScanning = true;
        phaseIndex = 0;
        switchPhase();

        window.addEventListener('load', function() {
            console.log('📄 [加载完成] 执行最终检查 (域名: ' + currentHost + ')');
            setTimeout(processNewVideos, 1000);
        });

        console.log('✅ [自动全屏] 初始化完成 (域名: ' + currentHost + ')');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('beforeunload', function() {
        if (scanTimer) clearInterval(scanTimer);
        if (idleCheckTimer) clearInterval(idleCheckTimer);
        if (observerTimer) clearTimeout(observerTimer);
    });

})();