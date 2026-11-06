// Content management: edit module documents through the admin panel.
// Saves go through the same validation and importer as files on disk, and are
// written back to content/modules so they survive re-imports.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DB } from '../db';
import { parseJson } from '../db';
import { moduleDoc, type ModuleDoc } from '@shared/contentSchema';
import { slugify } from '@shared/text';
import type { AppConfig } from '../config';
import { badRequest, conflict, notFound } from '../http';
import { formatZodError, importAll, linkPrerequisites, upsertModule } from '../content/importer';
import { lintModule } from '../content/lint';

const LEVEL_FOLDER: Record<string, string> = { B1: 'B1', 'B1+': 'B1plus', B2: 'B2', 'B2+': 'B2plus', C1: 'C1' };

export function adminModules(db: DB) {
  return db
    .prepare(
      `SELECT m.id, m.level_code AS level, m.ord AS "order", m.title, m.topic, m.status, m.source_file AS sourceFile, m.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM lessons l WHERE l.module_id = m.id AND l.kind = 'core') AS lessons,
         (SELECT COUNT(*) FROM vocabulary v WHERE v.module_id = m.id AND v.owner_user_id IS NULL) AS words,
         (m.test_json IS NOT NULL) AS hasTest
       FROM modules m JOIN levels lv ON lv.code = m.level_code ORDER BY lv.ord, m.ord`,
    )
    .all();
}

export function adminModuleDoc(db: DB, id: string): { doc: ModuleDoc | null; outline: Record<string, unknown> | null; status: string } {
  const row = db.prepare('SELECT doc, status, level_code, ord, title, topic, description, targets FROM modules WHERE id = ?').get(id) as
    | { doc: string | null; status: string; level_code: string; ord: number; title: string; topic: string; description: string; targets: string }
    | undefined;
  if (!row) throw notFound('Module not found');
  return {
    doc: parseJson<ModuleDoc | null>(row.doc, null),
    outline: row.doc ? null : { id, level: row.level_code, order: row.ord, title: row.title, topic: row.topic, description: row.description, targets: parseJson(row.targets, {}) },
    status: row.status,
  };
}

/** A minimal but valid module skeleton to start editing from. */
export function moduleTemplate(input: { id: string; level: string; order: number; title: string; topic: string; description?: string }): ModuleDoc {
  const lessonId = `${input.id}-l1`;
  return moduleDoc.parse({
    id: input.id,
    level: input.level,
    order: input.order,
    title: input.title,
    topic: input.topic,
    description: input.description || `Module about ${input.topic.toLowerCase()}.`,
    objectives: [
      { text: `Use key vocabulary about ${input.topic.toLowerCase()}`, skills: ['vocabulary'] },
      { text: 'Understand a short text on the topic', skills: ['reading'] },
    ],
    targets: { grammar: [], vocabulary: [] },
    status: 'draft',
    lessons: [
      {
        id: lessonId,
        title: 'First lesson',
        focus: 'vocabulary',
        difficulty: 3,
        minutes: 20,
        objectives: ['Learn new words about the topic', 'Use them in sentences'],
        warmup: { intro: 'Warm up before the lesson.', questions: [{ type: 'mcq', prompt: 'Replace this warm-up question.', options: ['Option A', 'Option B'], answer: 0 }] },
        vocabulary: [],
        quiz: [],
      },
    ],
  });
}

export function validateDoc(json: unknown): { doc?: ModuleDoc; error?: string; lint: ReturnType<typeof lintModule> } {
  const parsed = moduleDoc.safeParse(json);
  if (!parsed.success) return { error: formatZodError(parsed.error), lint: [] };
  return { doc: parsed.data, lint: lintModule(parsed.data) };
}

function writeBack(db: DB, config: AppConfig, doc: ModuleDoc): string | null {
  if (!config.contentWriteBack) return null;
  const existing = db.prepare('SELECT source_file FROM modules WHERE id = ?').pluck().get(doc.id) as string | null;
  const rel = existing ?? `modules/${LEVEL_FOLDER[doc.level]}/${doc.id}-${slugify(doc.title).slice(0, 30)}.json`;
  const full = path.join(config.contentDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  fs.writeFileSync(full, text, 'utf8');
  db.prepare('UPDATE modules SET source_file = ?, content_hash = ? WHERE id = ?').run(rel, crypto.createHash('sha1').update(text).digest('hex'), doc.id);
  return rel;
}

export function saveModuleDoc(db: DB, config: AppConfig, json: unknown, opts: { create?: boolean } = {}) {
  const v = validateDoc(json);
  if (!v.doc) throw badRequest('The module does not match the content schema.', v.error);
  const exists = db.prepare(`SELECT status FROM modules WHERE id = ?`).pluck().get(v.doc.id) as string | undefined;
  if (opts.create && exists && exists !== 'planned') throw conflict(`A module with id "${v.doc.id}" already exists.`);
  upsertModule(db, v.doc, {});
  linkPrerequisites(db);
  const file = writeBack(db, config, v.doc);
  return { id: v.doc.id, file, lint: v.lint };
}

export function setModuleStatus(db: DB, config: AppConfig, id: string, status: 'draft' | 'published') {
  const { doc } = adminModuleDoc(db, id);
  if (!doc) throw badRequest('This module has no content yet. Create its content first.');
  if (status === 'published' && !doc.test) throw badRequest('Add a module test before publishing — learners need it to complete the module.');
  return saveModuleDoc(db, config, { ...doc, status });
}

export function deleteModule(db: DB, config: AppConfig, id: string) {
  const row = db.prepare('SELECT source_file FROM modules WHERE id = ?').get(id) as { source_file: string | null } | undefined;
  if (!row) throw notFound('Module not found');
  db.prepare('DELETE FROM modules WHERE id = ?').run(id);
  if (row.source_file && config.contentWriteBack) {
    const full = path.join(config.contentDir, row.source_file);
    if (fs.existsSync(full)) fs.renameSync(full, `${full}.deleted`);
  }
  linkPrerequisites(db);
}

export function reimport(db: DB, config: AppConfig) {
  return importAll(db, config.contentDir, { force: true });
}

export function contentStats(db: DB) {
  const n = (sql: string) => db.prepare(sql).pluck().get() as number;
  return {
    levels: n('SELECT COUNT(*) FROM levels'),
    modulesPublished: n(`SELECT COUNT(*) FROM modules WHERE status = 'published'`),
    modulesDraft: n(`SELECT COUNT(*) FROM modules WHERE status = 'draft'`),
    modulesPlanned: n(`SELECT COUNT(*) FROM modules WHERE status = 'planned'`),
    lessons: n(`SELECT COUNT(*) FROM lessons WHERE kind = 'core'`),
    words: n('SELECT COUNT(*) FROM vocabulary WHERE owner_user_id IS NULL'),
    grammarTopics: n('SELECT COUNT(*) FROM grammar_topics'),
    questions: n('SELECT COUNT(*) FROM quiz_questions'),
    readings: n('SELECT COUNT(*) FROM reading_materials'),
    listenings: n('SELECT COUNT(*) FROM listening_materials'),
    scenarios: n('SELECT COUNT(*) FROM conversation_scenarios'),
    levelExams: n('SELECT COUNT(*) FROM levels WHERE exam_json IS NOT NULL'),
    placement: n('SELECT COUNT(*) FROM placement_test') > 0,
  };
}
