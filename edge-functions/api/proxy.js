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

/* 境外无 CORS 站点：走 Redocly 公共 CORS 代理（hotboard 同款，需 Origin 头） */
async function fetchViaProxy(url) {
  return fetchText('https://cors.redoc.ly/' + url, { 'Origin': 'https://yiktt.github.io' });
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

/* 国内金价·元/克：ruseo.cn 今日金价（CORS 开放但结构多段，统一解析）；银行金条价 + 品牌贵金属价 + 回收价 */
async function ruseoGold() {
  const txt = await fetchText('https://api.ruseo.cn/api/goldprice');
  const j = JSON.parse(txt);
  const d = (j && j.data) || {};
  const out = [];
  (d.bank_gold_bar_price || []).forEach((b) => {
    out.push({ title: (b.bank || '') + ' · 金条', hot: b.price ? b.price + ' 元/克' : '', link: '' });
  });
  (d.precious_metal_price || []).slice(0, 6).forEach((p) => {
    if (!p.gold_price) return;
    out.push({ title: (p.brand || '') + ' · 黄金', hot: p.gold_price + ' 元/克', link: '' });
  });
  (d.gold_recycle_price || []).slice(0, 5).forEach((r) => {
    if (!r.recycle_price) return;
    out.push({ title: (r.gold_type || '') + ' · 回收', hot: r.recycle_price + ' 元/克', link: '' });
  });
  return out;
}

/* 新浪热榜：官方 top API，返回 JS 变量包裹 JSON（data[]: title/top_num/url） */
async function sinaHot() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const txt = await fetchText(
    'https://top.news.sina.com.cn/ws/GetTopDataList.php?top_type=day&top_cat=www_www_all_suda_suda&top_time=' + day + '&top_show_num=50&top_order=DESC&js_var=all_1_data'
  );
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('新浪热榜数据异常');
  const j = JSON.parse(txt.slice(s, e + 1));
  return (j.data || []).filter((it) => it.title && it.url).slice(0, 30).map((it) => ({
    title: it.title, hot: it.top_num ? String(it.top_num) : '', link: it.url
  }));
}

/* 网易新闻：移动端热榜 JSON（data.list[]: title/url） */
async function neteaseHot() {
  const j = JSON.parse(await fetchText('https://m.163.com/fe/api/hot/news/flow'));
  return (j.data && j.data.list || []).filter((it) => it.title && it.url).slice(0, 30).map((it) => ({
    title: it.title, hot: '', link: it.url
  }));
}

/* 澎湃新闻：官方右栏热榜 JSON（data.hotNews[]: name / link|contId） */
async function thePaperHot() {
  const j = JSON.parse(await fetchText('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar'));
  return (j.data && j.data.hotNews || []).filter((it) => it.name).slice(0, 30).map((it) => ({
    title: it.name, hot: '', link: it.link || ('https://www.thepaper.cn/newsDetail_forward_' + it.contId)
  }));
}

/* 通用 RSS 解析（BBC / NYT / Guardian / Aljazeera / NPR / DW / 中国新闻网）
   境外源走 redocly 代理（本地直连被墙），国内源直连 */
const RSS_FEEDS = {
  'hb-bbc': 'https://feeds.bbci.co.uk/news/world/rss.xml',
  'hb-nyt': 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'hb-guardian': 'https://www.theguardian.com/world/rss',
  'hb-aljazeera': 'https://www.aljazeera.com/xml/rss/all.xml',
  'hb-npr': 'https://feeds.npr.org/1001/rss.xml',
  'hb-dw': 'https://rss.dw.com/rdf/rss-en-world',
  'hb-chinanews': 'https://www.chinanews.com.cn/rss/scroll-news.xml'
};
const RSS_VIA_PROXY = ['hb-bbc', 'hb-nyt', 'hb-guardian', 'hb-aljazeera', 'hb-dw'];
async function rssXml(id) {
  const feed = RSS_FEEDS[id];
  const xml = RSS_VIA_PROXY.includes(id) ? await fetchViaProxy(feed) : await fetchText(feed);
  const out = [];
  const itemRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/g;
  let m;
  while ((m = itemRe.exec(xml)) && out.length < 30) {
    const node = m[1];
    const t = node.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const l1 = node.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const l2 = node.match(/<link[^>]*href="([^"]+)"/);
    if (!t) continue;
    const title = t[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, ' ').trim();
    const link = (l2 ? l2[1] : l1 ? l1[1].trim() : '');
    if (title && title.length > 4 && link) out.push({ title, hot: '', link });
  }
  return out;
}

