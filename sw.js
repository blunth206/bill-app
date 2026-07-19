// Service Worker - PWA 离线缓存（v3：核心文件改为网络优先，避免旧代码长期缓存）
const CACHE_NAME = 'jizhang-v7';
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
    })
  );
  self.skipWaiting();
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
  // CDN 资源直接走网络，不做拦截
  if (event.request.url.includes('cdn.') || event.request.url.includes('jsdelivr.net')) {
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
