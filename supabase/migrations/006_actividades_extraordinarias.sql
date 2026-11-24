-- Migration 006: extraordinary activities and collaborations, a bonus on top of the central KPI for them,
-- and "Nuevo y Acciones" renamed to "Acciones y Portafolios". Safe to run more than once.

-- Bonus points of extraordinary activities in the month, added on top of the central KPI (capped at 10 by the app).
alter table kpi_records add column if not exists score_extra numeric(5, 2) not null default 0 check (score_extra between 0 and 100);

create table if not exists member_activities (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  period date not null check (extract(day from period) = 1),   -- month of the activity
  kind text not null check (kind in ('colaboracion_comercial', 'conversatorio', 'colaboracion_areas', 'proyecto_adicional')),
  description text not null default '' check (length(description) <= 2000),
  done boolean not null default false,                          -- realizada / no realizada
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_activities_member_idx on member_activities (member_id, period);

alter table member_activities enable row level security;

update departments
set label = 'Departamento de Acciones y Portafolios', short = 'Acciones y Portafolios'
where key = 'nuevo_acciones';
