alter table latest_quotes
  alter column market_cap type numeric using market_cap::numeric;
