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

alter table members enable row level security;
alter table kpi_records enable row level security;
