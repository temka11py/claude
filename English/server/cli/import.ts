// npm run content:import [-- --force] — import content/*.json into the database.
import { config } from '../config';
import { migrate, openDatabase } from '../db';
import { importAll } from '../content/importer';

const db = openDatabase(config.databasePath);
migrate(db);
const report = importAll(db, config.contentDir, { force: process.argv.includes('--force') });
for (const f of report.imported) console.log(`✓ ${f}`);
for (const f of report.skipped) console.log(`· ${f} (unchanged)`);
for (const e of report.errors) console.log(`✗ ${e.file}\n${e.message}`);
console.log(`\n${report.imported.length} imported, ${report.skipped.length} unchanged, ${report.errors.length} errors`);
db.close();
process.exit(report.errors.length ? 1 : 0);
