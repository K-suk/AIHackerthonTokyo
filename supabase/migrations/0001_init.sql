-- 声レジ 追加機能の初期スキーマ
-- 適用方法: Supabase の SQL Editor に貼り付けて実行するか、Supabase CLI で適用する。
-- アプリ起動時にはテーブルを作らない（このファイルを明示的に適用する）。

create table if not exists catalog (
  id integer primary key check (id = 1),
  json jsonb not null,
  version integer not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  confirmed_at timestamptz not null default now(),
  channel text not null check (channel in ('counter', 'phone')),
  ticket jsonb not null,                -- サーバで再計算した Ticket
  total integer not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  catalog_version integer not null,
  idempotency_key text unique,          -- 二重確定の防止
  created_by text not null
);
create index if not exists orders_business_date_idx on orders (business_date);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  created_at timestamptz not null default now(),
  text text not null,
  category text not null check (category in ('equipment', 'customer', 'staff', 'other', 'reflection')),
  needs_action boolean not null default false,
  created_by text not null
);
create index if not exists events_business_date_idx on events (business_date);

create table if not exists materials (
  id text primary key,                  -- 'milk', 'oat_milk' など
  name text not null,
  unit text not null check (unit in ('ml', 'g', 'pcs')),
  stock double precision not null,
  reorder_point double precision not null,
  order_unit double precision not null,
  order_unit_label text not null,       -- '本' '袋' '個' など
  updated_at timestamptz not null default now(),
  updated_by text not null
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id text not null references materials (id),
  delta double precision not null,      -- 減算はマイナス
  reason text not null check (reason in ('order', 'order_cancel', 'adjust', 'voice_adjust')),
  order_id uuid references orders (id),
  change_id uuid,                       -- 音声操作のまとまり
  created_at timestamptz not null default now(),
  created_by text not null
);
create index if not exists stock_movements_material_idx on stock_movements (material_id, created_at);
create index if not exists stock_movements_order_idx on stock_movements (order_id);

create table if not exists reports (
  business_date date primary key,
  body text not null,
  generated_at timestamptz not null default now(),
  updated_by text not null
);

-- Data API（anon / service_role キー）からの読み書きを防ぐ。
-- アプリはサーバから直接接続するため影響を受けない。ポリシーは作らない。
alter table catalog enable row level security;
alter table orders enable row level security;
alter table events enable row level security;
alter table materials enable row level security;
alter table stock_movements enable row level security;
alter table reports enable row level security;
