// Skill profile: rolling accuracy, adaptive difficulty and CEFR estimates per skill.

import type { DB } from '../db';
import { parseJson } from '../db';
import {
  CORE_SKILLS,
  labelFor,
  levelValue,
  overallEstimate,
  progressWithinBand,
  updateSkillEstimate,
  withDerivedSkills,
  type CoreSkill,
  type EvidenceSource,
  type Skill,
} from '@shared/cefr';
import { difficultyDecision, updateAccuracy, type DifficultyAction, type SkillStat } from '@shared/adaptive';
import { toDateKey } from '@shared/streak';
import type { ErrorCategory } from '@shared/writingChecker';
import { upsertError } from './errors';

export interface ResponseInput {
  questionId?: string | null;
  skill: string;
  qtype: string;
  tag?: string | null;
  level?: string | null;
  difficulty?: number | null;
  correct: boolean;
  score: number;
  /** For the mistakes notebook: the learner's version and the correct version. */
  wrong?: string | null;
  right?: string | null;
  explanation?: string | null;
  explanationMn?: string | null;
  errorCategory?: ErrorCategory | null;
}

interface ProfileRow {
  skill: string;
  score: number;
  accuracy: number | null;
  responses: number;
  difficulty: number;
  provisional: number;
}

export function profileRows(db: DB, userId: number): ProfileRow[] {
  return db.prepare('SELECT skill, score, accuracy, responses, difficulty, provisional FROM skill_profile WHERE user_id = ?').all(userId) as ProfileRow[];
}

export function skillStats(db: DB, userId: number): SkillStat[] {
  const rows = new Map(profileRows(db, userId).map((r) => [r.skill, r]));
  return CORE_SKILLS.map((skill) => {
    const r = rows.get(skill);
    return { skill, accuracy: r?.accuracy ?? null, responses: r?.responses ?? 0, estimate: r?.score ?? levelValue('B1') };
  });
}

export function skillProfile(db: DB, userId: number) {
  const rows = profileRows(db, userId);
  const scores: Partial<Record<Skill, number>> = {};
  for (const r of rows) scores[r.skill as Skill] = r.score;
  const all = withDerivedSkills(scores);
  const overall = overallEstimate(all);
  const byName = new Map(rows.map((r) => [r.skill, r]));
  return {
    overall: { score: overall, label: labelFor(overall), progress: progressWithinBand(overall) },
    skills: (Object.keys(all) as Skill[]).map((skill) => {
      const r = byName.get(skill);
      return {
        skill,
        score: all[skill],
        label: labelFor(all[skill]),
        progress: progressWithinBand(all[skill]),
        accuracy: r?.accuracy ?? null,
        responses: r?.responses ?? 0,
        difficulty: r?.difficulty ?? null,
        provisional: r ? !!r.provisional : false,
        derived: !r,
      };
    }),
  };
}

const ERROR_SKILLS = new Set(['grammar', 'vocabulary', 'writing', 'pronunciation']);

function categoryFor(r: ResponseInput): ErrorCategory {
  if (r.errorCategory) return r.errorCategory;
  if (r.tag === 'collocation') return 'collocation';
  if (r.tag === 'word_choice' || r.tag === 'register') return 'word_choice';
  if (r.skill === 'pronunciation') return 'pronunciation';
  if (r.skill === 'vocabulary') return 'vocabulary';
  if (r.qtype === 'words') return 'sentence_structure';
  return 'grammar';
}

