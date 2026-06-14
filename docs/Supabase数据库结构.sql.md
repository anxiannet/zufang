# Supabase数据库结构.sql

> 本文件是维界租房平台的数据库结构草案，用于后续 Supabase migration 实现。

## 设计目标

数据库必须支持：

- 屋主提交房源
- 爬虫采集房源
- AI结构化解析
- 房源展示与搜索
- 通勤缓存
- 收藏与浏览统计
- 推广订单
- 后台审核

---

# 1. 枚举类型

```sql
create type user_role as enum ('tenant', 'landlord', 'advisor', 'admin');
create type listing_status as enum ('raw', 'parsed', 'pending_auth', 'authorized', 'published', 'promoted', 'rented', 'archived', 'rejected');
create type verification_level as enum ('none', 'basic', 'landlord_verified', 'site_verified');
create type source_type as enum ('manual', 'wechat', 'telegram', 'facebook', 'xiaohongshu', 'zufang_sg', 'other');
create type property_type as enum ('hdb', 'condo', 'landed', 'apartment', 'other');
create type room_type as enum ('common_room', 'master_room', 'bed_space', 'whole_unit', 'studio', 'other');
```

---

# 2. profiles 用户表

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  role user_role default 'tenant',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

# 3. landlords 屋主表

```sql
create table landlords (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  name text,
  wechat text,
  whatsapp text,
  phone text,
  verification verification_level default 'none',
  verified_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

索引：

```sql
create index idx_landlords_wechat on landlords(wechat);
create index idx_landlords_phone on landlords(phone);
```

---

# 4. listings 房源表

```sql
create table listings (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references landlords(id) on delete set null,
  source source_type default 'manual',
  status listing_status default 'pending_auth',
  title text,
  description text,
  property_type property_type,
  room_type room_type,
  monthly_rent integer,
  postal_code text,
  address text,
  block text,
  floor text,
  unit_masked text,
  latitude numeric,
  longitude numeric,
  available_date date,
  min_lease_months integer,
  contact_wechat text,
  contact_whatsapp text,
  contact_phone text,
  listing_hash text unique,
  published_at timestamptz,
  rented_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

索引：

```sql
create index idx_listings_status on listings(status);
create index idx_listings_postal_code on listings(postal_code);
create index idx_listings_rent on listings(monthly_rent);
create index idx_listings_room_type on listings(room_type);
create index idx_listings_location on listings(latitude, longitude);
```

---

# 5. listing_features 房源特征表

```sql
create table listing_features (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  feature_key text not null,
  feature_value boolean default true,
  created_at timestamptz default now(),
  unique(listing_id, feature_key)
);
```

常用 feature_key：

```text
aircon
wifi
utilities_included
cooking_allowed
address_registration
owner_stay
couple_allowed
visitors_allowed
furnished
near_mrt
near_bus_stop
```

---

# 6. listing_images 图片表

```sql
create table listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  image_url text not null,
  original_url text,
  image_type text,
  sort_order integer default 0,
  is_cover boolean default false,
  created_at timestamptz default now()
);
```

---

# 7. listing_tags 标签表

```sql
create table listing_tags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  tag text not null,
  confidence numeric default 1,
  created_at timestamptz default now(),
  unique(listing_id, tag)
);
```

---

# 8. source_listings 原始采集表

```sql
create table source_listings (
  id uuid primary key default gen_random_uuid(),
  source source_type not null,
  source_url text,
  raw_text text,
  raw_json jsonb,
  raw_images jsonb,
  collected_by text,
  parse_status text default 'pending',
  listing_id uuid references listings(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

原则：

> 原始数据永不覆盖。解析错误也保留。

---

# 9. ai_contents AI内容表

```sql
create table ai_contents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  summary text,
  recommendation_reason text,
  suitable_for text,
  not_suitable_for text,
  wechat_post text,
  xiaohongshu_title text,
  xiaohongshu_post text,
  poster_headline text,
  poster_features jsonb,
  version integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(listing_id, version)
);
```

---

# 10. commute_cache 通勤缓存表

```sql
create table commute_cache (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  destination text not null,
  transport_mode text default 'public_transport',
  duration_minutes integer,
  distance_meters integer,
  raw_response jsonb,
  updated_at timestamptz default now(),
  unique(listing_id, destination, transport_mode)
);
```

---

# 11. favorites 收藏表

```sql
create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, listing_id)
);
```

---

# 12. listing_views 浏览记录

```sql
create table listing_views (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  ip_hash text,
  source text,
  viewed_at timestamptz default now()
);
```

---

# 13. inquiries 咨询记录

```sql
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  tenant_id uuid references profiles(id) on delete set null,
  message text,
  contact_method text,
  status text default 'new',
  created_at timestamptz default now()
);
```

---

# 14. promotion_orders 推广订单

```sql
create table promotion_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  landlord_id uuid references landlords(id) on delete set null,
  service_type text not null,
  amount_sgd numeric not null,
  status text default 'pending',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now(),
  paid_at timestamptz
);
```

---

# RLS原则

MVP阶段建议：

- 公开用户只能读取 `published/promoted` 房源。
- 屋主只能管理自己的房源。
- advisor 可以提交和编辑自己负责的房源草稿。
- admin 拥有全部权限。

---

# 最小开发顺序

1. profiles
2. landlords
3. listings
4. listing_images
5. listing_tags
6. source_listings
7. ai_contents
8. commute_cache
9. favorites
10. promotion_orders
