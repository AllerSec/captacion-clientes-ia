import { detectSector } from './sector-detector.js';

/**
 * Normaliza un nombre de negocio tal y como viene de Google Maps
 * para usarlo en saludo de email. Quita sufijos legales, evita ALL CAPS
 * gritado, y respeta tildes/eñe.
 */
export function cleanBusinessName(raw: string): string {
  if (!raw) return raw;
  let name = raw.trim();

  // Sufijos legales que sobran en un saludo coloquial.
  // Requerimos espacio o coma ANTES y una de:
  //   "S.L.", "SL", "S L", "S.A.", "SA", "S A", "SRC", "S.R.C.", "C.B.", "CB", "S Coop"
  // Para evitar matches como "...sa" en "Ametsa", exigimos punto o espacio entre letras
  // cuando el sufijo es de 1-2 letras.
  const legalSuffixes = [
    /(?:,|\s)\s*S\.\s*L\.?\s*U?\.?\s*(\(.*\))?\s*$/i,
    /(?:,|\s)\s*S\s+L\s*$/i,
    /(?:,|\s)\s*SL\s*$/,                       // sólo en mayúsculas
    /(?:,|\s)\s*S\.\s*A\.?\s*$/i,
    /(?:,|\s)\s*S\s+A\s*$/i,
    /(?:,|\s)\s*SA\s*$/,
    /(?:,|\s)\s*S\.\s*R\.\s*C\.?\s*$/i,
    /(?:,|\s)\s*SRC\s*$/,
    /(?:,|\s)\s*C\.\s*B\.?\s*$/i,
    /(?:,|\s)\s*CB\s*$/,
    /(?:,|\s)\s*S\.?\s*Coop\.?\s*$/i,
  ];
  for (const rx of legalSuffixes) {
    name = name.replace(rx, '');
  }
  name = name.trim();

  // Si está TODO en mayúsculas (más de 4 letras y no hay minúsculas),
  // pasamos a Title Case. Si tiene mezcla, lo dejamos como está.
  const letters = name.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    name = name
      .toLocaleLowerCase('es-ES')
      .replace(/(^|\s|-|\/)([a-záéíóúñ])/g, (_m, sep, ch) => sep + ch.toLocaleUpperCase('es-ES'));
  }

  return name;
}

// Palabras genéricas de un nombre de negocio (sector / forma jurídica / artículos):
// no distinguen una marca de otra, así que NO sirven para reconocer al competidor
// dentro del texto de un email ("taller", "motor"... aparecen en cualquiera).
const GENERIC_NAME_WORDS = new Set([
  'taller', 'talleres', 'motor', 'motors', 'auto', 'autos', 'automoviles', 'automóviles',
  'automocion', 'automoción', 'mecanica', 'mecánica', 'mecanizados', 'neumaticos', 'neumáticos',
  'optica', 'óptica', 'opticas', 'ópticas', 'farmacia', 'farmacias', 'empresa', 'empresas',
  'centro', 'servicio', 'servicios', 'garaje', 'recambios', 'car', 'service',
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'sl', 'sa', 'cb', 'src',
]);

/**
 * Devuelve el token MÁS distintivo de un nombre de negocio: la palabra propia de
 * la marca, ignorando genéricos de sector y forma jurídica. Sirve para reconocer
 * al competidor en un email aunque Claude acorte el nombre de forma natural
 * ("Taller GTS motor" → "GTS"). Si todas las palabras son genéricas, cae al
 * nombre limpio completo. Devuelve null si no hay nada utilizable.
 */
