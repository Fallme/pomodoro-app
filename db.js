const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_URL || path.join(dataDir, 'pomodoro.db');

let db;

async function initDB() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','in_progress','completed','abandoned')),
      priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('focus','short_break','long_break')),
      duration_minutes INTEGER NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      completed_at TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pomodoro_started ON pomodoro_sessions(started_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pomodoro_task ON pomodoro_sessions(task_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date)');

  // Auto-save on changes
  saveDB();

  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Helper: run query and return all rows
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run query and return first row
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

// Helper: run statement
function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return { changes: db.getRowsModified(), lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] };
}

// ─── Tasks ───

function getAllTasks(filter, sortBy) {
  let sql = 'SELECT * FROM tasks';
  const params = [];
  if (filter && filter !== 'all') {
    sql += ' WHERE state = ?';
    params.push(filter);
  }
  sql += sortBy === 'priority' ? ' ORDER BY priority ASC, created_at DESC' : ' ORDER BY created_at DESC';
  return queryAll(sql, params);
}

function createTask(title, priority) {
  const result = run('INSERT INTO tasks (title, priority) VALUES (?, ?)', [title, priority || 3]);
  return queryOne('SELECT * FROM tasks WHERE id = ?', [result.lastInsertRowid]);
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
  run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
  return queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
}

function deleteTask(id) {
  return run('DELETE FROM tasks WHERE id = ?', [id]);
}

// ─── Pomodoro Sessions ───

function logPomodoroSession(taskId, type, durationMinutes, completed) {
  const result = run(
    'INSERT INTO pomodoro_sessions (task_id, type, duration_minutes, completed_at, completed) VALUES (?, ?, ?, datetime(\'now\',\'localtime\'), ?)',
    [taskId || null, type, durationMinutes, completed ? 1 : 0]
  );
  return queryOne('SELECT * FROM pomodoro_sessions WHERE id = ?', [result.lastInsertRowid]);
}

function getPomodoroStats() {
  const row = queryOne(`
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
  `);

  const avgRow = queryOne(`
    SELECT COALESCE(AVG(daily_mins), 0) AS avg_daily FROM (
      SELECT SUM(duration_minutes) AS daily_mins
      FROM pomodoro_sessions
      WHERE type = 'focus' AND completed = 1
      GROUP BY date(started_at,'localtime')
    )
  `);

  return {
    today: { minutes: row.today_minutes, count: row.today_count },
    thisWeek: { minutes: row.week_minutes, count: row.week_count },
    total: { minutes: row.total_minutes, count: row.total_count },
    avgDaily: { minutes: Math.round(avgRow.avg_daily || 0), count: 0 },
    firstSessionDate: row.first_date
  };
}

function getWeeklyChartData() {
  return queryAll(`
    SELECT date(started_at,'localtime') AS day, SUM(duration_minutes) AS minutes
    FROM pomodoro_sessions
    WHERE type = 'focus' AND completed = 1
      AND date(started_at,'localtime') >= date('now','localtime','-6 days','weekday 1')
    GROUP BY day ORDER BY day
  `);
}

function getMonthlyTrendData() {
  return queryAll(`
    SELECT strftime('%Y-%m', started_at,'localtime') AS month, SUM(duration_minutes) AS minutes
    FROM pomodoro_sessions
    WHERE type = 'focus' AND completed = 1
      AND started_at >= date('now','localtime','-11 months','start of month')
    GROUP BY month ORDER BY month
  `);
}

function getDailyTaskStats(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  const tasks = queryAll(`
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
  `, [d]);
  const total = tasks.reduce((s, t) => s + (t.total_minutes || 0), 0);
  return { date: d, tasks, total_minutes: total };
}

function getTaskStats() {
  const row = queryOne(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN state = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN state = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN state = 'waiting' THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN state = 'abandoned' THEN 1 ELSE 0 END) AS abandoned
    FROM tasks
  `);
  const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
  return { total: row.total || 0, completed: row.completed || 0, in_progress: row.in_progress || 0, waiting: row.waiting || 0, abandoned: row.abandoned || 0, completion_rate: rate };
}

// ─── Checkins ───

function recordCheckin(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  const existing = queryOne('SELECT id FROM checkins WHERE date = ?', [d]);
  if (existing) return { date: d, created: false };
  run('INSERT INTO checkins (date) VALUES (?)', [d]);
  return { date: d, created: true };
}

function getCheckins(startDate, endDate) {
  const end = endDate || new Date().toISOString().slice(0, 10);
  const start = startDate || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  return queryAll('SELECT date, created_at FROM checkins WHERE date >= ? AND date <= ? ORDER BY date', [start, end]);
}

function getStreak() {
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let checkDate = today;
  while (true) {
    const row = queryOne('SELECT id FROM checkins WHERE date = ?', [checkDate]);
    if (!row) break;
    streak++;
    const prev = new Date(new Date(checkDate).getTime() - 86400000);
    checkDate = prev.toISOString().slice(0, 10);
  }
  return streak;
}

// Initialize on module load
const initPromise = initDB().catch(e => {
  console.error('[FATAL] Database init failed:', e.message);
  process.exit(1);
});

module.exports = {
  initPromise,
  getAllTasks, createTask, updateTask, deleteTask,
  logPomodoroSession, getPomodoroStats, getWeeklyChartData, getMonthlyTrendData, getDailyTaskStats, getTaskStats,
  recordCheckin, getCheckins, getStreak
};
