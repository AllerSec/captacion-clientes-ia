export type Sector = 'taller' | 'optica' | 'farmacia' | 'industria' | 'peluqueria' | 'dental' | 'fisio' | 'fontanero' | 'electricista' | 'cerrajero' | 'restaurante' | 'gestoria' | 'academia' | 'unknown';

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
  {
    pattern: /peluquer[ií]a|barbería|barberia|estética|estetica|salón de belleza|salon de belleza/i,
    info: { sector: 'peluqueria', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'peluquería' },
  },
  {
    pattern: /cl[ií]nica dental|dentista|odontolog|orthodon/i,
    info: { sector: 'dental', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'clínica dental' },
  },
  {
    pattern: /fisiotera|rehabilitaci[oó]n|osteópata|osteopata/i,
    info: { sector: 'fisio', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'clínica de fisioterapia' },
  },
  {
    pattern: /fontanero|fontaner[ií]a|plomero|instalaci[oó]n de tuber[ií]as/i,
    info: { sector: 'fontanero', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'fontanero' },
  },
  {
    pattern: /electricista|instalaci[oó]n el[eé]ctrica|electricidad/i,
    info: { sector: 'electricista', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'electricista' },
  },
  {
    pattern: /cerrajero|cerrajer[ií]a/i,
    info: { sector: 'cerrajero', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'cerrajero' },
  },
  {
    pattern: /restaurante|bar\b|cafeter[ií]a|bodega|taberna|asador|sidrería|sidreria/i,
    info: { sector: 'restaurante', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'restaurante' },
  },
  {
    pattern: /gestor[ií]a|asesor[ií]a|contabilidad|fiscal|laboral/i,
    info: { sector: 'gestoria', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'gestoría' },
  },
  {
    pattern: /academia|autoescuela|clases\s+particulares|academia\s+de/i,
    info: { sector: 'academia', exampleUrl: 'unaxaller.com', clientWord: 'clientes', sectorLabel: 'academia' },
  },
];

export function detectSector(...hints: Array<string | null | undefined>): SectorInfo {
  const haystack = hints.filter((h): h is string => typeof h === 'string' && h.length > 0).join(' ');
  for (const { pattern, info } of SECTOR_MAP) {
    if (pattern.test(haystack)) return info;
  }
  return { sector: 'unknown', exampleUrl: null, clientWord: 'clientes', sectorLabel: 'negocio' };
}
