// Preserve a populated phase-one database and its verified login during migration.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const directory = mkdtempSync(path.join(tmpdir(), 'bouwr-migration-'));
Object.assign(process.env, { APP_ORIGIN: 'https://migration.invalid', DATA_DIR: directory, BETTER_AUTH_SECRET: randomBytes(48).toString('base64'), VAULT_KEY: randomBytes(32).toString('base64') });
const { getSqlite } = await import('../lib/runtime.ts');
const sqlite = getSqlite();
try {
  sqlite.exec('CREATE TABLE bouwr_migrations (name TEXT PRIMARY KEY, applied TEXT NOT NULL)');
  for (const file of ['0000_unique_titania.sql', '0001_handy_iron_fist.sql']) {
    sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
    sqlite.prepare('INSERT INTO bouwr_migrations VALUES (?,?)').run(file, new Date().toISOString());
  }
  const { authOptions, getAuth } = await import('../lib/auth.ts');
  const { getMigrations } = await import('better-auth/db/migration');
  await (await getMigrations(authOptions())).runMigrations();
  const auth = getAuth();
  (await auth.$context).options.emailVerification.sendVerificationEmail = async () => {};
  const headers = { Origin: process.env.APP_ORIGIN, 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.230' };
  const body = { name: 'Existing developer', email: 'existing@migration.invalid', password: 'Existing-password-2026!' };
  const signUp = await auth.handler(new Request(process.env.APP_ORIGIN + '/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify(body) }));
  assert.equal(signUp.status, 200, await signUp.clone().text());
  const user = (await signUp.json()).user;
  sqlite.prepare('UPDATE user SET emailVerified=1 WHERE id=?').run(user.id);
  sqlite.prepare("INSERT INTO users VALUES (?,?,?,?,?,'{}',?)").run(user.id, body.email, body.name, 'Existing company', 'developer', new Date().toISOString());
  const { encrypt, decrypt } = await import('../lib/server.ts');
  const encrypted = await encrypt('Existing private hosting credentials');
  const project = randomUUID();
  sqlite.prepare("INSERT INTO projects (id,owner,title,client,description,category,budget,deadline,hosting,checklist,secret,created) VALUES (?,?,?,?,?,'WordPress',100001,'2026-12-01','Eigen hosting','[]',?,?)").run(project, user.id, 'Existing project', 'Existing client', 'Original scope', encrypted, new Date().toISOString());
  sqlite.prepare("INSERT INTO payments VALUES ('tr_Legacy',?,100001,15000,'paid',?)").run(project, new Date().toISOString());
  sqlite.prepare("INSERT INTO messages VALUES (?,?,?,'internal','Original conversation',?)").run(randomUUID(), project, user.id, new Date().toISOString());
  const oldPassword = sqlite.prepare('SELECT password FROM account WHERE userId=?').get(user.id).password;
  for (let run = 0; run < 2; run++) {
    const migration = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { env: process.env, encoding: 'utf8' });
    assert.equal(migration.status, 0, migration.stdout + migration.stderr);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM bouwr_migrations').get().n, 3);
  const saved = sqlite.prepare('SELECT * FROM projects WHERE id=?').get(project);
  assert.equal(saved.title, 'Existing project'); assert.equal(saved.budget, 100001); assert.equal(saved.payment_schedule, 'full');
  assert.equal(await decrypt(saved.secret), 'Existing private hosting credentials');
  assert.equal(sqlite.prepare('SELECT fee FROM payments WHERE id=?').get('tr_Legacy').fee, 15000);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM messages WHERE project=?').get(project).n, 1);
  assert.equal(sqlite.prepare('SELECT password FROM account WHERE userId=?').get(user.id).password, oldPassword);
  const signIn = await auth.handler(new Request(process.env.APP_ORIGIN + '/api/auth/sign-in/email', { method: 'POST', headers, body: JSON.stringify(body) }));
  assert.equal(signIn.status, 200, await signIn.clone().text());
  assert.ok(signIn.headers.get('set-cookie')?.includes('bouwr'));
  console.log('PASS: phase-one migration preserves verified login, password hash, project, encrypted vault, chat and legacy fees; repeated migration is safe.');
} finally { sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
