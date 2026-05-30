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
  it('extrae key de la query', () => {
    expect(extractToken('/panel?key=abc')).toBe('abc');
    expect(extractToken('/panel/data?key=abc&x=1')).toBe('abc');
  });

  it('devuelve null si no hay query o no hay key', () => {
    expect(extractToken('/panel')).toBe(null);
    expect(extractToken('/panel?x=1')).toBe(null);
  });

  it('decodifica valores url-encoded', () => {
    expect(extractToken('/panel?key=a%20b')).toBe('a b');
  });
});
