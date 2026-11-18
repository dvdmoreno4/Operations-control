-- Migration 004: member department, improvement recommendations / requests, project collaborators.
-- Run it in the Supabase SQL Editor. Safe to run more than once. (schema.sql includes it too.)

-- Department a member belongs to, for the department KPIs. Null = the department of their station.
alter table members add column if not exists department_key text references departments (key);

-- Improvement recommendations (for the member) and requests (from the member).
-- Pending requests show as a red badge on the member's station.
create table if not exists member_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  kind text not null check (kind in ('solicitud', 'recomendacion')),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'pendiente' check (status in ('pendiente', 'en_proceso', 'resuelta', 'rechazada')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists member_requests_member_idx on member_requests (member_id, status);

-- Members who collaborate on a project (besides its owner). Collaborators earn a share of the
-- project's monthly points in their own project score.
create table if not exists project_collaborators (
  project_id uuid not null references projects (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (project_id, member_id)
);

create index if not exists project_collaborators_member_idx on project_collaborators (member_id);

alter table member_requests enable row level security;
alter table project_collaborators enable row level security;
