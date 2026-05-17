-- Paid storefront: In Transit (expected arrival) and Reserved (countdown end)
-- Run after migrate-marketplace.sql

alter table vehicles add column if not exists expected_arrival_at timestamptz;
alter table vehicles add column if not exists reserved_until timestamptz;

create index if not exists idx_vehicles_reserved_until on vehicles (reserved_until) where reserved_until is not null;
create index if not exists idx_vehicles_expected_arrival on vehicles (expected_arrival_at) where expected_arrival_at is not null;
