// Rule-based writing analysis. Works fully offline; the AI feedback layer (when
// configured) goes much further, but this catches frequent learner errors and
// gives honest, explainable statistics.

import { findWordForm, sentences, wordCount, words, STOPWORDS } from './text';

export type ErrorCategory =
  | 'grammar'
  | 'vocabulary'
  | 'spelling'
  | 'pronunciation'
  | 'word_choice'
  | 'collocation'
  | 'sentence_structure'
  | 'register'
  | 'punctuation';

export interface WritingIssue {
  ruleId: string;
  category: ErrorCategory;
  /** The text as written. */
  original: string;
  /** Suggested replacement (may be a description if no single fix exists). */
  suggestion: string;
  explanation: string;
  explanationMn?: string;
  /** Sentence containing the issue — shown as original → improved. */
  sentence: string;
  improvedSentence: string;
}

interface Rule {
  id: string;
  category: ErrorCategory;
  re: RegExp;
  /** Replacement for String.replace, or a function. */
  fix: string | ((match: string, ...groups: string[]) => string);
  explanation: string;
  explanationMn?: string;
  /** Only apply in formal/academic register. */
  formalOnly?: boolean;
  /** For issues without a mechanical fix: advice shown instead of a replacement. */
  advice?: string;
}

const IRREGULAR_PAST_TO_BASE: Record<string, string> = {
  went: 'go', saw: 'see', came: 'come', took: 'take', made: 'make', gave: 'give', got: 'get', had: 'have',
  bought: 'buy', ate: 'eat', wrote: 'write', said: 'say', told: 'tell', thought: 'think', knew: 'know',
  found: 'find', left: 'leave', felt: 'feel', began: 'begin', brought: 'bring', spoke: 'speak', understood: 'understand',
};

const THIRD_PERSON: Record<string, string> = {
  have: 'has', do: 'does', "don't": "doesn't", go: 'goes', want: 'wants', like: 'likes', need: 'needs',
  make: 'makes', say: 'says', think: 'thinks', know: 'knows', live: 'lives', work: 'works', study: 'studies',
};

/** Spell the -ing form: make → making, see → seeing, stop → stopping, lie → lying. */
export function ingForm(verb: string): string {
  const v = verb.toLowerCase();
  if (v.endsWith('ie')) return v.slice(0, -2) + 'ying';
  if (v.endsWith('ee') || v.endsWith('ye') || v.endsWith('oe')) return v + 'ing';
  if (v.endsWith('e') && v.length > 2) return v.slice(0, -1) + 'ing';
  if (/^[^aeiou]*[aeiou][bdgmnprt]$/.test(v) && v.length <= 4) return v + v[v.length - 1] + 'ing';
  return v + 'ing';
}

