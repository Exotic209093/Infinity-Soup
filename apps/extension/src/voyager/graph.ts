/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Voyager entity graph — the DuxSoup "pagecache" pattern.
 *
 * LinkedIn's normalized+json responses are flat: a `data` root plus an `included[]` array of
 * entities, each with an `entityUrn`, cross-referencing each other by URN string. We index
 * every entity by its URN(s) so URN references can be dereferenced, group by `$type`, and
 * extract fields by STABLE KEY NAME (`titleV2`, `subtitle`, `caption`, …) via findNestedKey —
 * never by DOM class or fixed path. This is what makes the scrape immune to LinkedIn's
 * obfuscated, hashed-class DOM.
 */

export type AnyObj = Record<string, any>;

export interface VoyagerGraph {
  /** entity lookup by any of: entityUrn, objectUrn, $id, urn, publicIdentifier:<id> */
  entities: Map<string, AnyObj>;
  /** entities grouped by `$type` / `$recipeType` */
  byType: Map<string, AnyObj[]>;
  /** parsed top-level response roots (for reading `data` query results) */
  roots: AnyObj[];
}

function indexKeysFor(entity: AnyObj): string[] {
  const keys: string[] = [];
  for (const k of ['entityUrn', 'objectUrn', '$id', 'urn', 'trackingUrn']) {
    const v = entity[k];
    if (typeof v === 'string') keys.push(v);
  }
  if (typeof entity.publicIdentifier === 'string') keys.push('publicIdentifier:' + entity.publicIdentifier);
  return keys;
}

function walk(node: any, visit: (o: AnyObj) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const it of node) walk(it, visit);
    return;
  }
  visit(node);
  for (const v of Object.values(node)) walk(v, visit);
}

/** Parse a corpus of raw JSON bodies into a single deduped entity graph. Invalid JSON is skipped. */
export function buildGraph(bodies: string[]): VoyagerGraph {
  const entities = new Map<string, AnyObj>();
  const byType = new Map<string, AnyObj[]>();
  const roots: AnyObj[] = [];
  for (const body of bodies) {
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    roots.push(parsed);
    walk(parsed, (o) => {
      const t = (o.$type ?? o.$recipeType) as unknown;
      if (typeof t === 'string') {
        let arr = byType.get(t);
        if (!arr) {
          arr = [];
          byType.set(t, arr);
        }
        arr.push(o);
      }
      for (const key of indexKeysFor(o)) {
        if (!entities.has(key)) entities.set(key, o); // first-wins; later dupes ignored
      }
    });
  }
  return { entities, byType, roots };
}

/** First occurrence of `key` anywhere in the object subtree (DuxSoup findNestedKey). */
export function findNestedKey(obj: any, key: string): any {
  if (obj == null || typeof obj !== 'object') return null;
  if (key in obj && obj[key] != null) return obj[key];
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = findNestedKey(v, key);
      if (found != null) return found;
    }
  }
  return null;
}

/** Resolve a URN string (or pass through an inline entity object) to its entity. */
export function deref(graph: VoyagerGraph, ref: unknown): AnyObj | null {
  if (typeof ref === 'string') return graph.entities.get(ref) ?? null;
  if (ref && typeof ref === 'object') return ref as AnyObj;
  return null;
}

/** All entities whose `$type` contains `typeSubstring` (e.g. "Profile", "Position"). */
export function entitiesOfType(graph: VoyagerGraph, typeSubstring: string): AnyObj[] {
  const out: AnyObj[] = [];
  for (const [t, list] of graph.byType) if (t.includes(typeSubstring)) out.push(...list);
  return out;
}

/**
 * LinkedIn text nodes are often `{ text: "..." }` or `{ text: { text: "..." } }`.
 * Extract the innermost string regardless of nesting depth.
 */
export function textOf(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object') {
    if (typeof node.text === 'string') return node.text;
    if (node.text && typeof node.text === 'object') return textOf(node.text);
  }
  return '';
}
