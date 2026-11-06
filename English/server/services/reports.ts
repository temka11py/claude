// Weekly and monthly reports, the knowledge map and analytics — all computed
// from the learner's recorded activity.

import type { DB } from '../db';
import { parseJson } from '../db';
import { CORE_SKILLS, COURSE_LEVELS, labelFor, levelValue, type CoreSkill } from '@shared/cefr';
import { buildWeeklyFocus, strongSkills, weakSkills } from '@shared/adaptive';
import { studyDaysPerWeek } from '@shared/timeline';
import { toDateKey } from '@shared/streak';
import { skillProfile, skillStats, snapshots } from './skills';
import { getSettings } from './users';
import { errorStats, listErrors } from './errors';
import { roadmap } from './course';
import { weekStart } from './focus';

function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toDateKey(dt);
}

function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function isoStart(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

function accuracyBySkill(db: DB, userId: number, fromIso: string, toIso: string) {
  const rows = db
    .prepare(`SELECT skill, COUNT(*) AS n, AVG(score) AS acc FROM question_responses WHERE user_id = ? AND created_at >= ? AND created_at < ? GROUP BY skill`)
    .all(userId, fromIso, toIso) as { skill: string; n: number; acc: number }[];
  return Object.fromEntries(rows.map((r) => [r.skill, { answered: r.n, accuracy: r.acc }])) as Record<string, { answered: number; accuracy: number }>;
}

function dailyMinutes(db: DB, userId: number, from: string, to: string) {
  const rows = db.prepare('SELECT date, minutes, xp, activities FROM study_days WHERE user_id = ? AND date >= ? AND date <= ?').all(userId, from, to) as {
    date: string;
    minutes: number;
    xp: number;
    activities: number;
  }[];
  const by = new Map(rows.map((r) => [r.date, r]));
  return range(from, to).map((date) => ({ date, minutes: Math.round(by.get(date)?.minutes ?? 0), xp: by.get(date)?.xp ?? 0, studied: (by.get(date)?.activities ?? 0) > 0 }));
}

const SKILL_TITLE: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  reading: 'Reading',
  listening: 'Listening',
  speaking: 'Speaking',
  writing: 'Writing',
  pronunciation: 'Pronunciation',
};

