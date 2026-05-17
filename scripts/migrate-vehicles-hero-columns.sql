-- Run once in Supabase SQL editor for existing databases.
-- Adds hero media columns required by dealer vehicle save (POST /api/dealer/vehicles).

alter table vehicles add column if not exists hero_image_url text;
alter table vehicles add column if not exists hero_video_url text;
