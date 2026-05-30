import { describe, it, expect } from 'vitest';
import { isPanelAuthorized, extractToken } from '../../src/core/panel-auth.js';

describe('isPanelAuthorized', () => {
  it('permite todo si no hay token configurado (abierto)', () => {
    expect(isPanelAuthorized(undefined, null)).toBe(true);
    expect(isPanelAuthorized(undefined, 'lo-que-sea')).toBe(true);
    expect(isPanelAuthorized('', 'x')).toBe(true); // '' es falsy → abierto
  });

  it('rechaza si hay token pero no se provee', () => {
    expect(isPanelAuthorized('secreto', null)).toBe(false);
    expect(isPanelAuthorized('secreto', '')).toBe(false);
  });

  it('rechaza si el token no coincide', () => {
    expect(isPanelAuthorized('secreto', 'otro')).toBe(false);
    expect(isPanelAuthorized('secreto', 'secret')).toBe(false); // longitud distinta
  });

  it('acepta si el token coincide exactamente', () => {
    expect(isPanelAuthorized('secreto', 'secreto')).toBe(true);
    expect(isPanelAuthorized('abc123XYZ', 'abc123XYZ')).toBe(true);
  });
});

describe('extractToken', () => {
  it('extrae key de la query (fallback para favorito)', () => {
    expect(extractToken('/panel?key=abc')).toBe('abc');
    expect(extractToken('/panel/data?key=abc&x=1')).toBe('abc');
  });

  it('devuelve null si no hay query ni header', () => {
    expect(extractToken('/panel')).toBe(null);
    expect(extractToken('/panel?x=1')).toBe(null);
  });

  it('decodifica valores url-encoded', () => {
    expect(extractToken('/panel?key=a%20b')).toBe('a b');
  });

  it('prefiere el header Authorization: Bearer sobre la query', () => {
    expect(extractToken('/panel/data', 'Bearer fromheader')).toBe('fromheader');
    expect(extractToken('/panel/data?key=fromquery', 'Bearer fromheader')).toBe('fromheader');
  });

  it('cae a la query si el header no es Bearer válido', () => {
    expect(extractToken('/panel/data?key=q', 'Basic xyz')).toBe('q');
    expect(extractToken('/panel/data?key=q', 'Bearer ')).toBe('q');
  });

  it('maneja header como array (cabeceras repetidas)', () => {
    expect(extractToken('/panel/data', ['Bearer arr'])).toBe('arr');
  });
});