export function weeklyReport(db: DB, userId: number, weekKey: string) {
  const from = weekKey;
  const to = addDays(weekKey, 6);
  const fromIso = isoStart(from);
  const toIso = isoStart(addDays(to, 1));
  const days = dailyMinutes(db, userId, from, to);
  const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).pluck().get(userId, ...p) as number) ?? 0;

  const lessons = db
    .prepare(
      `SELECT l.id, l.title, l.grammar_topic_id AS grammarId, p.score FROM user_progress p JOIN lessons l ON l.id = p.lesson_id
       WHERE p.user_id = ? AND p.completed_at >= ? AND p.completed_at < ?`,
    )
    .all(userId, fromIso, toIso) as { id: string; title: string; grammarId: string | null; score: number }[];
  const grammarTopics = lessons.filter((l) => l.grammarId).map((l) => (db.prepare('SELECT title FROM grammar_topics WHERE id = ?').pluck().get(l.grammarId) as string) ?? l.grammarId!);

  const newWords = count('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_seen_at >= ? AND first_seen_at < ?', fromIso, toIso);
  const stillFragile = count(
    `SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_seen_at >= ? AND first_seen_at < ? AND (state IN ('LEARNING', 'REVIEW') OR lapses > 0)`,
    fromIso,
    toIso,
  );
  const learned = count('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_learned_at >= ? AND first_learned_at < ?', fromIso, toIso);
  const mastered = count(`SELECT COUNT(DISTINCT vocab_id) FROM vocabulary_reviews WHERE user_id = ? AND state_after = 'MASTERED' AND reviewed_at >= ? AND reviewed_at < ?`, fromIso, toIso);
  const reviews = count('SELECT COUNT(*) FROM vocabulary_reviews WHERE user_id = ? AND reviewed_at >= ? AND reviewed_at < ?', fromIso, toIso);
  const speaking = db
    .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(duration_sec), 0) AS secs FROM speaking_attempts WHERE user_id = ? AND created_at >= ? AND created_at < ?')
    .get(userId, fromIso, toIso) as { n: number; secs: number };
  const writing = db
    .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(word_count), 0) AS words, AVG(score) AS avg FROM writing_submissions WHERE user_id = ? AND created_at >= ? AND created_at < ?')
    .get(userId, fromIso, toIso) as { n: number; words: number; avg: number | null };
  const acc = accuracyBySkill(db, userId, fromIso, toIso);
  const answered = Object.values(acc).reduce((a, s) => a + s.answered, 0);
  const overallAccuracy = answered ? Object.values(acc).reduce((a, s) => a + s.accuracy * s.answered, 0) / answered : null;
  const stats = skillStats(db, userId);
  const weak = weakSkills(stats);
  const strong = strongSkills(stats);
  const focus = buildWeeklyFocus(stats);
  const settings = getSettings(db, userId);
  const minutes = days.reduce((a, d) => a + d.minutes, 0);
  const studied = days.filter((d) => d.studied).length;

  const highlights: string[] = [];
  if (newWords) {
    highlights.push(
      stillFragile
        ? `You met ${newWords} new words this week, but ${stillFragile} still require frequent review.`
        : `You met ${newWords} new words this week and all of them are holding up well.`,
    );
  }
  if (acc.listening && acc.reading && acc.reading.accuracy - acc.listening.accuracy >= 0.1) {
    highlights.push(`Reading accuracy (${Math.round(acc.reading.accuracy * 100)}%) is ahead of listening (${Math.round(acc.listening.accuracy * 100)}%).`);
  }
  if (!minutes) highlights.push('No study recorded this week. That is fine — your progress is saved and you can continue where you left off.');

  return {
    weekStart: from,
    weekEnd: to,
    minutes,
    studyDays: studied,
    plannedStudyDays: Math.round(studyDaysPerWeek(settings.schedule)),
    days,
    lessonsCompleted: lessons.length,
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, score: l.score })),
    grammarTopics: [...new Set(grammarTopics)],
    words: { new: newWords, learned, mastered, stillFragile, reviews },
    speaking: { attempts: speaking.n, minutes: Math.round(speaking.secs / 6) / 10 },
    writing: { submissions: writing.n, words: writing.words, averageScore: writing.avg },
    accuracy: { overall: overallAccuracy, bySkill: acc, answered },
    strong: strong.map((s) => SKILL_TITLE[s]),
    weak: weak.map((s) => SKILL_TITLE[s]),
    highlights,
    nextWeek: focus.messages.length ? focus.messages : ['Keep your current rhythm: review first, then new lessons, then a little speaking.'],
  };
}

