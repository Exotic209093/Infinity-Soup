import { describe, it, expect } from 'vitest';
import { isVoyagerUrl } from './targets.js';

describe('isVoyagerUrl', () => {
  it('matches voyager graphql + REST endpoints', () => {
    expect(isVoyagerUrl('https://www.linkedin.com/voyager/api/graphql?queryId=voyagerIdentityDashProfileCards.abc')).toBe(true);
    expect(isVoyagerUrl('https://www.linkedin.com/voyager/api/identity/dash/profiles')).toBe(true);
  });

  it('matches sales navigator + recruiter endpoints', () => {
    expect(isVoyagerUrl('https://www.linkedin.com/sales-api/salesApiProfiles/(profileId:abc)')).toBe(true);
    expect(isVoyagerUrl('https://www.linkedin.com/recruiter/api/smartsearch')).toBe(true);
  });

  it('rejects unrelated URLs and empties', () => {
    expect(isVoyagerUrl('https://www.linkedin.com/in/someone')).toBe(false);
    expect(isVoyagerUrl('https://static.licdn.com/scds/main.js')).toBe(false);
    expect(isVoyagerUrl('')).toBe(false);
  });
});
