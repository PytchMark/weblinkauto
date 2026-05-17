-- Dealer opt-in: list individual vehicles on ACJ Marketplace
-- Run after migrate-vehicle-status-scheduling.sql

alter table vehicles add column if not exists show_in_marketplace boolean default false;

create index if not exists idx_vehicles_show_in_marketplace
  on vehicles (show_in_marketplace)
  where show_in_marketplace = true;
