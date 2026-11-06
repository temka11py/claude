// Loads course content from content/*.json into the database.
// Imports are idempotent upserts keyed by stable ids, so learner progress
// (which references lesson and word ids) survives re-imports.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ZodError } from 'zod';
import type { DB } from '../db';
import { nowIso } from '../db';
import {
  levelExamDoc,
  levelsDoc,
  moduleDoc,
  placementDoc,
  scenarioDoc,
  type ListeningMaterial,
  type ModuleDoc,
  type Question,
  type ReadingMaterial,
  type SpeakingTask,
  type WritingTask,
} from '@shared/contentSchema';
import { ACHIEVEMENTS } from '@shared/gamification';
import { slugify, wordCount } from '@shared/text';

export interface ImportReport {
  imported: string[];
  skipped: string[];
  errors: { file: string; message: string }[];
}

export function formatZodError(err: ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

function hash(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsonFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}

const DEFAULT_SKILL: Record<string, string> = {
  grammar_guided: 'grammar',
  grammar_free: 'grammar',
  reading: 'reading',
  listening_gist: 'listening',
  listening_detail: 'listening',
  placement_grammar: 'grammar',
  placement_vocabulary: 'vocabulary',
};

const VOCAB_TAGS = new Set(['vocabulary', 'collocation', 'word_choice', 'phrasal_verb', 'idiom', 'word_formation', 'synonym', 'antonym']);

function inferSkill(q: Question, ownerType: string): string {
  if (q.skill) return q.skill;
  if (DEFAULT_SKILL[ownerType]) return DEFAULT_SKILL[ownerType];
  if (q.tag && VOCAB_TAGS.has(q.tag)) return 'vocabulary';
  return 'grammar';
}

export function insertQuestions(
  db: DB,
  questions: Question[],
  owner: { type: string; id: string; moduleId: string | null; level: string },
): void {
  const stmt = db.prepare(
    `INSERT INTO quiz_questions (id, owner_type, owner_id, module_id, ord, skill, type, cefr_level, difficulty, tag, data)
     VALUES (@id, @owner_type, @owner_id, @module_id, @ord, @skill, @type, @cefr_level, @difficulty, @tag, @data)`,
  );
  questions.forEach((q, i) => {
    const id = q.id ? `${owner.id}:${q.id}` : `${owner.id}:${owner.type}:${i + 1}`;
    const data = { ...q, id };
    stmt.run({
      id,
      owner_type: owner.type,
      owner_id: owner.id,
      module_id: owner.moduleId,
      ord: i,
      skill: inferSkill(q, owner.type),
      type: q.type,
      cefr_level: q.level ?? owner.level,
      difficulty: q.difficulty ?? 3,
      tag: q.tag ?? null,
      data: JSON.stringify(data),
    });
  });
}

/** Namespaced id so authored ids only need to be unique within their module. */
export function ns(moduleId: string, id: string): string {
  return id.startsWith(`${moduleId}-`) ? id : `${moduleId}-${id}`;
}

type Ctx = { context: string; lessonId: string | null; moduleId: string | null; level: string };

export function upsertReading(db: DB, m: ReadingMaterial, id: string, ctx: Ctx): void {
  const { questions, ...data } = m;
  db.prepare(
    `INSERT INTO reading_materials (id, context, lesson_id, module_id, cefr_level, title, genre, word_count, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET context=excluded.context, lesson_id=excluded.lesson_id, module_id=excluded.module_id,
       cefr_level=excluded.cefr_level, title=excluded.title, genre=excluded.genre, word_count=excluded.word_count,
       data=excluded.data, updated_at=excluded.updated_at`,
  ).run(id, ctx.context, ctx.lessonId, ctx.moduleId, ctx.level, m.title, m.genre, wordCount(m.text.join(' ')), JSON.stringify({ ...data, id }), nowIso());
  db.prepare(`DELETE FROM quiz_questions WHERE owner_type = 'reading' AND owner_id = ?`).run(id);
  insertQuestions(db, questions, { type: 'reading', id, moduleId: ctx.moduleId, level: ctx.level });
}

export function upsertListening(db: DB, m: ListeningMaterial, id: string, ctx: Ctx): void {
  const { gist, detail, ...data } = m;
  db.prepare(
    `INSERT INTO listening_materials (id, context, lesson_id, module_id, cefr_level, title, kind, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET context=excluded.context, lesson_id=excluded.lesson_id, module_id=excluded.module_id,
       cefr_level=excluded.cefr_level, title=excluded.title, kind=excluded.kind, data=excluded.data, updated_at=excluded.updated_at`,
  ).run(id, ctx.context, ctx.lessonId, ctx.moduleId, ctx.level, m.title, m.kind, JSON.stringify({ ...data, id }), nowIso());
  db.prepare(`DELETE FROM quiz_questions WHERE owner_type IN ('listening_gist', 'listening_detail') AND owner_id = ?`).run(id);
  insertQuestions(db, gist, { type: 'listening_gist', id, moduleId: ctx.moduleId, level: ctx.level });
  insertQuestions(db, detail, { type: 'listening_detail', id, moduleId: ctx.moduleId, level: ctx.level });
}

export function upsertSpeaking(db: DB, t: SpeakingTask, id: string, ctx: Ctx): void {
  db.prepare(
    `INSERT INTO speaking_tasks (id, context, lesson_id, module_id, cefr_level, type, prompt, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET context=excluded.context, lesson_id=excluded.lesson_id, module_id=excluded.module_id,
       cefr_level=excluded.cefr_level, type=excluded.type, prompt=excluded.prompt, data=excluded.data, updated_at=excluded.updated_at`,
  ).run(id, ctx.context, ctx.lessonId, ctx.moduleId, ctx.level, t.type, t.prompt, JSON.stringify({ ...t, id }), nowIso());
}

export function upsertWriting(db: DB, t: WritingTask, id: string, ctx: Ctx): void {
  db.prepare(
    `INSERT INTO writing_tasks (id, context, lesson_id, module_id, cefr_level, type, prompt, register, min_words, max_words, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET context=excluded.context, lesson_id=excluded.lesson_id, module_id=excluded.module_id,
       cefr_level=excluded.cefr_level, type=excluded.type, prompt=excluded.prompt, register=excluded.register,
       min_words=excluded.min_words, max_words=excluded.max_words, data=excluded.data, updated_at=excluded.updated_at`,
  ).run(id, ctx.context, ctx.lessonId, ctx.moduleId, ctx.level, t.type, t.prompt, t.register, t.minWords, t.maxWords, JSON.stringify({ ...t, id }), nowIso());
}

/** Estimated minutes per lesson section — drives lesson steps and session planning. */
export function sectionMinutes(kind: string, info: { words?: number; readingWords?: number; items?: number } = {}): number {
  switch (kind) {
    case 'warmup':
      return 2;
    case 'objectives':
      return 1;
    case 'vocabulary':
      return Math.max(3, Math.round((info.items ?? 8) * 0.5));
    case 'vocab_practice':
      return Math.max(3, Math.round((info.items ?? 8) * 0.4));
    case 'phrases':
      return Math.max(2, Math.round((info.items ?? 4) * 0.6));
    case 'grammar':
      return 9;
    case 'reading':
      return Math.max(6, Math.round((info.readingWords ?? 300) / 60) + 4);
    case 'listening':
      return 8;
    case 'pronunciation':
      return 5;
    case 'speaking':
      return 6;
    case 'writing':
      return 10;
    case 'quiz':
      return Math.max(3, Math.round((info.items ?? 8) * 0.45));
    default:
      return 3;
  }
}

/** Import or update one module document inside a transaction. */
export function upsertModule(db: DB, doc: ModuleDoc, opts: { sourceFile?: string | null; contentHash?: string | null } = {}): void {
  const now = nowIso();
  const level = doc.level;
  const mid = doc.id;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO modules (id, level_code, ord, title, topic, description, description_mn, objectives, targets, test_json, doc, status, source_file, content_hash, updated_at)
       VALUES (@id, @level, @ord, @title, @topic, @description, @description_mn, @objectives, @targets, @test_json, @doc, @status, @source_file, @content_hash, @updated_at)
       ON CONFLICT(id) DO UPDATE SET level_code=excluded.level_code, ord=excluded.ord, title=excluded.title, topic=excluded.topic,
         description=excluded.description, description_mn=excluded.description_mn, objectives=excluded.objectives,
         targets=excluded.targets, test_json=excluded.test_json, doc=excluded.doc, status=excluded.status,
         source_file=COALESCE(excluded.source_file, modules.source_file), content_hash=excluded.content_hash, updated_at=excluded.updated_at`,
    ).run({
      id: mid,
      level,
      ord: doc.order,
      title: doc.title,
      topic: doc.topic,
      description: doc.description,
      description_mn: doc.descriptionMn ?? null,
      objectives: JSON.stringify(doc.objectives),
      targets: JSON.stringify(doc.targets),
      test_json: doc.test ? JSON.stringify(doc.test) : null,
      doc: JSON.stringify(doc),
      status: doc.status,
      source_file: opts.sourceFile ?? null,
      content_hash: opts.contentHash ?? null,
      updated_at: now,
    });

    // Grammar & pronunciation topics.
    const grammarIds = doc.grammar.map((g) => ns(mid, g.id));
    db.prepare(`DELETE FROM quiz_questions WHERE owner_type IN ('grammar_guided', 'grammar_free') AND owner_id IN (SELECT id FROM grammar_topics WHERE module_id = ?)`).run(mid);
    const keepGrammar = new Set(grammarIds);
    for (const id of db.prepare('SELECT id FROM grammar_topics WHERE module_id = ?').pluck().all(mid) as string[]) {
      if (!keepGrammar.has(id)) db.prepare('DELETE FROM grammar_topics WHERE id = ?').run(id);
    }
    for (const g of doc.grammar) {
      const id = ns(mid, g.id);
      const { guided, free, ...data } = g;
      db.prepare(
        `INSERT INTO grammar_topics (id, module_id, cefr_level, title, data, prerequisites, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET module_id=excluded.module_id, cefr_level=excluded.cefr_level, title=excluded.title,
           data=excluded.data, prerequisites=excluded.prerequisites, updated_at=excluded.updated_at`,
      ).run(id, mid, g.level, g.title, JSON.stringify({ ...data, id }), JSON.stringify(g.prerequisites), now);
      insertQuestions(db, guided, { type: 'grammar_guided', id, moduleId: mid, level: g.level });
      insertQuestions(db, free, { type: 'grammar_free', id, moduleId: mid, level: g.level });
    }
    const pronIds = new Set(doc.pronunciation.map((p) => ns(mid, p.id)));
    for (const id of db.prepare('SELECT id FROM pronunciation_topics WHERE module_id = ?').pluck().all(mid) as string[]) {
      if (!pronIds.has(id)) db.prepare('DELETE FROM pronunciation_topics WHERE id = ?').run(id);
    }
    for (const p of doc.pronunciation) {
      const id = ns(mid, p.id);
      db.prepare(
        `INSERT INTO pronunciation_topics (id, module_id, cefr_level, title, category, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET module_id=excluded.module_id, cefr_level=excluded.cefr_level, title=excluded.title,
           category=excluded.category, data=excluded.data, updated_at=excluded.updated_at`,
      ).run(id, mid, level, p.title, p.category, JSON.stringify({ ...p, id }), now);
    }

    // Lessons (+ one generated review lesson at the end of the module).
    const lessonIds = doc.lessons.map((l) => l.id);
    const reviewId = `${mid}-review`;
    const keepLessons = new Set([...lessonIds, reviewId]);
    for (const id of db.prepare('SELECT id FROM lessons WHERE module_id = ?').pluck().all(mid) as string[]) {
      if (!keepLessons.has(id)) db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
    }
    const lessonStmt = db.prepare(
      `INSERT INTO lessons (id, module_id, ord, title, kind, focus, skills, cefr_level, difficulty, minutes, prerequisite_id, objectives, warmup, phrases, quiz, grammar_topic_id, pronunciation_id, status, updated_at)
       VALUES (@id, @module_id, @ord, @title, @kind, @focus, @skills, @cefr_level, @difficulty, @minutes, @prerequisite_id, @objectives, @warmup, @phrases, @quiz, @grammar_topic_id, @pronunciation_id, @status, @updated_at)
       ON CONFLICT(id) DO UPDATE SET module_id=excluded.module_id, ord=excluded.ord, title=excluded.title, kind=excluded.kind,
         focus=excluded.focus, skills=excluded.skills, cefr_level=excluded.cefr_level, difficulty=excluded.difficulty,
         minutes=excluded.minutes, prerequisite_id=excluded.prerequisite_id, objectives=excluded.objectives, warmup=excluded.warmup,
         phrases=excluded.phrases, quiz=excluded.quiz, grammar_topic_id=excluded.grammar_topic_id,
         pronunciation_id=excluded.pronunciation_id, status=excluded.status, updated_at=excluded.updated_at`,
    );

    doc.lessons.forEach((l, i) => {
      const skills = new Set<string>([l.focus]);
      if (l.vocabulary.length) skills.add('vocabulary');
      if (l.grammar) skills.add('grammar');
      if (l.reading) skills.add('reading');
      if (l.listening) skills.add('listening');
      if (l.speaking) skills.add('speaking');
      if (l.writing) skills.add('writing');
      if (l.pronunciation) skills.add('pronunciation');
      const grammarId = l.grammar ? ns(mid, l.grammar) : null;
      const pronId = l.pronunciation ? ns(mid, l.pronunciation) : null;

      // Steps (activities) derived from the content.
      const steps: { type: string; skill: string; ref: string | null; minutes: number }[] = [
        { type: 'warmup', skill: 'vocabulary', ref: null, minutes: sectionMinutes('warmup') },
        { type: 'objectives', skill: l.focus, ref: null, minutes: sectionMinutes('objectives') },
      ];
      if (l.vocabulary.length) {
        steps.push({ type: 'vocabulary', skill: 'vocabulary', ref: null, minutes: sectionMinutes('vocabulary', { items: l.vocabulary.length }) });
        steps.push({ type: 'vocab_practice', skill: 'vocabulary', ref: null, minutes: sectionMinutes('vocab_practice', { items: l.vocabulary.length }) });
      }
      if (l.phrases.length) steps.push({ type: 'phrases', skill: 'vocabulary', ref: null, minutes: sectionMinutes('phrases', { items: l.phrases.length }) });
      if (grammarId) steps.push({ type: 'grammar', skill: 'grammar', ref: grammarId, minutes: sectionMinutes('grammar') });
      if (l.reading) steps.push({ type: 'reading', skill: 'reading', ref: ns(mid, l.reading.id), minutes: sectionMinutes('reading', { readingWords: wordCount(l.reading.text.join(' ')) }) });
      if (l.listening) steps.push({ type: 'listening', skill: 'listening', ref: ns(mid, l.listening.id), minutes: sectionMinutes('listening') });
      if (pronId) steps.push({ type: 'pronunciation', skill: 'pronunciation', ref: pronId, minutes: sectionMinutes('pronunciation') });
      if (l.speaking) steps.push({ type: 'speaking', skill: 'speaking', ref: ns(mid, l.speaking.id), minutes: sectionMinutes('speaking') });
      if (l.writing) steps.push({ type: 'writing', skill: 'writing', ref: ns(mid, l.writing.id), minutes: sectionMinutes('writing') });
      steps.push({ type: 'quiz', skill: l.focus, ref: null, minutes: sectionMinutes('quiz', { items: l.quiz.length + Math.min(6, l.vocabulary.length) }) });

      lessonStmt.run({
        id: l.id,
        module_id: mid,
        ord: i + 1,
        title: l.title,
        kind: 'core',
        focus: l.focus,
        skills: JSON.stringify([...skills]),
        cefr_level: level,
        difficulty: l.difficulty,
        minutes: l.minutes,
        prerequisite_id: i > 0 ? doc.lessons[i - 1].id : null,
        objectives: JSON.stringify(l.objectives),
        warmup: JSON.stringify(l.warmup),
        phrases: JSON.stringify(l.phrases),
        quiz: JSON.stringify(l.quiz),
        grammar_topic_id: grammarId,
        pronunciation_id: pronId,
        status: 'published',
        updated_at: now,
      });

      db.prepare('DELETE FROM activities WHERE lesson_id = ?').run(l.id);
      const actStmt = db.prepare('INSERT INTO activities (id, lesson_id, ord, type, skill, ref_id, minutes, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      steps.forEach((s, j) => actStmt.run(`${l.id}:${j}`, l.id, j, s.type, s.skill, s.ref, s.minutes, l.difficulty));

      db.prepare(`DELETE FROM quiz_questions WHERE owner_type IN ('lesson_warmup', 'lesson_quiz') AND owner_id = ?`).run(l.id);
      insertQuestions(db, l.warmup.questions, { type: 'lesson_warmup', id: l.id, moduleId: mid, level });
      insertQuestions(db, l.quiz, { type: 'lesson_quiz', id: l.id, moduleId: mid, level });

      // Vocabulary.
      const seen = new Map<string, number>();
      const vocabIds: string[] = [];
      const vocabStmt = db.prepare(
        `INSERT INTO vocabulary (id, word, pos, ipa, definition, mongolian, examples, collocations, synonyms, antonyms, mistake, note, cefr_level, difficulty, topic, module_id, lesson_id, ord, created_at, updated_at)
         VALUES (@id, @word, @pos, @ipa, @definition, @mongolian, @examples, @collocations, @synonyms, @antonyms, @mistake, @note, @cefr_level, @difficulty, @topic, @module_id, @lesson_id, @ord, @now, @now)
         ON CONFLICT(id) DO UPDATE SET word=excluded.word, pos=excluded.pos, ipa=excluded.ipa, definition=excluded.definition,
           mongolian=excluded.mongolian, examples=excluded.examples, collocations=excluded.collocations, synonyms=excluded.synonyms,
           antonyms=excluded.antonyms, mistake=excluded.mistake, note=excluded.note, cefr_level=excluded.cefr_level,
           difficulty=excluded.difficulty, topic=excluded.topic, module_id=excluded.module_id, lesson_id=excluded.lesson_id,
           ord=excluded.ord, updated_at=excluded.updated_at`,
      );
      l.vocabulary.forEach((v, j) => {
        const slug = slugify(v.word) || `w${j}`;
        const n = (seen.get(slug) ?? 0) + 1;
        seen.set(slug, n);
        const id = `${l.id}-${slug}${n > 1 ? `-${n}` : ''}`;
        vocabIds.push(id);
        vocabStmt.run({
          id,
          word: v.word,
          pos: v.pos,
          ipa: v.ipa ?? null,
          definition: v.definition,
          mongolian: v.mn,
          examples: JSON.stringify(v.examples),
          collocations: JSON.stringify(v.collocations),
          synonyms: JSON.stringify(v.synonyms),
          antonyms: JSON.stringify(v.antonyms),
          mistake: v.mistake ?? null,
          note: v.note ?? null,
          cefr_level: v.level,
          difficulty: v.difficulty,
          topic: doc.topic,
          module_id: mid,
          lesson_id: l.id,
          ord: j,
          now,
        });
      });
      const keepVocab = new Set(vocabIds);
      for (const id of db.prepare('SELECT id FROM vocabulary WHERE lesson_id = ? AND owner_user_id IS NULL').pluck().all(l.id) as string[]) {
        if (!keepVocab.has(id)) db.prepare('DELETE FROM vocabulary WHERE id = ?').run(id);
      }

      const ctx: Ctx = { context: 'lesson', lessonId: l.id, moduleId: mid, level };
      if (l.reading) upsertReading(db, l.reading, ns(mid, l.reading.id), ctx);
      if (l.listening) upsertListening(db, l.listening, ns(mid, l.listening.id), ctx);
      if (l.speaking) upsertSpeaking(db, l.speaking, ns(mid, l.speaking.id), ctx);
      if (l.writing) upsertWriting(db, l.writing, ns(mid, l.writing.id), ctx);
    });

    // Generated module review lesson.
    lessonStmt.run({
      id: reviewId,
      module_id: mid,
      ord: doc.lessons.length + 1,
      title: `Module review: ${doc.title}`,
      kind: 'review',
      focus: 'vocabulary',
      skills: JSON.stringify(['vocabulary', 'grammar', 'listening', 'reading', 'speaking']),
      cefr_level: level,
      difficulty: Math.max(...doc.lessons.map((l) => l.difficulty)),
      minutes: 20,
      prerequisite_id: doc.lessons[doc.lessons.length - 1].id,
      objectives: JSON.stringify([
        `Recall and use the key vocabulary from “${doc.title}”`,
        'Apply the grammar of this module in mixed practice',
        'Check your listening and speaking before the module test',
      ]),
      warmup: null,
      phrases: '[]',
      quiz: '[]',
      grammar_topic_id: null,
      pronunciation_id: null,
      status: 'published',
      updated_at: now,
    });
    db.prepare('DELETE FROM activities WHERE lesson_id = ?').run(reviewId);
    ['vocab_practice', 'grammar_mix', 'listening_mix', 'reading_mix', 'speaking', 'quiz'].forEach((type, j) =>
      db
        .prepare('INSERT INTO activities (id, lesson_id, ord, type, skill, ref_id, minutes, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(`${reviewId}:${j}`, reviewId, j, type, type.split('_')[0] === 'vocab' ? 'vocabulary' : type.split('_')[0], null, [5, 4, 4, 3, 3, 3][j], 5),
    );

    // Module test materials.
    const testIds = { reading: `${mid}-test-reading`, listening: `${mid}-test-listening`, writing: `${mid}-test-writing`, speaking: `${mid}-test-speaking` };
    db.prepare(`DELETE FROM quiz_questions WHERE owner_type = 'module_test' AND owner_id = ?`).run(mid);
    if (doc.test) {
      const ctx: Ctx = { context: 'module_test', lessonId: null, moduleId: mid, level };
      upsertReading(db, doc.test.reading, testIds.reading, ctx);
      upsertListening(db, doc.test.listening, testIds.listening, ctx);
      upsertWriting(db, doc.test.writing, testIds.writing, ctx);
      upsertSpeaking(db, doc.test.speaking, testIds.speaking, ctx);
      insertQuestions(db, doc.test.questions, { type: 'module_test', id: mid, moduleId: mid, level });
    }
  })();
}

/** Each module requires the previous one (across levels, in course order). */
export function linkPrerequisites(db: DB): void {
  const rows = db
    .prepare(`SELECT m.id FROM modules m JOIN levels l ON l.code = m.level_code WHERE m.status != 'planned' ORDER BY l.ord, m.ord`)
    .pluck()
    .all() as string[];
  const stmt = db.prepare('UPDATE modules SET prerequisite_id = ? WHERE id = ?');
  db.transaction(() => rows.forEach((id, i) => stmt.run(i > 0 ? rows[i - 1] : null, id)))();
}

function importLevels(db: DB, dir: string, report: ImportReport): Set<string> {
  const file = path.join(dir, 'levels.json');
  const outlineIds = new Set<string>();
  if (!fs.existsSync(file)) {
    report.errors.push({ file, message: 'levels.json is missing' });
    return outlineIds;
  }
  const parsed = levelsDoc.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    report.errors.push({ file, message: formatZodError(parsed.error) });
    return outlineIds;
  }
  const stmt = db.prepare(
    `INSERT INTO levels (code, ord, title, description, description_mn, can_do) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET ord=excluded.ord, title=excluded.title, description=excluded.description,
       description_mn=excluded.description_mn, can_do=excluded.can_do`,
  );
  db.transaction(() => {
    parsed.data.levels.forEach((l, i) => stmt.run(l.code, i + 1, l.title, l.description, l.descriptionMn ?? null, JSON.stringify(l.canDo)));
    // Planned modules from the outline: visible on the roadmap, clearly marked as in preparation.
    const now = nowIso();
    for (const o of parsed.data.outline) {
      outlineIds.add(o.id);
      const exists = db.prepare('SELECT status FROM modules WHERE id = ?').pluck().get(o.id) as string | undefined;
      if (exists && exists !== 'planned') continue;
      db.prepare(
        `INSERT INTO modules (id, level_code, ord, title, topic, description, objectives, targets, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'planned', ?)
         ON CONFLICT(id) DO UPDATE SET level_code=excluded.level_code, ord=excluded.ord, title=excluded.title,
           topic=excluded.topic, description=excluded.description, targets=excluded.targets, updated_at=excluded.updated_at`,
      ).run(o.id, o.level, o.order, o.title, o.topic, o.description, JSON.stringify({ grammar: o.grammar, vocabulary: o.vocabulary }), now);
    }
  })();
  report.imported.push('levels.json');
  return outlineIds;
}

function importLevelExams(db: DB, dir: string, report: ImportReport): void {
  for (const file of listJsonFiles(path.join(dir, 'exams'))) {
    const parsed = levelExamDoc.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!parsed.success) {
      report.errors.push({ file, message: formatZodError(parsed.error) });
      continue;
    }
    const exam = parsed.data;
    const prefix = `exam-${slugify(exam.level)}`;
    db.transaction(() => {
      const ctx: Ctx = { context: 'level_exam', lessonId: null, moduleId: null, level: exam.level };
      const readingIds = exam.reading.map((r, i) => {
        const id = `${prefix}-reading-${i + 1}`;
        upsertReading(db, r, id, ctx);
        return id;
      });
      const listeningIds = exam.listening.map((l, i) => {
        const id = `${prefix}-listening-${i + 1}`;
        upsertListening(db, l, id, ctx);
        return id;
      });
      upsertWriting(db, exam.writing, `${prefix}-writing`, ctx);
      upsertSpeaking(db, exam.speaking, `${prefix}-speaking`, ctx);
      db.prepare(`DELETE FROM quiz_questions WHERE owner_type = 'level_exam' AND owner_id = ?`).run(exam.level);
      insertQuestions(db, exam.questions, { type: 'level_exam', id: exam.level, moduleId: null, level: exam.level });
      db.prepare('UPDATE levels SET exam_json = ? WHERE code = ?').run(
        JSON.stringify({ title: exam.title, readingIds, listeningIds, writingId: `${prefix}-writing`, speakingId: `${prefix}-speaking` }),
        exam.level,
      );
    })();
    report.imported.push(path.relative(dir, file));
  }
}

function importPlacement(db: DB, dir: string, report: ImportReport): void {
  const file = path.join(dir, 'placement.json');
  if (!fs.existsSync(file)) return;
  const parsed = placementDoc.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    report.errors.push({ file, message: formatZodError(parsed.error) });
    return;
  }
  const p = parsed.data;
  db.transaction(() => {
    db.prepare('INSERT INTO placement_test (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(JSON.stringify(p));
    db.prepare(`DELETE FROM quiz_questions WHERE owner_type LIKE 'placement_%'`).run();
    insertQuestions(db, p.grammar, { type: 'placement_grammar', id: 'placement', moduleId: null, level: 'B1' });
    insertQuestions(db, p.vocabulary, { type: 'placement_vocabulary', id: 'placement', moduleId: null, level: 'B1' });
  })();
  report.imported.push('placement.json');
}

function importScenarios(db: DB, dir: string, report: ImportReport): void {
  const file = path.join(dir, 'scenarios.json');
  if (!fs.existsSync(file)) return;
  const parsed = scenarioDoc.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    report.errors.push({ file, message: formatZodError(parsed.error) });
    return;
  }
  const stmt = db.prepare(
    `INSERT INTO conversation_scenarios (id, title, min_level, category, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, min_level=excluded.min_level, category=excluded.category, data=excluded.data`,
  );
  db.transaction(() => parsed.data.scenarios.forEach((s) => stmt.run(s.id, s.title, s.minLevel, s.category, JSON.stringify(s))))();
  report.imported.push('scenarios.json');
}

export function syncAchievements(db: DB): void {
  const stmt = db.prepare(
    `INSERT INTO achievements (code, title, description, icon, category, xp, ord) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET title=excluded.title, description=excluded.description, icon=excluded.icon,
       category=excluded.category, xp=excluded.xp, ord=excluded.ord`,
  );
  db.transaction(() => ACHIEVEMENTS.forEach((a, i) => stmt.run(a.code, a.title, a.description, a.icon, a.category, a.xp, i)))();
}

export function readModuleFile(file: string): { doc?: ModuleDoc; error?: string; hash: string } {
  const text = fs.readFileSync(file, 'utf8');
  const h = hash(text);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { error: `Invalid JSON: ${(e as Error).message}`, hash: h };
  }
  const parsed = moduleDoc.safeParse(json);
  if (!parsed.success) return { error: formatZodError(parsed.error), hash: h };
  return { doc: parsed.data, hash: h };
}

/** Import everything under the content directory. Unchanged module files are skipped unless forced. */
export function importAll(db: DB, contentDir: string, opts: { force?: boolean } = {}): ImportReport {
  const report: ImportReport = { imported: [], skipped: [], errors: [] };
  importLevels(db, contentDir, report);

  const moduleFiles = listJsonFiles(path.join(contentDir, 'modules'));
  for (const file of moduleFiles) {
    const rel = path.relative(contentDir, file).replace(/\\/g, '/');
    const { doc, error, hash: h } = readModuleFile(file);
    if (error || !doc) {
      report.errors.push({ file: rel, message: error ?? 'unknown error' });
      continue;
    }
    const existing = db.prepare('SELECT content_hash FROM modules WHERE id = ?').pluck().get(doc.id) as string | null | undefined;
    if (!opts.force && existing && existing === h) {
      report.skipped.push(rel);
      continue;
    }
    try {
      upsertModule(db, doc, { sourceFile: rel, contentHash: h });
      report.imported.push(rel);
    } catch (e) {
      report.errors.push({ file: rel, message: (e as Error).message });
    }
  }

  importLevelExams(db, contentDir, report);
  importPlacement(db, contentDir, report);
  importScenarios(db, contentDir, report);
  syncAchievements(db);
  linkPrerequisites(db);
  return report;
}
