-- Migración 006: trazabilidad del enriquecimiento email/web desde Internet.
-- Se usa cuando Google Maps no devuelve email y buscamos en la web vía Firecrawl.

alter table leads
  add column if not exists enriched_at timestamptz,
  add column if not exists enriched_via text,
  add column if not exists enriched_website text;

create index if not exists idx_leads_enriched_at
  on leads(enriched_at)
  where enriched_at is not null;

comment on column leads.enriched_at is
  'Timestamp en el que el enricher (services/lead-enricher.ts) corrió para este lead.';
comment on column leads.enriched_via is
  'Origen del enriquecimiento. Hoy solo "search" (Firecrawl /search).';
comment on column leads.enriched_website is
  'URL de la web propia que el enricher detectó (solo si has_real_website=true). Lead queda SKIPPED.';
