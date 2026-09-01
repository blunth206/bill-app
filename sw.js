// Service Worker - PWA 离线缓存（v20：CDN资源缓存，支持弱网/离线启动）
const CACHE_NAME = 'jizhang-v39';
const FILES_TO_CACHE = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'reset.html',
  'reset-pwd.html',
  'icon-192.png',
  'icon-512.png',
  'favicon-32.png',
  'apple-touch-icon.png'
];
// CDN 资源也预缓存（首次安装加载成功后缓存，后续离线/换网可用）
const CDN_FILES = [
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js',
];

// 网络请求超时（防止 GitHub 被墙时长时间等待）
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    fetch(request).then(res => {
      clearTimeout(timer);
      resolve(res);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// 安装时预缓存核心文件 + 尝试预缓存CDN资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 核心文件必须缓存
      return cache.addAll(FILES_TO_CACHE).catch(() => {});
    }).then(() => {
      // CDN 资源尽力缓存（首次安装时可能网络不通，不阻塞安装）
      return caches.open(CACHE_NAME).then((cache) => {
        return Promise.allSettled(CDN_FILES.map(function(url) {
          return fetch(url, { mode: 'no-cors' }).then(function(res) {
            if (res.ok) {
              return cache.put(url, res);
            }
          }).catch(function() {
            // CDN 暂不可用，后续 fetch 事件中会自动缓存
          });
        }));
      });
    }).then(() => self.skipWaiting())
  );
});

// 激活时清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  // GitHub API 请求必须走网络（同步功能）
  if (event.request.url.includes('api.github.com')) {
    return;
  }
  // 本地代理（OCR 跨域转发）和百度/腾讯 API 不走 SW，避免拦截
  if (event.request.url.includes('localhost:') ||
      event.request.url.includes('aip.baidubce.com') ||
      event.request.url.includes('tencentcloudapi.com')) {
    return;
  }

  const url = new URL(event.request.url);
  const isCore = /\/(app\.js|index\.html|style\.css|manifest\.json|reset\.html|reset-pwd\.html)$/.test(url.pathname);
  const isCdn = /(cdn\.|jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/.test(event.request.url) && /\.js$/.test(event.request.url);

  if (isCdn) {
    // CDN 资源：缓存优先 + 网络更新（stale-while-revalidate），换网络也能用
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkUpdate = fetchWithTimeout(event.request, 6000).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          console.warn('[SW] CDN 资源网络请求失败，尝试使用缓存:', url.pathname);
          return null;
        });

        if (cached) {
          networkUpdate; // 后台静默更新
          return cached;
        }
        // 无缓存时等待网络
        return networkUpdate.then((networkRes) => networkRes || cached);
      })
    );
    return;
  }

  if (isCore) {
    // 核心文件（app.js/index.html/style.css 等）：网络优先，失败/超时才回退缓存
    // 保证联网时用户刷新一次即可拿到最新代码（修复能立刻生效），断网弱网时仍可离线打开
    event.respondWith(
      fetchWithTimeout(event.request, 5000).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        }
        // 网络返回异常状态，回退缓存
        return caches.match(event.request);
      }).catch(() => {
        // 网络不通/超时，回退缓存保证离线可用
        return caches.match(event.request);
      })
    );
  } else {
    // 其他资源（图片、图标等）：缓存优先，网络回退
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetchWithTimeout(event.request, 8000).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
