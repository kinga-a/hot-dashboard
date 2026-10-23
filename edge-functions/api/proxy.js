/**
 * 数据代理 API：/api/proxy?key=<sourceId>
 * 从外部数据源抓取榜单，写入 KV 缓存并带上时间戳，实现"自动刷新"。
 * 缓存未过期则直接返回缓存，不重复抓取。
 */
import { getKV, readConfig, CORS, json } from './lib.js';

// 通用解析器：从 JSON 中提取榜单数组
function extractList(json, cfg) {
  let arr = json;
  const listPath = (cfg.listPath || '').trim();
  if (listPath) {
    for (const part of listPath.split('.')) {
      if (arr == null) break;
      arr = arr[part];
    }
  }
  // 兜底：自动查找第一个数组
  if (!Array.isArray(arr)) {
    arr = findFirstArray(json);
  }
  if (!Array.isArray(arr)) return [];

  const titleField = cfg.titleField || 'title';
  const urlField = cfg.urlField || 'url';
  return arr
    .filter((it) => it && typeof it === 'object')
    .map((it) => ({
      title: it[titleField] ?? it.title ?? it.word ?? it.name ?? it.query ?? '',
      url: it[urlField] ?? it.url ?? it.link ?? it.hotUrl ?? ''
    }))
    .filter((it) => it.title);
}

function findFirstArray(obj, depth = 0) {
  if (depth > 4 || obj == null) return null;
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const r = findFirstArray(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function isFresh(cached, refreshSeconds) {
  if (!cached) return false;
  const age = (Date.now() - cached.t) / 1000;
  return age < refreshSeconds;
}

export async function onRequestGet(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return json({ error: '缺少 key 参数' }, 400);

  const kv = getKV(context);
  const config = await readConfig(kv);
  const refreshSeconds = config.refreshSeconds || 600;

  // 查找数据源配置
  let source = null;
  for (const g of config.groups || []) {
    for (const s of g.sources || []) {
      if (s.id === key) { source = s; break; }
    }
    if (source) break;
  }
  if (!source) return json({ error: '数据源不存在' }, 404);

  const cacheKey = 'cache:' + key;
  const now = Date.now();

  // 命中新鲜缓存
  if (kv) {
    try {
      const cachedRaw = await kv.get(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (isFresh(cached, refreshSeconds)) {
          return json({ source: source.name, updatedAt: cached.t, data: cached.data });
        }
      }
    } catch (e) { /* 忽略缓存错误，重新抓取 */ }
  }

  // 抓取外部数据源
  try {
    const resp = await fetch(source.url, {
      headers: source.headers ? JSON.parse(source.headers) : {}
    });
    if (!resp.ok) throw new Error('上游返回 ' + resp.status);
    const raw = await resp.json();
    const data = extractList(raw, source);
    const item = { t: now, data };
    if (kv) {
      try { await kv.put(cacheKey, JSON.stringify(item)); } catch (e) { /* 写缓存失败不影响返回 */ }
    }
    return json({ source: source.name, updatedAt: now, data });
  } catch (err) {
    // 抓取失败时尝试回退旧缓存
    if (kv) {
      try {
        const cachedRaw = await kv.get(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          return json({ source: source.name, updatedAt: cached.t, data: cached.data, stale: true });
        }
      } catch (e) { /* ignore */ }
    }
    return json({ source: source.name, error: '抓取失败: ' + err.message }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
