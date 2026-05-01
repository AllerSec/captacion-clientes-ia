create table if not exists query_history (
  id              uuid primary key default gen_random_uuid(),
  query           text not null,
  tier            integer not null,
  scraped_at      timestamptz default now(),
  places_found    integer default 0,
  unique_inserted integer default 0
);

create index if not exists idx_query_history_query on query_history(query);
create index if not exists idx_query_history_scraped_at on query_history(scraped_at desc);

-- One-row state table to track current tier (no need for full event log)
create table if not exists scraper_state (
  id            integer primary key default 1,
  current_tier  integer default 1,
  last_burst_at timestamptz,
  constraint scraper_state_singleton check (id = 1)
);

insert into scraper_state (id, current_tier) values (1, 1) on conflict do nothing;
