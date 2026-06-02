const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_URL || path.join(dataDir, 'pomodoro.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','in_progress','completed','abandoned')),
    priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('focus','short_break','long_break')),
    duration_minutes INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    completed_at TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_started ON pomodoro_sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_pomodoro_task ON pomodoro_sessions(task_id);
  CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date);
`);

// ─── Tasks ───

function getAllTasks(filter, sortBy) {
  let sql = 'SELECT * FROM tasks';
  const params = [];
  if (filter && filter !== 'all') {
    sql += ' WHERE state = ?';
    params.push(filter);
  }
  sql += sortBy === 'priority' ? ' ORDER BY priority ASC, created_at DESC' : ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
}

function createTask(title, priority) {
  const stmt = db.prepare('INSERT INTO tasks (title, priority) VALUES (?, ?)');
  const info = stmt.run(title, priority || 3);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
}

function updateTask(id, fields) {
  const sets = [];
  const params = [];
  if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
  if (fields.state !== undefined) { sets.push('state = ?'); params.push(fields.state); }
  if (fields.priority !== undefined) { sets.push('priority = ?'); params.push(fields.priority); }
  if (sets.length === 0) return null;
  sets.push("updated_at = datetime('now','localtime')");
  params.push(id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function deleteTask(id) {
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

// ─── Pomodoro Sessions ───

function logPomodoroSession(taskId, type, durationMinutes, completed) {
  const stmt = db.prepare(
    'INSERT INTO pomodoro_sessions (task_id, type, duration_minutes, completed_at, completed) VALUES (?, ?, ?, datetime(\'now\',\'localtime\'), ?)'
  );
  const info = stmt.run(taskId || null, type, durationMinutes, completed ? 1 : 0);
  return db.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').get(info.lastInsertRowid);
}

function getPomodoroStats() {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(started_at,'localtime') = date('now','localtime') THEN duration_minutes END), 0) AS today_minutes,
      COUNT(CASE WHEN date(started_at,'localtime') = date('now','localtime') THEN 1 END) AS today_count,
      COALESCE(SUM(CASE WHEN date(started_at,'localtime') >= date('now','localtime','-6 days','weekday 1') THEN duration_minutes END), 0) AS week_minutes,
      COUNT(CASE WHEN date(started_at,'localtime') >= date('now','localtime','-6 days','weekday 1') THEN 1 END) AS week_count,
      COALESCE(SUM(duration_minutes), 0) AS total_minutes,
      COUNT(*) AS total_count,
      (SELECT MIN(date(started_at,'localtime')) FROM pomodoro_sessions WHERE type='focus' AND completed=1) AS first_date
    FROM pomodoro_sessions
    WHERE type = 'focus' AND completed = 1
  `).get();

  // Calculate avg daily from daily totals
  const avgRow = db.prepare(`
    SELECT COALESCE(AVG(daily_mins), 0) AS avg_daily FROM (
      SELECT SUM(duration_minutes) AS daily_mins
      FROM pomodoro_sessions
      WHERE type = 'focus' AND completed = 1
      GROUP BY date(started_at,'localtime')
    )
  `).get();

  return {
    today: { minutes: row.today_minutes, count: row.today_count },
    thisWeek: { minutes: row.week_minutes, count: row.week_count },
    total: { minutes: row.total_minutes, count: row.total_count },
    avgDaily: { minutes: Math.round(avgRow.avg_daily), count: 0 },
    firstSessionDate: row.first_date
  };
}

function getWeeklyChartData() {
  return db.prepare(`
    SELECT date(started_at,'localtime') AS day, SUM(duration_minutes) AS minutes
    FROM pomodoro_sessions
    WHERE type = 'focus' AND completed = 1
      AND date(started_at,'localtime') >= date('now','localtime','-6 days','weekday 1')
    GROUP BY day ORDER BY day
  `).all();
}

function getMonthlyTrendData() {
  return db.prepare(`
    SELECT strftime('%Y-%m', started_at,'localtime') AS month, SUM(duration_minutes) AS minutes
    FROM pomodoro_sessions
    WHERE type = 'focus' AND completed = 1
      AND started_at >= date('now','localtime','-11 months','start of month')
    GROUP BY month ORDER BY month
  `).all();
}

function getDailyTaskStats(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  const tasks = db.prepare(`
    SELECT
      ps.task_id,
      COALESCE(t.title, '未分配') AS title,
      SUM(ps.duration_minutes) AS total_minutes,
      COUNT(*) AS session_count
    FROM pomodoro_sessions ps
    LEFT JOIN tasks t ON ps.task_id = t.id
    WHERE ps.type = 'focus' AND ps.completed = 1
      AND date(ps.started_at, 'localtime') = ?
    GROUP BY ps.task_id
    ORDER BY total_minutes DESC
  `).all(d);
  const total = tasks.reduce((s, t) => s + t.total_minutes, 0);
  return { date: d, tasks, total_minutes: total };
}

function getTaskStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN state = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN state = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN state = 'waiting' THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN state = 'abandoned' THEN 1 ELSE 0 END) AS abandoned
    FROM tasks
  `).get();
  const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
  return { total: row.total, completed: row.completed, in_progress: row.in_progress, waiting: row.waiting, abandoned: row.abandoned, completion_rate: rate };
}

// ─── Checkins ───

function recordCheckin(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT id FROM checkins WHERE date = ?').get(d);
  if (existing) return { date: d, created: false };
  db.prepare('INSERT INTO checkins (date) VALUES (?)').run(d);
  return { date: d, created: true };
}

function getCheckins(startDate, endDate) {
  const end = endDate || new Date().toISOString().slice(0, 10);
  const start = startDate || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  return db.prepare('SELECT date, created_at FROM checkins WHERE date >= ? AND date <= ? ORDER BY date').all(start, end);
}

function getStreak() {
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let checkDate = today;
  while (true) {
    const row = db.prepare('SELECT id FROM checkins WHERE date = ?').get(checkDate);
    if (!row) break;
    streak++;
    const prev = new Date(new Date(checkDate).getTime() - 86400000);
    checkDate = prev.toISOString().slice(0, 10);
  }
  return streak;
}

module.exports = {
  db,
  getAllTasks, createTask, updateTask, deleteTask,
  logPomodoroSession, getPomodoroStats, getWeeklyChartData, getMonthlyTrendData, getDailyTaskStats, getTaskStats,
  recordCheckin, getCheckins, getStreak
};
