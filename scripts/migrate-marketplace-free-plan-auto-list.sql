-- Free-plan vehicles appear on /marketplace by default (no per-vehicle opt-in).
-- Run after migrate-vehicle-marketplace-opt-in.sql

-- New free-plan listings default to visible on the marketplace
alter table vehicles alter column show_in_marketplace set default true;

-- Backfill existing free-plan inventory (legacy default was false)
update vehicles v
set show_in_marketplace = true
from profiles p
where p.dealer_id = v.dealer_id
  and lower(coalesce(p.plan, '')) = 'free'
  and coalesce(v.show_in_marketplace, false) = false
  and coalesce(v.archived, false) = false;
