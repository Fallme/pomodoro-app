const api = {
  async request(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  getTasks(filter, sort) {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') params.set('state', filter);
    if (sort) params.set('sort', sort);
    const qs = params.toString();
    return this.request('GET', '/api/tasks' + (qs ? '?' + qs : ''));
  },

  createTask(title, priority) {
    return this.request('POST', '/api/tasks', { title, priority });
  },

  updateTask(id, fields) {
    return this.request('PUT', '/api/tasks/' + id, fields);
  },

  deleteTask(id) {
    return this.request('DELETE', '/api/tasks/' + id);
  },

  logPomodoro(session) {
    return this.request('POST', '/api/pomodoro', session);
  },

  getPomodoroStats() {
    return this.request('GET', '/api/pomodoro/stats');
  },

  getWeeklyChart() {
    return this.request('GET', '/api/pomodoro/weekly');
  },

  getMonthlyTrend() {
    return this.request('GET', '/api/pomodoro/monthly');
  },

  getDailyTaskStats(date) {
    const params = date ? '?date=' + date : '';
    return this.request('GET', '/api/pomodoro/daily-tasks' + params);
  },

  getCheckins(startDate, endDate) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    return this.request('GET', '/api/checkins' + (qs ? '?' + qs : ''));
  },

  getStreak() {
    return this.request('GET', '/api/checkins/streak');
  },

  recordCheckin(date) {
    return this.request('POST', '/api/checkins', { date });
  }
};
