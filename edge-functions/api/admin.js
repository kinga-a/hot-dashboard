/**
 * 管理 API：/api/admin
 * 分类管理：新建/删除分类、排序调整、设置卡片数
 * 数据源管理：添加/编辑/删除接口、配置刷新间隔
 * 鉴权：Header Authorization: Bearer <ADMIN_TOKEN>（环境变量配置）
 */
import { getKV, readConfig, saveConfig, CORS, json } from './lib.js';

function checkAuth(context) {
  const token = context.env && context.env.ADMIN_TOKEN;
  if (!token) return false;
  const auth = context.request.headers.get('Authorization') || '';
  return auth === 'Bearer ' + token || auth === token;
}

function uid() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function onRequest(context) {
  // OPTIONS 预检
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (!checkAuth(context)) {
    return json({ error: '未授权：请配置正确的 ADMIN_TOKEN' }, 401);
  }

  const kv = getKV(context);
  if (!kv) return json({ error: 'KV 存储未绑定，请先在控制台创建命名空间并绑定到 BOARD_KV' }, 500);

  const config = await readConfig(kv);
  let body;
  try { body = await context.request.json(); } catch (e) { body = {}; }

  const action = body.action || body.op || '';

  try {
    let result;

    switch (action) {
      case 'get':
        result = config;
        break;

      case 'save': // 整体覆盖保存（后台编辑完整配置）
        if (!body.config || typeof body.config !== 'object') return json({ error: 'config 参数缺失' }, 400);
        result = await saveConfig(kv, body.config);
        break;

      // ===== 分类管理 =====
      case 'addGroup': {
        const name = (body.name || '').trim();
        if (!name) return json({ error: '分类名称不能为空' }, 400);
        const maxOrder = (config.groups || []).reduce((m, g) => Math.max(m, g.order || 0), 0);
        const group = {
          id: 'g' + Date.now().toString(36),
          name,
          color: body.color || '#2563eb',
          order: maxOrder + 1,
          cardCount: body.cardCount || 5,
          sources: []
        };
        config.groups = config.groups || [];
        config.groups.push(group);
        result = await saveConfig(kv, config);
        break;
      }

      case 'deleteGroup': {
        const gid = body.groupId;
        if (!gid) return json({ error: 'groupId 缺失' }, 400);
        config.groups = (config.groups || []).filter((g) => g.id !== gid);
        result = await saveConfig(kv, config);
        break;
      }

      case 'renameGroup': {
        const gid = body.groupId;
        const g = (config.groups || []).find((x) => x.id === gid);
        if (!g) return json({ error: '分类不存在' }, 404);
        if (body.name) g.name = body.name.trim();
        if (body.color) g.color = body.color;
        if (body.cardCount) g.cardCount = Number(body.cardCount);
        result = await saveConfig(kv, config);
        break;
      }

      case 'moveGroup': { // 排序调整：dir = up | down
        const gid = body.groupId;
        const dir = body.dir;
        const list = config.groups || [];
        const idx = list.findIndex((x) => x.id === gid);
        if (idx < 0) return json({ error: '分类不存在' }, 404);
        const target = dir === 'up' ? idx - 1 : dir === 'down' ? idx + 1 : -1;
        if (target < 0 || target >= list.length) return json({ error: '已在边界' }, 400);
        const tmp = list[idx]; list[idx] = list[target]; list[target] = tmp;
        list.forEach((g, i) => { g.order = i + 1; });
        result = await saveConfig(kv, config);
        break;
      }

      // ===== 数据源（接口）管理 =====
      case 'addSource': {
        const gid = body.groupId;
        const g = (config.groups || []).find((x) => x.id === gid);
        if (!g) return json({ error: '分类不存在' }, 404);
        if (!(body.name || '').trim() || !(body.url || '').trim()) {
          return json({ error: '名称和接口 URL 必填' }, 400);
        }
        const source = {
          id: uid(),
          name: body.name.trim(),
          url: body.url.trim(),
          iconColor: body.iconColor || '#2563eb',
          showItems: body.showItems ? Number(body.showItems) : 6,
          listPath: body.listPath || '',
          titleField: body.titleField || 'title',
          urlField: body.urlField || 'url',
          headers: body.headers || '',
          enabled: body.enabled !== false
        };
        g.sources = g.sources || [];
        g.sources.push(source);
        result = await saveConfig(kv, config);
        break;
      }

      case 'updateSource': {
        const sid = body.sourceId;
        for (const g of config.groups || []) {
          const s = (g.sources || []).find((x) => x.id === sid);
          if (s) {
            if (body.name != null) s.name = body.name.trim();
            if (body.url != null) s.url = body.url.trim();
            if (body.iconColor != null) s.iconColor = body.iconColor;
            if (body.showItems != null) s.showItems = Number(body.showItems);
            if (body.listPath != null) s.listPath = body.listPath;
            if (body.titleField != null) s.titleField = body.titleField;
            if (body.urlField != null) s.urlField = body.urlField;
            if (body.headers != null) s.headers = body.headers;
            if (body.enabled != null) s.enabled = body.enabled;
            break;
          }
        }
        result = await saveConfig(kv, config);
        break;
      }

      case 'deleteSource': {
        const sid = body.sourceId;
        for (const g of config.groups || []) {
          const i = (g.sources || []).findIndex((x) => x.id === sid);
          if (i >= 0) { g.sources.splice(i, 1); break; }
        }
        result = await saveConfig(kv, config);
        break;
      }

      // ===== 全局 =====
      case 'setRefresh': {
        config.refreshSeconds = Number(body.refreshSeconds) || 600;
        result = await saveConfig(kv, config);
        break;
      }

      case 'clearCache': {
        for (const g of config.groups || []) {
          for (const s of g.sources || []) {
            try { await kv.delete('cache:' + s.id); } catch (e) { /* ignore */ }
          }
        }
        result = { ok: true, cleared: '全部数据缓存已清除' };
        break;
      }

      default:
        return json({ error: '未知操作 action=' + action }, 400);
    }

    return json({ ok: true, result });
  } catch (err) {
    return json({ error: '操作失败: ' + err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
