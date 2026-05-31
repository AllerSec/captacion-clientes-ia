export type Sector = 'taller' | 'optica' | 'farmacia' | 'industria' | 'unknown';

export interface SectorInfo {
  sector: Sector;
  exampleUrl: string | null;
  clientWord: string;
  sectorLabel: string;
}

const SECTOR_MAP: Array<{ pattern: RegExp; info: SectorInfo }> = [
  // industria va ANTES que taller porque "mecanizado" matchearía /mecán/.
  // Cubre cómo Google Maps etiqueta de verdad estas empresas: la categoría suele ser
  // "Ingeniero industrial", "Taller metalúrgico", "Fábrica", etc., casi nunca "mecanizado".
  {
    pattern: /mecanizado|mecaniz|caldecer|caldereria|calder[eé]r[ií]a|ingenier[ií]a\s+industrial|ingenier[oa]\s+industrial|fabricaci[oó]n\s+met[aá]lica|industria\s+del\s+acero|metal[uú]rgic|metal[ií]stic|fundici[oó]n|tornerí|torner[ií]a|troquel|estampaci[oó]n|fresado|\bcnc\b|carpinter[ií]a\s+met[aá]lica|construcciones?\s+met[aá]licas/i,
    info: { sector: 'industria', exampleUrl: 'tecmac.es', clientWord: 'clientes', sectorLabel: 'empresa de mecanizado' },
  },
  {
    pattern: /taller|mecán/i,
    info: { sector: 'taller', exampleUrl: 'motosarretxe.com', clientWord: 'clientes', sectorLabel: 'taller' },
  },
  {
    pattern: /óptica|optica/i,
    info: { sector: 'optica', exampleUrl: 'anakaoptica.com', clientWord: 'clientes', sectorLabel: 'óptica' },
  },
  {
    pattern: /farmacia/i,
    info: { sector: 'farmacia', exampleUrl: 'farmaciafernandezbera.com', clientWord: 'clientes', sectorLabel: 'farmacia' },
  },
];

export function detectSector(...hints: Array<string | null | undefined>): SectorInfo {
  const haystack = hints.filter((h): h is string => typeof h === 'string' && h.length > 0).join(' ');
  for (const { pattern, info } of SECTOR_MAP) {
    if (pattern.test(haystack)) return info;
  }
  return { sector: 'unknown', exampleUrl: null, clientWord: 'clientes', sectorLabel: 'negocio' };
}
