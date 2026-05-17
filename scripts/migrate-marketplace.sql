-- ACJ Marketplace: financing, quality gate, reservation %, sell-your-car pipeline
-- Run after migrate-vehicles-hero-columns.sql

alter table vehicles add column if not exists financing_available boolean default false;
alter table vehicles add column if not exists acj_quality_verified boolean default false;
alter table vehicles add column if not exists listed_at timestamptz;

alter table profiles add column if not exists reservation_deposit_pct numeric;

create table if not exists sell_submissions (
  id uuid primary key default gen_random_uuid(),
  year int,
  make text,
  model text,
  mileage int,
  price_hope numeric,
  contact_name text not null,
  contact_phone text not null,
  contact_email text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sell_submissions_status on sell_submissions (status);
create index if not exists idx_sell_submissions_created_at on sell_submissions (created_at desc);
create index if not exists idx_vehicles_listed_at on vehicles (listed_at desc nulls last);
create index if not exists idx_vehicles_financing on vehicles (financing_available) where financing_available = true;

drop trigger if exists trg_sell_submissions_updated_at on sell_submissions;
create trigger trg_sell_submissions_updated_at
before update on sell_submissions
for each row execute function set_updated_at();

alter table sell_submissions disable row level security;
