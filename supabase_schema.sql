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

-- NEW: Referral program fields
alter table profiles add column if not exists referral_code text unique;
alter table profiles add column if not exists referred_by text;
alter table profiles add column if not exists referral_credits int default 0;

-- Dealer public profile (storefront directory + dealer page)
alter table profiles add column if not exists description text;
alter table profiles add column if not exists location_label text;
alter table profiles add column if not exists google_maps_url text;
alter table profiles add column if not exists hero_video_url text;
alter table profiles add column if not exists reviews_highlight text;
alter table profiles add column if not exists social_website text;
alter table profiles add column if not exists social_instagram text;
alter table profiles add column if not exists social_facebook text;
alter table profiles add column if not exists social_tiktok text;

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

-- Dealer waitlist / free-tier applications (public apply → admin approves)
create table if not exists dealer_applications (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  email text not null,
  whatsapp text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_dealer_applications_status on dealer_applications (status);
create index if not exists idx_dealer_applications_created_at on dealer_applications (created_at desc);

drop trigger if exists trg_dealer_applications_updated_at on dealer_applications;
create trigger trg_dealer_applications_updated_at
before update on dealer_applications
for each row execute function set_updated_at();

alter table dealer_applications disable row level security;

-- Buyer reviews on dealers (storefront)
create table if not exists dealer_reviews (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  reviewer_name text,
  created_at timestamptz default now()
);

create index if not exists idx_dealer_reviews_dealer_id on dealer_reviews (dealer_id);
create index if not exists idx_dealer_reviews_created_at on dealer_reviews (created_at desc);

-- Buyer reports on dealers
create table if not exists dealer_reports (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  reason text not null,
  details text,
  reporter_name text,
  reporter_email text,
  reporter_phone text,
  created_at timestamptz default now()
);

create index if not exists idx_dealer_reports_dealer_id on dealer_reports (dealer_id);
create index if not exists idx_dealer_reports_created_at on dealer_reports (created_at desc);

alter table dealer_reviews disable row level security;
alter table dealer_reports disable row level security;

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
