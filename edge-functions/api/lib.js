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

// 行情源构造器（腾讯行情接口 qt.gtimg.cn：CORS 开放、浏览器可直连；指数类 ~ 分隔、外盘类 , 分隔，GBK 编码）
function quote(id, name, color, symbols, names, note) {
  return {
    id,
    name,
    url: 'https://qt.gtimg.cn/q=' + symbols.join(','),
    iconColor: color,
    showItems: symbols.length,
    type: 'quote',
    symbols,
    names,
    note: note || '',
    enabled: true
  };
}

// 服务端代理源构造器：无 CORS 的页面/接口由后端 Edge Function 抓取解析（/api/proxy?id=），前端 fetch 同源代理
function page(id, name, color, target, showItems = 10) {
  return {
    id,
    name,
    url: target,
    iconColor: color,
    showItems,
    listPath: 'data',
    titleField: 'title',
    urlField: 'link',
    type: 'page',
    enabled: true
  };
}

// 汇率源构造器（frankfurter.app：ECB 官方数据、免费无 key、CORS 开放、UTF-8 JSON；基准 USD）
// 前端拉取最近 7 日序列，交叉换算「1 外币 = ? 人民币」，涨跌 = 最近交易日环比
function fxQuote(id, name, color, currencies, names) {
  return {
    id,
    name,
    url: 'https://api.frankfurter.dev/v1/latest?from=USD',
    iconColor: color,
    showItems: currencies.length,
    type: 'fx',
    symbols: currencies,
    names,
    note: 'ECB 中间价 · 最近交易日环比',
    enabled: true
  };
}

