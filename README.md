# 新加坡华人租房平台 MVP

这是一个可运行的 Next.js App Router + TypeScript + Tailwind + Supabase MVP，覆盖：

- 房东 / 中介发布房源，提交后进入 `pending_review`
- 租客浏览、搜索、筛选已发布房源
- 房源详情、设施、规则、周边 mock 信息和咨询表单
- 管理后台审核通过、驳回、下架、查看用户 / 咨询 / 异常房源
- Supabase PostgreSQL、Auth、Storage bucket、RLS 权限策略
- `postal_code`、`latitude`、`longitude` 字段预留，后续可替换 OneMap API

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth / PostgreSQL / Storage
- Supabase SQL migration

## Zufang 自动采集

数据采集已改为网站内运行，不再依赖本机 PM2、`node-cron` 或本地 logs 定时任务。

- Vercel Cron：`vercel.json` 每天 UTC `15 19 * * *` 调用 `/api/cron/crawl-zufang`，即新加坡时间 03:15。
- Cron API：`GET /api/cron/crawl-zufang`，必须带 `Authorization: Bearer <CRON_SECRET>`。
- 手动 API：`POST /api/admin/crawl-zufang`，同样必须带 `Authorization: Bearer <CRON_SECRET>`。
- 后台状态页：`/admin/crawler` 显示最近 20 次 `crawl_jobs`，不在前端暴露 `CRON_SECRET`。
- 爬虫入口：`src/crawler/zufangCrawler.ts` 导出 `crawlZufangRecentListings`。
- 本地手动测试：`npm run crawl:local`。
- 采集源：`CRAWL_SOURCE=zufang.sg` 或 `CRAWL_SOURCE=shichengbbs.com`。
- `shichengbbs.com` 默认优先采集裕廊东、裕华园、湖畔、文礼、先驱、裕群区域；可用 `CRAWL_ENTRY_URL` 临时覆盖入口 URL。

Vercel Serverless Function 不适合长时间爬取，默认每次最多抓 5 页，成功新增 50 条符合最近 3 天条件的原始房源后停止；详情页处理保留 200 个安全上限，详情并发为 2。超过限制会停止本次任务，明天继续。

采集任务成功保存 raw HTML 后直接结束，不在本地触发解析、清理、索引或地理编码。后续处理由服务端任务分步执行：

1. 从 `ingestion_listings.raw_detail_html` 解析详情页 HTML
2. 清理并结构化字段，写入 `listing_indexes`
3. 扫描索引中的邮编并加入 `geocoding_cache`
4. 同步坐标、学校距离和通勤估算回索引表

手动触发示例：

```bash
curl -X POST https://your-domain.com/api/admin/crawl-zufang \
  -H "Authorization: Bearer $CRON_SECRET"
```

详情页采集只做两件事：从列表页发现房源 URL，然后请求详情页并保存 `raw_detail_html`。采集阶段不解析详情页内容，不写入详情页结构化字段；解析、语义字段抽取和搜索索引由后续 `index:listings` 分步处理。列表页发现信息仍以 `list_*` 保存，方便排查和后台管理。

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env.local
```

填写：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
DATABASE_URL=
CRAWL_SOURCE=zufang.sg
CRAWL_ENTRY_URL=
CRAWL_DAYS=3
MAX_PAGES_PER_RUN=5
MAX_INSERTED_PER_RUN=50
MAX_DETAILS_PER_RUN=200
DETAIL_CONCURRENCY=2
```

3. 执行数据库迁移

将 `supabase/migrations/*.sql` 放入 Supabase 项目执行，或使用 Supabase CLI：

```bash
supabase db push
```

迁移会创建核心表、枚举、索引、RLS policies、`listing-images` Storage bucket。
采集相关迁移会创建 `crawl_jobs`、`crawl_logs`，并将 `ingestion_listings` 收束为原始采集表；结构化解析结果写入 `listing_indexes`。

4. 启动本地开发

```bash
npm run dev
```

打开 `http://localhost:3000/rent`。

## 主要路径

- `/rent`：租客搜索页
- `/rent/[id]`：房源详情页
- `/landlord/listings/new`：房东发布房源
- `/admin`：管理后台
- `/auth/login`：登录 / 注册

## 角色权限

- `tenant`：可浏览已发布房源，可创建 enquiry
- `landlord`：可创建和管理自己的 listings
- `agent`：可创建和管理自己发布的 listings
- `admin`：可审核和管理所有数据
- 未登录用户：可浏览 `published` 房源，不能创建 enquiry

## 地理信息

当前实现：

- `services/geocoding.ts`：根据邮编前缀 mock 地址、经纬度、最近 MRT
- `services/nearbyPlaces.ts`：根据经纬度 mock MRT、bus stop、food court、supermarket、mall

后续接 OneMap API 时，只需要替换这两个服务的内部实现，数据库字段已经预留。

## 图片上传

MVP 的发布表单支持填写 Supabase Storage public URL，并已提供：

- `uploadListingImage`
- `deleteListingImage`

后续可以把图片控件从 URL 输入升级为直接上传文件到 `listing-images` bucket。

## 注意

Admin 账号需要先注册普通用户，然后在 Supabase SQL Editor 中手动更新：

```sql
update public.users_profile
set role = 'admin'
where auth_user_id = '<auth.users.id>';
```

Supabase 新项目可能不会自动把 SQL 创建的表暴露给 Data API。本迁移已经包含 `grant usage` 和表级 `grant`，并开启了 RLS。
