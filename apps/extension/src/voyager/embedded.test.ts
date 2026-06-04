import { describe, it, expect } from 'vitest';
import { extractEmbeddedVoyagerJson, looksLikeVoyager } from './embedded.js';

function docFrom(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
}

describe('looksLikeVoyager', () => {
  it('accepts normalized graphs and graphql data, rejects junk', () => {
    expect(looksLikeVoyager('{"included":[],"data":{}}')).toBe(true);
    expect(looksLikeVoyager('  {"foo":"urn:li:fsd_profile:abc"}')).toBe(true);
    expect(looksLikeVoyager('not json')).toBe(false);
    expect(looksLikeVoyager('{"unrelated":1}')).toBe(false);
  });
});

describe('extractEmbeddedVoyagerJson', () => {
  it('pulls JSON out of <code> blocks', () => {
    const doc = docFrom(
      '<code>{"included":["urn:li:fsd_profile:abc"]}</code>' +
        '<code>plain text not json</code>' +
        '<code>{"data":{"x":1},"meta":2}</code>',
    );
    const out = extractEmbeddedVoyagerJson(doc);
    expect(out).toHaveLength(2);
    expect(JSON.parse(out[0]).included[0]).toBe('urn:li:fsd_profile:abc');
  });

  it('pulls JSON from script#rehydrate-data', () => {
    const doc = docFrom('<script id="rehydrate-data" type="application/json">{"included":[1,2,3]}</script>');
    const out = extractEmbeddedVoyagerJson(doc);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]).included).toEqual([1, 2, 3]);
  });

  it('returns [] when there is no embedded data', () => {
    expect(extractEmbeddedVoyagerJson(docFrom('<div>nothing here</div>'))).toEqual([]);
  });
});
