# Deprecated ingestion folder

采集代码已迁移到项目根目录 `src/`，由 Vercel Cron 和 Next.js API Route 触发。

请使用：

```bash
npm run crawl:local
```

线上自动采集入口：

- `GET /api/cron/crawl-zufang`
- `POST /api/admin/crawl-zufang`

两个接口都必须携带 `Authorization: Bearer <CRON_SECRET>`。
