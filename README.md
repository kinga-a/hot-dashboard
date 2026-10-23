# 热点聚合看板 — EdgeOne 应用

可自定义分组的全网热搜看板，部署在腾讯云 EdgeOne Pages。架构参考 [yiktt/hotboard](https://github.com/yiktt/hotboard)：**纯静态直连数据源 + 会话缓存 + 定时自动刷新**，榜单数据不写入任何存储，彻底避免"数据过期不更新"问题。

## 架构（v2 · hotboard 模式）

```
浏览器 (index.html)
 ├─ GET /api/board        → 只取看板配置（分类+数据源+刷新间隔，来自 KV）
 ├─ 直连数据源 fetch(URL) → 浏览器端并行抓取各平台热榜（Codelife 等，CORS 开放）
 ├─ sessionStorage 缓存    → 先展示旧数据，后台刷新覆盖；失败保留旧数据并标注时间
 └─ setInterval 定时刷新   → 每 refreshSeconds 只刷过期缓存，不重复请求

KV (BOARD_KV)
 └─ key: config            → 仅存看板配置（分类 / 排序 / 卡片数 / 数据源）
```

- **榜单数据不落 KV**：数据由每个浏览器会话自行抓取缓存，明天数据变了，刷新自然拿到新数据。
- **默认配置兜底**：KV 无配置时自动使用内置默认配置（5 大分类、25 个 Codelife 源），开箱即有真实热榜。

## 功能

| 功能 | 说明 |
|---|---|
| 新建分类 | 后台创建分类（名称 / 颜色 / 卡片数量） |
| 分类排序 | 每个分类可上移 / 下移调整顺序 |
| 设置卡片数 | 每分类可设 1~5 张卡片，每卡片可设显示条数 |
| 添加接口 | 每个分类可添加任意返回 JSON 的榜单 API（可配列表路径 / 标题字段 / 链接字段 / 请求头） |
| 自动刷新 | 全局设置刷新间隔（秒），浏览器按间隔自动刷新过期数据 |

## 目录结构

```
hot-dashboard-edgeone/
├── edgeone.json              # EdgeOne 项目配置
├── package.json
├── index.html                # 看板展示页（直连数据源 + 会话缓存 + 自动刷新）
├── admin.html                # 管理后台
├── serve-test.mjs            # 本地测试服务（模拟边缘函数，无需部署即可预览）
└── edge-functions/
    └── api/
        ├── lib.js            # KV 工具 + 默认配置 + 配置读写 + CORS
        ├── board.js          # GET /api/board  只返回看板配置
        └── admin.js          # POST /api/admin 管理接口（需 Token）
```

## 本地预览（推荐先跑这个）

```bash
node serve-test.mjs
# 打开 http://localhost:8790  → 看板
# 打开 http://localhost:8790/admin.html → 管理后台（Token: Aa123456@*，可在脚本中改）
```

## 部署步骤

1. **注册并登录 EdgeOne**（腾讯云）：`edgeone login`，选择 `China` 国内站。
2. **开通 Pages 服务**，控制台创建 Pages 项目（Git 连接或直接上传）。
3. **安装 CLI**：`npm install -g edgeone`
4. **初始化并关联**（在项目目录）：
   ```bash
   edgeone pages init
   edgeone pages link
   ```
5. **创建 KV 命名空间**（控制台 → KV 存储 → 创建命名空间，例如 `hot-dashboard-kv`），并绑定到边缘函数，变量名设为 **`BOARD_KV`**。
   > 注意：KV 存储目前需白名单，联系 EdgeOne 申请开通。
6. **配置环境变量**（控制台 → 环境变量）：
   - `ADMIN_TOKEN`：管理后台访问令牌（必填）
7. **部署**：
   ```bash
   edgeone pages deploy
   ```
   或推送代码到 GitHub，由 Pages 自动构建发布。

## 后台使用

- 访问 `/admin.html`，输入部署时配置的 `ADMIN_TOKEN`。
- 新建分类 → 添加数据源（榜单接口 URL）→ 调整顺序与卡片数 → 保存。

## 内置数据源（Codelife，无需 Key）

默认配置已内置 5 大分类 25 个源，均来自 [hotboard](https://github.com/yiktt/hotboard) 同款开放接口：

- **综合热搜**：微博热搜 / 知乎热榜 / 百度热搜 / 头条热榜 / 微信热文
- **科技开发**：GitHub 热榜 / 掘金热榜 / 少数派 / IT之家 / 36氪
- **海外视野**：Product Hunt / 腾讯新闻 / 新浪新闻 / 雪球热帖 / 华尔街见闻
- **新闻资讯**：B站热门 / 抖音热榜 / 虎扑热帖 / 微信读书 / 懂球帝
- **影音娱乐**：猫眼电影 / IMDb Top / 快手热榜 / 什么值得买 / 百度贴吧

接口格式：`https://api.codelife.cc/api/top/list?id=<平台ID>`，返回 `{code, data:[{index,title,hotValue,link}]}`，CORS 开放。

## 数据源示例（通用格式）

任意返回 JSON 的榜单接口，例如：

```json
{
  "code": 0,
  "data": [
    { "title": "热搜标题1", "url": "https://.../1" },
    { "title": "热搜标题2", "url": "https://.../2" }
  ]
}
```

- 列表路径：`data`
- 标题字段：`title`
- 链接字段：`url`

若接口是 `{ "data": { "list": [...] } }`，列表路径填 `data.list`。
若标题字段是 `word`、链接字段是 `link`，对应改为 `word` / `link`。
