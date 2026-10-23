# 热点聚合看板 — EdgeOne 全栈应用

可自定义分组的全网热搜看板，部署在腾讯云 EdgeOne Pages。

- 前端：`index.html`（看板展示）、`admin.html`（管理后台）
- 后端：`edge-functions/api/` 下的边缘函数（Pages Functions）
- 存储：EdgeOne KV（存配置 + 数据缓存，实现自动刷新）

## 功能

| 功能 | 说明 |
|---|---|
| 新建分类 | 后台创建分类（名称 / 颜色 / 卡片数量） |
| 分类排序 | 每个分类可上移 / 下移调整顺序 |
| 设置卡片数 | 每分类可设 1~5 张卡片，每卡片可设显示条数 |
| 添加接口 | 每个分类可添加任意返回 JSON 的榜单 API（可配列表路径 / 标题字段 / 链接字段 / 请求头） |
| 自动刷新 | 全局设置刷新间隔（秒），边缘函数按间隔抓取并缓存到 KV |

## 目录结构

```
hot-dashboard-edgeone/
├── edgeone.json              # EdgeOne 项目配置
├── package.json
├── index.html                # 看板展示页
├── admin.html                # 管理后台
└── edge-functions/
    └── api/
        ├── lib.js            # KV 工具 + 配置读写 + CORS
        ├── board.js          # GET /api/board  展示页数据
        ├── proxy.js          # GET /api/proxy  数据代理（抓取+KV缓存自动刷新）
        └── admin.js          # POST /api/admin 管理接口（需 Token）
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