export const DEFAULT_CONFIG = {
  refreshSeconds: 600,
  cardsPerRow: 4, // PC 端每排卡片数（2~6），移动端自动单列
  groups: [
    {
      id: 'gfinance', name: '财经行情', color: '#d97706', order: 1, cardCount: 6,
      sources: [
        quote('qt-index', '全球指数', '#2563eb',
          ['sh000001', 'sz399001', 'sh000300', 'hkHSI', 'usNDX', 'usDJI', 'usINX'],
          ['上证指数', '深证成指', '沪深300', '恒生指数', '纳斯达克100', '道琼斯', '标普500']),
        quote('qt-us-stock', '热门美股', '#3b82f6',
          ['usAAPL', 'usGOOG', 'usMSFT', 'usNVDA', 'usTSLA', 'usJD', 'usBABA', 'usPDD'],
          ['苹果', '谷歌', '微软', '英伟达', '特斯拉', '京东', '阿里巴巴', '拼多多']),
        quote('qt-gold', '贵金属大宗', '#d97706',
          ['hf_XAU', 'hf_XAG', 'hf_GC', 'hf_SI', 'hf_OIL'],
          ['伦敦金', '伦敦银', '纽约黄金', '纽约白银', '布伦特原油']),
        quote('qt-cn-gold', '国内金价', '#eab308',
          ['sh518880', 'sh518800', 'sz159937', 'sz159934'],
          ['黄金ETF·华安', '黄金ETF·国泰', '黄金ETF·博时', '黄金ETF·易方达'], '黄金ETF · 元/份'),
        page('hb-ruseo-gold', '国内金价·元/克', '#d97706', 'https://api.ruseo.cn/api/goldprice', 12),
        fxQuote('qt-fx', '主要汇率', '#0ea5e9',
          ['USD', 'EUR', 'GBP', 'JPY', 'HKD', 'AUD'],
          ['美元/人民币', '欧元/人民币', '英镑/人民币', '日元/人民币', '港币/人民币', '澳元/人民币'])
      ]
    },
    {
      id: 'gmovie', name: '影视热播', color: '#7c3aed', order: 7, cardCount: 2,
      sources: [
        page('hb-redfruit', '红果短剧热播榜', '#ec4899', 'https://hongguoduanju.com/rank/hot-drama', 10),
        page('hb-douban-movie', '豆瓣热门电影', '#00b51d', 'https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8', 10)
      ]
    },
    {
      id: 'ghot', name: '综合热搜', color: '#e6162d', order: 2, cardCount: 5,
      sources: [
        src('KqndgxeLl9', '微博热搜', '#e6162d'),
        src('mproPpoq6O', '知乎热榜', '#0084ff'),
        src('Jb0vmloB1G', '百度热搜', '#2932e1'),
        src('toutiao', '头条热榜', '#f03d3d'),
        src('WnBe01o371', '微信热文', '#07c160'),
        src('K7GdagpoQy', '什么值得买', '#e8340e'),
        src('Om4ejxvxEN', '百度贴吧', '#4a90d9'),
        page('hb-sina-hot', '新浪热榜', '#f6842e', 'https://top.news.sina.com.cn/ws/GetTopDataList.php', 10),
        page('hb-netease', '网易新闻', '#d0021b', 'https://m.163.com/fe/api/hot/news/flow', 10)
      ]
    },
    {
      id: 'gtech', name: '科技开发', color: '#2563eb', order: 3, cardCount: 5,
      sources: [
        src('rYqoXQ8vOD', 'GitHub 热榜', '#24292f'),
        src('QaqeEaVe9R', '掘金热榜', '#1e80ff'),
        src('Y2KeDGQdNP', '少数派', '#e65929'),
        src('74Kvx59dkx', 'IT之家', '#e2522f'),
        src('Q1Vd5Ko85R', '36氪', '#1cbfa0'),
        src('DgeyrgMoZq', 'CSDN', '#fc5531'),
        src('VaobJ88oAj', '站酷', '#e07b00'),
        src('5VaobgvAj1', '虎嗅', '#d0021b'),
        src('rYqoXZzdOD', '开源中国', '#00a062'),
        src('20MdKx4ew1', '人人都是产品经理', '#1e88e5')
      ]
    },
    {
      id: 'gglobal', name: '海外视野', color: '#0f9d58', order: 4, cardCount: 5,
      sources: [
        src('LBwdG0jePx', 'Product Hunt', '#da552f'),
        page('hb-hn', 'Hacker News', '#ff6600', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20', 10),
        page('hb-devto', 'dev.to', '#3b49df', 'https://dev.to/api/articles?top=7&per_page=20', 10),
        page('hb-appstore', 'App Store 免费榜', '#0d96f6', 'https://itunes.apple.com/us/rss/topfreeapplications/limit=10/json', 10),
        page('hb-bbc', 'BBC 新闻', '#bb1919', 'https://feeds.bbci.co.uk/news/world/rss.xml', 10),
        page('hb-nyt', '纽约时报', '#1c2333', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 10),
        page('hb-guardian', '卫报', '#14284b', 'https://www.theguardian.com/world/rss', 10),
        page('hb-aljazeera', '半岛电视台', '#b6102f', 'https://www.aljazeera.com/xml/rss/all.xml', 10),
        page('hb-npr', 'NPR', '#2659a4', 'https://feeds.npr.org/1001/rss.xml', 10),
        page('hb-dw', '德国之声', '#2a5da8', 'https://rss.dw.com/rdf/rss-en-world', 10)
      ]
    },
    {
      id: 'gnews', name: '新闻资讯', color: '#f97316', order: 5, cardCount: 5,
      sources: [
        src('12owgX0oNV', '腾讯新闻·热问', '#256eb3'),
        src('rx9ozj7oXb', '新浪财经', '#e6162d'),
        src('0MdKam4ow1', '第一财经', '#1c3e8e'),
        src('X12owXzvNV', '雪球热帖', '#00a5e5'),
        src('G2me3ndwjq', '华尔街见闻', '#c9a063'),
        page('hb-thepaper', '澎湃新闻', '#e66a2c', 'https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', 10),
        page('hb-chinanews', '中国新闻网', '#e02e2e', 'https://www.chinanews.com.cn/rss/scroll-news.xml', 10)
      ]
    },
    {
      id: 'gfun', name: '影音娱乐', color: '#8b5cf6', order: 6, cardCount: 5,
      sources: [
        src('74KvxwokxM', '哔哩哔哩', '#fb7299'),
        src('DpQvNABoNE', '抖音热点', '#f2f5f8'),
        page('hb-douban-chart', '豆瓣新片榜', '#00b51d', 'https://movie.douban.com/chart', 10),
        src('G47o8weMmN', '虎扑步行街', '#d43c33'),
        src('4KvxEX0dkx', '微信读书', '#2c6fbb'),
        src('n3moBE1eN5', '懂球帝', '#00b76a'),
        src('MZd7PrPerO', '快手热榜', '#ff4906'),
        src('9JndkpJe3V', '猫眼电影', '#ff4d00'),
        src('VaobbkqoAj', 'IMDb Top', '#e2b616')
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
