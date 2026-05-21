-- Migración 007: top 3 competidores CON web de la búsqueda original del lead.
-- Sirve para personalizar el cold email nombrando explícitamente al competidor
-- que está apareciendo en Google delante del lead.

alter table leads
  add column if not exists top_competitors jsonb;

comment on column leads.top_competitors is
  'Array JSON de hasta 3 competidores con web. Formato: [{"name":"...","website":"..."}]. Origen: 3 primeros resultados con website de la query Apify donde se encontró el lead.';
