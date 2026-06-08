import { describe, it, expect } from 'vitest';
import { parseProfileExtras } from './extras.js';

describe('parseProfileExtras', () => {
  it('reads connection + follower counts from inline top-card text', () => {
    document.body.innerHTML = `
      <main>
        <section>
          <a><span>272 connections</span></a>
          <span>275 followers</span>
        </section>
      </main>`;
    expect(parseProfileExtras(document)).toEqual({ connections: 272, followers: 275, openToWork: false });
  });

  it('handles 500+ and K-suffixed follower counts', () => {
    document.body.innerHTML = `<main><span>500+ connections</span><span>12.3K followers</span></main>`;
    const r = parseProfileExtras(document);
    expect(r.connections).toBe(500);
    expect(r.followers).toBe(12300);
  });

  it('detects the open-to-work badge but not the self-view "Open to" button', () => {
    document.body.innerHTML = `<main><span>Open to Add section</span></main>`;
    expect(parseProfileExtras(document).openToWork).toBe(false);
    document.body.innerHTML = `<main><span>James is open to work</span></main>`;
    expect(parseProfileExtras(document).openToWork).toBe(true);
  });

  it('defaults to 0/false when nothing matches', () => {
    document.body.innerHTML = `<main><span>hello</span></main>`;
    expect(parseProfileExtras(document)).toEqual({ connections: 0, followers: 0, openToWork: false });
  });
});
