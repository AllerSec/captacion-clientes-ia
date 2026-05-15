export type Sector = 'taller' | 'optica' | 'farmacia' | 'unknown';

export interface SectorInfo {
  sector: Sector;
  exampleUrl: string | null;
  clientWord: string;
  sectorLabel: string;
}

const SECTOR_MAP: Array<{ pattern: RegExp; info: SectorInfo }> = [
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

export function detectSector(query: string): SectorInfo {
  for (const { pattern, info } of SECTOR_MAP) {
    if (pattern.test(query)) return info;
  }
  return { sector: 'unknown', exampleUrl: null, clientWord: 'clientes', sectorLabel: 'negocio' };
}
