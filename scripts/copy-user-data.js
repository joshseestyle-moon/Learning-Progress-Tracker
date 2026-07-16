/**
 * copy-user-data.js
 * 將指定來源帳號的所有資料複製到目標帳號。
 * 用法：node scripts/copy-user-data.js <來源名稱> <目標名稱> [--allow-any]
 * 例如：node scripts/copy-user-data.js 邦正 測試用帳號B
 *
 * 安全護欄：目標帳號名稱不含「測試」時，除非帶 --allow-any 旗標，否則拒絕執行
 * （清除段是毀滅性的，避免手滑打到真實帳號）。
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

const rawArgs = process.argv.slice(2);
const allowAny = rawArgs.includes('--allow-any');
const [srcName, dstName] = rawArgs.filter(a => !a.startsWith('--'));

if (!srcName || !dstName) {
  console.error('用法：node scripts/copy-user-data.js <來源名稱> <目標名稱> [--allow-any]');
  process.exit(1);
}

if (!dstName.includes('測試') && !allowAny) {
  console.error(`目標帳號「${dstName}」名稱不含「測試」，拒絕執行（避免誤複製到真實帳號）。若確定要這麼做，加上 --allow-any 旗標。`);
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
    DELETE FROM catchup_quest_items WHERE quest_id IN (SELECT id FROM catchup_quests WHERE user_id = ${dstId});
    DELETE FROM catchup_quests      WHERE user_id = ${dstId};
    DELETE FROM daily_reward_log    WHERE user_id = ${dstId};
    DELETE FROM xp_log              WHERE user_id = ${dstId};
    DELETE FROM goals               WHERE user_id = ${dstId};
    DELETE FROM periods             WHERE user_id = ${dstId};
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
    'INSERT INTO subjects (user_id, name, color, category, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const s of srcSubjects) {
    const info = insSubj.run(dstId, s.name, s.color, s.category, s.created_at);
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

  // ── 7. 複製 chapter_progress，建立 progress ID 對映 ──────────────────
  const srcCP = db.prepare('SELECT * FROM chapter_progress WHERE user_id = ?').all(srcId);
  const insCP = db.prepare(
    'INSERT INTO chapter_progress (user_id, chapter_id, type, seq, scheduled_date, original_scheduled_date, is_done, done_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const cpMap = {}; // old chapter_progress id → new id
  let cpCount = 0;
  for (const cp of srcCP) {
    const newChapId = chapMap[cp.chapter_id];
    if (!newChapId) continue;
    const info = insCP.run(dstId, newChapId, cp.type, cp.seq, cp.scheduled_date, cp.original_scheduled_date, cp.is_done, cp.done_at, cp.notes);
    cpMap[cp.id] = info.lastInsertRowid;
    cpCount++;
  }
  console.log(`  章節進度：${cpCount} 筆`);

  // ── 8. 複製 study_log，建立 study_log ID 對映 ─────────────────────────
  const srcSL = db.prepare('SELECT * FROM study_log WHERE user_id = ?').all(srcId);
  const insSL = db.prepare(
    'INSERT INTO study_log (user_id, subject_id, log_date, minutes, note, chapter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const slMap = {}; // old study_log id → new id
  let slCount = 0;
  for (const sl of srcSL) {
    const newSubjId = subjMap[sl.subject_id];
    if (!newSubjId) continue;
    const newChapId = sl.chapter_id ? (chapMap[sl.chapter_id] || null) : null;
    const info = insSL.run(dstId, newSubjId, sl.log_date, sl.minutes, sl.note, newChapId, sl.created_at);
    slMap[sl.id] = info.lastInsertRowid;
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

  // ── 16. 複製 daily_tasks + daily_task_parts，建立 task ID 對映 ────────
  const srcDT = db.prepare('SELECT * FROM daily_tasks WHERE user_id = ?').all(srcId);
  const insDT = db.prepare(
    'INSERT INTO daily_tasks (user_id, task_date, title, is_done, subject_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insDTP = db.prepare(
    'INSERT INTO daily_task_parts (task_id, part_num, is_done) VALUES (?, ?, ?)'
  );
  const taskMap = {}; // old daily_tasks id → new id（parts 不需要 map）
  let dtCount = 0;
  for (const t of srcDT) {
    const newSubjId = t.subject_id ? (subjMap[t.subject_id] || null) : null;
    const info = insDT.run(dstId, t.task_date, t.title, t.is_done, newSubjId, t.created_at);
    const newTaskId = info.lastInsertRowid;
    taskMap[t.id] = newTaskId;
    const parts = db.prepare('SELECT * FROM daily_task_parts WHERE task_id = ?').all(t.id);
    for (const p of parts) insDTP.run(newTaskId, p.part_num, p.is_done);
    dtCount++;
  }
  console.log(`  每日作業：${dtCount} 筆`);

  // ── 17. 同步目標帳號設定（lang / 每日每週目標分鐘）────────────────────
  db.prepare('UPDATE users SET lang = ?, daily_goal_minutes = ?, weekly_goal_minutes = ? WHERE id = ?')
    .run(srcUser.lang, srcUser.daily_goal_minutes, srcUser.weekly_goal_minutes, dstId);

  // ── 18. 複製 periods，建立 period ID 對映 ─────────────────────────────
  const srcPeriods = db.prepare('SELECT * FROM periods WHERE user_id = ?').all(srcId);
  const insPeriod = db.prepare(
    'INSERT INTO periods (user_id, school_year, type, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const periodMap = {}; // old period id → new id
  for (const p of srcPeriods) {
    const info = insPeriod.run(dstId, p.school_year, p.type, p.start_date, p.end_date, p.created_at);
    periodMap[p.id] = info.lastInsertRowid;
  }
  console.log(`  學習區間：${srcPeriods.length} 筆`);

  // ── 19. 複製 goals，建立 goal ID 對映 ──────────────────────────────────
  const srcGoals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(srcId);
  const insGoal = db.prepare(
    'INSERT INTO goals (user_id, title, goal_type, horizon, period_id, subject_id, exam_type, target_value, due_date, is_done, done_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const goalMap = {}; // old goal id → new id
  for (const g of srcGoals) {
    let newPeriodId = null;
    if (g.period_id != null) {
      newPeriodId = periodMap[g.period_id] || null;
      if (newPeriodId == null) console.warn(`  警告：goal id=${g.id} 的 period_id=${g.period_id} 對映不到，改設為 null`);
    }
    let newSubjId = null;
    if (g.subject_id != null) {
      newSubjId = subjMap[g.subject_id] || null;
      if (newSubjId == null) console.warn(`  警告：goal id=${g.id} 的 subject_id=${g.subject_id} 對映不到，改設為 null`);
    }
    const info = insGoal.run(dstId, g.title, g.goal_type, g.horizon, newPeriodId, newSubjId, g.exam_type, g.target_value, g.due_date, g.is_done, g.done_at, g.created_at);
    goalMap[g.id] = info.lastInsertRowid;
  }
  console.log(`  學習目標：${srcGoals.length} 筆`);

  // ── 20. 複製 catchup_quests + catchup_quest_items，建立 quest ID 對映 ──
  const srcQuests = db.prepare('SELECT * FROM catchup_quests WHERE user_id = ?').all(srcId);
  const insQuest = db.prepare(
    'INSERT INTO catchup_quests (user_id, title, target_count, deadline_date, bonus_points, bonus_xp, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const questMap = {}; // old quest id → new id
  for (const q of srcQuests) {
    const info = insQuest.run(dstId, q.title, q.target_count, q.deadline_date, q.bonus_points, q.bonus_xp, q.status, q.created_at, q.completed_at);
    questMap[q.id] = info.lastInsertRowid;
  }
  console.log(`  補救任務：${srcQuests.length} 筆`);

  const insQuestItem = db.prepare(
    'INSERT INTO catchup_quest_items (quest_id, kind, item_id) VALUES (?, ?, ?)'
  );
  let qiCount = 0;
  let qiSkipped = 0;
  for (const q of srcQuests) {
    const newQuestId = questMap[q.id];
    const items = db.prepare('SELECT * FROM catchup_quest_items WHERE quest_id = ?').all(q.id);
    for (const item of items) {
      let newItemId = null;
      if (item.kind === 'chapter') newItemId = cpMap[item.item_id];
      else if (item.kind === 'task') newItemId = taskMap[item.item_id];
      if (!newItemId) {
        console.warn(`  警告：quest item quest_id=${item.quest_id} kind=${item.kind} item_id=${item.item_id} 對映不到，跳過`);
        qiSkipped++;
        continue;
      }
      insQuestItem.run(newQuestId, item.kind, newItemId);
      qiCount++;
    }
  }
  console.log(`  補救任務項目：${qiCount} 筆（跳過 ${qiSkipped} 筆對映不到的）`);

  // ── 21. 複製 xp_log，reason 內嵌 id 依 map 改寫 ────────────────────────
  function rewriteReason(reason) {
    let m;
    if ((m = /^study:(\d+)$/.exec(reason))) {
      const newId = slMap[m[1]];
      if (newId) return { reason: `study:${newId}`, unmapped: false };
      return { reason, unmapped: true };
    }
    if ((m = /^chapter:(\d+)$/.exec(reason))) {
      const newId = cpMap[m[1]];
      if (newId) return { reason: `chapter:${newId}`, unmapped: false };
      return { reason, unmapped: true };
    }
    if ((m = /^task:(\d+):(.+)$/.exec(reason))) {
      const newId = taskMap[m[1]];
      if (newId) return { reason: `task:${newId}:${m[2]}`, unmapped: false };
      return { reason, unmapped: true };
    }
    if ((m = /^goal:(\d+)$/.exec(reason))) {
      const newId = goalMap[m[1]];
      if (newId) return { reason: `goal:${newId}`, unmapped: false };
      return { reason, unmapped: true };
    }
    if ((m = /^quest:(\d+)$/.exec(reason))) {
      const newId = questMap[m[1]];
      if (newId) return { reason: `quest:${newId}`, unmapped: false };
      return { reason, unmapped: true };
    }
    // backfill:% 及其他不符合上述樣式者，原樣保留，不計入 unmapped
    return { reason, unmapped: false };
  }

  const srcXP = db.prepare('SELECT * FROM xp_log WHERE user_id = ?').all(srcId);
  const insXP = db.prepare(
    'INSERT INTO xp_log (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'
  );
  let xpUnmapped = 0;
  for (const x of srcXP) {
    const { reason, unmapped } = rewriteReason(x.reason);
    if (unmapped) xpUnmapped++;
    insXP.run(dstId, x.delta, reason, x.created_at);
  }
  console.log(`  XP 紀錄：${srcXP.length} 筆（reason 樣式符合但對映不到、原樣保留：${xpUnmapped} 筆）`);

  // ── 22. 複製 daily_reward_log ──────────────────────────────────────────
  const srcDRL = db.prepare('SELECT * FROM daily_reward_log WHERE user_id = ?').all(srcId);
  const insDRL = db.prepare(
    'INSERT INTO daily_reward_log (user_id, reward_date, tier, points, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const r of srcDRL) insDRL.run(dstId, r.reward_date, r.tier, r.points, r.created_at);
  console.log(`  每日驚喜獎勵紀錄：${srcDRL.length} 筆`);

})();

console.log('\n✅ 複製完成！');
db.pragma('foreign_keys = ON');
db.close();
