/**
 * 看板 API：/api/board
 * 返回完整看板数据（配置 + 各数据源榜单），供前端展示页一次性渲染。
 */
import { getKV, readConfig, CORS, json } from './lib.js';

export async function onRequestGet(context) {
  const kv = getKV(context);
  const config = await readConfig(kv);
  const refreshSeconds = config.refreshSeconds || 600;
  const now = Date.now();

  // 为每个数据源读取缓存（不主动抓取，由 /api/proxy 或前端触发刷新）
  const groups = [];
  for (const g of config.groups || []) {
    const cards = [];
    for (const s of g.sources || []) {
      if (s.enabled === false) continue;
      let data = [];
      let updatedAt = 0;
      if (kv) {
        try {
          const cachedRaw = await kv.get('cache:' + s.id);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            data = cached.data || [];
            updatedAt = cached.t || 0;
          }
        } catch (e) { /* ignore */ }
      }
      cards.push({
        id: s.id,
        name: s.name,
        iconColor: s.iconColor,
        showItems: s.showItems || 6,
        updatedAt,
        data
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

  return json({ refreshSeconds, now, groups });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
