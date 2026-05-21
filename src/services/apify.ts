import { ApifyClient } from 'apify-client';
import { loadEnv } from '../config/env.js';

export interface ApifyPlace {
  place_id: string;
  business_name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  rating: number | null;
  review_count: number | null;
}

let client: ApifyClient | null = null;
function getClient() {
  if (!client) client = new ApifyClient({ token: loadEnv().APIFY_TOKEN });
  return client;
}

const ACTOR_ID = 'compass/crawler-google-places';

/**
 * Extrae la ciudad de una query tipo "taller mecánico Donostia" → "Donostia".
 * Heurística: últimas 1-3 palabras del string. Devuelve null si no parece una
 * ciudad (ej. la query no tiene ningún sustantivo capitalizado al final).
 */
function extractCityFromQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  // Coge desde la última palabra hacia atrás mientras parezca parte de un topónimo.
  // Heurística simple: últimas 1-3 palabras donde la primera arranca con mayúscula
  // o tiene tilde típica de topónimo vasco/catalán.
  const parts = trimmed.split(/\s+/);
  // Sectores conocidos que NO son ciudad — paramos antes de ellos.
  const sectorWords = /^(óptica|optica|taller|taller(es)?|farmacia|mecánico|mecanico|mecanizado|caldereria|caldería|caldereria|ingeniería|fabricación|tornería)$/i;
  let start = parts.length;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (sectorWords.test(parts[i])) break;
    start = i;
    // Coge máximo 3 palabras (ej. "Castro Urdiales", "Miranda de Ebro").
    if (parts.length - start >= 3) break;
  }
  if (start >= parts.length) return null;
  const city = parts.slice(start).join(' ').trim();
  return city.length >= 3 ? city : null;
}

export async function searchBusinesses(query: string, maxItems = 50): Promise<ApifyPlace[]> {
  const city = extractCityFromQuery(query);
  const run = await getClient().actor(ACTOR_ID).call({
    searchStringsArray: [query],
    maxCrawledPlacesPerSearch: maxItems,
    language: 'es',
    countryCode: 'es',
    // Fijar la ciudad evita que el actor se vaya a scrapear toda España
    // cuando interpreta "country: es" como "todo el país".
    ...(city ? { locationQuery: city } : {}),
    includeWebResults: false,
    scrapeContacts: true,
  });
  if (!run.defaultDatasetId) return [];
  const { items } = await getClient().dataset(run.defaultDatasetId).listItems();
  return (items as any[]).map(mapItem).filter(p => p.place_id);
}

function mapItem(it: any): ApifyPlace {
  const emails: string[] = it.emails ?? [];
  return {
    place_id: it.placeId ?? it.place_id ?? '',
    business_name: it.title ?? it.name ?? '',
    category: it.categoryName ?? it.category ?? null,
    address: it.address ?? null,
    city: it.city ?? null,
    province: it.state ?? null,
    phone: it.phone ?? null,
    website: it.website ?? null,
    email: emails.length > 0 ? emails[0] : null,
    rating: typeof it.totalScore === 'number' ? it.totalScore : null,
    review_count: typeof it.reviewsCount === 'number' ? it.reviewsCount : null,
  };
}
