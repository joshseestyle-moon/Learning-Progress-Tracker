require('dotenv').config();
const express = require('express');
const path = require('path');

// Initialize DB (creates schema on first run)
const db = require('./db/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/users',       require('./routes/users'));
app.use('/api/subjects',    require('./routes/subjects'));
app.use('/api/timetable',   require('./routes/timetable'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/exams',       require('./routes/exams'));
app.use('/api/chapters',    require('./routes/chapters'));
app.use('/api/studylog',    require('./routes/studylog'));
app.use('/api/grades',      require('./routes/grades'));
app.use('/api/badges',      require('./routes/badges'));
app.use('/api/shop',        require('./routes/shop'));
app.use('/api/daily-tasks', require('./routes/daily-tasks'));
app.use('/api/periods',     require('./routes/periods'));
app.use('/api/goals',       require('./routes/goals'));

// Backup: checkpoint WAL first so the downloaded file is complete
app.get('/api/backup', (req, res) => {
  const dbPath = path.resolve(process.env.DB_PATH || './data/app.db');
  db.pragma('wal_checkpoint(TRUNCATE)');
  const filename = `studyapp-backup-${new Date().toISOString().slice(0,10)}.db`;
  res.download(dbPath, filename);
});

// Import: restore from uploaded backup file (hot-swap, no server restart needed)
app.post('/api/backup', express.raw({ type: 'application/octet-stream', limit: '500mb' }), (req, res) => {
  const buf = req.body;
  const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');
  if (!Buffer.isBuffer(buf) || buf.length < 16 || !buf.slice(0, 16).equals(SQLITE_MAGIC)) {
    return res.status(400).json({ error: '不是有效的 SQLite 備份檔案' });
  }
  const fs = require('fs');
  const dbPath = path.resolve(process.env.DB_PATH || './data/app.db');
  const tmpPath = dbPath + '.import.tmp';
  try {
    fs.writeFileSync(tmpPath, buf);
    db.reinitialize(tmpPath);
    fs.unlinkSync(tmpPath);
    res.json({ ok: true });
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    res.status(500).json({ error: '匯入失敗：' + e.message });
  }
});

// SPA fallback — serve app.html for any non-API route
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Study App running at http://localhost:${PORT}`);
  console.log('LAN: http://<your-ip>:' + PORT);
});
