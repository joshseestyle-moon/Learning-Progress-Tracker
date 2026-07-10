// DB_PATH redirected to a temp file BEFORE requiring db/db.js so the real
// data/app.db is never touched.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const TMP_DB = path.join(os.tmpdir(), `autobackup-src-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;

const Database = require('better-sqlite3');
const db = require('../db/db');
const { performAutoBackup } = require('../utils/autoBackup');

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'autobackup-'));
}

after(() => {
  for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP_DB + ext); } catch (_) {} }
});

test('creates a snapshot on first run; the file is a valid, openable DB', () => {
  const dir = freshDir();
  const r = performAutoBackup(db, dir, '2026-07-10');
  assert.equal(r.created, true);
  assert.equal(r.file, 'auto-2026-07-10.db');
  const file = path.join(dir, 'backups', 'auto-2026-07-10.db');
  assert.ok(fs.existsSync(file));
  const snap = new Database(file, { readonly: true });
  const hasUsers = snap.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  snap.close();
  assert.ok(hasUsers, 'snapshot should contain the migrated schema');
});

test('skips when a snapshot already exists within the last 7 days', () => {
  const dir = freshDir();
  assert.equal(performAutoBackup(db, dir, '2026-07-10').created, true);
  const second = performAutoBackup(db, dir, '2026-07-10');
  assert.equal(second.created, false);
  // 3 days later — still inside the 7-day window → skip
  assert.equal(performAutoBackup(db, dir, '2026-07-13').created, false);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter(f => f.startsWith('auto-')).length, 1);
});

test('creates again once the interval has passed', () => {
  const dir = freshDir();
  assert.equal(performAutoBackup(db, dir, '2026-07-10').created, true);
  // 7 days later (today-6 = 07-11 > 07-10) → create
  assert.equal(performAutoBackup(db, dir, '2026-07-17').created, true);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter(f => f.startsWith('auto-')).length, 2);
});

test('prunes to the newest 8 snapshots', () => {
  const dir = freshDir();
  const bdir = path.join(dir, 'backups');
  fs.mkdirSync(bdir, { recursive: true });
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(bdir, `auto-2025-01-0${i}.db`), 'x');
  const r = performAutoBackup(db, dir, '2026-07-10'); // adds a 10th (real) → prune to 8
  assert.equal(r.created, true);
  const files = fs.readdirSync(bdir).filter(f => f.startsWith('auto-')).sort();
  assert.equal(files.length, 8);
  assert.ok(!files.includes('auto-2025-01-01.db'), 'oldest pruned');
  assert.ok(!files.includes('auto-2025-01-02.db'), '2nd oldest pruned');
  assert.ok(files.includes('auto-2026-07-10.db'), 'newest kept');
  assert.deepEqual(r.pruned.sort(), ['auto-2025-01-01.db', 'auto-2025-01-02.db']);
});

test('never throws when the backup dir cannot be created', () => {
  // Pass a FILE as dataDir → mkdir(<file>/backups) fails → caught, no throw.
  const asFile = path.join(os.tmpdir(), `autobackup-notdir-${Date.now()}`);
  fs.writeFileSync(asFile, 'x');
  const r = performAutoBackup(db, asFile, '2026-07-10');
  assert.equal(r.created, false);
  assert.ok(r.error, 'error surfaced, not thrown');
  fs.unlinkSync(asFile);
});