/** Store answered questions, update rolling accuracy and collect mistakes. */
export function recordResponses(
  db: DB,
  userId: number,
  ctx: { type: string; id?: string | null; attemptId?: number | null },
  responses: ResponseInput[],
  now: Date,
): void {
  if (!responses.length) return;
  db.transaction(() => {
    const ins = db.prepare(
      `INSERT INTO question_responses (user_id, attempt_id, question_id, context_type, context_id, skill, qtype, tag, cefr_level, difficulty, correct, score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of responses) {
      ins.run(userId, ctx.attemptId ?? null, r.questionId ?? null, ctx.type, ctx.id ?? null, r.skill, r.qtype, r.tag ?? null, r.level ?? null, r.difficulty ?? null, r.correct ? 1 : 0, Math.max(0, Math.min(1, r.score)), now.toISOString());
    }

    const bySkill = new Map<string, number[]>();
    for (const r of responses) bySkill.set(r.skill, [...(bySkill.get(r.skill) ?? []), r.score]);
    for (const [skill, scores] of bySkill) {
      const share = scores.reduce((a, b) => a + b, 0) / scores.length;
      const row = db.prepare('SELECT accuracy, responses FROM skill_profile WHERE user_id = ? AND skill = ?').get(userId, skill) as
        | { accuracy: number | null; responses: number }
        | undefined;
      if (!row) continue;
      const weight = Math.min(0.4, 0.06 * scores.length);
      const acc = updateAccuracy(row.accuracy, share, weight);
      db.prepare('UPDATE skill_profile SET accuracy = ?, responses = responses + ?, updated_at = ? WHERE user_id = ? AND skill = ?').run(
        Math.round(acc * 1000) / 1000,
        scores.length,
        now.toISOString(),
        userId,
        skill,
      );
    }

    for (const r of responses) {
      if (r.correct || !ERROR_SKILLS.has(r.skill) || !r.right) continue;
      upsertError(
        db,
        userId,
        {
          category: categoryFor(r),
          key: r.questionId ? `q:${r.questionId}` : `t:${(r.wrong ?? '').toLowerCase().slice(0, 80)}=>${r.right.toLowerCase().slice(0, 80)}`,
          wrong: r.wrong ?? '—',
          correct: r.right,
          explanation: r.explanation ?? null,
          explanationMn: r.explanationMn ?? null,
          source: ctx.type,
          sourceRef: ctx.id ?? null,
        },
        now,
      );
    }
  })();
}

/** Move a skill's CEFR estimate with assessment evidence. */
export function applyEvidence(db: DB, userId: number, skill: string, materialLevel: string, percent: number, source: EvidenceSource, now: Date): number | null {
  const row = db.prepare('SELECT score FROM skill_profile WHERE user_id = ? AND skill = ?').get(userId, skill) as { score: number } | undefined;
  if (!row) return null;
  let level: number;
  try {
    level = levelValue(materialLevel);
  } catch {
    return row.score;
  }
  const next = updateSkillEstimate(row.score, level, percent, source);
  db.prepare('UPDATE skill_profile SET score = ?, provisional = 0, updated_at = ? WHERE user_id = ? AND skill = ?').run(
    Math.round(next * 1000) / 1000,
    now.toISOString(),
    userId,
    skill,
  );
  snapshot(db, userId, now);
  return next;
}

export function setSkillScore(db: DB, userId: number, skill: string, score: number, provisional: boolean, now: Date): void {
  db.prepare(
    `INSERT INTO skill_profile (user_id, skill, score, provisional, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, skill) DO UPDATE SET score = excluded.score, provisional = excluded.provisional, updated_at = excluded.updated_at`,
  ).run(userId, skill, Math.round(score * 1000) / 1000, provisional ? 1 : 0, now.toISOString());
}

/** Adaptive difficulty after a scored activity (lesson quiz, test section, game). */
export function adaptDifficulty(db: DB, userId: number, skill: string, percent: number, now: Date): DifficultyAction | null {
  const row = db.prepare('SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = ?').get(userId, skill) as { difficulty: number } | undefined;
  if (!row) return null;
  const d = difficultyDecision(Math.round(row.difficulty), percent);
  db.prepare('UPDATE skill_profile SET difficulty = ?, updated_at = ? WHERE user_id = ? AND skill = ?').run(d.next, now.toISOString(), userId, skill);
  return d.action;
}

/** Daily snapshot of CEFR estimates (for progress charts). */
export function snapshot(db: DB, userId: number, now: Date): void {
  const rows = profileRows(db, userId);
  const scores: Partial<Record<Skill, number>> = {};
  for (const r of rows) scores[r.skill as Skill] = r.score;
  const overall = overallEstimate(withDerivedSkills(scores));
  db.prepare(
    `INSERT INTO cefr_snapshots (user_id, date, overall, skills) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET overall = excluded.overall, skills = excluded.skills`,
  ).run(userId, toDateKey(now), Math.round(overall * 1000) / 1000, JSON.stringify(scores));
}

export function snapshots(db: DB, userId: number, sinceDate: string): { date: string; overall: number; skills: Record<string, number> }[] {
  return (db.prepare('SELECT date, overall, skills FROM cefr_snapshots WHERE user_id = ? AND date >= ? ORDER BY date').all(userId, sinceDate) as {
    date: string;
    overall: number;
    skills: string;
  }[]).map((r) => ({ date: r.date, overall: r.overall, skills: parseJson(r.skills, {}) }));
}

export type { CoreSkill };
