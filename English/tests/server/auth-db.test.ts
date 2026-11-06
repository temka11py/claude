import { describe, expect, it } from 'vitest';
import { createTestApp, createUser } from './helpers';
import { importAll } from '../../server/content/importer';
import { migrate } from '../../server/db';

describe('authentication', () => {
  it('runs first-time setup once and protects the API', async () => {
    const t = await createTestApp({ login: false });
    const status = (await t.req('GET', '/api/auth/status', undefined, { cookie: null })).json();
    expect(status.needsSetup).toBe(true);
    expect((await t.req('GET', '/api/dashboard', undefined, { cookie: null })).statusCode).toBe(401);

    const setup = await t.req('POST', '/api/auth/setup', { username: 'ganaa', displayName: 'Ganaa', password: 'password123' }, { cookie: null });
    expect(setup.statusCode).toBe(200);
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    expect(cookie).toMatch(/^fp_session=/);

    const again = await t.req('POST', '/api/auth/setup', { username: 'x', displayName: 'X', password: 'password123' }, { cookie: null });
    expect(again.statusCode).toBe(403);

    const me = (await t.req('GET', '/api/auth/status', undefined, { cookie })).json();
    expect(me.user.username).toBe('ganaa');
    expect(me.user.role).toBe('admin');
    expect((await t.req('GET', '/api/dashboard', undefined, { cookie })).statusCode).toBe(200);
  });

  it('rejects wrong passwords and signs out', async () => {
    const t = await createTestApp();
    expect((await t.req('POST', '/api/auth/login', { username: 'tester', password: 'wrong-password' }, { cookie: null })).statusCode).toBe(401);
    const ok = await t.req('POST', '/api/auth/login', { username: 'tester', password: 'password123' }, { cookie: null });
    expect(ok.statusCode).toBe(200);
    const cookie = String(ok.headers['set-cookie']).split(';')[0];
    await t.req('POST', '/api/auth/logout', {}, { cookie });
    expect((await t.req('GET', '/api/settings', undefined, { cookie })).statusCode).toBe(401);
  });

  it('validates passwords and keeps the admin area for admins', async () => {
    const t = await createTestApp({ login: false });
    const weak = await t.req('POST', '/api/auth/setup', { username: 'abc', displayName: 'A', password: 'short' }, { cookie: null });
    expect(weak.statusCode).toBe(400);
    createUser(t.db, { username: 'learner2', displayName: 'L2', password: 'password123', role: 'learner' });
    const login = await t.req('POST', '/api/auth/login', { username: 'learner2', password: 'password123' }, { cookie: null });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    expect((await t.req('GET', '/api/admin/modules', undefined, { cookie })).statusCode).toBe(403);
  });

  it('changes the password', async () => {
    const t = await createTestApp();
    expect((await t.req('POST', '/api/auth/password', { current: 'nope', next: 'newpassword1' })).statusCode).toBe(400);
    expect((await t.req('POST', '/api/auth/password', { current: 'password123', next: 'newpassword1' })).statusCode).toBe(200);
    expect((await t.req('POST', '/api/auth/login', { username: 'tester', password: 'newpassword1' }, { cookie: null })).statusCode).toBe(200);
  });
});

describe('database and content import', () => {
  it('applies migrations once and keeps referential integrity', async () => {
    const t = await createTestApp();
    expect(migrate(t.db)).toEqual([]);
    expect(t.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const counts = t.db.prepare(`SELECT (SELECT COUNT(*) FROM modules WHERE status = 'published') AS published, (SELECT COUNT(*) FROM modules WHERE status = 'planned') AS planned, (SELECT COUNT(*) FROM lessons) AS lessons, (SELECT COUNT(*) FROM vocabulary) AS words`).get() as Record<string, number>;
    expect(counts.published).toBe(1);
    expect(counts.planned).toBeGreaterThan(40);
    expect(counts.lessons).toBe(5); // 4 core lessons + the generated review lesson
    expect(counts.words).toBe(36);
  });

  it('re-imports idempotently without losing learner progress', async () => {
    const t = await createTestApp();
    await t.json('POST', '/api/lessons/b1-01-l1/complete', { score: 0.9 });
    const words = t.db.prepare('SELECT COUNT(*) FROM user_vocab').pluck().get();
    const skipped = importAll(t.db, t.contentDir);
    expect(skipped.imported.filter((f) => f.startsWith('modules'))).toEqual([]);
    importAll(t.db, t.contentDir, { force: true });
    expect(t.db.prepare('SELECT COUNT(*) FROM user_vocab').pluck().get()).toBe(words);
    expect(t.db.prepare(`SELECT status FROM user_progress WHERE lesson_id = 'b1-01-l1'`).pluck().get()).toBe('completed');
    expect(t.db.prepare('SELECT COUNT(*) FROM lessons').pluck().get()).toBe(5);
    expect(t.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