export function monthlyReport(db: DB, userId: number, month: string) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = toDateKey(new Date(y, m, 0));
  const fromIso = isoStart(from);
  const toIso = isoStart(addDays(to, 1));
  const settings = getSettings(db, userId);
  const days = dailyMinutes(db, userId, from, to);
  const snaps = snapshots(db, userId, addDays(from, -1)).filter((s) => s.date <= to);
  const profile = skillProfile(db, userId);
  const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).pluck().get(userId, ...p) as number) ?? 0;

  // Weekly accuracy series per skill.
  const weeks: { weekStart: string; bySkill: Record<string, number | null> }[] = [];
  for (let w = weekStart(new Date(y, m - 1, 1)); w <= to; w = addDays(w, 7)) {
    const acc = accuracyBySkill(db, userId, isoStart(w), isoStart(addDays(w, 7)));
    weeks.push({ weekStart: w, bySkill: Object.fromEntries(CORE_SKILLS.map((s) => [s, acc[s]?.accuracy ?? null])) });
  }

  const learnedTotal = count('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_learned_at IS NOT NULL');
  const vocabScore = profile.skills.find((s) => s.skill === 'vocabulary')?.score ?? levelValue('B1');
  // Typical word-family knowledge by CEFR band (rough research-based ranges).
  const bands: [number, number, number][] = [
    [1, 1000, 1500],
    [1.5, 1500, 2000],
    [2, 2000, 2750],
    [2.5, 2750, 3250],
    [3, 3250, 4000],
    [3.5, 4000, 5000],
    [4, 5000, 6500],
  ];
  const band = [...bands].reverse().find((b) => vocabScore >= b[0]) ?? bands[0];

  const map = roadmap(db, userId);
  const unlocked = map.filter((l) => l.status !== 'locked');
  const topicIds = unlocked.flatMap((l) => l.modules.filter((mo) => mo.state !== 'planned').map((mo) => mo.id));
  const totalTopics = topicIds.length
    ? (db.prepare(`SELECT COUNT(*) FROM grammar_topics WHERE module_id IN (${topicIds.map(() => '?').join(',')})`).pluck().get(...topicIds) as number)
    : 0;
  const studiedTopics = count(
    `SELECT COUNT(DISTINCT l.grammar_topic_id) FROM user_progress p JOIN lessons l ON l.id = p.lesson_id WHERE p.user_id = ? AND p.status = 'completed' AND l.grammar_topic_id IS NOT NULL`,
  );

  const acc = accuracyBySkill(db, userId, fromIso, toIso);
  const scheduled = Math.round((days.length / 7) * studyDaysPerWeek(settings.schedule));
  const studiedDays = days.filter((d) => d.studied).length;
  const errors = errorStats(db, userId);
  const topErrors = listErrors(db, userId, { status: 'open' }).slice(0, 5);
  const stats = skillStats(db, userId);
  const first = snaps[0];
  const last = snaps[snaps.length - 1];

  return {
    month,
    from,
    to,
    days,
    minutes: days.reduce((a, d) => a + d.minutes, 0),
    cefr: {
      series: snaps.map((s) => ({ date: s.date, overall: s.overall, ...s.skills })),
      start: first ? { overall: first.overall, label: labelFor(first.overall) } : null,
      end: last ? { overall: last.overall, label: labelFor(last.overall) } : { overall: profile.overall.score, label: profile.overall.label },
      current: profile,
    },
    vocabulary: {
      learnedInApp: learnedTotal,
      learnedThisMonth: count('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_learned_at >= ? AND first_learned_at < ?', fromIso, toIso),
      estimatedSize: { low: band[1], high: band[2], basis: `Rough estimate for a ${labelFor(vocabScore)} vocabulary level` },
      forgotten: count(`SELECT COUNT(*) FROM vocabulary_reviews WHERE user_id = ? AND grade = 'again' AND interval_before >= 7 AND reviewed_at >= ? AND reviewed_at < ?`, fromIso, toIso),
    },
    grammar: { studiedTopics, totalTopics, accuracy: acc.grammar?.accuracy ?? null },
    reading: { accuracy: acc.reading?.accuracy ?? null, answered: acc.reading?.answered ?? 0 },
    listening: { accuracy: acc.listening?.accuracy ?? null, answered: acc.listening?.answered ?? 0 },
    speaking: {
      attempts: count('SELECT COUNT(*) FROM speaking_attempts WHERE user_id = ? AND created_at >= ? AND created_at < ?', fromIso, toIso),
      conversations: count(`SELECT COUNT(*) FROM ai_threads WHERE user_id = ? AND mode = 'conversation' AND created_at >= ? AND created_at < ?`, fromIso, toIso),
    },
    writing: {
      submissions: count('SELECT COUNT(*) FROM writing_submissions WHERE user_id = ? AND created_at >= ? AND created_at < ?', fromIso, toIso),
      averageScore: db.prepare('SELECT AVG(score) FROM writing_submissions WHERE user_id = ? AND created_at >= ? AND created_at < ?').pluck().get(userId, fromIso, toIso) as number | null,
    },
    consistency: { studiedDays, scheduledDays: scheduled, ratio: scheduled ? Math.min(1, studiedDays / scheduled) : 0 },
    weeks,
    mistakes: { byCategory: errors.byCategory, resolved: errors.resolved, top: topErrors.map((e) => ({ wrong: e.wrong, correct: e.correct, occurrences: e.occurrences, category: e.category })) },
    recommendedFocus: buildWeeklyFocus(stats).messages,
    weakSkills: weakSkills(stats).map((s) => SKILL_TITLE[s]),
  };
}

