create table if not exists price_eod (
  symbol text not null references securities(symbol) on delete cascade,
  date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume bigint,
  vwap numeric,
  change numeric,
  change_percent numeric,
  inserted_at timestamptz default now(),
  primary key(symbol, date)
);

create index if not exists idx_price_eod_symbol_date
  on price_eod(symbol, date desc);