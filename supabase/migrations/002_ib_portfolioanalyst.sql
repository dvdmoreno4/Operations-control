-- Migration 002: data read from the Interactive Brokers PortfolioAnalyst PDF.
-- Run it in the Supabase SQL Editor on a database created with schema.sql. Safe to run more than once.
-- (schema.sql already includes these changes for new databases.)

-- The report covers a custom period (e.g. Jan 1 - May 26). "period" stays the month the report is
-- scored for (first day of the month of period_end); one report per member and month.
alter table ib_reports add column if not exists account_name text not null default '';
alter table ib_reports add column if not exists account_type text not null default '';
alter table ib_reports add column if not exists period_start date;
alter table ib_reports add column if not exists period_end date;
alter table ib_reports add column if not exists return_mtd_pct numeric(9, 4);
alter table ib_reports add column if not exists return_ytd_pct numeric(9, 4);
alter table ib_reports add column if not exists change_in_nav numeric(18, 2);
alter table ib_reports add column if not exists other_pnl numeric(18, 2);
alter table ib_reports add column if not exists sharpe_ratio numeric(10, 4);
alter table ib_reports add column if not exists sortino_ratio numeric(10, 4);
alter table ib_reports add column if not exists std_dev_pct numeric(9, 4);
alter table ib_reports add column if not exists positive_periods_pct numeric(6, 2);
alter table ib_reports add column if not exists cash_balance numeric(18, 2);
alter table ib_reports add column if not exists short_options_pct numeric(9, 4);
alter table ib_reports add column if not exists fees_ratio_pct numeric(9, 4);
-- Returns and risk of the account and benchmarks (SPXTR, EFA, VT...), as read from the report.
alter table ib_reports add column if not exists analytics jsonb not null default '{}';
alter table ib_reports add column if not exists warnings text[] not null default '{}';

alter table ib_positions add column if not exists description text not null default '';
alter table ib_positions add column if not exists close_price numeric(18, 6);
alter table ib_positions add column if not exists local_value numeric(18, 2);   -- value in the position currency
alter table ib_positions alter column quantity drop not null;

-- NAV split by asset class for each day (Commodities, Equities, Fixed Income, Cash...).
alter table ib_nav_daily add column if not exists by_class jsonb not null default '{}';

-- Monthly returns of the account and benchmarks, in %.
create table if not exists ib_monthly_returns (
  report_id uuid not null references ib_reports (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  account_pct numeric(9, 4),
  benchmarks jsonb not null default '{}',          -- {"SPXTR": 1.45, "EFA": 4.90, "VT": 3.11}
  primary key (report_id, month)
);

-- Performance of every symbol held in the period (open and closed).
create table if not exists ib_symbol_performance (
  id bigint generated always as identity primary key,
  report_id uuid not null references ib_reports (id) on delete cascade,
  symbol text not null,
  description text not null default '',
  sector text not null default '',
  asset_class text not null default '',
  avg_weight_pct numeric(9, 4),
  return_pct numeric(12, 4),
  contribution_pct numeric(9, 4),
  unrealized_pnl numeric(18, 2),
  realized_pnl numeric(18, 2),
  is_open boolean not null default false
);

create index if not exists ib_symbol_performance_report_idx on ib_symbol_performance (report_id);

-- Bought / sold totals per symbol in the period (PortfolioAnalyst "Trade Summary").
create table if not exists ib_trade_summary (
  id bigint generated always as identity primary key,
  report_id uuid not null references ib_reports (id) on delete cascade,
  symbol text not null,
  description text not null default '',
  sector text not null default '',
  asset_class text not null default '',
  currency text not null default '',
  bought_qty numeric(18, 4),
  bought_avg_price numeric(18, 6),
  bought_proceeds numeric(18, 2),
  sold_qty numeric(18, 4),
  sold_avg_price numeric(18, 6),
  sold_proceeds numeric(18, 2)
);

create index if not exists ib_trade_summary_report_idx on ib_trade_summary (report_id);

alter table ib_monthly_returns enable row level security;
alter table ib_symbol_performance enable row level security;
alter table ib_trade_summary enable row level security;