/* App Store 热门免费应用榜：iTunes RSS（feed.entry[]: im:name / id） */
async function appStore() {
  const j = JSON.parse(await fetchText('https://itunes.apple.com/us/rss/topfreeapplications/limit=10/json'));
  const entries = j.feed && j.feed.entry || [];
  return entries.map((e) => {
    const links = Array.isArray(e.link) ? e.link : [e.link];
    const alt = links.find((l) => l && l.attributes && l.attributes.rel === 'alternate') || links[0];
    return {
      title: (e['im:name'] && e['im:name'].label) || '',
      hot: '',
      link: (e.id && e.id.label) || (alt && alt.attributes && alt.attributes.href) || ''
    };
  }).filter((it) => it.title && it.link);
}

/* 豆瓣新片榜：官方 chart 页 HTML（.item 行: nbg 片名/链接 + rating_nums 评分） */
async function doubanChart() {
  const html = await fetchViaProxy('https://movie.douban.com/chart');
  const out = [];
  const itemRe = /<tr class="item">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = itemRe.exec(html)) && out.length < 20) {
    const tr = m[1];
    const nb = tr.match(/<a class="nbg"[^>]*href="([^"]+)"[^>]*title="([^"]*)"/);
    const score = tr.match(/<span class="rating_nums">([\s\S]*?)<\/span>/);
    if (!nb) continue;
    out.push({
      title: nb[2].trim() + (score ? ' · ' + strip(score[1]) : ''),
      hot: '',
      link: nb[1]
    });
  }
  return out;
}

/* Hacker News 首页：Algolia 公开 API（hits[]: title/points/url|objectID） */
async function hn() {
  const j = JSON.parse(await fetchText('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20'));
  return (j.hits || []).map((h) => ({
    title: h.title || '',
    hot: h.points != null ? String(h.points) : '',
    link: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID)
  })).filter((it) => it.title);
}

/* dev.to 本周热门：公开 API（数组: title/positive_reactions_count/url） */
async function devto() {
  const j = JSON.parse(await fetchText('https://dev.to/api/articles?top=7&per_page=20'));
  return j.map((a) => ({
    title: a.title || '',
    hot: a.positive_reactions_count != null ? String(a.positive_reactions_count) : '',
    link: a.url || ('https://dev.to' + (a.path || ''))
  })).filter((it) => it.title);
}

const PARSERS = {
  'hb-redfruit': redfruit,
  'hb-douban-movie': doubanMovie,
  'hb-ruseo-gold': ruseoGold,
  'hb-sina-hot': sinaHot,
  'hb-netease': neteaseHot,
  'hb-thepaper': thePaperHot,
  'hb-bbc': () => rssXml('hb-bbc'),
  'hb-nyt': () => rssXml('hb-nyt'),
  'hb-guardian': () => rssXml('hb-guardian'),
  'hb-aljazeera': () => rssXml('hb-aljazeera'),
  'hb-npr': () => rssXml('hb-npr'),
  'hb-dw': () => rssXml('hb-dw'),
  'hb-chinanews': () => rssXml('hb-chinanews'),
  'hb-appstore': appStore,
  'hb-douban-chart': doubanChart,
  'hb-hn': hn,
  'hb-devto': devto
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
