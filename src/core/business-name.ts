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
