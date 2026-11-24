-- Migration 008: goals. Screen time: 140 hours a month. Interactive Brokers: 25% minimum a year.
-- Projects: 1 a semester, 2 a year (in the app). Safe to run more than once.

-- Screen hours registered for the month; score_screen_time is computed from them against the goal.
alter table kpi_records add column if not exists screen_hours numeric(7, 2) check (screen_hours >= 0);

alter table kpi_settings add column if not exists annual_return_goal_pct numeric(6, 2) not null default 25;
alter table kpi_settings alter column monthly_screen_hours_goal set default 140;
update kpi_settings set monthly_screen_hours_goal = 140, annual_return_goal_pct = 25;
