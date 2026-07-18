const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const TMP_DB = path.join(__dirname, `tmp-copyguard-${process.pid}.db`);
const SCRIPT = path.join(__dirname, '..', 'scripts', 'copy-user-data.js');

function runScript(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, DB_PATH: TMP_DB },
    encoding: 'utf8'
  });
}

before(() => {
  const db = new Database(TMP_DB);
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  const ins = db.prepare('INSERT INTO users (name) VALUES (?)');
  ins.run('測試用帳號B');
  ins.run('測試重複');
  ins.run('測試重複');
  db.close();
});

after(() => {
  for (const suf of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suf); } catch {}
  }
});

test('來源與目標為同一帳號時拒絕執行', () => {
  const r = runScript(['測試用帳號B', '測試用帳號B']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /同一個帳號/);
});

test('名稱對應多個帳號時拒絕執行（來源歧義）', () => {
  const r = runScript(['測試重複', '測試用帳號B']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /2 個帳號/);
});

test('名稱對應多個帳號時拒絕執行（目標歧義）', () => {
  const r = runScript(['測試用帳號B', '測試重複']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /2 個帳號/);
});

test('目標名稱不含「測試」且無 --allow-any 時拒絕執行（既有護欄不退化）', () => {
  const r = runScript(['測試用帳號B', '真實帳號']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--allow-any/);
});
