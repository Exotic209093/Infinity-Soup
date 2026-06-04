/**
 * URL predicate for LinkedIn's internal "Voyager" API + Sales/Recruiter APIs.
 *
 * DuxSoup-style strategy (see M1 RESUME notes): rather than scrape LinkedIn's obfuscated,
 * hashed-class DOM, we harvest the normalized JSON the page already fetches. The MAIN-world
 * interceptor patches fetch/XHR and forwards any response whose URL matches one of these.
 */
const VOYAGER_TARGETS = [
  '/voyager/api/', // covers /voyager/api/graphql and all REST identity/profile endpoints
  '/sales-api/salesApiProfiles',
  '/sales/profile/',
  '/recruiter/api/',
];

export function isVoyagerUrl(url: string): boolean {
  if (!url) return false;
  return VOYAGER_TARGETS.some((t) => url.includes(t));
}
