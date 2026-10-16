import bcrypt from 'bcrypt';
import { run, get } from '../config/database.js';
import { isStrongPassword } from '../utils/validators.js';

// Sets (or rotates) the admin's password from ADMIN_PASSWORD:
//   ADMIN_PASSWORD='...' npm run admin:set-password
// Use it once on any database seeded before the default password was
// removed from code, and whenever the admin password needs rotating.

const SALT_ROUNDS = 10;

async function setAdminPassword() {
  const email = process.env.ADMIN_EMAIL || 'admin@leadgen.local';
  const password = process.env.ADMIN_PASSWORD;

  if (!isStrongPassword(password)) {
    throw new Error('Set ADMIN_PASSWORD to at least 8 characters with a letter and a number.');
  }

  const admin = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (!admin) throw new Error(`No user with email ${email} — run npm run db:init first.`);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, admin.id]);
  console.log(`[Admin] Password updated for ${email}.`);
}

setAdminPassword()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[Admin] ${error.message}`);
    process.exit(1);
  });
