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
```

3. 执行数据库迁移

将 `supabase/migrations/202605230001_create_rental_mvp.sql` 放入 Supabase 项目执行，或使用 Supabase CLI：

```bash
supabase db push
```

迁移会创建核心表、枚举、索引、RLS policies、`listing-images` Storage bucket。

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