export function distinctiveToken(raw: string): string | null {
  if (!raw) return null;
  // Quita paréntesis (p.ej. "AutoZona (Talleres AUTO-PRIX S.L.)") y limpia sufijos.
  const cleaned = cleanBusinessName(raw.replace(/\([^)]*\)/g, ' ').trim());
  const words = cleaned
    .split(/[\s\-/]+/)
    .map(w => w.replace(/[.,]/g, ''))
    .filter(w => w.length >= 2);
  const distinctive = words.filter(w => !GENERIC_NAME_WORDS.has(w.toLocaleLowerCase('es-ES')));
  const pool = distinctive.length > 0 ? distinctive : words;
  if (pool.length === 0) return null;
  // El token más largo es el más identificable como marca.
  return pool.reduce((a, b) => (b.length > a.length ? b : a));
}

// Nombres que NO son un negocio comercial real al que escribir: razones sociales
// genéricas mal scrapeadas de Google Maps ("Proximidad Empresarial S L",
// "Inversiones Patrimoniales SL"). El saludo "Hola, Proximidad Empresarial:" delata
// que no se ha mirado a quién se escribe. Se detectan por palabras corporativas
// abstractas que un negocio de cara al público (taller, óptica, farmacia) no usa.
const JUNK_NAME_PATTERNS: RegExp[] = [
  /\bproximidad\s+empresarial\b/i,
  /\binversiones?\b/i,
  /\bpatrimoni(al|ales|o)\b/i,
  /\bgesti[oó]n(es)?\s+(empresarial|patrimonial|integral|de\s+activos)\b/i,
  /\bholding\b/i,
  /\bconsulting\b/i,
  /\bservicios?\s+integrales?\b/i,
  /\bsociedad\s+(limitada|an[oó]nima)\b/i,
  /\bpromociones?\s+y\s+/i,
];

/**
 * True si el nombre parece una razón social genérica / mal scrapeada en vez del
 * nombre comercial de un negocio local. También marca como junk un nombre que,
 * tras quitar la forma jurídica, queda vacío o demasiado corto para ser una marca.
 */
export function isLikelyJunkName(businessName: string): boolean {
  if (!businessName) return true;
  if (JUNK_NAME_PATTERNS.some(rx => rx.test(businessName))) return true;
  // Si al limpiar la forma jurídica no queda casi nada, no es utilizable.
  const stripped = cleanBusinessName(businessName).replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  return stripped.length < 3;
}

/**
 * Lista negra de marcas/franquicias internacionales que casi seguro
 * tienen web corporativa global aunque Google Maps no la muestre.
 * Mandarles un email diciéndoles que "no tenéis web" es vergonzoso.
 */
const FRANCHISE_PATTERNS: RegExp[] = [
  /\bbosch\b/i,
  /\bfeu\s*vert\b/i,
  /\bnorauto\b/i,
  /\bmidas\b/i,
  /\beuromaster\b/i,
  /\bcarglass\b/i,
  /\bautocenter\s*(citroen|peugeot|renault|ford|seat|opel|fiat|toyota|nissan|hyundai|kia)/i,
  /\b(renault|peugeot|citroen|seat|opel|ford|fiat|toyota|nissan|hyundai|kia|volkswagen|audi|bmw|mercedes|skoda|dacia)\s+(concesionario|oficial|service)/i,
  /\bconcesionario\s+(renault|peugeot|citroen|seat|opel|ford|fiat|toyota|nissan|hyundai|kia|volkswagen|audi|bmw|mercedes|skoda|dacia)/i,
  // Ópticas franquicia
  /\bmulti[oó]pticas\b/i,
  /\bgeneral\s*[oó]ptica\b/i,
  /\b[oó]pticas?\s*alain\s*afflelou\b/i,
  /\balain\s*afflelou\b/i,
  /\bvis[ií]on\s*lab\b/i,
  // Farmacias suelen ser independientes en España, no añadimos por defecto.
];

export function isLikelyFranchise(businessName: string): boolean {
  if (!businessName) return false;
  return FRANCHISE_PATTERNS.some(rx => rx.test(businessName));
}

