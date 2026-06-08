import { describe, it, expect } from 'vitest';
import { parsePosts, parseCount, parseAge } from './posts.js';

describe('parseCount', () => {
  it('parses plain, comma, and K/M suffixes', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('1.2K')).toBe(1200);
    expect(parseCount('3K')).toBe(3000);
    expect(parseCount('2M')).toBe(2_000_000);
    expect(parseCount('5 comments')).toBe(5);
    expect(parseCount('')).toBe(0);
    expect(parseCount(null)).toBe(0);
  });
});

describe('parseAge', () => {
  it('extracts a relative age token from noisy sub-descriptions', () => {
    expect(parseAge('2w • Edited • Visible to anyone')).toBe('2w');
    expect(parseAge('3mo •')).toBe('3mo');
    expect(parseAge('1yr')).toBe('1yr');
    expect(parseAge('no age here')).toBe('');
  });
});

describe('parsePosts', () => {
  it('extracts text, urn, age, url, and engagement from a feed card', () => {
    document.body.innerHTML = `
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:7000000000000000000">
        <div class="update-components-actor__sub-description">2w • Edited • Visible to anyone</div>
        <div class="update-components-text">Shipping AURA — excited!</div>
        <div class="social-details-social-counts">
          <span class="social-details-social-counts__reactions-count">42</span>
          <li><button>3 comments</button></li>
          <li><button>1 repost</button></li>
        </div>
      </div>`;
    const posts = parsePosts(document);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      urn: 'urn:li:activity:7000000000000000000',
      text: 'Shipping AURA — excited!',
      postedAt: '2w',
      likes: 42,
      comments: 3,
      reposts: 1,
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/',
    });
  });

  it('reads likes from an aria-label or a bare reactions number (no "likes" text)', () => {
    document.body.innerHTML = `
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:10">
        <div class="update-components-text">aria post</div>
        <div class="social-details-social-counts">
          <button aria-label="128 reactions">128</button>
          <li><button>5 comments</button></li>
        </div>
      </div>
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:11">
        <div class="update-components-text">bare number post</div>
        <div class="social-details-social-counts">
          <span>1,234</span>
          <li><button>2 comments</button></li>
          <li><button>3 reposts</button></li>
        </div>
      </div>`;
    const posts = parsePosts(document);
    expect(posts.find((p) => p.urn.endsWith(':10'))).toMatchObject({ likes: 128, comments: 5 });
    expect(posts.find((p) => p.urn.endsWith(':11'))).toMatchObject({ likes: 1234, comments: 2, reposts: 3 });
  });

  it('dedupes by urn and skips empty/placeholder cards', () => {
    document.body.innerHTML = `
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:1"><div class="update-components-text">A</div></div>
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:1"><div class="update-components-text">A again</div></div>
      <div class="feed-shared-update-v2"></div>`;
    const posts = parsePosts(document);
    expect(posts).toHaveLength(1);
    expect(posts[0].text).toBe('A');
  });

  it('respects the max cap', () => {
    document.body.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<div class="feed-shared-update-v2" data-urn="urn:li:activity:${i}"><div class="update-components-text">p${i}</div></div>`,
    ).join('');
    expect(parsePosts(document, 2)).toHaveLength(2);
  });
});
