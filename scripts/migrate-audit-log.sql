-- Admin / system audit trail for portal actions
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_role text not null,
  actor_id text,
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on audit_log (created_at desc);
create index if not exists idx_audit_log_action on audit_log (action);

alter table audit_log disable row level security;
