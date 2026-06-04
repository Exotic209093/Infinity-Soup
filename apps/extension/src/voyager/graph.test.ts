import { describe, it, expect } from 'vitest';
import { buildGraph, findNestedKey, deref, entitiesOfType, textOf } from './graph.js';

// A miniature of LinkedIn's normalized+json shape: a `data` root + flat `included[]`
// entities cross-referencing by URN.
const RESPONSE = JSON.stringify({
  data: { '*elements': ['urn:li:fsd_profilePosition:(ACoAAB,123)'] },
  included: [
    {
      entityUrn: 'urn:li:fsd_profilePosition:(ACoAAB,123)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Position',
      titleV2: { text: { text: 'Solutions Engineer' } },
      subtitle: { text: 'Apex Infinity Solutions · Full-time' },
      caption: { text: 'May 2026 - Present · 2 mos' },
      '*company': 'urn:li:fsd_company:42',
    },
    {
      entityUrn: 'urn:li:fsd_company:42',
      $type: 'com.linkedin.voyager.dash.organization.Company',
      name: 'Apex Infinity Solutions',
    },
    {
      entityUrn: 'urn:li:fsd_profile:ACoAAB',
      $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
      publicIdentifier: 'james-collard',
      firstName: 'James',
      lastName: 'Collard',
    },
  ],
});

describe('buildGraph', () => {
  const g = buildGraph([RESPONSE, 'not json — skipped', '']);

  it('indexes every included entity by entityUrn', () => {
    expect(g.entities.has('urn:li:fsd_profilePosition:(ACoAAB,123)')).toBe(true);
    expect(g.entities.has('urn:li:fsd_company:42')).toBe(true);
    expect(g.entities.get('urn:li:fsd_company:42')?.name).toBe('Apex Infinity Solutions');
  });

  it('indexes by publicIdentifier and groups by $type', () => {
    expect(g.entities.get('publicIdentifier:james-collard')?.firstName).toBe('James');
    expect(entitiesOfType(g, 'Position')).toHaveLength(1);
    expect(entitiesOfType(g, 'profile.Profile')).toHaveLength(1);
  });

  it('skips invalid JSON without throwing and keeps valid roots', () => {
    expect(g.roots).toHaveLength(1);
  });
});

describe('deref', () => {
  const g = buildGraph([RESPONSE]);
  it('resolves a URN string to its entity and passes through inline objects', () => {
    const pos = g.entities.get('urn:li:fsd_profilePosition:(ACoAAB,123)')!;
    expect(deref(g, pos['*company'])?.name).toBe('Apex Infinity Solutions');
    expect(deref(g, { inline: true })).toEqual({ inline: true });
    expect(deref(g, 'urn:li:does-not-exist')).toBeNull();
  });
});

describe('findNestedKey', () => {
  const g = buildGraph([RESPONSE]);
  const pos = g.entities.get('urn:li:fsd_profilePosition:(ACoAAB,123)')!;
  it('finds the first occurrence of a key anywhere in the subtree', () => {
    expect(textOf(findNestedKey(pos, 'titleV2'))).toBe('Solutions Engineer');
    expect(textOf(findNestedKey(pos, 'subtitle'))).toBe('Apex Infinity Solutions · Full-time');
    expect(textOf(findNestedKey(pos, 'caption'))).toBe('May 2026 - Present · 2 mos');
    expect(findNestedKey(pos, 'nonexistentKey')).toBeNull();
  });
});

describe('textOf', () => {
  it('unwraps {text} and {text:{text}} and plain strings', () => {
    expect(textOf('plain')).toBe('plain');
    expect(textOf({ text: 'one level' })).toBe('one level');
    expect(textOf({ text: { text: 'two levels' } })).toBe('two levels');
    expect(textOf(null)).toBe('');
    expect(textOf({ noText: 1 })).toBe('');
  });
});