function keepCase(original: string, replacement: string): string {
  return original[0] === original[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

export const RULES: Rule[] = [
  {
    id: 'be-agree',
    category: 'grammar',
    re: /\b(I|you|we|they)\s+(?:am|are|'m|'re)\s+agree\b/gi,
    fix: '$1 agree',
    explanation: '"Agree" is a verb, so we don\'t use "am/are/is" before it.',
    explanationMn: '"Agree" бол үйл үг тул өмнө нь am/is/are хэрэглэдэггүй.',
  },
  {
    id: 'be-agree-3rd',
    category: 'grammar',
    re: /\b(he|she|it)\s+is\s+agree\b/gi,
    fix: '$1 agrees',
    explanation: '"Agree" is a verb: he/she agrees.',
    explanationMn: '"Agree" бол үйл үг: he/she agrees.',
  },
  {
    id: 'third-person-s',
    category: 'grammar',
    re: /(?<!\b(?:does|did|do|will|would|can|could|should|might|must|may|to|let|make|made|help|helped|not|n't|if)\s)\b(he|she|it)\s+(have|do|don't|go|want|like|need|make|say|think|know|live|work|study)\b/gi,
    fix: (_m, subj: string, verb: string) => `${subj} ${THIRD_PERSON[verb.toLowerCase()] ?? verb}`,
    explanation: 'In the present simple, he/she/it takes a verb with -s (he has, she doesn\'t, it goes).',
    explanationMn: 'Одоо цагт he/she/it-ийн дараа үйл үг -s авна (he has, she doesn\'t).',
  },
  {
    id: 'people-is',
    category: 'grammar',
    re: /\bpeople\s+(is|was|has)\b/gi,
    fix: (_m, v: string) => `people ${v.toLowerCase() === 'is' ? 'are' : v.toLowerCase() === 'was' ? 'were' : 'have'}`,
    explanation: '"People" is plural: people are / were / have.',
    explanationMn: '"People" нь олон тоо: people are / were / have.',
  },
  {
    id: 'peoples',
    category: 'grammar',
    re: /\bpeoples\b(?!\s+of\b)/gi,
    fix: 'people',
    explanation: '"People" is already plural. "Peoples" only means different nations or ethnic groups.',
    explanationMn: '"People" аль хэдийн олон тоо. "Peoples" нь зөвхөн "ард түмнүүд" гэсэн утгатай.',
  },
  {
    id: 'uncountable-plural',
    category: 'grammar',
    re: /\b(informations|advices|furnitures|equipments|homeworks|knowledges|researches|evidences|feedbacks|luggages|softwares|vocabularies)\b/gi,
    fix: (m: string) => m.replace(/s$/i, ''),
    explanation: 'This noun is uncountable in English, so it has no plural form. Use "some" or "a piece of".',
    explanationMn: 'Энэ нэр үг тоологдохгүй тул олон тооны -s авахгүй. "some" эсвэл "a piece of" хэрэглэнэ.',
  },
  {
    id: 'a-uncountable',
    category: 'grammar',
    re: /\b(a|an)\s+(information|advice|news|furniture|equipment|homework|knowledge|luggage|feedback)\b/gi,
    fix: (_m, _a: string, noun: string) => `some ${noun}`,
    explanation: 'Uncountable nouns can\'t take "a/an". Use "some", "a piece of", or no article.',
    explanationMn: 'Тоологдохгүй нэр үгийн өмнө a/an хэрэглэхгүй. "some" эсвэл "a piece of" гэж хэрэглэнэ.',
  },
  {
    id: 'double-comparative',
    category: 'grammar',
    re: /\bmore\s+(better|worse|easier|bigger|smaller|faster|cheaper|happier|older|younger|larger|higher|lower)\b/gi,
    fix: '$1',
    explanation: 'Don\'t use "more" with a comparative that already ends in -er.',
    explanationMn: '-er төгсгөлтэй харьцуулсан зэрэгтэй "more" давхар хэрэглэхгүй.',
  },
  {
    id: 'did-past',
    category: 'grammar',
    re: /\b(did|didn't|did not)\s+(went|saw|came|took|made|gave|got|had|bought|ate|wrote|said|told|thought|knew|found|left|felt|began|brought|spoke|understood)\b/gi,
    fix: (_m, aux: string, v: string) => `${aux} ${IRREGULAR_PAST_TO_BASE[v.toLowerCase()] ?? v}`,
    explanation: 'After "did/didn\'t" use the base form of the verb (didn\'t go, not didn\'t went).',
    explanationMn: '"did/didn\'t"-ийн дараа үйл үгийн үндсэн хэлбэр орно (didn\'t go).',
  },
  {
    id: 'we-was',
    category: 'grammar',
    re: /\b(we|they|you)\s+was\b/gi,
    fix: '$1 were',
    explanation: 'Use "were" with we/you/they.',
    explanationMn: 'we/you/they-тэй "were" хэрэглэнэ.',
  },
  {
    id: 'it-depend',
    category: 'grammar',
    re: /\b(it|this|that)\s+(?:is\s+)?depend\b/gi,
    fix: '$1 depends',
    explanation: 'Say "it depends" (depend is a verb, not an adjective).',
    explanationMn: '"It depends" гэж хэлнэ.',
  },
  {
    id: 'modal-of',
    category: 'grammar',
    re: /\b(could|would|should|must|might)\s+of\b/gi,
    fix: '$1 have',
    explanation: '"Could\'ve" sounds like "could of", but the correct form is "could have".',
    explanationMn: '"could have" гэж бичнэ; "could of" буруу.',
  },
  {
    id: 'can-able',
    category: 'grammar',
    re: /\bcan\s+able\s+to\b/gi,
    fix: 'can',
    explanation: 'Use either "can" or "be able to", not both.',
    explanationMn: '"can" эсвэл "be able to"-гийн аль нэгийг хэрэглэнэ.',
  },
  {
    id: 'although-but',
    category: 'sentence_structure',
    re: /\b(although|though|even though)\b([^.!?]*?),\s*but\b/gi,
    fix: (_m, conj: string, middle: string) => `${conj}${middle},`,
    explanation: 'Don\'t use "but" together with "although" in the same sentence — one linker is enough.',
    explanationMn: '"although" болон "but"-ийг нэг өгүүлбэрт хамт хэрэглэхгүй.',
  },
  {
    id: 'present-perfect-finished-time',
    category: 'grammar',
    re: /\b(have|has|'ve)\s+(been|gone|seen|visited|done|made|had|bought|met|lost|found|written|read|eaten|travelled|traveled|started|finished|moved|graduated)\b([^.!?]{0,25}?)\b(yesterday|last\s+(?:week|month|year|night|summer|winter|weekend)|\d+\s+\w+\s+ago|in\s+(?:19|20)\d\d)\b/gi,
    fix: (m: string) => m,
    advice: 'Use the past simple with a finished time (e.g. "I visited it last year").',
    explanation: 'With a finished time (yesterday, last year, ago, in 2020) use the past simple, not the present perfect.',
    explanationMn: 'Дууссан цагийн илэрхийлэлтэй (yesterday, last year, ago) өнгөрсөн энгийн цаг хэрэглэнэ.',
  },
  {
    id: 'since-period',
    category: 'grammar',
    re: /\bsince\s+(\d+|two|three|four|five|six|seven|eight|nine|ten|many|several|a few)\s+(years|months|weeks|days|hours)\b/gi,
    fix: 'for $1 $2',
    explanation: 'Use "for" with a period of time (for three years) and "since" with a starting point (since 2020).',
    explanationMn: 'Хугацааны урттай "for" (for three years), эхлэх цэгтэй "since" (since 2020) хэрэглэнэ.',
  },
  {
    id: 'for-year',
    category: 'grammar',
    re: /\bfor\s+((?:19|20)\d\d)\b/gi,
    fix: 'since $1',
    explanation: 'Use "since" with a starting point in time (since 2019).',
    explanationMn: 'Эхлэх цэгтэй "since" хэрэглэнэ (since 2019).',
  },
  {
    id: 'interesting-in',
    category: 'word_choice',
    re: /\b(am|is|are|was|were|'m|'re|'s)\s+(interesting|boring|exciting|tiring|confusing)\s+in\b/gi,
    fix: (_m, be: string, adj: string) => `${be} ${adj.replace(/ing$/, 'ed')} in`,
    explanation: 'Use -ed adjectives for feelings (I am interested in...) and -ing adjectives for things that cause them.',
    explanationMn: 'Мэдрэмжийг -ed (interested), түүнийг үүсгэгчийг -ing (interesting) нэмэлтээр илэрхийлнэ.',
  },
  {
    id: 'discuss-about',
    category: 'collocation',
    re: /\b(discuss(?:ed|es|ing)?)\s+about\b/gi,
    fix: '$1',
    explanation: '"Discuss" takes a direct object: discuss a problem (no "about").',
    explanationMn: '"Discuss"-ийн дараа "about" орохгүй: discuss a problem.',
  },
  {
    id: 'mention-about',
    category: 'collocation',
    re: /\b(mention(?:ed|s|ing)?)\s+about\b/gi,
    fix: '$1',
    explanation: '"Mention" takes a direct object: mention something (no "about").',
    explanationMn: '"Mention"-ы дараа "about" орохгүй.',
  },
  {
    id: 'emphasize-on',
    category: 'collocation',
    re: /\b(emphasi[sz](?:e|ed|es|ing))\s+on\b/gi,
    fix: '$1',
    explanation: 'The verb "emphasise" takes a direct object; "on" goes with the noun: put emphasis on.',
    explanationMn: '"emphasise something" эсвэл "put emphasis on something" гэж хэрэглэнэ.',
  },
  {
    id: 'explain-me',
    category: 'collocation',
    re: /\b(explain(?:ed|s)?)\s+(me|him|her|us|them)\b/gi,
    fix: '$1 to $2',
    explanation: 'We explain something TO someone: explain to me / explain it to me.',
    explanationMn: '"explain to me" гэж "to" хэрэглэнэ.',
  },
  {
    id: 'said-me',
    category: 'word_choice',
    re: /\b(say|says|said)\s+(me|him|her|us|them)\b/gi,
    fix: (_m, v: string, obj: string) => `${v.toLowerCase() === 'said' ? 'told' : v.toLowerCase() === 'says' ? 'tells' : 'tell'} ${obj}`,
    explanation: 'Use "tell" + person (tell me). "Say" doesn\'t take a person directly (say to me).',
    explanationMn: 'Хүн дурдахдаа "tell me" гэнэ. "Say me" буруу.',
  },
  {
    id: 'listen-music',
    category: 'collocation',
    re: /\b(listen(?:ed|s|ing)?)\s+(music|the radio|podcasts?|him|her|me|them|songs?)\b/gi,
    fix: '$1 to $2',
    explanation: 'We listen TO something: listen to music.',
    explanationMn: '"listen to music" гэж "to" хэрэглэнэ.',
  },
  {
    id: 'depend-of',
    category: 'collocation',
    re: /\b(depend(?:s|ed|ing)?)\s+(of|from)\b/gi,
    fix: '$1 on',
    explanation: 'The preposition after "depend" is "on".',
    explanationMn: '"depend on" гэж хэрэглэнэ.',
  },
  {
    id: 'married-with',
    category: 'collocation',
    re: /\bmarried\s+with\b/gi,
    fix: 'married to',
    explanation: 'We say "married to someone".',
    explanationMn: '"married to someone" гэнэ.',
  },
  {
    id: 'arrive-to',
    category: 'collocation',
    re: /\b(arrive(?:d|s)?)\s+to\b/gi,
    fix: '$1 in',
    explanation: 'Use "arrive in" (cities/countries) or "arrive at" (buildings, stations) — not "arrive to".',
    explanationMn: '"arrive in" (хот, улс) эсвэл "arrive at" (барилга) гэж хэрэглэнэ.',
  },
  {
    id: 'go-to-home',
    category: 'collocation',
    re: /\b(go|went|come|came|get|got|arrive(?:d)?)\s+to\s+home\b/gi,
    fix: '$1 home',
    explanation: '"Home" works like an adverb here: go home, get home (no "to").',
    explanationMn: '"go home" гэж "to"-гүй хэрэглэнэ.',
  },
  {
    id: 'return-back',
    category: 'word_choice',
    re: /\b(return(?:ed|s)?)\s+back\b/gi,
    fix: '$1',
    explanation: '"Return" already means "go back", so "back" is repeated.',
    explanationMn: '"Return" нь "буцах" гэсэн утгатай тул "back" давхардана.',
  },
  {
    id: 'enjoy-to',
    category: 'grammar',
    re: /\b(enjoy(?:s|ed)?|finish(?:es|ed)?|avoid(?:s|ed)?|mind(?:s|ed)?|suggest(?:s|ed)?|consider(?:s|ed)?)\s+to\s+([a-z]+)\b/gi,
    fix: (_m, v: string, verb: string) => `${v} ${ingForm(verb)}`,
    explanation: 'This verb is followed by the -ing form (enjoy doing, avoid making), not "to + verb".',
    explanationMn: 'Энэ үйл үгийн дараа -ing хэлбэр орно (enjoy doing).',
  },
  {
    id: 'look-forward-to',
    category: 'grammar',
    re: /\b(look(?:ing|s)?\s+forward\s+to)\s+(see|hear|meet|receive|work|talk|get|visit|hearing from)\b(?!ing)/gi,
    fix: (_m, lf: string, v: string) => `${lf} ${v.endsWith('ing from') ? v : ingForm(v)}`,
    explanation: 'In "look forward to", "to" is a preposition, so it\'s followed by -ing: look forward to hearing.',
    explanationMn: '"look forward to"-гийн дараа -ing хэлбэр орно.',
  },
  {
    id: 'much-countable',
    category: 'grammar',
    re: /\bmuch\s+(people|students|friends|cars|books|things|countries|problems|jobs|children)\b/gi,
    fix: 'many $1',
    explanation: 'Use "many" with countable plural nouns and "much" with uncountable nouns.',
    explanationMn: 'Тоологдох олон тооны нэр үгтэй "many", тоологдохгүйтэй "much" хэрэглэнэ.',
  },
  {
    id: 'many-uncountable',
    category: 'grammar',
    re: /\bmany\s+(money|time|information|water|work|advice|furniture|traffic|pollution|homework)\b/gi,
    fix: 'much $1',
    explanation: 'This noun is uncountable: use "much" or "a lot of".',
    explanationMn: 'Тоологдохгүй нэр үг тул "much" эсвэл "a lot of" хэрэглэнэ.',
  },
  {
    id: 'each-plural',
    category: 'grammar',
    re: /\b(each|every)\s+(students|people|countries|days|children|persons|years|teachers|employees)\b/gi,
    fix: (_m, d: string, n: string) => {
      const singular: Record<string, string> = { students: 'student', people: 'person', countries: 'country', days: 'day', children: 'child', persons: 'person', years: 'year', teachers: 'teacher', employees: 'employee' };
      return `${d} ${singular[n.toLowerCase()] ?? n}`;
    },
    explanation: '"Each" and "every" are followed by a singular noun.',
    explanationMn: '"Each", "every"-ийн дараа ганц тооны нэр үг орно.',
  },
  {
    id: 'the-most-of',
    category: 'grammar',
    re: /\bthe\s+most\s+of\s+(?:the\s+)?(people|students|time|them|us|countries)\b/gi,
    fix: 'most $1',
    explanation: 'Say "most people" or "most of the people" — not "the most of".',
    explanationMn: '"most people" эсвэл "most of the people" гэнэ.',
  },
  {
    id: 'double-negative',
    category: 'grammar',
    re: /\b(don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|haven't)\s+(\w+\s+)?(nothing|nobody|nowhere|none)\b/gi,
    fix: (_m, neg: string, mid = '', word: string) => {
      const any: Record<string, string> = { nothing: 'anything', nobody: 'anybody', nowhere: 'anywhere', none: 'any' };
      return `${neg} ${mid ?? ''}${any[word.toLowerCase()]}`;
    },
    explanation: 'Standard English uses only one negative: "I don\'t know anything", not "I don\'t know nothing".',
    explanationMn: 'Англи хэлэнд нэг өгүүлбэрт нэг л үгүйсгэл хэрэглэнэ.',
  },
  {
    id: 'despite-of',
    category: 'grammar',
    re: /\bdespite\s+of\b/gi,
    fix: 'despite',
    explanation: 'Say "despite" or "in spite of" — never "despite of".',
    explanationMn: '"despite" эсвэл "in spite of" гэнэ.',
  },
  {
    id: 'day-preposition',
    category: 'grammar',
    re: /\bin\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi,
    fix: (m: string) => m.replace(/^in/i, 'on'),
    explanation: 'Use "on" with days: on Monday.',
    explanationMn: 'Гаригтай "on" хэрэглэнэ: on Monday.',
  },
  {
    id: 'month-preposition',
    category: 'grammar',
    re: /\bon\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b(?!\s+\d)/g,
    fix: 'in $1',
    explanation: 'Use "in" with months (in May) and "on" with dates (on May 5th).',
    explanationMn: 'Сартай "in" (in May), огноотой "on" (on May 5th) хэрэглэнэ.',
  },
  {
    id: 'at-morning',
    category: 'grammar',
    re: /\bat\s+(?:the\s+)?(morning|afternoon|evening)\b/gi,
    fix: 'in the $1',
    explanation: 'We say "in the morning / afternoon / evening" (but "at night").',
    explanationMn: '"in the morning" гэнэ ("at night" л "at" авна).',
  },
  {
    id: 'in-the-other-hand',
    category: 'collocation',
    re: /\bin\s+the\s+other\s+hand\b/gi,
    fix: 'on the other hand',
    explanation: 'The fixed phrase is "on the other hand".',
    explanationMn: 'Тогтсон хэллэг: "on the other hand".',
  },
  {
    id: 'on-my-opinion',
    category: 'collocation',
    re: /\b(on|according to)\s+my\s+opinion\b/gi,
    fix: 'in my opinion',
    explanation: 'The fixed phrase is "in my opinion".',
    explanationMn: 'Тогтсон хэллэг: "in my opinion".',
  },
  {
    id: 'according-to-me',
    category: 'word_choice',
    re: /\baccording\s+to\s+me\b/gi,
    fix: 'in my opinion',
    explanation: '"According to" introduces what someone else says. For your own view, use "in my opinion" or "I believe".',
    explanationMn: '"According to" нь бусдын үгийг иш татахад хэрэглэгдэнэ. Өөрийн санааг "in my opinion" гэж илэрхийлнэ.',
  },
  {
    id: 'as-a-conclusion',
    category: 'collocation',
    re: /\bas\s+a\s+conclusion\b/gi,
    fix: 'in conclusion',
    explanation: 'The usual phrase is "in conclusion" (or "to sum up").',
    explanationMn: '"in conclusion" эсвэл "to sum up" гэж хэрэглэнэ.',
  },
  {
    id: 'in-nowadays',
    category: 'word_choice',
    re: /\bin\s+nowadays\b/gi,
    fix: 'nowadays',
    explanation: '"Nowadays" is an adverb — no preposition before it.',
    explanationMn: '"Nowadays"-ийн өмнө угтвар үг хэрэглэхгүй.',
  },
  {
    id: 'make-homework',
    category: 'collocation',
    re: /\b(make|makes|made|making)\s+(?:my\s+|the\s+|your\s+|our\s+)?(homework|sport|sports|exercise|housework|shopping)\b/gi,
    fix: (m: string, v: string) => m.replace(v, { make: 'do', makes: 'does', made: 'did', making: 'doing' }[v.toLowerCase()] ?? v),
    explanation: 'We DO homework, sport, exercise, housework and the shopping.',
    explanationMn: 'homework, sport, exercise-тэй "do" хэрэглэнэ.',
  },
  {
    id: 'do-mistake',
    category: 'collocation',
    re: /\b(do|does|did|doing)\s+(a\s+|the\s+|many\s+|some\s+)?(mistakes?|decisions?|progress|an effort|money|a plan)\b/gi,
    fix: (m: string, v: string) => m.replace(v, { do: 'make', does: 'makes', did: 'made', doing: 'making' }[v.toLowerCase()] ?? v),
    explanation: 'We MAKE a mistake, a decision, progress, an effort and money.',
    explanationMn: 'mistake, decision, progress-тэй "make" хэрэглэнэ.',
  },
  {
    id: 'very-extreme',
    category: 'word_choice',
    re: /\b(very)\s+(unique|perfect|excellent|amazing|fantastic|essential|impossible|enormous|terrible|delicious|exhausted|furious)\b/gi,
    fix: 'absolutely $2',
    explanation: 'Extreme adjectives (amazing, essential, exhausted) don\'t go with "very". Use "absolutely" or "really".',
    explanationMn: 'Хэт утгатай тэмдэг нэрийг "very"-тэй хэрэглэхгүй; "absolutely" хэрэглэнэ.',
  },
  {
    id: 'alot',
    category: 'spelling',
    re: /\balot\b/gi,
    fix: 'a lot',
    explanation: '"A lot" is two words.',
    explanationMn: '"a lot" хоёр тусдаа үг.',
  },
  {
    id: 'lowercase-i',
    category: 'spelling',
    re: /(^|[\s(])i(?=[\s',.!?]|$)/g,
    fix: '$1I',
    explanation: 'The pronoun "I" is always a capital letter.',
    explanationMn: '"I" төлөөний үг үргэлж том үсгээр бичигдэнэ.',
  },
  {
    id: 'repeated-word',
    category: 'spelling',
    re: /\b(?!(?:that|had)\b)(\w+)\s+\1\b/gi,
    fix: '$1',
    explanation: 'The same word is written twice.',
    explanationMn: 'Нэг үгийг давхар бичсэн байна.',
  },
  {
    id: 'space-before-punct',
    category: 'punctuation',
    re: /\s+([,.!?;:])/g,
    fix: '$1',
    explanation: 'No space before punctuation marks in English.',
    explanationMn: 'Англи хэлэнд цэг таслалын өмнө зай авахгүй.',
  },
  {
    id: 'informal-words',
    category: 'register',
    re: /\b(gonna|wanna|gotta|kids|stuff|guys|okay|awesome|cool)\b/gi,
    fix: (m: string) =>
      ({ gonna: 'going to', wanna: 'want to', gotta: 'have to', kids: 'children', stuff: 'things', guys: 'people', okay: 'acceptable', awesome: 'excellent', cool: 'good' })[m.toLowerCase()] ?? m,
    explanation: 'This word is informal. In formal or academic writing choose a neutral word.',
    explanationMn: 'Энэ үг албан бус. Албан ёсны бичвэрт төвийг сахисан үг сонгоно.',
    formalOnly: true,
  },
  {
    id: 'contractions-formal',
    category: 'register',
    re: /\b(\w+)n't\b|\b(I'm|it's|you're|we're|they're|I've|I'll|I'd|we'll|that's|there's)\b/g,
    fix: (m: string) => {
      const map: Record<string, string> = { "can't": 'cannot', "won't": 'will not', "I'm": 'I am', "it's": 'it is', "you're": 'you are', "we're": 'we are', "they're": 'they are', "I've": 'I have', "I'll": 'I will', "I'd": 'I would', "we'll": 'we will', "that's": 'that is', "there's": 'there is' };
      return map[m] ?? m.replace(/n't$/, ' not');
    },
    explanation: 'Contractions are informal. In formal writing use full forms (do not, it is).',
    explanationMn: 'Товчилсон хэлбэр албан бус. Албан бичигт бүтэн хэлбэрийг хэрэглэнэ.',
    formalOnly: true,
  },
];

const AN_EXCEPTIONS = /^(uni|use|usu|uti|ure|euro|eu|one|once|ubiq)/i;
const SILENT_H = /^(hour|honest|honou?r|heir)/i;

function needsAn(word: string): boolean {
  if (SILENT_H.test(word)) return true;
  return /^[aeiou]/i.test(word) && !AN_EXCEPTIONS.test(word);
}

function articleIssues(text: string): { original: string; suggestion: string; index: number }[] {
  const out: { original: string; suggestion: string; index: number }[] = [];
  const re = /\b(a|an)\s+([A-Za-z][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [full, art, next] = m;
    // Skip abbreviations (an MBA, a UFO) — their sound depends on the letter names.
    if (next.length > 1 && next === next.toUpperCase()) continue;
    const isAn = art.toLowerCase() === 'an';
    if (!isAn && needsAn(next)) {
      out.push({ original: full, suggestion: `${keepCase(art, 'an')} ${next}`, index: m.index });
    } else if (isAn && !needsAn(next)) {
      out.push({ original: full, suggestion: `${keepCase(art, 'a')} ${next}`, index: m.index });
    }
  }
  return out;
}

export const LINKERS: { phrase: string; level: 'B1' | 'B1+' | 'B2' | 'C1' }[] = [
  ...['because', 'so', 'but', 'also', 'first', 'then', 'finally', 'for example', 'after that'].map((phrase) => ({ phrase, level: 'B1' as const })),
  ...['however', 'although', 'in addition', 'as a result', 'on the other hand', 'in my opinion', 'for instance', 'while', 'instead'].map((phrase) => ({ phrase, level: 'B1+' as const })),
  ...['moreover', 'furthermore', 'nevertheless', 'whereas', 'consequently', 'therefore', 'despite', 'in contrast', 'to sum up', 'overall', 'in conclusion', 'even though', 'as long as', 'unless'].map((phrase) => ({ phrase, level: 'B2' as const })),
  ...['notwithstanding', 'admittedly', 'by the same token', 'that said', 'having said that', 'conversely', 'thereby', 'hence', 'in light of', 'given that', 'insofar as', 'to a large extent', 'it could be argued'].map((phrase) => ({ phrase, level: 'C1' as const })),
];

export interface WritingAnalysis {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  averageSentenceLength: number;
  longSentences: string[];
  /** Different words ÷ total words, measured over 50-word windows (0–1). */
  lexicalVariety: number;
  /** Content words repeated 3+ times (possible overuse). */
  repeatedWords: { word: string; count: number }[];
  linkersUsed: { phrase: string; level: string }[];
  targetWordsUsed: string[];
  targetWordsMissing: string[];
  issues: WritingIssue[];
  lengthStatus: 'too_short' | 'ok' | 'too_long' | 'unknown';
}

function sentenceAt(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('!', index - 1), text.lastIndexOf('?', index - 1), text.lastIndexOf('\n', index - 1)) + 1;
  const ends = ['.', '!', '?', '\n'].map((c) => text.indexOf(c, index)).filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).trim();
}

function movingTypeTokenRatio(ws: string[], window = 50): number {
  if (ws.length === 0) return 0;
  if (ws.length <= window) return new Set(ws).size / ws.length;
  let total = 0;
  let n = 0;
  for (let i = 0; i + window <= ws.length; i += 10) {
    total += new Set(ws.slice(i, i + window)).size / window;
    n++;
  }
  return total / n;
}

export interface AnalyzeOptions {
  register?: string;
  minWords?: number;
  maxWords?: number;
  targetWords?: string[];
}

export function analyzeWriting(text: string, opts: AnalyzeOptions = {}): WritingAnalysis {
  const formal = opts.register === 'formal' || opts.register === 'academic' || opts.register === 'professional';
  const issues: WritingIssue[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    if (rule.formalOnly && !formal) continue;
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    while ((m = re.exec(text))) {
      const original = m[0];
      if (!original.trim()) {
        re.lastIndex++;
        continue;
      }
      const single = new RegExp(rule.re.source, rule.re.flags.replace('g', ''));
      const suggestion =
        typeof rule.fix === 'string'
          ? original.replace(single, rule.fix)
          : original.replace(single, rule.fix as (substring: string, ...args: string[]) => string);
      const key = `${rule.id}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sentence = sentenceAt(text, m.index);
      const isAdvice = rule.advice !== undefined;
      issues.push({
        ruleId: rule.id,
        category: rule.category,
        original: original.trim(),
        suggestion: isAdvice ? rule.advice! : suggestion.trim(),
        explanation: rule.explanation,
        explanationMn: rule.explanationMn,
        sentence,
        improvedSentence: isAdvice ? sentence : sentence.replace(original.trim(), suggestion.trim()),
      });
    }
  }

  for (const a of articleIssues(text)) {
    const sentence = sentenceAt(text, a.index);
    issues.push({
      ruleId: 'article-a-an',
      category: 'grammar',
      original: a.original,
      suggestion: a.suggestion,
      explanation: 'Use "an" before a vowel sound and "a" before a consonant sound (a university, an hour).',
      explanationMn: 'Эгшиг авиаы өмнө "an", гийгүүлэгч авианы өмнө "a" хэрэглэнэ.',
      sentence,
      improvedSentence: sentence.replace(a.original, a.suggestion),
    });
  }

  const sents = sentences(text);
  for (const s of sents) {
    if (/^[a-z]/.test(s)) {
      issues.push({
        ruleId: 'sentence-capital',
        category: 'punctuation',
        original: s.split(' ')[0],
        suggestion: s[0].toUpperCase() + s.split(' ')[0].slice(1),
        explanation: 'Start every sentence with a capital letter.',
        explanationMn: 'Өгүүлбэрийг том үсгээр эхлүүлнэ.',
        sentence: s,
        improvedSentence: s[0].toUpperCase() + s.slice(1),
      });
    }
  }
  const trimmed = text.trim();
  if (trimmed && !/[.!?"')]$/.test(trimmed)) {
    const last = sents[sents.length - 1] ?? trimmed;
    issues.push({
      ruleId: 'final-punctuation',
      category: 'punctuation',
      original: last.slice(-20),
      suggestion: `${last.slice(-20)}.`,
      explanation: 'End the last sentence with a full stop (or ? / !).',
      explanationMn: 'Сүүлийн өгүүлбэрийг цэгээр төгсгөнө.',
      sentence: last,
      improvedSentence: `${last}.`,
    });
  }

  const ws = words(text);
  const wc = wordCount(text);
  const sentenceLengths = sents.map((s) => wordCount(s));
  const longSentences = sents.filter((s) => wordCount(s) > 35);

  const counts = new Map<string, number>();
  for (const w of ws) {
    if (STOPWORDS.has(w) || w.length < 4) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const repeatThreshold = wc > 250 ? 5 : 3;
  const repeatedWords = [...counts.entries()]
    .filter(([, c]) => c >= repeatThreshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));

  const lower = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const linkersUsed = LINKERS.filter((l) => new RegExp(`[^a-z]${l.phrase.replace(/ /g, '\\s+')}[^a-z]`).test(lower));

  const targets = opts.targetWords ?? [];
  const targetWordsUsed = targets.filter((w) => findWordForm(text, w) !== null);
  const targetWordsMissing = targets.filter((w) => !targetWordsUsed.includes(w));

  let lengthStatus: WritingAnalysis['lengthStatus'] = 'unknown';
  if (opts.minWords !== undefined || opts.maxWords !== undefined) {
    lengthStatus = opts.minWords !== undefined && wc < opts.minWords ? 'too_short' : opts.maxWords !== undefined && wc > opts.maxWords * 1.25 ? 'too_long' : 'ok';
  }

  return {
    wordCount: wc,
    sentenceCount: sents.length,
    paragraphCount: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
    averageSentenceLength: sentenceLengths.length ? Math.round((wc / sentenceLengths.length) * 10) / 10 : 0,
    longSentences,
    lexicalVariety: Math.round(movingTypeTokenRatio(ws) * 100) / 100,
    repeatedWords,
    linkersUsed,
    targetWordsUsed,
    targetWordsMissing,
    issues,
    lengthStatus,
  };
}

/**
 * Rough 0–100 estimate used when no AI is available (e.g. the writing part of
 * a module test). Always labelled as an automatic estimate in the UI.
 */
export function estimateWritingScore(a: WritingAnalysis, opts: { minWords?: number; targetCount?: number } = {}): number {
  const min = opts.minWords ?? 60;
  const lengthScore = Math.min(1, a.wordCount / min);
  const errorsPer100 = a.wordCount ? (a.issues.filter((i) => i.category !== 'register').length / a.wordCount) * 100 : 10;
  const accuracyScore = Math.max(0, 1 - errorsPer100 / 8);
  const cohesionScore = Math.min(1, a.linkersUsed.length / 4);
  const targetScore = opts.targetCount ? Math.min(1, a.targetWordsUsed.length / Math.min(3, opts.targetCount)) : 0.7;
  const varietyScore = Math.min(1, Math.max(0, (a.lexicalVariety - 0.45) / 0.3));
  const sentenceScore = a.averageSentenceLength >= 8 && a.averageSentenceLength <= 28 ? 1 : 0.6;
  const total =
    lengthScore * 25 + accuracyScore * 30 + cohesionScore * 15 + targetScore * 15 + varietyScore * 10 + sentenceScore * 5;
  return Math.round(a.wordCount < 10 ? Math.min(total, 10) : total);
}
