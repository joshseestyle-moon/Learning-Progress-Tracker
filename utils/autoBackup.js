// Weekly rotating backup taken at server start. VACUUM INTO produces a
// checkpointed, compact single-file snapshot that is safe to make while the DB
// connection is open (it reads committed state through the connection). A
// backup failure must NEVER block startup, so everything is wrapped and the
// function never throws.
const fs = require('fs');
const path = require('path');
const { addDays } = require('./catchup');

const KEEP = 8;               // retain the newest N snapshots
const MIN_INTERVAL_DAYS = 6;  // skip if a snapshot exists within the last 7 days (today-6 .. today)
const NAME_RE = /^auto-\d{4}-\d{2}-\d{2}\.db$/;

function listBackups(dir) {
  return fs.readdirSync(dir).filter(f => NAME_RE.test(f)).sort(); // YYYY-MM-DD sorts chronologically
}

// performAutoBackup(db, dataDir, todayStr) → { created, file?, pruned, error? }
function performAutoBackup(db, dataDir, todayStr) {
  try {
    const dir = path.join(dataDir, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const existing = listBackups(dir);
    const latest = existing.length ? existing[existing.length - 1].slice(5, 15) : null;
    const cutoff = addDays(todayStr, -MIN_INTERVAL_DAYS);
    if (latest && latest >= cutoff) return { created: false, pruned: [] };

    const finalName = `auto-${todayStr}.db`;
    const finalPath = path.join(dir, finalName);
    const tmpPath = path.join(dir, `.tmp-${todayStr}-${process.pid}.db`);
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    // Controlled path (no user input) but bind it anyway rather than interpolate.
    db.prepare('VACUUM INTO ?').run(tmpPath);
    fs.renameSync(tmpPath, finalPath);

    const pruned = [];
    const after = listBackups(dir);
    while (after.length > KEEP) {
      const victim = after.shift();
      fs.unlinkSync(path.join(dir, victim));
      pruned.push(victim);
    }
    return { created: true, file: finalName, pruned };
  } catch (err) {
    console.warn('[autoBackup]', err.message);
    return { created: false, pruned: [], error: err.message };
  }
}

module.exports = { performAutoBackup };
