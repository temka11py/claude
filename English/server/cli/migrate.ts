// npm run db:migrate — apply pending database migrations.
import { config } from '../config';
import { migrate, openDatabase } from '../db';

const db = openDatabase(config.databasePath);
const applied = migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
db.close();
