import { describe, expect, it } from 'vitest';
import { bandFor, courseLevelFor, labelFor, levelValue, overallEstimate, progressWithinBand, updateSkillEstimate } from '@shared/cefr';
import { estimateFromItems, summarizePlacement } from '@shared/placement';

describe('CEFR scale', () => {
  it('maps scores to bands and borderline labels', () => {
    expect(bandFor(2.3).label).toBe('B1');
    expect(labelFor(2.3)).toBe('B1');
    expect(labelFor(1.95)).toBe('A2+/B1');
    expect(labelFor(4.0)).toBe('C1');
    expect(progressWithinBand(2.25)).toBeCloseTo(0.5);
  });

  it('chooses the course level from the overall score', () => {
    expect(courseLevelFor(1.4)).toBe('B1');
    expect(courseLevelFor(2.6)).toBe('B1+');
    expect(courseLevelFor(3.2)).toBe('B2');
    expect(courseLevelFor(4.8)).toBe('C1');
  });

  it('raises estimates with strong evidence and does not lower them for easy material done well', () => {
    const b2 = levelValue('B2');
    expect(updateSkillEstimate(2.0, b2, 0.95, 'module_test')).toBeGreaterThan(2.0);
    // A B2 learner scoring 85% on B1 material stays B2.
    expect(updateSkillEstimate(3.0, levelValue('B1'), 0.85, 'module_test')).toBe(3.0);
    // Clearly weak performance lowers it.
    expect(updateSkillEstimate(3.0, b2, 0.3, 'level_exam')).toBeLessThan(3.0);
  });

  it('weighs vocabulary slightly more in the overall estimate', () => {
    const o = overallEstimate({ grammar: 3, vocabulary: 2, reading: 3, listening: 3, speaking: 3, writing: 3 });
    expect(o).toBeLessThan(3);
    expect(o).toBeGreaterThan(2.7);
  });
});

describe('placement scoring', () => {
  it('estimates between the last passed level and the next', () => {
    const items = [
      ...Array(5).fill({ level: 'A2', score: 1 }),
      ...Array(5).fill({ level: 'B1', score: 0.8 }),
      ...Array(5).fill({ level: 'B2', score: 0.4 }),
      ...Array(5).fill({ level: 'C1', score: 0.2 }),
    ];
    const est = estimateFromItems(items)!;
    expect(est).toBeGreaterThan(2.0);
    expect(est).toBeLessThan(3.0);
  });

  it('gives a low estimate when even easy items are missed', () => {
    const est = estimateFromItems([
      { level: 'A2', score: 0.3 },
      { level: 'A2', score: 0.2 },
      { level: 'B1', score: 0 },
    ])!;
    expect(est).toBeLessThan(1);
  });

  it('builds a profile, flags untested skills and explains uneven skills', () => {
    const s = summarizePlacement({ grammar: 2.6, vocabulary: 1.8, reading: 2.5, listening: 2.0, writing: 2.1, speaking: null });
    expect(s.provisional).toContain('speaking');
    expect(s.labels.grammar).toBe('B1+');
    expect(s.notes.join(' ')).toMatch(/grammar is ahead of your vocabulary/);
    expect(['B1', 'B1+']).toContain(s.startLevel);
  });
});
