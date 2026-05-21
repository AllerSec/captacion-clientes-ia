export type Sector = 'taller' | 'optica' | 'farmacia' | 'industria' | 'unknown';

export interface SectorInfo {
  sector: Sector;
  exampleUrl: string | null;
  clientWord: string;
  sectorLabel: string;
}

const SECTOR_MAP: Array<{ pattern: RegExp; info: SectorInfo }> = [
  // industria va ANTES que taller porque "mecanizado" matchearía /mecán/.
  {
    pattern: /mecanizado|caldereria|calder[eé]r[ií]a|ingenier[ií]a industrial|fabricaci[oó]n met[aá]lica|industria del acero|tornerí|torner[ií]a/i,
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
