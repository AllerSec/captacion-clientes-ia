import { describe, it, expect } from 'vitest';
import { cleanBusinessName, isLikelyFranchise, isValidCompetitor, distinctiveToken, isLikelyJunkName, isSameSectorCompetitor } from '../../src/core/business-name.js';

describe('cleanBusinessName', () => {
  it('downcases ALL CAPS to Title Case', () => {
    expect(cleanBusinessName('ALTZA MOTOR TALLERES')).toBe('Altza Motor Talleres');
    expect(cleanBusinessName('TALLERES EGIA')).toBe('Talleres Egia');
  });

  it('keeps mixed-case names untouched', () => {
    expect(cleanBusinessName('Taller Mecánico San Martín')).toBe('Taller Mecánico San Martín');
    expect(cleanBusinessName('Auto Taller Gure Ametsa')).toBe('Auto Taller Gure Ametsa');
  });

  it('strips trailing S.L./S.A./S.R.C./C.B.', () => {
    expect(cleanBusinessName('Talleres Bosque S L')).toBe('Talleres Bosque');
    expect(cleanBusinessName('Automoviles Ayefer S.R.C.')).toBe('Automoviles Ayefer');
    expect(cleanBusinessName('Mecanizados Lartaun, S.L.')).toBe('Mecanizados Lartaun');
    expect(cleanBusinessName('San Fernando Motor SL')).toBe('San Fernando Motor');
  });

  it('handles empty input', () => {
    expect(cleanBusinessName('')).toBe('');
  });
});

describe('distinctiveToken', () => {
  it('extrae la marca ignorando genéricos de sector', () => {
    expect(distinctiveToken('Taller GTS motor')).toBe('GTS');
    expect(distinctiveToken('Talleres Egia')).toBe('Egia');
    expect(distinctiveToken('Óptica Goya')).toBe('Goya');
  });

  it('limpia paréntesis y forma jurídica', () => {
    expect(distinctiveToken('AutoZona (Talleres AUTO-PRIX S.L.)')).toBe('AutoZona');
    expect(distinctiveToken('San Fernando Motor SL')).toBe('Fernando');
  });

  it('cae al nombre completo si todo es genérico', () => {
    expect(distinctiveToken('Taller Motor')).toBeTruthy();
  });

  it('devuelve null para vacío', () => {
    expect(distinctiveToken('')).toBeNull();
  });
});

describe('isLikelyJunkName', () => {
  it('flags generic corporate shells', () => {
    expect(isLikelyJunkName('Proximidad Empresarial S L')).toBe(true);
    expect(isLikelyJunkName('Inversiones del Norte SL')).toBe(true);
    expect(isLikelyJunkName('Gestión Patrimonial Integral')).toBe(true);
  });

  it('does NOT flag real local businesses', () => {
    expect(isLikelyJunkName('Talleres Egia')).toBe(false);
    expect(isLikelyJunkName('Óptica Goya')).toBe(false);
    expect(isLikelyJunkName('Farmacia García')).toBe(false);
  });

  it('flags empty or too-short-after-cleaning names', () => {
    expect(isLikelyJunkName('')).toBe(true);
    expect(isLikelyJunkName('SL')).toBe(true);
  });
});

describe('isSameSectorCompetitor (política estricta: solo datos correctos)', () => {
  it('acepta competidor del mismo sector conocido', () => {
    expect(isSameSectorCompetitor('Óptica Visión', 'optica')).toBe(true);
    expect(isSameSectorCompetitor('Talleres Duerna', 'taller')).toBe(true);
  });

  it('rechaza competidor de otro sector conocido (taller vs óptica)', () => {
    expect(isSameSectorCompetitor('Talleres Duerna', 'optica')).toBe(false);
  });

  it('rechaza competidor de sector indeterminado en un lead de sector conocido', () => {
    // Datos sucios de Google Maps: no son de la misma actividad → fuera.
    expect(isSameSectorCompetitor('Radiokable', 'optica')).toBe(false);
    expect(isSameSectorCompetitor('Casa Pepe', 'farmacia')).toBe(false);
  });

  it('no exige sector cuando el lead es unknown (no hay con qué comparar)', () => {
    expect(isSameSectorCompetitor('Lo que sea', 'unknown')).toBe(true);
  });

  // Ortopedia ya se bloquea antes, en isValidCompetitor (lista de no-competidores).
  it('ortopedia se bloquea en isValidCompetitor', () => {
    expect(isValidCompetitor({ name: 'Ortopedia Mayor', website: 'https://ortopediamayor.es' })).toBe(false);
  });
});

describe('isLikelyFranchise', () => {
  it('detects Bosch Car Service', () => {
    expect(isLikelyFranchise('Bosch Car Service - Martutene Motor')).toBe(true);
  });

  it('detects Feu Vert', () => {
    expect(isLikelyFranchise('Feu Vert')).toBe(true);
  });

  it('detects Multiópticas', () => {
    expect(isLikelyFranchise('Multiópticas Centro')).toBe(true);
    expect(isLikelyFranchise('Multiopticas Bilbao')).toBe(true);
  });

  it('detects Alain Afflelou', () => {
    expect(isLikelyFranchise('Óptica Alain Afflelou Donostia')).toBe(true);
  });

  it('does NOT flag independent businesses', () => {
    expect(isLikelyFranchise('Talleres Egia')).toBe(false);
    expect(isLikelyFranchise('Farmacia García')).toBe(false);
    expect(isLikelyFranchise('Óptica Goya')).toBe(false);
  });
});

describe('isValidCompetitor', () => {
  it('accepts a real private same-sector business', () => {
    expect(isValidCompetitor({ name: 'Óptica Goya', website: 'https://opticagoya.com' })).toBe(true);
    expect(isValidCompetitor({ name: 'Talleres Egia', website: 'http://talleresegia.es' })).toBe(true);
  });

  it('rejects public entities (the ambulatorio bug)', () => {
    expect(isValidCompetitor({ name: 'Centro de Salud de Tafalla', website: 'http://www.tafalla.es/centro-de-salud' })).toBe(false);
    expect(isValidCompetitor({ name: 'Ayuntamiento de Burlada', website: 'https://www.burlada.es' })).toBe(false);
    expect(isValidCompetitor({ name: 'Hospital García Orcoyen', website: 'https://hospital.navarra.es' })).toBe(false);
  });

  it('rejects directories and aggregators by domain', () => {
    expect(isValidCompetitor({ name: 'Óptica X', website: 'https://www.paginasamarillas.es/x' })).toBe(false);
    expect(isValidCompetitor({ name: 'Clínica Y', website: 'https://www.doctoralia.es/y' })).toBe(false);
  });

  it('rejects social media profiles', () => {
    expect(isValidCompetitor({ name: 'Taller Z', website: 'https://www.facebook.com/tallerz' })).toBe(false);
  });

  it('rejects franchises', () => {
    expect(isValidCompetitor({ name: 'Multiópticas Centro', website: 'https://multiopticas.com' })).toBe(false);
  });

  it('rejects entries missing name or website', () => {
    expect(isValidCompetitor({ name: '', website: 'https://x.com' })).toBe(false);
    expect(isValidCompetitor({ name: 'X', website: '' })).toBe(false);
  });
});
