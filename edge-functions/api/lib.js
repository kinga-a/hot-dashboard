/**
 * 公共 KV 与配置读取工具
 * EdgeOne Pages Functions 运行时注入 KV 绑定变量（BOARD_KV），可通过 env 或全局访问。
 */

// 尝试从 context.env 或全局作用域拿到 KV 绑定对象
export function getKV(context) {
  if (context && context.env && context.env.BOARD_KV) return context.env.BOARD_KV;
  if (typeof BOARD_KV !== 'undefined') return BOARD_KV;
  return null;
}

// 读取看板配置（不存在则返回默认配置）
export async function readConfig(kv) {
  const DEFAULT = {
    refreshSeconds: 600, // 数据自动刷新间隔（秒）
    groups: []
  };
  if (!kv) return DEFAULT;
  try {
    const raw = await kv.get('config');
    if (!raw) return DEFAULT;
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT;
  }
}

// 保存看板配置
export async function saveConfig(kv, config) {
  if (!kv) throw new Error('KV 未绑定');
  await kv.put('config', JSON.stringify(config));
  return config;
}

// CORS 统一响应头
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json; charset=UTF-8'
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS
  });
}
