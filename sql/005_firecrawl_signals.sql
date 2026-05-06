-- 005: Firecrawl signals + screenshot URL + status
alter table leads add column if not exists web_signals jsonb;
alter table leads add column if not exists screenshot_url text;
alter table leads add column if not exists firecrawl_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_firecrawl_status_chk'
  ) then
    alter table leads
      add constraint leads_firecrawl_status_chk
      check (firecrawl_status is null or firecrawl_status in ('ok','failed','fallback','skipped_no_url'));
  end if;
end $$;
