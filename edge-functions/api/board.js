/**
 * 看板 API：/api/board
 * 只返回看板配置（分类 + 数据源 + 刷新间隔），不含榜单数据。
 * 数据由前端浏览器直连数据源抓取（hotboard 模式），会话缓存 + 自动刷新。
 */
import { getKV, readConfig, CORS, json } from './lib.js';

export async function onRequestGet(context) {
  const kv = getKV(context);
  const config = await readConfig(kv);
  const refreshSeconds = config.refreshSeconds || 600;
  const cardsPerRow = config.cardsPerRow || 4;
  const now = Date.now();

  const groups = [];
  for (const g of config.groups || []) {
    const cards = [];
    for (const s of g.sources || []) {
      if (s.enabled === false) continue;
      cards.push({
        id: s.id,
        name: s.name,
        url: s.url || '',
        iconColor: s.iconColor,
        icon: s.icon || '',
        showItems: s.showItems || 6,
        listPath: s.listPath || '',
        titleField: s.titleField || 'title',
        urlField: s.urlField || 'url',
        headers: s.headers || '',
        // 行情源专属字段（腾讯行情卡）
        type: s.type || '',
        symbols: s.symbols || [],
        names: s.names || [],
        note: s.note || ''
      });
    }
    groups.push({
      id: g.id,
      name: g.name,
      color: g.color,
      order: g.order,
      cardCount: g.cardCount || cards.length,
      cards
    });
  }

  groups.sort((a, b) => (a.order || 0) - (b.order || 0));

  return json({ refreshSeconds, cardsPerRow, now, groups });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
