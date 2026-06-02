const express = require('express');
const path = require('path');

let db;
try {
  db = require('./db');
} catch (e) {
  console.error('[FATAL] Database init failed:', e.message);
  process.exit(1);
}

let gitSync;
try {
  gitSync = require('./git-sync');
} catch (e) {
  console.error('[WARN] Git sync unavailable:', e.message);
  gitSync = { pull() {}, push() {}, isGitConfigured() { return false; } };
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// ─── Tasks API ───

app.get('/api/tasks', (req, res) => {
  const { state, sort } = req.query;
  res.json({ tasks: db.getAllTasks(state, sort) });
});

app.post('/api/tasks', (req, res) => {
  const { title, priority } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  const p = Math.min(5, Math.max(1, Number(priority) || 3));
  const task = db.createTask(title.trim(), p);
  gitSync.push();
  res.status(201).json({ task });
});

app.put('/api/tasks/:id', (req, res) => {
  const task = db.updateTask(Number(req.params.id), req.body);
  if (!task) return res.status(404).json({ error: 'task not found' });
  gitSync.push();
  res.json({ task });
});

app.delete('/api/tasks/:id', (req, res) => {
  const info = db.deleteTask(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'task not found' });
  gitSync.push();
  res.json({ success: true });
});

// ─── Pomodoro API ───

app.post('/api/pomodoro', (req, res) => {
  const { task_id, type, duration_minutes, completed } = req.body;
  if (!type || !duration_minutes) return res.status(400).json({ error: 'type and duration_minutes required' });
  const session = db.logPomodoroSession(task_id, type, duration_minutes, completed);
  if (type === 'focus' && completed) {
    db.recordCheckin();
  }
  gitSync.push();
  res.status(201).json({ session });
});

app.get('/api/pomodoro/stats', (req, res) => {
  res.json(db.getPomodoroStats());
});

app.get('/api/pomodoro/weekly', (req, res) => {
  res.json(db.getWeeklyChartData());
});

app.get('/api/pomodoro/monthly', (req, res) => {
  res.json(db.getMonthlyTrendData());
});

app.get('/api/pomodoro/daily-tasks', (req, res) => {
  res.json(db.getDailyTaskStats(req.query.date));
});

app.get('/api/tasks/stats', (req, res) => {
  res.json(db.getTaskStats());
});

// ─── Checkins API ───

app.get('/api/checkins', (req, res) => {
  const { startDate, endDate } = req.query;
  res.json({ checkins: db.getCheckins(startDate, endDate) });
});

app.get('/api/checkins/streak', (req, res) => {
  res.json({ streak: db.getStreak() });
});

app.post('/api/checkins', (req, res) => {
  const result = db.recordCheckin(req.body.date);
  gitSync.push();
  res.status(201).json(result);
});

// ─── Fallback ───

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Startup: pull latest data from git ───
try {
  gitSync.pull();
} catch (e) {
  console.error('[startup] git pull failed:', e.message);
}

// Only listen when running directly (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    const gitStatus = gitSync.isGitConfigured() ? ' | Git sync enabled' : ' | Git sync not configured';
    console.log(`Server running at http://localhost:${PORT}${gitStatus}`);
  });
}

module.exports = app;
