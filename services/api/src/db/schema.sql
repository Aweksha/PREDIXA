create table if not exists securities (
  symbol text primary key,
  name text,
  exchange text,
  created_at timestamptz default now()
);

create table if not exists latest_quotes (
  symbol text primary key references securities(symbol) on delete cascade,
  price numeric,
  change numeric,
  change_percent numeric,
  volume bigint,
  day_low numeric,
  day_high numeric,
  market_cap bigint,
  quote_ts bigint,
  updated_at timestamptz default now()
);

create index if not exists idx_latest_quotes_updated_at
  on latest_quotes(updated_at desc);

create table if not exists prediction_evaluations (
  id bigserial primary key,
  symbol text not null references securities(symbol) on delete cascade,
  as_of_date date not null,
  current_close double precision,
  predicted_next_close double precision,
  expected_move_next_day double precision,
  expected_move_next_day_pct double precision,
  signal_5d text,
  prob_up_5d double precision,
  prob_down_5d double precision,
  actual_direction_5d text,
  actual_return_5d double precision,
  actual_close_5d double precision,
  direction_correct_5d boolean,
  signal_10d text,
  prob_sell_10d double precision,
  prob_hold_10d double precision,
  prob_buy_10d double precision,
  actual_signal_10d text,
  actual_return_10d double precision,
  actual_close_10d double precision,
  direction_correct_10d boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(symbol, as_of_date)
);

create index if not exists idx_prediction_evaluations_symbol_date
  on prediction_evaluations(symbol, as_of_date desc);
