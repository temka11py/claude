import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../server/app';
import { migrate, openDatabase, type DB } from '../../server/db';
import { importAll } from '../../server/content/importer';
import { config } from '../../server/config';
import { UnavailableProvider, type AIProvider } from '../../server/ai/provider';
import { createUser } from '../../server/services/users';
import type { Question } from '../../shared/contentSchema';
import type { AnswerValue } from '../../shared/scoring';

const REAL_CONTENT = path.resolve(import.meta.dirname, '../../content');

/** A small, self-contained content folder: levels, module b1-01, placement, a B1 exam and one scenario. */
export function fixtureContent(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-content-'));
  fs.mkdirSync(path.join(dir, 'modules', 'B1'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'exams'), { recursive: true });
  fs.copyFileSync(path.join(REAL_CONTENT, 'levels.json'), path.join(dir, 'levels.json'));
  fs.copyFileSync(path.join(REAL_CONTENT, 'placement.json'), path.join(dir, 'placement.json'));
  const moduleFile = path.join(REAL_CONTENT, 'modules', 'B1', 'b1-01-everyday-life.json');
  fs.copyFileSync(moduleFile, path.join(dir, 'modules', 'B1', 'b1-01-everyday-life.json'));
  const mod = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
  fs.writeFileSync(
    path.join(dir, 'exams', 'b1.json'),
    JSON.stringify({
      level: 'B1',
      title: 'B1 level exam (test fixture)',
      reading: [mod.test.reading],
      listening: [mod.test.listening],
      writing: mod.test.writing,
      speaking: mod.test.speaking,
      questions: mod.test.questions,
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'scenarios.json'),
    JSON.stringify({
      scenarios: [
        {
          id: 'cafe',
          title: 'Ordering at a café',
          minLevel: 'B1',
          category: 'Everyday',
          description: 'Order a drink and a snack.',
          partnerRole: 'A friendly barista',
          learnerGoal: 'Order politely and ask one question.',
          opening: 'Hi there! What can I get you?',
          guidedTurns: [
            { prompt: 'Would you like anything to eat?', hint: 'Say what you want.', sample: "Yes, I'd like a cheese sandwich, please." },
            { prompt: 'For here or to take away?', hint: 'Choose one.', sample: 'For here, please.' },
            { prompt: "That's 12,000 tugriks.", hint: 'Pay and thank.', sample: 'Here you are. Thank you!' },
          ],
          phrases: ["I'd like…", 'Could I have…', 'Thank you'],
        },
      ],
    }),
  );
  return dir;
}

export interface TestApp {
  app: FastifyInstance;
  db: DB;
  contentDir: string;
  cookie: string;
  userId: number;
  req: (method: string, url: string, body?: unknown, opts?: { now?: string; cookie?: string | null }) => Promise<LightMyRequestResponse>;
  json: <T = any>(method: string, url: string, body?: unknown, opts?: { now?: string }) => Promise<T>;
}

export async function createTestApp(opts: { ai?: AIProvider; login?: boolean } = {}): Promise<TestApp> {
  const contentDir = fixtureContent();
  const db = openDatabase(':memory:');
  migrate(db);
  const report = importAll(db, contentDir);
  if (report.errors.length) throw new Error(`fixture import failed: ${JSON.stringify(report.errors)}`);
  const app = await buildApp({
    db,
    config: { ...config, contentDir, contentWriteBack: false, recordingsDir: path.join(contentDir, 'rec'), distDir: path.join(contentDir, 'no-dist') },
    ai: opts.ai ?? new UnavailableProvider(),
  });
  let cookie = '';
  let userId = 0;
  if (opts.login !== false) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'tester', displayName: 'Tester', password: 'password123' } });
    cookie = String(res.headers['set-cookie']).split(';')[0];
    userId = (db.prepare('SELECT id FROM users WHERE username = ?').pluck().get('tester') as number) ?? 0;
  }
  const req: TestApp['req'] = (method, url, body, o = {}) =>
    app.inject({
      method: method as 'GET',
      url,
      payload: body as Record<string, unknown> | undefined,
      headers: { ...(o.cookie === null ? {} : { cookie: o.cookie ?? cookie }), ...(o.now ? { 'x-test-now': o.now } : {}) },
    });
  const json: TestApp['json'] = async (method, url, body, o) => {
    const r = await req(method, url, body, o);
    if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode}: ${r.body}`);
    return r.json();
  };
  return { app, db, contentDir, cookie, userId, req, json };
}

export { createUser };

/** The correct answer for any question type (used to "pass" tests in integration tests). */
export function correctValue(q: Question): AnswerValue {
  switch (q.type) {
    case 'mcq':
      return q.answer;
    case 'tfng':
      return q.answer;
    case 'gap':
    case 'short':
    case 'correct':
    case 'transform':
      return q.answers[0];
    case 'order':
      return q.items;
    case 'words':
      return q.answer;
    case 'match':
      return q.pairs.map((p) => p[1]);
    case 'error':
      return q.wrongIndex;
    case 'summary':
      return q.answers;
  }
}

/** Answers for an attempt, read from the stored paper. */
export function answersFor(db: DB, attemptId: number, pick: (i: number) => boolean = () => true): Record<string, AnswerValue> {
  const paper = JSON.parse(db.prepare('SELECT paper FROM quiz_attempts WHERE id = ?').pluck().get(attemptId) as string) as {
    sections: { questions: { id: string; question: Question }[] }[];
  };
  const out: Record<string, AnswerValue> = {};
  let i = 0;
  for (const s of paper.sections) {
    for (const q of s.questions) {
      out[q.id] = pick(i++) ? correctValue(q.question) : null;
    }
  }
  return out;
}

export const GOOD_TEXT =
  'On weekdays I usually get up at half past six and commute to work by bus. However, my routine is different at the moment because I am taking an online course, so I study every evening. At weekends I run errands, do the chores and relax with friends. In addition, I am trying to break a bad habit: I check my phone too often. As a result, I sleep better now and I feel less exhausted in the morning. Overall, I think a good routine makes life easier.';
