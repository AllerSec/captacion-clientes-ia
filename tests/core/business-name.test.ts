import { describe, it, expect } from 'vitest';
import { cleanBusinessName, isLikelyFranchise, isValidCompetitor } from '../../src/core/business-name.js';

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
