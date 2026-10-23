/**
 * 服务端数据源代理：/api/proxy?id=<card.id>
 * 用于无 CORS / 需服务端抓取的榜单源（页面 HTML 解析、带 UA/Referer 的 JSON 接口）。
 * 只允许读取看板配置中 type='page' 的源（白名单校验），返回统一格式 {ok, data:[{title,hot,link}]}。
 */
import { getKV, readConfig, json } from './lib.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchText(url, extra = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*;q=0.8', ...extra },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function strip(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* 红果短剧热播榜：镜像站 /rank/hot-drama 页面 HTML，20 条（排名 + 剧名 + 详情链接） */
async function redfruit() {
  const html = await fetchText('https://hongguoduanju.com/rank/hot-drama');
  const out = [];
  const re = /<li[^>]*class="[^"]*pc-list-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    const li = m[1];
    const num = li.match(/pc-badge-number[^>]*>([\s\S]*?)</);
    const title = li.match(/pc-title[^>]*>([\s\S]*?)</);
    const href = li.match(/href="([^"]+)"/);
    if (!title) continue;
    out.push({
      title: strip(title[1]),
      hot: num ? '第' + strip(num[1]) + '名' : '',
      link: href ? 'https://hongguoduanju.com' + href[1] : ''
    });
  }
  return out;
}

/* 豆瓣热门电影：官方 JSON 接口（带 UA + Referer），评分拼在标题后 */
async function doubanMovie() {
  const txt = await fetchText(
    'https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&sort=recommend&page_limit=20&page_start=0',
    { 'Referer': 'https://movie.douban.com/' }
  );
  const j = JSON.parse(txt);
  return (j.subjects || []).map((s) => ({
    title: (s.title || '') + (s.rate ? ' · ' + s.rate : ''),
    hot: '',
    link: s.url || ''
  }));
}

const PARSERS = {
  'hb-redfruit': redfruit,
  'hb-douban-movie': doubanMovie
};

export async function onRequestGet(context) {
  try {
    const raw = String(context.request.url || '');
    const qi = raw.indexOf('?');
    const params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
    const id = params.get('id') || '';
    const config = await readConfig(getKV(context));
    let found = false;
    for (const g of config.groups || []) {
      for (const s of g.sources || []) {
        if (s.id === id && s.type === 'page') found = true;
      }
    }
    if (!found) return json({ ok: false, error: '未授权的数据源' }, 403);
    const fn = PARSERS[id];
    if (!fn) return json({ ok: false, error: '无解析器' }, 404);
    const items = await fn();
    return json({ ok: true, data: items });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 502);
  }
}
