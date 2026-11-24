-- Migration 007: a conversatorio marked as not done subtracts from the central KPI, so the activities
-- adjustment can be negative; activities start as pending (done = null). Safe to run more than once.

alter table kpi_records drop constraint if exists kpi_records_score_extra_check;
alter table kpi_records add constraint kpi_records_score_extra_check check (score_extra between -100 and 100);

-- null = pendiente, true = realizada, false = no realizada.
alter table member_activities alter column done drop not null;
alter table member_activities alter column done set default null;
