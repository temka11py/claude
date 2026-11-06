// npm run content:validate [-- path/to/file.json ...]
// Validates content files against the schema and runs quality checks.
// With no arguments: every module, the placement test, scenarios and level exams.

import fs from 'node:fs';
import path from 'node:path';
import type { ZodSchema } from 'zod';
import { config } from '../config';
import { formatZodError, readModuleFile } from '../content/importer';
import { lintModule } from '../content/lint';
import { levelExamDoc, levelsDoc, placementDoc, scenarioDoc } from '@shared/contentSchema';

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listJson(full) : e.name.endsWith('.json') ? [full] : [];
  });
}

function schemaFor(file: string): ZodSchema | null {
  const rel = path.relative(config.contentDir, file).replace(/\\/g, '/');
  if (rel === 'placement.json') return placementDoc;
  if (rel === 'scenarios.json') return scenarioDoc;
  if (rel === 'levels.json') return levelsDoc;
  if (rel.startsWith('exams/')) return levelExamDoc;
  return null;
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((a) => path.resolve(a))
  : [
      ...['levels.json', 'placement.json', 'scenarios.json'].map((f) => path.join(config.contentDir, f)).filter((f) => fs.existsSync(f)),
      ...listJson(path.join(config.contentDir, 'exams')),
      ...listJson(path.join(config.contentDir, 'modules')),
    ];
let errors = 0;
let warnings = 0;
const ids = new Map<string, string>();

for (const file of files) {
  const rel = path.relative(config.contentDir, file);
  const other = schemaFor(file);
  if (other) {
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      errors++;
      console.log(`\n✗ ${rel}: invalid JSON — ${(e as Error).message}`);
      continue;
    }
    const r = other.safeParse(json);
    if (r.success) console.log(`\n✓ ${rel}`);
    else {
      errors++;
      console.log(`\n✗ ${rel}\n${formatZodError(r.error)}`);
    }
    continue;
  }
  const { doc, error } = readModuleFile(file);
  if (error || !doc) {
    errors++;
    console.log(`\n✗ ${rel}\n${error}`);
    continue;
  }
  if (ids.has(doc.id)) {
    errors++;
    console.log(`\n✗ ${rel}: module id "${doc.id}" also used in ${ids.get(doc.id)}`);
  }
  ids.set(doc.id, rel);
  const issues = lintModule(doc);
  const errs = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warning');
  errors += errs.length;
  warnings += warns.length;
  const words = doc.lessons.reduce((a, l) => a + l.vocabulary.length, 0);
  console.log(`\n${errs.length ? '✗' : '✓'} ${rel} — ${doc.lessons.length} lessons, ${words} words${doc.test ? ', test' : ', NO TEST'}`);
  for (const i of issues) console.log(`   ${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.path}: ${i.message}`);
}

console.log(`\n${files.length} file(s), ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
