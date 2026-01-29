-- Enable required extensions
create extension if not exists pgcrypto;

-- Profiles (dealers/admin credentials)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  dealer_id text unique not null,
  profile_email text,
  password text,
  name text,
  status text default 'active',
  whatsapp text,
  logo_url text,
  plan text,
  trial_ends_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles add column if not exists profile_email text;
alter table profiles add column if not exists password text;
alter table profiles add column if not exists whatsapp text;
alter table profiles add column if not exists logo_url text;
alter table profiles add column if not exists plan text;
alter table profiles add column if not exists trial_ends_at timestamptz;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;
alter table profiles add column if not exists stripe_subscription_status text;

-- Vehicles inventory
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  vehicle_id text unique not null,
  title text,
  make text,
  model text,
  year int,
  vin text,
  price numeric,
  status text,
  availability boolean default true,
  archived boolean default false,
  mileage int,
  color text,
  body_type text,
  transmission text,
  fuel_type text,
  description text,
  cloudinary_image_urls text,
  cloudinary_video_url text,
  hero_image_url text,
  hero_video_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Viewing requests
create table if not exists viewing_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text unique,
  dealer_id text not null,
  vehicle_id text,
  type text,
  status text default 'new',
  name text,
  phone text,
  email text,
  preferred_date date,
  preferred_time text,
  notes text,
  source text default 'storefront',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_profiles_dealer_id on profiles (dealer_id);
create index if not exists idx_profiles_profile_email on profiles (profile_email);

create index if not exists idx_vehicles_dealer_id on vehicles (dealer_id);
create index if not exists idx_vehicles_vehicle_id on vehicles (vehicle_id);

create index if not exists idx_viewing_requests_dealer_id on viewing_requests (dealer_id);
create index if not exists idx_viewing_requests_request_id on viewing_requests (request_id);

-- Updated_at trigger helper
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

drop trigger if exists trg_vehicles_updated_at on vehicles;
create trigger trg_vehicles_updated_at
before update on vehicles
for each row execute function set_updated_at();

drop trigger if exists trg_viewing_requests_updated_at on viewing_requests;
create trigger trg_viewing_requests_updated_at
before update on viewing_requests
for each row execute function set_updated_at();

-- Disable RLS (optional for server-side only access)
alter table profiles disable row level security;
alter table vehicles disable row level security;
alter table viewing_requests disable row level security;
