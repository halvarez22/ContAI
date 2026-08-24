import { describe, it, expect } from 'vitest';
import { isMigratedNavTabId, isNavTabId } from './appSections';

describe('appSections type guards', () => {
  it('isNavTabId acepta ids válidos', () => {
    expect(isNavTabId('overview')).toBe(true);
    expect(isNavTabId('transactions')).toBe(true);
    expect(isNavTabId('design_system')).toBe(true);
    expect(isNavTabId('invalid')).toBe(false);
    expect(isNavTabId('')).toBe(false);
  });

  it('isMigratedNavTabId solo tabs E7.3', () => {
    expect(isMigratedNavTabId('fiscal')).toBe(true);
    expect(isMigratedNavTabId('analysis')).toBe(false);
    expect(isMigratedNavTabId('settings')).toBe(false);
  });
});
