import { describe, expect, it } from 'vitest';
import { question, type Question } from '@shared/contentSchema';
import { checkAnswer, stripAnswer, weightedPercent } from '@shared/scoring';
import { diffWords } from '@shared/textDiff';
import { findWordForm, normalizeAnswer } from '@shared/text';

const q = (data: unknown) => question.parse(data) as Question;

describe('answer normalisation', () => {
  it('ignores case, punctuation and contractions', () => {
    expect(normalizeAnswer('I do not agree.')).toBe(normalizeAnswer("i don't agree"));
    expect(normalizeAnswer('He has gone home!')).toBe(normalizeAnswer("He's gone home"));
    expect(normalizeAnswer('I have to go')).not.toBe(normalizeAnswer("I've to go"));
  });

  it('finds inflected word forms in sentences', () => {
    expect(findWordForm('She made two decisions yesterday.', 'decision')).toBe('decisions');
    expect(findWordForm('We are making progress.', 'make')).toBe('making');
    expect(findWordForm('I have to meet a deadline.', 'meet a deadline')).toBe('meet a deadline');
    expect(findWordForm('Nothing here.', 'deadline')).toBeNull();
  });

  it('finds inflected phrasal verbs, irregular forms and optional parts', () => {
    expect(findWordForm('I am looking forward to the weekend.', 'look forward to')).toBe('looking forward to');
    expect(findWordForm('We took turns cooking.', 'take turns')).toBe('took turns');
    expect(findWordForm('I overslept again today.', 'oversleep')).toBe('overslept');
    expect(findWordForm('I get along well with my flatmates.', 'get along (with)')).toBe('get along');
    expect(findWordForm('She is getting along with them.', 'get along')).toBe('getting along');
    expect(findWordForm('He stopped smoking.', 'stop')).toBe('stopped');
    expect(findWordForm('She studied hard.', 'study')).toBe('studied');
    expect(findWordForm('They kept in touch for years.', 'keep in touch')).toBe('kept in touch');
  });
});

describe('checkAnswer', () => {
  it('scores multiple choice and true/false/not given', () => {
    const mcq = q({ type: 'mcq', prompt: 'Pick', options: ['a', 'b', 'c'], answer: 1 });
    expect(checkAnswer(mcq, 1).correct).toBe(true);
    expect(checkAnswer(mcq, 0).correct).toBe(false);
    const tf = q({ type: 'tfng', prompt: 'S', answer: 'not_given' });
    expect(checkAnswer(tf, 'not_given').score).toBe(1);
  });

  it('accepts equivalent typed answers and gives half credit for a small slip', () => {
    const gap = q({ type: 'gap', prompt: 'I have lived here ___ 2019.', answers: ['since'] });
    expect(checkAnswer(gap, ' Since ').correct).toBe(true);
    const corr = q({ type: 'correct', prompt: 'Fix it', sentence: 'I am agree with you.', answers: ['I agree with you.'] });
    expect(checkAnswer(corr, 'i agree with you').correct).toBe(true);
    const almost = checkAnswer(corr, 'I agre with you.');
    expect(almost.correct).toBe(false);
    expect(almost.feedback).toBe('almost');
    expect(almost.score).toBe(0.5);
  });

  it('requires the keyword in transformations', () => {
    const t = q({ type: 'transform', prompt: 'Use SINCE', sentence: 'I started working here three years ago.', keyword: 'since', answers: ['I have worked here since three years ago.', 'I have been working here since three years ago.'] });
    expect(checkAnswer(t, 'I have worked here for three years.').score).toBe(0);
    expect(checkAnswer(t, "I've been working here since three years ago").correct).toBe(true);
  });

  it('matches short answers by keywords', () => {
    const s = q({ type: 'short', prompt: 'Why did she move?', answers: ['to find a better job'] });
    expect(checkAnswer(s, 'Because she wanted to find a better-paid job').correct).toBe(false);
    expect(checkAnswer(s, 'She wanted to find a better job there').correct).toBe(true);
  });

  it('gives partial credit for ordering, matching and summaries', () => {
    const o = q({ type: 'order', prompt: 'Order', items: ['one', 'two', 'three', 'four'] });
    expect(checkAnswer(o, ['one', 'two', 'four', 'three']).score).toBe(0.5);
    const m = q({ type: 'match', prompt: 'Match', pairs: [['make', 'a decision'], ['meet', 'a deadline'], ['gain', 'experience']] });
    expect(checkAnswer(m, ['a decision', 'experience', 'a deadline']).score).toBeCloseTo(1 / 3);
    const s = q({ type: 'summary', prompt: 'Fill', text: 'Prices {1} because demand {2}.', bank: ['rose', 'fell', 'grew'], answers: ['rose', 'grew'] });
    expect(checkAnswer(s, ['rose', 'fell']).score).toBe(0.5);
  });

  it('checks word-order questions', () => {
    const w = q({ type: 'words', prompt: 'Build', answer: 'She has never been to Japan', alternatives: ['She has been to Japan never'] });
    expect(checkAnswer(w, ['She', 'has', 'never', 'been', 'to', 'Japan']).correct).toBe(true);
    expect(checkAnswer(w, 'She never has been to Japan').correct).toBe(false);
  });

  it('strips answers for graded tests', () => {
    const mcq = q({ type: 'mcq', prompt: 'Pick', options: ['a', 'b'], answer: 1, explanation: 'because' });
    const stripped = stripAnswer(mcq);
    expect(stripped).not.toHaveProperty('answer');
    expect(stripped).not.toHaveProperty('explanation');
    const w = stripAnswer(q({ type: 'words', prompt: 'Build', answer: 'b a c' }));
    expect(w).not.toHaveProperty('answer');
    expect(w.tiles).toEqual(['a', 'b', 'c']);
  });

  it('computes weighted section percentages, skipping unscored sections', () => {
    expect(weightedPercent([{ weight: 20, percent: 1 }, { weight: 20, percent: 0.5 }, { weight: 10, percent: null }])).toBeCloseTo(0.75);
  });
});

describe('dictation diff', () => {
  it('highlights missing, wrong and misspelled words', () => {
    const d = diffWords('I have been working here for three years.', 'I have ben working for tree years');
    const kinds = d.tokens.map((t) => t.kind);
    expect(kinds).toContain('spelling');
    expect(kinds).toContain('missing');
    expect(d.counts.missing).toBe(1);
    expect(d.accuracy).toBeLessThan(1);
    expect(diffWords('Hello there.', 'hello there').accuracy).toBe(1);
  });

  it('flags extra words', () => {
    const d = diffWords('She lives in Paris.', 'She really lives in Paris');
    expect(d.counts.extra).toBe(1);
  });
});
