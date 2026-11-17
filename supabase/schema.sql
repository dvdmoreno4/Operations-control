-- Operations Control schema. Run once in the Supabase SQL editor.
--
-- RLS is enabled with no policies on every table, so the anon key has no access.
-- The app reaches these tables only from API routes, with the service role key.

-- One member per workstation. Station ids are defined in src/lib/floorplan.ts;
-- a station with no member row is shown as empty on the floor plan.
create table members (
  id uuid primary key default gen_random_uuid(),
  station_id text not null unique,
  name text not null check (length(trim(name)) between 1 and 80),
  role text not null default '' check (length(role) <= 80),
  created_at timestamptz not null default now()
);

-- Monthly KPI record per member. period is always the first day of the month.
create table kpi_records (
  member_id uuid not null references members (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  operations_count integer not null default 0 check (operations_count >= 0),
  volume numeric(18, 2) not null default 0 check (volume >= 0),
  pnl numeric(18, 2) not null default 0,
  pnl_pct numeric(9, 4) not null default 0,
  goal numeric(18, 2) not null default 0 check (goal >= 0),
  achieved numeric(18, 2) not null default 0,
  errors integer not null default 0 check (errors >= 0),
  incidents integer not null default 0 check (incidents >= 0),
  -- Segments of the total score, each 0 to 100. Weights live in src/lib/kpis.ts.
  score_operational numeric(5, 2) not null default 0 check (score_operational between 0 and 100),
  score_projects numeric(5, 2) not null default 0 check (score_projects between 0 and 100),
  score_screen_time numeric(5, 2) not null default 0 check (score_screen_time between 0 and 100),
  notes text not null default '' check (length(notes) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (member_id, period)
);

create index kpi_records_period_idx on kpi_records (period desc);

-- Projects of a member. Progress follows the status: propuesta uses manual_progress (0-49,
-- edited by the member), aceptado 50, produccion 75, culminado 100 (set by an admin).
create table projects (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'propuesta' check (status in ('propuesta', 'aceptado', 'produccion', 'culminado')),
  manual_progress integer not null default 0 check (manual_progress between 0 and 49),
  created_at timestamptz not null default now()
);

create index projects_member_idx on projects (member_id);

-- Every status or progress change, so the monthly project score knows when each milestone happened.
create table project_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects (id) on delete cascade,
  status text not null check (status in ('propuesta', 'aceptado', 'produccion', 'culminado')),
  progress integer not null check (progress between 0 and 100),
  at timestamptz not null default now()
);

create index project_events_project_idx on project_events (project_id, at);

-- Project documents. The file itself lives in the private Storage bucket "documents".
create table project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  file_path text not null unique,
  name text not null check (length(name) between 1 and 200),
  size bigint not null check (size >= 0),
  uploaded_at timestamptz not null default now()
);

alter table members enable row level security;
alter table kpi_records enable row level security;
alter table projects enable row level security;
alter table project_events enable row level security;
alter table project_files enable row level security;

-- Private bucket for IB reports and project documents; reached only through signed URLs made by the API.
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