/** Tree of the learner's knowledge: level → skill → topic with mastery percentages. */
export function knowledgeMap(db: DB, userId: number) {
  const map = roadmap(db, userId);
  const settings = getSettings(db, userId);
  const currentIdx = COURSE_LEVELS.indexOf(settings.courseLevel);
  return map
    .filter((l) => COURSE_LEVELS.indexOf(l.code) <= currentIdx + 1)
    .map((level) => {
      const moduleIds = level.modules.filter((m) => m.state !== 'planned').map((m) => m.id);
      const inList = moduleIds.map(() => '?').join(',') || "''";
      const topics = db.prepare(`SELECT id, title FROM grammar_topics WHERE module_id IN (${inList}) ORDER BY module_id`).all(...moduleIds) as { id: string; title: string }[];
      const grammar = topics.map((t) => {
        const r = db
          .prepare(
            `SELECT COUNT(*) AS n, AVG(r.score) AS acc FROM question_responses r
             WHERE r.user_id = ? AND r.question_id IN (SELECT id FROM quiz_questions WHERE owner_id = ? AND owner_type IN ('grammar_guided', 'grammar_free'))`,
          )
          .get(userId, t.id) as { n: number; acc: number | null };
        const lessonDone = (db
          .prepare(`SELECT COUNT(*) FROM lessons l JOIN user_progress p ON p.lesson_id = l.id AND p.user_id = ? WHERE l.grammar_topic_id = ? AND p.status = 'completed'`)
          .pluck()
          .get(userId, t.id) as number) > 0;
        return { id: t.id, title: t.title, mastery: r.n ? r.acc : null, answered: r.n, studied: lessonDone };
      });
      const vocabulary = level.modules
        .filter((m) => m.state !== 'planned')
        .map((m) => {
          const r = db
            .prepare(
              `SELECT COUNT(*) AS total,
                 SUM(CASE WHEN uv.state = 'MASTERED' THEN 1.0 WHEN uv.state = 'FAMILIAR' THEN 0.75 WHEN uv.state IN ('LEARNING', 'REVIEW') THEN 0.35 ELSE 0 END) AS score,
                 SUM(CASE WHEN uv.vocab_id IS NOT NULL THEN 1 ELSE 0 END) AS seen
               FROM vocabulary v LEFT JOIN user_vocab uv ON uv.vocab_id = v.id AND uv.user_id = ?
               WHERE v.module_id = ? AND v.owner_user_id IS NULL`,
            )
            .get(userId, m.id) as { total: number; score: number | null; seen: number };
          return { id: m.id, title: m.topic, module: m.title, mastery: r.total ? (r.score ?? 0) / r.total : 0, seen: r.seen, total: r.total };
        });
      const levelCodes = level.code === 'B1' ? ['A2', 'A2+', 'B1'] : [level.code];
      const skillAcc = (skill: string) => {
        const r = db
          .prepare(`SELECT COUNT(*) AS n, AVG(score) AS acc FROM question_responses WHERE user_id = ? AND skill = ? AND cefr_level IN (${levelCodes.map(() => '?').join(',')}) AND context_type != 'placement'`)
          .get(userId, skill, ...levelCodes) as { n: number; acc: number | null };
        return { mastery: r.n ? r.acc : null, answered: r.n };
      };
      const productive = (table: 'speaking_attempts' | 'writing_submissions', scoreExpr: string) => {
        const r = db
          .prepare(
            `SELECT COUNT(*) AS n, AVG(${scoreExpr}) AS avg FROM ${table} t
             WHERE t.user_id = ? AND t.task_id IN (SELECT id FROM ${table === 'speaking_attempts' ? 'speaking_tasks' : 'writing_tasks'} WHERE cefr_level = ?)`,
          )
          .get(userId, level.code) as { n: number; avg: number | null };
        return { attempts: r.n, mastery: r.avg };
      };
      return {
        level: level.code,
        status: level.status,
        progress: level.progress,
        branches: [
          { skill: 'grammar', title: 'Grammar', items: grammar },
          { skill: 'vocabulary', title: 'Vocabulary', items: vocabulary },
          { skill: 'reading', title: 'Reading', ...skillAcc('reading') },
          { skill: 'listening', title: 'Listening', ...skillAcc('listening') },
          { skill: 'speaking', title: 'Speaking', ...productive('speaking_attempts', "json_extract(t.feedback, '$.score') / 100.0") },
          { skill: 'writing', title: 'Writing', ...productive('writing_submissions', 't.score / 100.0') },
        ],
      };
    });
}

