-- Migration 010: MetaTrader 5 "Trade History Report" (Excel) for the operational results.
-- One report per member and month (the month of its last deal). Safe to run more than once.

create table if not exists mt5_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  file_path text not null,                      -- Excel in the "documents" Storage bucket
  file_name text not null default '',
  account text not null default '',
  period_start date,
  period_end date,
  initial_balance numeric(18, 2),
  final_balance numeric(18, 2),
  net_profit numeric(18, 2),
  return_pct numeric(9, 4),                     -- whole period, net of deposits and withdrawals
  ytd_pct numeric(9, 4),
  profit_factor numeric(10, 4),
  drawdown_pct numeric(9, 4),
  win_rate_pct numeric(6, 2),
  total_trades integer,
  score numeric(5, 2) check (score between 0 and 100),
  score_detail jsonb not null default '[]',     -- sub-scores with their detail
  recommendations jsonb not null default '[]',
  data jsonb not null default '{}',             -- full parsed report: results, balance curve, months, symbols...
  uploaded_at timestamptz not null default now(),
  unique (member_id, period)
);

alter table mt5_reports enable row level security;
