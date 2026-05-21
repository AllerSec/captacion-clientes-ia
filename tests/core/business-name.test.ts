import { describe, it, expect } from 'vitest';
import { cleanBusinessName, isLikelyFranchise } from '../../src/core/business-name.js';

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
