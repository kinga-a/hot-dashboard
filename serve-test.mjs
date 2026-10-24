// 本地测试服务：模拟 EdgeOne Pages Functions 环境
// - /api/board  → board.js onRequestGet（内存 KV mock）
// - /api/admin  → admin.js onRequest（内存 KV mock）
// - 静态文件    → index.html / admin.html
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const ADMIN_TOKEN = 'Aa123456@*';

// 内存 KV mock
const memKV = {
  store: new Map(),
  async get(k) { return this.store.has(k) ? this.store.get(k) : null; },
  async put(k, v) { this.store.set(k, v); },
  async delete(k) { this.store.delete(k); }
};

async function loadApi(mod) {
  const m = await import(path.join(ROOT, 'edge-functions', 'api', mod + '.js') + '?t=' + Date.now());
  return m;
}

function mockRequest(method, url, bodyObj) {
  return {
    method,
    url,
    headers: {
      get: (n) => {
        const map = {
          'authorization': 'Bearer ' + ADMIN_TOKEN,
          'content-type': 'application/json'
        };
        return map[String(n).toLowerCase()] || null;
      }
    },
    async json() { return bodyObj || {}; }
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const method = req.method || 'GET';

  try {
    if (url === '/api/board' || url === '/api/admin' || url === '/api/proxy') {
      let bodyObj = {};
      if (method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        try { bodyObj = JSON.parse(body); } catch (e) {}
      }
      const mod = url === '/api/board' ? 'board' : (url === '/api/admin' ? 'admin' : 'proxy');
      const api = await loadApi(mod);
      const ctx = { env: { BOARD_KV: memKV, ADMIN_TOKEN }, request: mockRequest(method, req.url, bodyObj) };
      let r;
      if (mod === 'board' && method === 'GET') r = await api.onRequestGet(ctx);
      else if (mod === 'admin') r = await api.onRequest(ctx);
      else { r = await api.onRequestGet(ctx); }
      const text = await r.text();
      const hdrs = {};
      (r.headers || []).forEach((v, k) => { if (k !== 'content-length') hdrs[k] = v; });
      res.writeHead(r.status, hdrs);
      res.end(text);
      return;
    }

    // 静态文件
    let file = url === '/' ? 'index.html' : url.slice(1);
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const fp = path.join(ROOT, file);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(fp));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + url);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500: ' + e.message + '\n' + (e.stack || ''));
  }
}).listen(Number(process.env.PORT) || 8790, () => {
  console.log('测试服务已启动: http://localhost:' + (Number(process.env.PORT) || 8790));
});
