require('dotenv').config();
const express = require('express');
const path = require('path');

// Initialize DB (creates schema on first run)
require('./db/db');

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

// Backup: download the SQLite database file
app.get('/api/backup', (req, res) => {
  const dbPath = path.resolve(process.env.DB_PATH || './data/app.db');
  const filename = `studyapp-backup-${new Date().toISOString().slice(0,10)}.db`;
  res.download(dbPath, filename);
});

// SPA fallback — serve app.html for any non-API route
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Study App running at http://localhost:${PORT}`);
  console.log('LAN: http://<your-ip>:' + PORT);
});
