-- Operations Control: full schema. Paste it whole into the Supabase SQL Editor and click Run.
-- Safe to run more than once: tables use "if not exists" and seed rows use "on conflict do nothing".
--
-- RLS is enabled with no policies on every table, so the public (anon/publishable) key has no access.
-- The app reaches these tables only from API routes, with the secret (service role) key.

------------------------------------------------------------------------------------------------
-- Areas (departments) and workstations of the HQ floor plan. Mirrors src/lib/floorplan.ts.
------------------------------------------------------------------------------------------------

create table if not exists departments (
  key text primary key,
  label text not null,            -- full name, e.g. "Departamento de Mercados Internacionales"
  short text not null,            -- short name for chips and tables
  color text not null             -- hex color used on the plan
);

insert into departments (key, label, short, color) values
  ('ia_cfd', 'Departamento IA y CFD''s', 'IA y CFD''s', '#84cc16'),
  ('nuevo_acciones', 'Departamento de Nuevo y Acciones', 'Nuevo y Acciones', '#14b8a6'),
  ('materias_primas', 'Departamento de Materias primas y coberturas', 'Materias primas', '#f97316'),
  ('mercados_internacionales', 'Departamento de Mercados Internacionales', 'Mercados Int.', '#eab308'),
  ('gerencia', 'Gerencia', 'Gerencia', '#6b7280')
on conflict (key) do nothing;

create table if not exists stations (
  id text primary key,            -- e.g. "IA-1", "NA-2", "GER-1"
  department_key text not null references departments (key)
);

insert into stations (id, department_key) values
  ('IA-1', 'ia_cfd'), ('IA-2', 'ia_cfd'), ('IA-3', 'ia_cfd'), ('IA-4', 'ia_cfd'), ('IA-5', 'ia_cfd'),
  ('IA-6', 'ia_cfd'), ('IA-7', 'ia_cfd'), ('IA-8', 'ia_cfd'), ('IA-9', 'ia_cfd'), ('IA-10', 'ia_cfd'),
  ('IA-11', 'ia_cfd'),
  ('NA-1', 'nuevo_acciones'), ('NA-2', 'nuevo_acciones'), ('NA-3', 'nuevo_acciones'),
  ('MP-1', 'materias_primas'),
  ('MI-1', 'mercados_internacionales'), ('MI-2', 'mercados_internacionales'),
  ('GER-1', 'gerencia')
on conflict (id) do nothing;

------------------------------------------------------------------------------------------------
-- Members: one per workstation. A station with no member is shown as inactive on the plan.
------------------------------------------------------------------------------------------------

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  station_id text not null unique references stations (id),
  name text not null check (length(trim(name)) between 1 and 80),
  role text not null default '' check (length(role) <= 80),     -- cargo
  created_at timestamptz not null default now()
);

------------------------------------------------------------------------------------------------
-- Monthly KPI record per member. period is always the first day of the month.
-- The three score_* columns (0-100) make up the total score; weights live in kpi_settings.
------------------------------------------------------------------------------------------------

create table if not exists kpi_records (
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
  score_operational numeric(5, 2) not null default 0 check (score_operational between 0 and 100),
  score_projects numeric(5, 2) not null default 0 check (score_projects between 0 and 100),
  score_screen_time numeric(5, 2) not null default 0 check (score_screen_time between 0 and 100),
  notes text not null default '' check (length(notes) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (member_id, period)
);

create index if not exists kpi_records_period_idx on kpi_records (period desc);

------------------------------------------------------------------------------------------------
-- Interactive Brokers monthly report (Activity Statement PDF) and the data read from it.
------------------------------------------------------------------------------------------------

create table if not exists ib_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  file_path text not null,                         -- PDF in the "documents" Storage bucket
  file_name text not null default '',
  account_id text not null default '',             -- IB account, e.g. U1234567
  base_currency text not null default 'USD',
  nav_start numeric(18, 2),                        -- Net Asset Value at the start of the period
  nav_end numeric(18, 2),                          -- Net Asset Value at the end of the period
  twr_pct numeric(9, 4),                           -- time-weighted return of the period, in %
  realized_pnl numeric(18, 2),
  unrealized_pnl numeric(18, 2),
  mtm_pnl numeric(18, 2),                          -- mark-to-market P&L
  commissions numeric(18, 2),
  deposits numeric(18, 2),
  withdrawals numeric(18, 2),
  dividends numeric(18, 2),
  interest numeric(18, 2),
  trades_count integer,
  win_rate_pct numeric(6, 2),                      -- winning closed trades over closed trades, in %
  profit_factor numeric(10, 4),                    -- gross profit / gross loss
  max_drawdown_pct numeric(9, 4),                  -- from daily NAV, when the report has it
  top_position_pct numeric(6, 2),                  -- largest position over NAV, in %
  score numeric(5, 2) check (score between 0 and 100),   -- operational score of the month
  score_detail jsonb not null default '{}',        -- sub-scores: rentabilidad, riesgo, consistencia, disciplina
  status text not null default 'procesado' check (status in ('procesado', 'error')),
  error text not null default '',
  uploaded_at timestamptz not null default now(),
  unique (member_id, period)
);

-- Daily NAV for the performance curve and the drawdown.
create table if not exists ib_nav_daily (
  report_id uuid not null references ib_reports (id) on delete cascade,
  day date not null,
  nav numeric(18, 2) not null,
  primary key (report_id, day)
);

