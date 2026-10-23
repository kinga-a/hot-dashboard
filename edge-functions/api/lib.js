/**
 * 公共 KV 与配置读取工具
 * EdgeOne Pages Functions 运行时注入 KV 绑定变量（BOARD_KV），可通过 env 或全局访问。
 *
 * 数据流（hotboard 模式）：
 *   KV 只存「看板配置」（分类 + 数据源 + 刷新间隔），不存榜单数据。
 *   榜单数据由前端浏览器直连数据源抓取，sessionStorage 会话缓存 + 自动刷新。
 */

// 尝试从 context.env 或全局作用域拿到 KV 绑定对象
export function getKV(context) {
  if (context && context.env && context.env.BOARD_KV) return context.env.BOARD_KV;
  if (typeof BOARD_KV !== 'undefined') return BOARD_KV;
  return null;
}

/* ===== 默认配置：参考 hotboard（yiktt/hotboard）内置数据源，主源 Codelife ===== */
const API_CODELIFE = 'https://api.codelife.cc/api/top/list';

// 每个数据源条目生成器
function src(id, name, color, showItems = 6) {
  return {
    id,
    name,
    url: API_CODELIFE + '?id=' + id,
    iconColor: color,
    showItems,
    listPath: 'data',
    titleField: 'title',
    urlField: 'link',
    enabled: true
  };
}

const DEFAULT_CONFIG = {
  refreshSeconds: 600,
  groups: [
    {
      id: 'ghot', name: '综合热搜', color: '#e6162d', order: 1, cardCount: 5,
      sources: [
        src('KqndgxeLl9', '微博热搜', '#e6162d'),
        src('mproPpoq6O', '知乎热榜', '#0084ff'),
        src('Jb0vmloB1G', '百度热搜', '#2932e1'),
        src('toutiao', '头条热榜', '#f03d3d'),
        src('WnBe01o371', '微信热文', '#07c160')
      ]
    },
    {
      id: 'gtech', name: '科技开发', color: '#2563eb', order: 2, cardCount: 5,
      sources: [
        src('rYqoXQ8vOD', 'GitHub 热榜', '#24292f'),
        src('QaqeEaVe9R', '掘金热榜', '#1e80ff'),
        src('Y2KeDGQdNP', '少数派', '#e65929'),
        src('74Kvx59dkx', 'IT之家', '#e2522f'),
        src('Q1Vd5Ko85R', '36氪', '#1cbfa0')
      ]
    },
    {
      id: 'gglobal', name: '海外视野', color: '#0f9d58', order: 3, cardCount: 5,
      sources: [
        src('LBwdG0jePx', 'Product Hunt', '#da552f'),
        src('12owgX0oNV', '腾讯新闻', '#256eb3'),
        src('rx9ozj7oXb', '新浪新闻', '#e6162d'),
        src('X12owXzvNV', '雪球热帖', '#00a5e5'),
        src('G2me3ndwjq', '华尔街见闻', '#c9a063')
      ]
    },
    {
      id: 'gnews', name: '新闻资讯', color: '#f97316', order: 4, cardCount: 5,
      sources: [
        src('74KvxwokxM', 'B站热门', '#fb7299'),
        src('DpQvNABoNE', '抖音热榜', '#f2f5f8'),
        src('G47o8weMmN', '虎扑热帖', '#d43c33'),
        src('4KvxEX0dkx', '微信读书', '#2c6fbb'),
        src('n3moBE1eN5', '懂球帝', '#00b76a')
      ]
    },
    {
      id: 'gfun', name: '影音娱乐', color: '#8b5cf6', order: 5, cardCount: 5,
      sources: [
        src('9JndkpJe3V', '猫眼电影', '#ff4d00'),
        src('VaobbkqoAj', 'IMDb Top', '#e2b616'),
        src('MZd7PrPerO', '快手热榜', '#ff4906'),
        src('K7GdagpoQy', '什么值得买', '#e8340e'),
        src('Om4ejxvxEN', '百度贴吧', '#4a90d9')
      ]
    }
  ]
};

// 读取看板配置（不存在则返回默认配置）
export async function readConfig(kv) {
  if (!kv) return DEFAULT_CONFIG;
  try {
    const raw = await kv.get('config');
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    // 配置为空（管理员清空过）时也回退默认
    if (!parsed.groups || !parsed.groups.length) return DEFAULT_CONFIG;
    return parsed;
  } catch (e) {
    return DEFAULT_CONFIG;
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
