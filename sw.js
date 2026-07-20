// Service Worker - PWA 离线缓存（v9：v29固定Token显示 + 复制按钮）
const CACHE_NAME = 'jizhang-v13';
const FILES_TO_CACHE = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json'
];

// 安装时预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// 激活时清理所有旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  // CDN 资源直接走网络，不做拦截
  if (event.request.url.includes('cdn.') || event.request.url.includes('jsdelivr.net')) {
    return;
  }

  // GitHub API 请求必须走网络，避免缓存旧 SHA 导致 409 冲突
  if (event.request.url.includes('api.github.com')) {
    return;
  }

  const url = new URL(event.request.url);
  // 核心文件（HTML/JS/CSS/manifest）使用网络优先，保证代码更新后能立即生效；离线时回退缓存
  const isCore = /\/(app\.js|index\.html|style\.css|manifest\.json|)$/.test(url.pathname);

  if (isCore) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // 其他资源（图片等）缓存优先，网络回退
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
  }
});