export function analytics(db: DB, userId: number, now: Date) {
  const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).pluck().get(userId, ...p) as number) ?? 0;
  const totals = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS minutes, COUNT(*) AS days FROM study_days WHERE user_id = ? AND activities > 0').get(userId) as { minutes: number; days: number };
  const acc = accuracyBySkill(db, userId, '0000', '9999');
  const settings = getSettings(db, userId);
  const today = toDateKey(now);
  const last28 = dailyMinutes(db, userId, addDays(today, -27), today);
  const scheduled = Math.round(4 * studyDaysPerWeek(settings.schedule));
  const reviewsDone = count('SELECT COUNT(*) FROM vocabulary_reviews WHERE user_id = ?');
  const reviewCorrect = count('SELECT COUNT(*) FROM vocabulary_reviews WHERE user_id = ? AND correct = 1');
  return {
    studyMinutes: Math.round(totals.minutes),
    studyDays: totals.days,
    lessonsCompleted: count(`SELECT COUNT(*) FROM user_progress WHERE user_id = ? AND status = 'completed'`),
    questionsAnswered: count('SELECT COUNT(*) FROM question_responses WHERE user_id = ?'),
    accuracy: count('SELECT COUNT(*) FROM question_responses WHERE user_id = ?') ? (db.prepare('SELECT AVG(score) FROM question_responses WHERE user_id = ?').pluck().get(userId) as number) : null,
    accuracyBySkill: Object.fromEntries(CORE_SKILLS.map((s) => [s, acc[s]?.accuracy ?? null])) as Record<CoreSkill, number | null>,
    wordsLearned: count('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_learned_at IS NOT NULL'),
    wordsMastered: count(`SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND state = 'MASTERED'`),
    wordsForgotten: count(`SELECT COUNT(*) FROM vocabulary_reviews WHERE user_id = ? AND grade = 'again' AND interval_before >= 7`),
    reviews: { done: reviewsDone, recallRate: reviewsDone ? reviewCorrect / reviewsDone : null },
    speakingAttempts: count('SELECT COUNT(*) FROM speaking_attempts WHERE user_id = ?'),
    writingSubmissions: count('SELECT COUNT(*) FROM writing_submissions WHERE user_id = ?'),
    consistency: { last28, studiedDays: last28.filter((d) => d.studied).length, scheduledDays: scheduled },
    skillProfile: skillProfile(db, userId),
    cefrHistory: snapshots(db, userId, addDays(today, -180)),
  };
}

export { parseJson };
