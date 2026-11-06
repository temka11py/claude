// Text utilities shared by answer checking, dictation diffs and writing analysis.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Straighten quotes/dashes and collapse whitespace. */
export function cleanText(s: string): string {
  return s
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEGATIONS: [RegExp, string][] = [
  [/\bcan ?not\b/g, "can't"],
  [/\bwill not\b/g, "won't"],
  [/\bshall not\b/g, "shan't"],
  [/\b(do|does|did|is|are|was|were|have|has|had|would|should|could|must|need|might) not\b/g, "$1n't"],
];

const PRONOUN_AUX: [RegExp, string][] = [
  [/\bi am\b/g, "i'm"],
  [/\b(you|we|they) are\b/g, "$1're"],
  [/\b(i|you|we|they|he|she|it|there|that) will\b/g, "$1'll"],
  [/\b(i|you|we|they) have\b(?! to\b)/g, "$1've"],
  [/\b(he|she|it|there|that|what|who|where|here) (is|has)\b(?! to\b)/g, "$1's"],
  [/\b(i|you|we|they|he|she|it|there) (would|had)\b(?! to\b)/g, "$1'd"],
  [/\blet us\b/g, "let's"],
];

/**
 * Canonical form for comparing typed answers: case, punctuation, spacing and
 * contractions ("do not" = "don't", "he has" = "he's") are ignored.
 */
export function normalizeAnswer(s: string): string {
  let t = cleanText(s).toLowerCase();
  t = t.replace(/[.!?;:,"()]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of NEGATIONS) t = t.replace(re, rep);
  for (const [re, rep] of PRONOUN_AUX) t = t.replace(re, rep);
  return t;
}

export function tokenize(s: string): string[] {
  return cleanText(s)
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Lower-case word without surrounding punctuation (apostrophes and hyphens kept). */
export function normalizeWord(w: string): string {
  return cleanText(w)
    .toLowerCase()
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
}

export function words(s: string): string[] {
  return tokenize(s).map(normalizeWord).filter(Boolean);
}

export function wordCount(s: string): number {
  return words(s).length;
}

export function sentences(s: string): string[] {
  return cleanText(s)
    .split(/(?<=[.!?])\s+(?=[A-Z"'0-9])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export const STOPWORDS = new Set(
  'a an the and or but so of to in on at for with by from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their do does did have has had not no yes if then than there here what which who whom whose when where why how can could will would should may might must shall about into over under up down out very just also too'.split(
    ' ',
  ),
);

/** Very light stemmer — enough for keyword matching in short answers. */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 3 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function keywords(s: string): string[] {
  return words(s)
    .filter((w) => !STOPWORDS.has(w))
    .map(stem);
}

const IRREGULAR: Record<string, string[]> = {
  be: ['is', 'are', 'was', 'were', 'been', 'being', 'am'],
  have: ['has', 'had', 'having'],
  do: ['does', 'did', 'done', 'doing'],
  go: ['goes', 'went', 'gone', 'going'],
  get: ['got', 'gotten'],
  take: ['took', 'taken'],
  make: ['made'],
  keep: ['kept'],
  catch: ['caught'],
  come: ['came'],
  give: ['gave', 'given'],
  run: ['ran'],
  bring: ['brought'],
  think: ['thought'],
  buy: ['bought'],
  find: ['found'],
  hold: ['held'],
  meet: ['met'],
  break: ['broke', 'broken'],
  fall: ['fell', 'fallen'],
  feel: ['felt'],
  leave: ['left'],
  lose: ['lost'],
  see: ['saw', 'seen'],
  speak: ['spoke', 'spoken'],
  write: ['wrote', 'written'],
  grow: ['grew', 'grown'],
  know: ['knew', 'known'],
  show: ['shown'],
  stand: ['stood'],
  sit: ['sat'],
  win: ['won'],
  begin: ['began', 'begun'],
  choose: ['chose', 'chosen'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  fly: ['flew', 'flown', 'flies'],
  forget: ['forgot', 'forgotten'],
  pay: ['paid'],
  say: ['said'],
  sell: ['sold'],
  send: ['sent'],
  spend: ['spent'],
  teach: ['taught'],
  tell: ['told'],
  understand: ['understood'],
  wear: ['wore', 'worn'],
  deal: ['dealt'],
  mean: ['meant'],
  rise: ['rose', 'risen'],
  seek: ['sought'],
  fight: ['fought'],
  build: ['built'],
  lead: ['led'],
  oversleep: ['overslept'],
  overcome: ['overcame'],
  undertake: ['undertook', 'undertaken'],
  withdraw: ['withdrew', 'withdrawn'],
  arise: ['arose', 'arisen'],
  draw: ['drew', 'drawn'],
  throw: ['threw', 'thrown'],
  wake: ['woke', 'woken'],
  stick: ['stuck'],
  strike: ['struck'],
  sleep: ['slept'],
  lend: ['lent'],
  bear: ['bore', 'borne'],
  hide: ['hid', 'hidden'],
  shake: ['shook', 'shaken'],
  swim: ['swam', 'swum'],
  sing: ['sang', 'sung'],
  ring: ['rang', 'rung'],
  drink: ['drank', 'drunk'],
  feed: ['fed'],
  light: ['lit'],
  mislead: ['misled'],
  foresee: ['foresaw', 'foreseen'],
  outgrow: ['outgrew', 'outgrown'],
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex source matching a word and its common inflections. */
function inflectedPattern(token: string): string {
  const t = token.toLowerCase();
  const alts = [`${escapeRe(t)}(?:s|es|ed|d|ing|ly|er|est|'s)?`];
  if (t.length > 3 && /(e|y)$/.test(t)) {
    alts.push(`${escapeRe(t.slice(0, -1))}(?:ing|ied|ies|ed|es|er|est|ily|ier|iest)`);
  }
  if (t.length > 2 && t.endsWith('ie')) alts.push(`${escapeRe(t.slice(0, -2))}ying`);
  if (/^[a-z]*[^aeiou][aeiou][bdgmnprt]$/.test(t)) alts.push(`${escapeRe(t)}${t.slice(-1)}(?:ed|ing|er|est)`);
  for (const form of IRREGULAR[t] ?? []) alts.push(escapeRe(form));
  return `(?:${alts.join('|')})`;
}

/**
 * Find the word (or an inflected form) inside a sentence. For phrases, the
 * first word may inflect ("look forward to" matches "looking forward to").
 * Returns the matched text or null.
 */
export function findWordForm(sentence: string, word: string): string | null {
  const tokens = cleanText(word).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  // "(with)"-style optional parts in authored phrases are ignored for matching.
  const core = tokens.filter((t) => !/^\(.*\)$/.test(t));
  const [first, ...rest] = core;
  // The first and last words may inflect ("took turns", "spare times"); middle words must match exactly.
  const source = [inflectedPattern(first), ...rest.map((t, i) => (i === rest.length - 1 ? inflectedPattern(t) : escapeRe(t)))].join('\\s+');
  const re = new RegExp(`\\b${source}\\b`, 'i');
  const m = cleanText(sentence).match(re);
  return m ? m[0] : null;
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Small deterministic PRNG (mulberry32) so generated exercises are reproducible in tests. */
export function seededRandom(seed: number | string): () => number {
  let h = typeof seed === 'number' ? seed : hashString(seed);
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function slugify(s: string): string {
  return cleanText(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
