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
- 默认按优先级多源补采：`shichengbbs.com` 西部 MRT、`zufang.sg` 西部 MRT、`shichengbbs.com` 全站单间、`zufang.sg` 全站单间。
- 可用 `CRAWL_ENTRY_URL` 临时覆盖为单入口采集；覆盖时 `CRAWL_SOURCE=zufang.sg` 或 `CRAWL_SOURCE=shichengbbs.com` 用于决定解析域名。

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

## 地理信息与 AI 补齐

后台脚本采用保守的 upsert/update 策略，不会 truncate 房源表，不会删除 `listing_indexes`，也不会把已有通勤或 AI 标签覆盖为空。现有重建入口同样改为按 `source,source_id` upsert。

### 环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
ONEMAP_API_TOKEN=
ONEMAP_ROUTE_TIME=08:30:00
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

- `ONEMAP_API_TOKEN`：OneMap Search 和 Routing API 的 Authorization token。OneMap Search 现在也要求 token。
- `ONEMAP_ROUTE_TIME`：公共交通路线计算时间，默认 `08:30:00`。
- `OPENAI_API_KEY`：可选；没有配置时 AI 分析使用规则 fallback。

### 真实通勤时间补齐

从 `commute_enrichment_queue` 读取 `pending/retry`，优先用 `postal_code`，其次用 `address_text` 调 OneMap Search 写回坐标，再按 `school_locations` 里的 NTU/NUS/SMU/SUTD 坐标调用 OneMap Route。成功后更新 `listing_indexes.travel_time_bus_*`、`commute_computed_at`、`commute_source`，并将 `commute_enrichment_jobs.status` 置为 `completed`。失败时只更新 job 的 `retry/failed`、`retry_count` 和 `last_error`，不会清空已有通勤字段。

通勤时间是缓存字段，不会每次搜索实时调用 OneMap：

- 坐标缓存：`listing_indexes.latitude`、`listing_indexes.longitude`、`geocoded_at`、`geocode_source`
- 通勤缓存：`listing_indexes.travel_time_bus_ntu/nus/smu/sutd`、`commute_computed_at`、`commute_source`
- 队列状态：`commute_enrichment_jobs`
- 同邮编复用：新房源邮编已存在坐标缓存时，直接复用本地坐标，不调用 OneMap Search；同邮编已存在完整目标学校通勤缓存时，直接复制 `travel_time_bus_*`，不调用 OneMap Route

新增或更新 `listing_indexes` 后会自动进入通勤队列：

- 应用层：索引 upsert 后会调用 `enqueueCommuteJobForListingIndex`
- 数据库层：`202606050002_auto_enqueue_commute_jobs.sql` 增加 trigger，防止其他写入路径漏入队
- 地址或邮编变化时，已完成任务会重新置为 `pending`

管理后台调试入口：

```text
/admin/commute
```

后台支持查看缓存覆盖率、队列状态、失败原因、最近通勤结果，并可执行扫描补漏、dry-run、小批量真实补齐、重试 failed。

自动处理路径：

- `app/api/cron/enrich-commute` 使用 `CRON_SECRET` 保护
- `vercel.json` 已配置每天 UTC 20:30 触发，即新加坡时间 04:30
- 默认每次处理 `COMMUTE_ENRICHMENT_LIMIT` 或 10 条 pending/retry 任务
- 服务器必须配置 `ONEMAP_API_TOKEN`

```bash
npm run enrich:commute -- --limit 20
npm run enrich:commute -- --limit 20 --school NTU
npm run enrich:commute -- --limit 5 --dry-run
```

运行输出包含待处理数量、成功数量、失败数量和跳过数量。

### AI 分析补齐

从 `listing_indexes` 读取 title、summary、body_text、search_text、price、gender_preference、room_type、normalized_room_type、semantic_tags、tags，写入 `listing_ai_analysis`。默认只在记录不存在、`semantic_tags_ai` 为空或 `summary_ai` 为空时更新；需要覆盖时显式加 `--force`。

```bash
npm run enrich:ai -- --limit 20
npm run enrich:ai -- --limit 20 --force
npm run enrich:ai -- --limit 5 --dry-run
```

标准 AI 标签只允许：

```text
QUIET, STUDY_FRIENDLY, LOW_DENSITY, PRIVATE, FLEXIBLE_ACCESS,
NIGHT_SHIFT_FRIENDLY, FEMALE_FRIENDLY, SOCIAL_FRIENDLY,
INTROVERT_FRIENDLY, WORKING_PROFESSIONAL_FRIENDLY
```

没有 `OPENAI_API_KEY` 时会使用规则 fallback，例如“安静 / 不吵 / 清静”映射到 `QUIET` 和 `quiet_score=4`，“适合学习 / 学生”映射到 `STUDY_FRIENDLY`，女生偏好映射到 `FEMALE_FRIENDLY`。

### 验证 SQL

```sql
select status, count(*) from commute_enrichment_jobs group by status;

select count(*) filter (where latitude is not null and longitude is not null) as has_coords
from listing_indexes;

select count(*) filter (where travel_time_bus_ntu is not null) as has_ntu_commute
from listing_indexes;

select count(*) as total from listing_ai_analysis;

select title, price, summary_ai, recommendation_reasons, risk_notes
from listing_ai_search_view
limit 10;
```

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
