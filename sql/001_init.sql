-- ============================================================
-- 001_init.sql — schema base
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  place_id        text unique not null,
  business_name   text not null,
  category        text,
  address         text,
  city            text,
  province        text,
  phone           text,
  website         text,
  email           text,
  rating          numeric(2,1),
  review_count    integer,
  web_score       integer,
  web_issues      jsonb,
  web_analyzed_at timestamptz,
  status          text not null default 'NEW',
  notes           text,
  contacted_at    timestamptz,
  responded_at    timestamptz
);

create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_email  on leads(email) where email is not null;

create table if not exists variants (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  prompt_snippet text not null,
  active         boolean default true,
  weight         integer default 1,
  sent_count     integer default 0,
  reply_count    integer default 0,
  created_at     timestamptz default now()
);

create table if not exists emails_sent (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references leads(id) on delete cascade,
  subject          text not null,
  body             text not null,
  variant_id       uuid references variants(id),
  gmail_message_id text not null,
  gmail_thread_id  text not null,
  sent_at          timestamptz default now()
);

create index if not exists idx_emails_thread on emails_sent(gmail_thread_id);
create index if not exists idx_emails_lead   on emails_sent(lead_id);

create table if not exists metrics (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz default now(),
  event       text not null,
  lead_id     uuid references leads(id),
  variant_id  uuid references variants(id),
  metadata    jsonb
);

create index if not exists idx_metrics_event_ts on metrics(event, ts desc);

create table if not exists alert_dedup (
  key         text primary key,
  last_sent   timestamptz default now()
);
