const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 5102;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-TC-Action, X-TC-Version, X-TC-Timestamp, X-TC-Region');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function proxyRequest(req, res, body) {
  try {
    const opt = JSON.parse(body || '{}');
    console.log('[代理POST]', opt.url ? opt.url.substring(0, 120) : '空url');
    const target = new URL(opt.url);
    const isHttps = target.protocol === 'https:';
    console.log('[代理POST转发]', target.hostname + target.pathname);

    const headers = opt.headers || {};
    delete headers['host'];
    delete headers['Host'];

    const requestOptions = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: opt.method || 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json; charset=utf-8'
      }, headers)
    };

    const proxyReq = (isHttps ? https : http).request(requestOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[代理错误]', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });

    if (opt.body) {
      proxyReq.write(opt.body);
    }
    proxyReq.end();
  } catch (e) {
    console.error('[代理解析错误]', e.message);
    res.writeHead(400);
    res.end(JSON.stringify({ error: e.message }));
  }
}

// 处理 GET 代理请求：/proxy?url=ENCODED_URL
function proxyGetRequest(req, res) {
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const targetUrl = parsedUrl.searchParams.get('url');
    console.log('[代理GET]', req.url.substring(0, 120));
    if (!targetUrl) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: '缺少 url 参数' }));
      return;
    }
    const target = new URL(targetUrl);
    console.log('[代理GET转发]', target.hostname + target.pathname);
    const isHttps = target.protocol === 'https:';

    const requestOptions = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    };

    const proxyReq = (isHttps ? https : http).request(requestOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[代理GET错误]', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });

    proxyReq.end();
  } catch (e) {
    console.error('[代理GET解析错误]', e.message);
    res.writeHead(400);
    res.end(JSON.stringify({ error: e.message }));
  }
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end(err.message);
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith('/proxy')) {
    if (req.method === 'POST') {
      readBody(req).then(body => proxyRequest(req, res, body));
    } else if (req.method === 'GET') {
      proxyGetRequest(req, res);
    }
    return;
  }

  serveStatic(req, res);
});

function tryListen(port) {
  server.listen(port, () => {
    console.log('====================================');
    console.log('本地服务已启动：http://localhost:' + port);
    console.log('请用浏览器访问上面地址，不要直接双击 index.html');
    console.log('OCR 代理地址：http://localhost:' + port + '/proxy');
    console.log('====================================');

    // 把实际端口写入文件，方便 start.bat 读取提示
    try {
      fs.writeFileSync(path.join(ROOT, '.server-port'), String(port));
    } catch (e) {}
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('[端口占用] ' + port + ' 被占用，尝试 ' + (port + 1));
      tryListen(port + 1);
    } else {
      console.error('[启动错误]', err.message);
    }
  });
}

tryListen(PORT);
