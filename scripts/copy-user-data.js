/**
 * copy-user-data.js
 * 將指定來源帳號的所有資料複製到目標帳號。
 * 用法：node scripts/copy-user-data.js <來源名稱> <目標名稱>
 * 例如：node scripts/copy-user-data.js 邦正 測試用帳號
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

const [,, srcName, dstName] = process.argv;
if (!srcName || !dstName) {
  console.error('用法：node scripts/copy-user-data.js <來源名稱> <目標名稱>');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // 暫時關閉，避免複製中途衝突

const srcUser = db.prepare('SELECT * FROM users WHERE name = ?').get(srcName);
const dstUser = db.prepare('SELECT * FROM users WHERE name = ?').get(dstName);

if (!srcUser) { console.error(`找不到來源帳號：${srcName}`); process.exit(1); }
if (!dstUser) { console.error(`找不到目標帳號：${dstName}`); process.exit(1); }

console.log(`來源：${srcUser.name} (id=${srcUser.id})`);
console.log(`目標：${dstUser.name} (id=${dstUser.id})`);

const srcId = srcUser.id;
const dstId = dstUser.id;

db.transaction(() => {
  // ── 1. 清除目標帳號的既有資料（依賴順序：先子表後父表）──────────────
  console.log('清除目標帳號既有資料…');
  db.exec(`
    DELETE FROM daily_task_parts WHERE task_id IN (SELECT id FROM daily_tasks WHERE user_id = ${dstId});
    DELETE FROM daily_tasks         WHERE user_id = ${dstId};
    DELETE FROM badge_exchange_log  WHERE user_id = ${dstId};
    DELETE FROM custom_badge_earned WHERE user_id = ${dstId};
    DELETE FROM custom_badges       WHERE user_id = ${dstId};
    DELETE FROM redemption_log      WHERE user_id = ${dstId};
    DELETE FROM reward_items        WHERE user_id = ${dstId};
    DELETE FROM point_log           WHERE user_id = ${dstId};
    DELETE FROM user_badges         WHERE user_id = ${dstId};
    DELETE FROM grades              WHERE user_id = ${dstId};
    DELETE FROM study_log           WHERE user_id = ${dstId};
    DELETE FROM chapter_progress    WHERE user_id = ${dstId};
    DELETE FROM assignments         WHERE user_id = ${dstId};
    DELETE FROM exams               WHERE user_id = ${dstId};
    DELETE FROM timetable_slots     WHERE user_id = ${dstId};
  `);

  // chapters 屬於 subjects，不直接用 user_id 刪除
  // 先取得目標的 subject id 列表再刪
  const dstSubjIds = db.prepare('SELECT id FROM subjects WHERE user_id = ?').all(dstId).map(r => r.id);
  if (dstSubjIds.length) {
    const ids = dstSubjIds.join(',');
    db.exec(`
      DELETE FROM chapters WHERE subject_id IN (${ids});
      DELETE FROM subjects WHERE id IN (${ids});
    `);
  }

  // ── 2. 複製 subjects，建立 subject ID 對映 ──────────────────────────
  console.log('複製科目…');
  const srcSubjects = db.prepare('SELECT * FROM subjects WHERE user_id = ?').all(srcId);
  const subjMap = {}; // old subject_id → new subject_id

  const insSubj = db.prepare(
    'INSERT INTO subjects (user_id, name, color, created_at) VALUES (?, ?, ?, ?)'
  );
  for (const s of srcSubjects) {
    const info = insSubj.run(dstId, s.name, s.color, s.created_at);
    subjMap[s.id] = info.lastInsertRowid;
  }
  console.log(`  科目：${srcSubjects.length} 筆`);

  // ── 3. 複製 chapters，建立 chapter ID 對映 ──────────────────────────
  console.log('複製章節…');
  const srcChapters = db.prepare(
    `SELECT * FROM chapters WHERE subject_id IN (${srcSubjects.map(s=>s.id).join(',') || 'NULL'})`
  ).all();
  const chapMap = {}; // old chapter_id → new chapter_id

  const insChap = db.prepare(
    'INSERT INTO chapters (subject_id, title, sort_order, created_at) VALUES (?, ?, ?, ?)'
  );
  for (const c of srcChapters) {
    const newSubjId = subjMap[c.subject_id];
    if (!newSubjId) continue;
    const info = insChap.run(newSubjId, c.title, c.sort_order, c.created_at);
    chapMap[c.id] = info.lastInsertRowid;
  }
  console.log(`  章節：${srcChapters.length} 筆`);

  // ── 4. 複製 timetable_slots ─────────────────────────────────────────
  const srcSlots = db.prepare('SELECT * FROM timetable_slots WHERE user_id = ?').all(srcId);
  const insSlot = db.prepare(
    'INSERT INTO timetable_slots (user_id, subject_id, day_of_week, period, school_year, semester, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const s of srcSlots) {
    const newSubjId = subjMap[s.subject_id];
    if (!newSubjId) continue;
    insSlot.run(dstId, newSubjId, s.day_of_week, s.period, s.school_year, s.semester, s.created_at);
  }
  console.log(`  課表：${srcSlots.length} 筆`);

  // ── 5. 複製 assignments ──────────────────────────────────────────────
  const srcAssign = db.prepare('SELECT * FROM assignments WHERE user_id = ?').all(srcId);
  const insAssign = db.prepare(
    'INSERT INTO assignments (user_id, subject_id, title, description, due_date, is_done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const a of srcAssign) {
    const newSubjId = subjMap[a.subject_id];
    if (!newSubjId) continue;
    insAssign.run(dstId, newSubjId, a.title, a.description, a.due_date, a.is_done, a.created_at, a.updated_at);
  }
  console.log(`  作業：${srcAssign.length} 筆`);

  // ── 6. 複製 exams，建立 exam ID 對映 ────────────────────────────────
  const srcExams = db.prepare('SELECT * FROM exams WHERE user_id = ?').all(srcId);
  const examMap = {};
  const insExam = db.prepare(
    'INSERT INTO exams (user_id, subject_id, title, exam_date, exam_type, is_completed, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const e of srcExams) {
    const newSubjId = subjMap[e.subject_id];
    if (!newSubjId) continue;
    const info = insExam.run(dstId, newSubjId, e.title, e.exam_date, e.exam_type, e.is_completed, e.notes, e.created_at, e.updated_at);
    examMap[e.id] = info.lastInsertRowid;
  }
  console.log(`  考試：${srcExams.length} 筆`);

  // ── 7. 複製 chapter_progress ─────────────────────────────────────────
  const srcCP = db.prepare('SELECT * FROM chapter_progress WHERE user_id = ?').all(srcId);
  const insCP = db.prepare(
    'INSERT INTO chapter_progress (user_id, chapter_id, type, seq, scheduled_date, is_done, done_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  let cpCount = 0;
  for (const cp of srcCP) {
    const newChapId = chapMap[cp.chapter_id];
    if (!newChapId) continue;
    insCP.run(dstId, newChapId, cp.type, cp.seq, cp.scheduled_date, cp.is_done, cp.done_at, cp.notes);
    cpCount++;
  }
  console.log(`  章節進度：${cpCount} 筆`);

  // ── 8. 複製 study_log ────────────────────────────────────────────────
  const srcSL = db.prepare('SELECT * FROM study_log WHERE user_id = ?').all(srcId);
  const insSL = db.prepare(
    'INSERT INTO study_log (user_id, subject_id, log_date, minutes, note, chapter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  let slCount = 0;
  for (const sl of srcSL) {
    const newSubjId = subjMap[sl.subject_id];
    if (!newSubjId) continue;
    const newChapId = sl.chapter_id ? (chapMap[sl.chapter_id] || null) : null;
    insSL.run(dstId, newSubjId, sl.log_date, sl.minutes, sl.note, newChapId, sl.created_at);
    slCount++;
  }
  console.log(`  讀書紀錄：${slCount} 筆`);

  // ── 9. 複製 grades ───────────────────────────────────────────────────
  const srcGrades = db.prepare('SELECT * FROM grades WHERE user_id = ?').all(srcId);
  const insGrade = db.prepare(
    'INSERT INTO grades (user_id, subject_id, exam_id, exam_name, exam_date, score, max_score, notes, class_rank, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  let grCount = 0;
  for (const g of srcGrades) {
    const newSubjId = subjMap[g.subject_id];
    if (!newSubjId) continue;
    const newExamId = g.exam_id ? (examMap[g.exam_id] || null) : null;
    insGrade.run(dstId, newSubjId, newExamId, g.exam_name, g.exam_date, g.score, g.max_score, g.notes, g.class_rank, g.created_at);
    grCount++;
  }
  console.log(`  成績：${grCount} 筆`);

  // ── 10. 複製 user_badges ─────────────────────────────────────────────
  const srcBadges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(srcId);
  const insBadge = db.prepare(
    'INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)'
  );
  for (const b of srcBadges) insBadge.run(dstId, b.badge_id, b.earned_at);
  console.log(`  系統徽章：${srcBadges.length} 筆`);

  // ── 11. 複製 point_log ───────────────────────────────────────────────
  const srcPL = db.prepare('SELECT * FROM point_log WHERE user_id = ?').all(srcId);
  const insPL = db.prepare(
    'INSERT INTO point_log (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'
  );
  for (const p of srcPL) insPL.run(dstId, p.delta, p.reason, p.created_at);
  console.log(`  點數紀錄：${srcPL.length} 筆`);

  // ── 12. 複製 reward_items ────────────────────────────────────────────
  const srcRI = db.prepare('SELECT * FROM reward_items WHERE user_id = ?').all(srcId);
  const insRI = db.prepare(
    'INSERT INTO reward_items (user_id, name, cost, created_at) VALUES (?, ?, ?, ?)'
  );
  for (const r of srcRI) insRI.run(dstId, r.name, r.cost, r.created_at);
  console.log(`  獎勵商品：${srcRI.length} 筆`);

  // ── 13. 複製 redemption_log ──────────────────────────────────────────
  const srcRedeem = db.prepare('SELECT * FROM redemption_log WHERE user_id = ?').all(srcId);
  const insRedeem = db.prepare(
    'INSERT INTO redemption_log (user_id, item_name, cost, redeemed_at) VALUES (?, ?, ?, ?)'
  );
  for (const r of srcRedeem) insRedeem.run(dstId, r.item_name, r.cost, r.redeemed_at);
  console.log(`  兌換紀錄：${srcRedeem.length} 筆`);

  // ── 14. 複製 custom_badges + custom_badge_earned ─────────────────────
  const srcCB = db.prepare('SELECT * FROM custom_badges WHERE user_id = ?').all(srcId);
  const insCB = db.prepare(
    'INSERT INTO custom_badges (user_id, name, icon, desc, points, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const cbMap = {};
  for (const cb of srcCB) {
    const info = insCB.run(dstId, cb.name, cb.icon, cb.desc, cb.points, cb.category, cb.created_at);
    cbMap[cb.id] = info.lastInsertRowid;
  }
  console.log(`  自訂徽章：${srcCB.length} 筆`);

  const srcCBE = db.prepare('SELECT * FROM custom_badge_earned WHERE user_id = ?').all(srcId);
  const insCBE = db.prepare(
    'INSERT OR IGNORE INTO custom_badge_earned (user_id, custom_badge_id, earned_at) VALUES (?, ?, ?)'
  );
  let cbeCount = 0;
  for (const e of srcCBE) {
    const newCBId = cbMap[e.custom_badge_id];
    if (!newCBId) continue;
    insCBE.run(dstId, newCBId, e.earned_at);
    cbeCount++;
  }
  console.log(`  自訂徽章已獲得：${cbeCount} 筆`);

  // ── 15. 複製 badge_exchange_log ──────────────────────────────────────
  const srcExL = db.prepare('SELECT * FROM badge_exchange_log WHERE user_id = ?').all(srcId);
  const insExL = db.prepare(
    'INSERT INTO badge_exchange_log (user_id, badge_id, badge_name, badge_icon, points, exchanged_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const e of srcExL) insExL.run(dstId, e.badge_id, e.badge_name, e.badge_icon, e.points, e.exchanged_at);
  console.log(`  徽章兌換紀錄：${srcExL.length} 筆`);

  // ── 16. 複製 daily_tasks + daily_task_parts ──────────────────────────
  const srcDT = db.prepare('SELECT * FROM daily_tasks WHERE user_id = ?').all(srcId);
  const insDT = db.prepare(
    'INSERT INTO daily_tasks (user_id, task_date, title, is_done, subject_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insDTP = db.prepare(
    'INSERT INTO daily_task_parts (task_id, part_num, is_done) VALUES (?, ?, ?)'
  );
  let dtCount = 0;
  for (const t of srcDT) {
    const newSubjId = t.subject_id ? (subjMap[t.subject_id] || null) : null;
    const info = insDT.run(dstId, t.task_date, t.title, t.is_done, newSubjId, t.created_at);
    const newTaskId = info.lastInsertRowid;
    const parts = db.prepare('SELECT * FROM daily_task_parts WHERE task_id = ?').all(t.id);
    for (const p of parts) insDTP.run(newTaskId, p.part_num, p.is_done);
    dtCount++;
  }
  console.log(`  每日作業：${dtCount} 筆`);

  // ── 17. 同步目標帳號 lang 設定 ────────────────────────────────────────
  db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(srcUser.lang, dstId);

})();

console.log('\n✅ 複製完成！');
db.pragma('foreign_keys = ON');
db.close();
