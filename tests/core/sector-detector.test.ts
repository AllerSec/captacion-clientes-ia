import { describe, it, expect } from 'vitest';
import { detectSector } from '../../src/core/sector-detector.js';

describe('detectSector', () => {
  it('detects taller from query', () => {
    const r = detectSector('taller mecánico Irún');
    expect(r.sector).toBe('taller');
    expect(r.exampleUrl).toBe('motosarretxe.com');
  });

  it('detects taller from mecán variant', () => {
    expect(detectSector('mecánico Donostia').sector).toBe('taller');
  });

  it('detects optica from óptica query', () => {
    const r = detectSector('óptica Bilbao');
    expect(r.sector).toBe('optica');
    expect(r.exampleUrl).toBe('anakaoptica.com');
  });

  it('detects optica from unaccented optica', () => {
    expect(detectSector('optica Vitoria').sector).toBe('optica');
  });

  it('detects farmacia', () => {
    const r = detectSector('farmacia Pamplona');
    expect(r.sector).toBe('farmacia');
    expect(r.exampleUrl).toBe('farmaciafernandezbera.com');
  });

  it('returns unknown for unrecognized query', () => {
    const r = detectSector('restaurante Madrid');
    expect(r.sector).toBe('unknown');
    expect(r.exampleUrl).toBeNull();
  });

  it('always returns clientWord clientes', () => {
    expect(detectSector('taller mecánico Irún').clientWord).toBe('clientes');
    expect(detectSector('óptica Bilbao').clientWord).toBe('clientes');
    expect(detectSector('farmacia Pamplona').clientWord).toBe('clientes');
  });

  it('finds the sector across multiple hint arguments', () => {
    expect(detectSector('', 'Farmacia López', null).sector).toBe('farmacia');
    expect(detectSector(null, 'Auto repair', 'Taller Etxebeste').sector).toBe('taller');
  });

  it('returns unknown when all hints are empty/null', () => {
    expect(detectSector(null, '', undefined).sector).toBe('unknown');
  });
});
