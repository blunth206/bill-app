// Service Worker - PWA 离线缓存（v19：缓存优先策略，修复跨设备删除同步问题）
const CACHE_NAME = 'jizhang-v25';
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

// 安装时预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE).catch(() => {});
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
  // CDN 资源直接走网络
  if (event.request.url.includes('cdn.') || event.request.url.includes('jsdelivr.net')) {
    return;
  }

  // GitHub API 请求必须走网络（同步功能）
  if (event.request.url.includes('api.github.com')) {
    return;
  }

  const url = new URL(event.request.url);
  const isCore = /\/(app\.js|index\.html|style\.css|manifest\.json|reset\.html|reset-pwd\.html)$/.test(url.pathname);

  if (isCore) {
    // 核心文件：缓存优先，网络静默更新（stale-while-revalidate）
    // 即使用户网络不通也能秒开，下次联网时自动更新
    event.respondWith(
      caches.match(event.request).then((cached) => {
        // 后台尝试网络更新缓存
        const networkUpdate = fetchWithTimeout(event.request, 5000).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => null);

        // 如果有缓存，立即返回缓存，同时后台静默更新
        if (cached) {
          networkUpdate; // 不await，纯后台
          return cached;
        }

        // 首次访问、无缓存，等待网络结果
        return networkUpdate.then((networkRes) => {
          return networkRes || cached;
        });
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
