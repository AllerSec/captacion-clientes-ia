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

export async function searchBusinesses(query: string, maxItems = 50): Promise<ApifyPlace[]> {
  const run = await getClient().actor(ACTOR_ID).call({
    searchStringsArray: [query],
    maxCrawledPlacesPerSearch: maxItems,
    language: 'es',
    countryCode: 'es',
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