-- Trades of the month.
create table if not exists ib_trades (
  id bigint generated always as identity primary key,
  report_id uuid not null references ib_reports (id) on delete cascade,
  traded_at timestamptz not null,
  symbol text not null,
  asset_class text not null default '',            -- STK, OPT, FUT, CFD, CASH...
  side text not null default '' check (side in ('', 'BUY', 'SELL')),
  quantity numeric(18, 4) not null,
  price numeric(18, 6) not null,
  proceeds numeric(18, 2),
  commission numeric(18, 2),
  realized_pnl numeric(18, 2),
  currency text not null default 'USD'
);

create index if not exists ib_trades_report_idx on ib_trades (report_id, traded_at);

-- Open positions at the end of the month: portfolio distribution.
create table if not exists ib_positions (
  id bigint generated always as identity primary key,
  report_id uuid not null references ib_reports (id) on delete cascade,
  symbol text not null,
  asset_class text not null default '',
  sector text not null default '',
  quantity numeric(18, 4) not null,
  cost_basis numeric(18, 2),
  market_value numeric(18, 2) not null,
  unrealized_pnl numeric(18, 2),
  weight_pct numeric(6, 2),                        -- market value over NAV, in %
  currency text not null default 'USD'
);

create index if not exists ib_positions_report_idx on ib_positions (report_id);

-- Rule-based recommendations of a report. Read by the other project through GET /api/reports/[id].
create table if not exists ib_recommendations (
  id bigint generated always as identity primary key,
  report_id uuid not null references ib_reports (id) on delete cascade,
  code text not null,                              -- e.g. CONCENTRATION, LOW_PROFIT_FACTOR, HIGH_COMMISSIONS
  severity text not null default 'info' check (severity in ('info', 'aviso', 'critico')),
  message text not null,
  data jsonb not null default '{}'                 -- values behind the message
);

create index if not exists ib_recommendations_report_idx on ib_recommendations (report_id);

------------------------------------------------------------------------------------------------
-- Projects. Progress follows the status: propuesta uses manual_progress (0-49, edited by the
-- member); aceptado 50, produccion 75, culminado 100 (set by an admin).
------------------------------------------------------------------------------------------------

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'propuesta' check (status in ('propuesta', 'aceptado', 'produccion', 'culminado')),
  manual_progress integer not null default 0 check (manual_progress between 0 and 49),
  created_at timestamptz not null default now()
);

create index if not exists projects_member_idx on projects (member_id);

-- Every status or progress change, so the monthly project score knows when each milestone happened.
create table if not exists project_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects (id) on delete cascade,
  status text not null check (status in ('propuesta', 'aceptado', 'produccion', 'culminado')),
  progress integer not null check (progress between 0 and 100),
  at timestamptz not null default now()
);

create index if not exists project_events_project_idx on project_events (project_id, at);

-- Project documents. The file itself lives in the "documents" Storage bucket.
create table if not exists project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  file_path text not null unique,
  name text not null check (length(name) between 1 and 200),
  size bigint not null check (size >= 0),
  uploaded_at timestamptz not null default now()
);

------------------------------------------------------------------------------------------------
-- Screen time per member and day, imported from ActivityWatch. Only daily totals are kept,
-- never window titles.
------------------------------------------------------------------------------------------------

create table if not exists screen_time_days (
  member_id uuid not null references members (id) on delete cascade,
  day date not null,
  active_seconds integer not null default 0 check (active_seconds >= 0),       -- not AFK
  productive_seconds integer not null default 0 check (productive_seconds >= 0), -- active in allowed apps
  idle_seconds integer not null default 0 check (idle_seconds >= 0),           -- AFK
  source text not null default 'activitywatch',
  imported_at timestamptz not null default now(),
  primary key (member_id, day)
);

------------------------------------------------------------------------------------------------
-- KPI settings: a single row with the weights and goals used by the score formulas.
------------------------------------------------------------------------------------------------

create table if not exists kpi_settings (
  id boolean primary key default true check (id),  -- only one row
  weight_operational numeric(4, 3) not null default 0.333,
  weight_projects numeric(4, 3) not null default 0.333,
  weight_screen_time numeric(4, 3) not null default 0.334,
  monthly_return_goal_pct numeric(6, 2) not null default 1,     -- TWR target per month, in %
  max_position_pct numeric(6, 2) not null default 25,           -- concentration limit, in % of NAV
  project_points_goal integer not null default 60,              -- monthly points for a 100 project score
  monthly_screen_hours_goal integer not null default 160,       -- productive hours for a 100 screen score
  productive_apps text[] not null default array['tws', 'excel', 'chrome', 'msedge'],
  updated_at timestamptz not null default now(),
  check (abs(weight_operational + weight_projects + weight_screen_time - 1) < 0.01)
);

insert into kpi_settings (id) values (true) on conflict (id) do nothing;

------------------------------------------------------------------------------------------------
-- Row level security: on everywhere, no policies (only the secret key used by the API gets in).
------------------------------------------------------------------------------------------------

alter table departments enable row level security;
alter table stations enable row level security;
alter table members enable row level security;
alter table kpi_records enable row level security;
alter table ib_reports enable row level security;
alter table ib_nav_daily enable row level security;
alter table ib_trades enable row level security;
alter table ib_positions enable row level security;
alter table ib_recommendations enable row level security;
alter table projects enable row level security;
alter table project_events enable row level security;
alter table project_files enable row level security;
alter table screen_time_days enable row level security;
alter table kpi_settings enable row level security;

------------------------------------------------------------------------------------------------
-- Private Storage bucket for IB report PDFs and project documents (signed URLs only).
------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
