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
