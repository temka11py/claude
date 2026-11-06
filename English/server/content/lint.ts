// Pedagogical quality checks that go beyond schema validation.

import type { ModuleDoc, Question, ReadingMaterial, ListeningMaterial } from '@shared/contentSchema';
import { findWordForm, wordCount } from '@shared/text';

export interface LintIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

const READING_WORDS: Record<string, [number, number]> = {
  B1: [150, 450],
  'B1+': [220, 550],
  B2: [300, 750],
  'B2+': [380, 850],
  C1: [450, 1100],
};

function lintQuestions(questions: Question[], path: string, out: LintIssue[]): void {
  questions.forEach((q, i) => {
    const p = `${path}[${i}]`;
    if (q.type === 'mcq') {
      // Case-sensitive on purpose: stress questions differ only in capitals ("TRAFfic jam" vs "traffic JAM").
      const opts = q.options.map((o) => o.trim());
      if (new Set(opts).size !== opts.length) out.push({ severity: 'error', path: p, message: 'duplicate options' });
    }
    if (q.type === 'gap' && (q.prompt.match(/___/g) ?? []).length > 1) {
      out.push({ severity: 'warning', path: p, message: 'gap question has more than one blank' });
    }
    if (q.type === 'match') {
      const rights = q.pairs.map((pr) => pr[1].toLowerCase());
      if (new Set(rights).size !== rights.length) {
        // Duplicate right-hand sides make matching ambiguous unless identical pairs.
        out.push({ severity: 'warning', path: p, message: 'match has duplicate right-hand items' });
      }
    }
  });
}

function lintReading(r: ReadingMaterial, level: string, path: string, out: LintIssue[]): void {
  const wc = wordCount(r.text.join(' '));
  const [min, max] = READING_WORDS[level] ?? [100, 1200];
  if (wc < min * 0.8 || wc > max * 1.2) out.push({ severity: 'warning', path, message: `reading has ${wc} words (expected about ${min}–${max} for ${level})` });
  const tags = new Set(r.questions.map((q) => q.tag).filter(Boolean));
  if (!tags.has('main_idea')) out.push({ severity: 'warning', path, message: 'reading has no main_idea question' });
  const types = new Set(r.questions.map((q) => q.type));
  if (types.size < 2) out.push({ severity: 'warning', path, message: 'reading uses only one question type' });
  lintQuestions(r.questions, `${path}.questions`, out);
}

function lintListening(l: ListeningMaterial, path: string, out: LintIssue[]): void {
  if (l.lines.length < 4) out.push({ severity: 'warning', path, message: 'listening script is very short' });
  lintQuestions([...l.gist, ...l.detail], `${path}.questions`, out);
}

export function lintModule(doc: ModuleDoc): LintIssue[] {
  const out: LintIssue[] = [];
  const seenWords = new Map<string, string>();

  doc.lessons.forEach((l, li) => {
    const lp = `lessons[${li}] (${l.id})`;
    if (l.vocabulary.length > 0 && (l.vocabulary.length < 6 || l.vocabulary.length > 15)) {
      out.push({ severity: 'warning', path: lp, message: `${l.vocabulary.length} vocabulary items (aim for 8–15)` });
    }
    l.vocabulary.forEach((v, vi) => {
      const vp = `${lp}.vocabulary[${vi}] "${v.word}"`;
      const key = v.word.toLowerCase();
      if (seenWords.has(key)) out.push({ severity: 'warning', path: vp, message: `word also taught in ${seenWords.get(key)}` });
      seenWords.set(key, l.id);
      const found = v.examples.some((ex) => findWordForm(ex, v.word));
      if (!found) out.push({ severity: 'warning', path: vp, message: 'no example sentence contains the word (cloze exercises will be skipped)' });
      if (v.examples.length < 2) out.push({ severity: 'warning', path: vp, message: 'only one example sentence' });
    });
    if (l.reading) lintReading(l.reading, doc.level, `${lp}.reading`, out);
    if (l.listening) lintListening(l.listening, `${lp}.listening`, out);
    lintQuestions(l.quiz, `${lp}.quiz`, out);
    lintQuestions(l.warmup.questions, `${lp}.warmup`, out);
    if (l.quiz.length < 4) out.push({ severity: 'warning', path: lp, message: 'lesson quiz has fewer than 4 questions' });
  });

  doc.grammar.forEach((g, gi) => {
    lintQuestions([...g.guided, ...g.free], `grammar[${gi}] (${g.id})`, out);
  });

  if (!doc.test) {
    out.push({ severity: 'warning', path: 'test', message: 'module has no test — a test is required before the module can be completed' });
  } else {
    lintReading(doc.test.reading, doc.level, 'test.reading', out);
    lintListening(doc.test.listening, 'test.listening', out);
    lintQuestions(doc.test.questions, 'test.questions', out);
  }
  return out;
}
