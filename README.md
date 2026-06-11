# 维界租房系统

新加坡华人租房平台，使用 Next.js App Router、TypeScript、Tailwind CSS 和 Supabase。

## 房源数据流

```text
ingestion_listings
原始爬虫数据
        ↓
listing_import_candidates
结构化解析、去重、人工审核
        ↓
listings
正式业务房源
```

`listing_clean` 和 `listing_indexes` 已退役。爬虫数据不会直接进入正式房源表，也不会自动发布。

## 常用命令

```bash
npm run dev
npm run build
npm run crawl:local
npm run import:crawler-listings -- --limit 50
npm run import:crawler-listings -- --limit 20 --dry-run
npm run enrich:ntu-commute -- --limit 20
npm run enrich:ntu-commute -- --postal-code 640975
npm run test:ingestion
```

导入脚本支持：

- `--limit 50`
- `--dry-run`
- `--source shichengbbs.com`

## 主要页面

- `/rent`：正式房源搜索
- `/rent/[id]`：正式房源详情
- `/landlord/listings/new`：发布房源
- `/admin`：管理后台
- `/admin/ingestion`：原始采集数据
- `/admin/listing-imports`：候选房源审核

## 环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
```

服务端爬虫和导入任务必须使用 Supabase secret key，不能把服务端密钥暴露给浏览器。

## 导入安全默认值

候选房源导入 `listings` 时固定使用：

- `status = draft`
- `verification_status = unverified`
- `contact_visibility = group_only`
- `source = zufang`

没有邮编、没有联系方式、无法映射正式 enum 的候选不能导入。隔间、佣人房和床位必须人工审核。

## NTU 通勤缓存

`listing_commute_cache` 以 6 位 `postal_code` 为主键。相同邮编的正式房源共享：

- `ntu_bus_minutes`
- `ntu_drive_minutes`

新房源写入或修改邮编时会自动创建 `pending` 缓存记录，再由 `enrich:ntu-commute` 调用 OneMap 补齐。

Vercel Cron 每天新加坡时间 04:30 调用 `/api/cron/enrich-ntu-commute`。该接口要求
`Authorization: Bearer <CRON_SECRET>`，默认每次处理 10 个邮编。
