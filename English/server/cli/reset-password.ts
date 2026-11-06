// npm run user:reset-password -- <username> <new-password>
import { config } from '../config';
import { migrate, openDatabase } from '../db';
import { hashPassword } from '../auth';

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.log('Usage: npm run user:reset-password -- <username> <new-password (8+ characters)>');
  process.exit(1);
}
const db = openDatabase(config.databasePath);
migrate(db);
const info = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashPassword(password), username);
if (!info.changes) {
  console.log(`No user named "${username}".`);
  process.exit(1);
}
db.prepare('DELETE FROM auth_sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run(username);
console.log(`Password updated for ${username}. Existing sessions were signed out.`);
db.close();
