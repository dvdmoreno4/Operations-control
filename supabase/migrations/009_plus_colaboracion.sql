-- Migration 009: collaborating on other members' projects adds a bonus on top of the central KPI.
-- Safe to run more than once.

alter table kpi_records add column if not exists score_collab numeric(5, 2) not null default 0 check (score_collab between 0 and 100);