// Entidades que NUNCA son competencia de un negocio local privado: salen primero en
// Google Maps por relevancia institucional, pero nombrarlas como "competidor que te
// quita clientes" deja en evidencia que no se ha mirado qué son (ej: un ambulatorio
// público frente a una óptica). Se filtran por NOMBRE.
const NON_COMPETITOR_NAME_PATTERNS: RegExp[] = [
  /\bayuntamiento\b/i,
  /\bcentro\s+de\s+salud\b/i,
  /\bambulatorio\b/i,
  /\bhospital\b/i,
  /\bcl[ií]nica\s+universitaria\b/i,
  /\bseguridad\s+social\b/i,
  /\bcolegio\b/i,
  /\binstituto\b/i,
  /\buniversidad\b/i,
  /\bdiputaci[oó]n\b/i,
  /\bgobierno\b/i,
  /\bjunta\s+de\b/i,
  /\bconcejal[ií]a\b/i,
  /\bregistro\s+civil\b/i,
  /\bpolic[ií]a\b/i,
  /\bbomberos\b/i,
  /\bcorreos\b/i,
  /\bcámara\s+de\s+comercio\b/i,
  /\basociaci[oó]n\s+de\s+comerciantes\b/i,
  // Negocios de salud que Google Maps mezcla con ópticas pero NO son competencia
  // de una óptica (categoría "salud y bienestar" demasiado amplia).
  /\bortopedia\b/i,
  /\bortodoncia\b/i,
  /\baudio(log[ií]a|protesi|f[oó]n)/i,
  /\bcentro\s+auditivo\b/i,
  /\bpodolog[ií]a\b/i,
  /\bfisioterapia\b/i,
  /\bdental\b|\bdentista\b/i,
];

// Dominios que NO son la web de un negocio competidor real: directorios, agregadores,
// redes sociales y webs oficiales. Si el "competidor" apunta aquí, no vale.
const NON_COMPETITOR_DOMAIN_PATTERNS: RegExp[] = [
  /paginasamarillas/i, /doctoralia/i, /yelp\./i, /tripadvisor/i, /foursquare/i,
  /einforma/i, /axesor/i, /infoempresa/i, /infobel/i, /cylex/i, /11870/i,
  /facebook\.com/i, /instagram\.com/i, /tiktok\.com/i, /linkedin\.com/i,
  /twitter\.com/i, /x\.com/i, /youtube\.com/i, /google\.com/i,
  /\.gob\.es/i, /\.gov\b/i, /\.sergas\./i, /\.osakidetza\./i, /\.navarra\.es/i,
];

// Decide si un resultado de Google Maps es un competidor legítimo para personalizar
// el cold email. Descarta entidades públicas, directorios, redes sociales y franquicias.
export function isValidCompetitor(c: { name: string; website: string }): boolean {
  if (!c.name || !c.website) return false;
  if (NON_COMPETITOR_NAME_PATTERNS.some(rx => rx.test(c.name))) return false;
  if (NON_COMPETITOR_DOMAIN_PATTERNS.some(rx => rx.test(c.website))) return false;
  if (isLikelyFranchise(c.name)) return false;
  return true;
}

/**
 * True SOLO si el competidor es demostrablemente del MISMO sector conocido que
 * el lead. Política estricta (preferimos un email sin competidor antes que uno
 * con un competidor incorrecto): si el competidor NO se identifica claramente
 * como del sector del lead, se descarta. Así caen las anclas absurdas de datos
 * sucios de Google Maps ("Radiokable" o "Ortopedia Mayor" en una óptica),
 * porque su sector sale 'unknown' y no coincide con el del lead.
 *
 * Si el lead es de sector 'unknown' no podemos comparar nada, así que en ese
 * caso no exigimos sector (el email caerá igualmente al fallback genérico).
 */
export function isSameSectorCompetitor(
  competitorName: string,
  leadSector: string,
): boolean {
  if (leadSector === 'unknown') return true;
  return detectSector(competitorName).sector === leadSector;
}
