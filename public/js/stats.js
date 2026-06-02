class StatsDashboard {
  constructor() {
    this.pieCanvas = document.getElementById('pie-chart');
    this.weeklyCanvas = document.getElementById('weekly-chart');
    this.heatmapCanvas = document.getElementById('heatmap-chart');
    this.monthlyCanvas = document.getElementById('monthly-chart');
    this.historyPieCanvas = document.getElementById('history-pie');
    this.pieColors = ['#FF8C6B', '#FFB347', '#7BC89C', '#E88D8D', '#B5C7E8', '#FFD700', '#FF6B6B', '#98D8C8'];

    // History day view
    this.historySection = document.getElementById('history-section');
    this.historyDatePicker = document.getElementById('history-date-picker');
    this.historyDatePicker.addEventListener('change', () => this.loadHistoryDay());
  }

  async refresh() {
    try {
      const [stats, streak, weekly, checkins, dailyTasks, taskStats, monthly] = await Promise.all([
        api.getPomodoroStats(),
        api.getStreak(),
        api.getWeeklyChart(),
        api.getCheckins(),
        api.getDailyTaskStats(),
        api.getTaskStats(),
        api.getMonthlyTrend()
      ]);

      this.updateHero(stats, streak.streak);
      this.updateTaskStats(taskStats);
      this.drawPieChart(dailyTasks);
      this.renderDailyTaskList(dailyTasks);
      this.drawWeeklyChart(weekly);
      this.drawHeatmap(checkins.checkins);
      this.drawMonthlyChart(monthly);

      // Set up heatmap click for history
      this._checkinsData = checkins.checkins;
      this.heatmapCanvas.onclick = (e) => this.onHeatmapClick(e);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }

  updateHero(stats, streak) {
    document.getElementById('stat-today').textContent = stats.today.minutes;
    document.getElementById('stat-today-count').textContent = stats.today.count;
    document.getElementById('stat-streak').textContent = streak;
    document.getElementById('stat-total').textContent = stats.total.minutes;
  }

  updateTaskStats(ts) {
    document.getElementById('stat-task-total').textContent = ts.total;
    document.getElementById('stat-task-done').textContent = ts.completed;
    document.getElementById('stat-task-rate').textContent = ts.completion_rate + '%';
    document.getElementById('stat-task-progress').textContent = ts.in_progress;
  }

  // ─── Pie Chart (Donut) ───

  drawPieChart(data) {
    const canvas = this.pieCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 160;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const outerR = 68, innerR = 44;
    const tasks = data.tasks || [];
    const total = data.total_minutes || 0;

    // Legend
    const legendEl = document.getElementById('pie-legend');
    legendEl.innerHTML = '';

    if (tasks.length === 0 || total === 0) {
      // Empty state
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fill();
      // Center text
      ctx.fillStyle = '#8B7355';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', cx, cy + 4);
      legendEl.innerHTML = '<div class="legend-item"><span class="legend-dot" style="background:#C7C7CC"></span>暂无数据</div>';
      return;
    }

    let startAngle = -Math.PI / 2;
    tasks.forEach((t, i) => {
      const slice = (t.total_minutes / total) * Math.PI * 2;
      const color = this.pieColors[i % this.pieColors.length];

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
      ctx.arc(cx, cy, innerR, startAngle + slice, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      startAngle += slice;

      // Legend item
      const pct = Math.round((t.total_minutes / total) * 100);
      legendEl.innerHTML += `
        <div class="legend-item">
          <span class="legend-dot" style="background:${color}"></span>
          <span>${this.escHtml(t.title)}</span>
          <span class="legend-mins">${t.total_minutes}m</span>
        </div>`;
    });

    // Center text
    ctx.fillStyle = '#1C1C1E';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 6);
    ctx.fillStyle = '#8B7355';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('分钟', cx, cy + 14);
  }

  // ─── Daily Task List ───

  renderDailyTaskList(data) {
    const listEl = document.getElementById('daily-task-list');
    const tasks = data.tasks || [];
    const total = data.total_minutes || 0;

    if (tasks.length === 0) {
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = tasks.map((t, i) => {
      const pct = total > 0 ? (t.total_minutes / total) * 100 : 0;
      const color = this.pieColors[i % this.pieColors.length];
      return `
        <div class="daily-task-row">
          <span class="daily-task-name">${this.escHtml(t.title)}</span>
          <div class="daily-task-bar-bg">
            <div class="daily-task-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="daily-task-mins">${t.total_minutes}m</span>
        </div>`;
    }).join('');
  }

  // ─── Weekly Bar Chart ───

  drawWeeklyChart(data) {
    const canvas = this.weeklyCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    const days = ['一', '二', '三', '四', '五', '六', '日'];
    const weekData = new Array(7).fill(0);
    data.forEach(d => {
      const dt = new Date(d.day + 'T00:00:00');
      weekData[(dt.getDay() + 6) % 7] = d.minutes;
    });

    const pad = { top: 15, right: 15, bottom: 30, left: 35 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;
    const maxVal = Math.max(...weekData, 30);
    const barW = cW / 7 * 0.55;
    const gap = cW / 7;

    // Grid
    ctx.strokeStyle = 'rgba(139,115,85,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (cH * i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#8B7355';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 4), pad.left - 6, y + 3);
    }

    // Bars
    weekData.forEach((val, i) => {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const barH = maxVal > 0 ? (val / maxVal) * cH : 0;
      const y = pad.top + cH - barH;

      const grad = ctx.createLinearGradient(x, y, x, pad.top + cH);
      grad.addColorStop(0, '#FF8C6B');
      grad.addColorStop(1, '#FFB5A0');
      ctx.fillStyle = grad;

      if (barH > 0) {
        ctx.beginPath();
        const r = Math.min(4, barW / 2);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, pad.top + cH);
        ctx.lineTo(x, pad.top + cH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.fill();
      }

      ctx.fillStyle = '#8B7355';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(days[i], x + barW / 2, H - 8);
    });
  }

  // ─── Heatmap ───

  drawHeatmap(checkins) {
    const canvas = this.heatmapCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    const dateSet = new Set(checkins.map(c => c.date));
    const cellSize = 14;
    const cellGap = 3;
    const totalW = cellSize + cellGap;
    const labelW = 22;
    const weeks = 13;

    // Day labels
    const dayLabels = ['一', '', '三', '', '五', '', '日'];
    ctx.fillStyle = '#8B7355';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    dayLabels.forEach((label, i) => {
      if (label) ctx.fillText(label, labelW - 4, 12 + i * totalW + cellSize / 2 + 3);
    });

    // Cells
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (weeks * 7 - 1) - ((today.getDay() + 6) % 7));

    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + w * 7 + d);
        if (cellDate > today) continue;

        const dateStr = cellDate.toISOString().slice(0, 10);
        const x = labelW + w * totalW;
        const y = 2 + d * totalW;

        ctx.beginPath();
        const r = 3;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + cellSize - r, y);
        ctx.quadraticCurveTo(x + cellSize, y, x + cellSize, y + r);
        ctx.lineTo(x + cellSize, y + cellSize - r);
        ctx.quadraticCurveTo(x + cellSize, y + cellSize, x + cellSize - r, y + cellSize);
        ctx.lineTo(x + r, y + cellSize);
        ctx.quadraticCurveTo(x, y + cellSize, x, y + cellSize - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();

        ctx.fillStyle = dateSet.has(dateStr) ? '#FF8C6B' : 'rgba(0,0,0,0.05)';
        ctx.fill();
      }
    }
  }

  // ─── Monthly Trend Line Chart ───

  drawMonthlyChart(data) {
    const canvas = this.monthlyCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    if (!data || data.length === 0) {
      ctx.fillStyle = '#8B7355';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', W / 2, H / 2 + 4);
      return;
    }

    const pad = { top: 15, right: 20, bottom: 30, left: 40 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map(d => d.minutes), 30);

    // Grid
    ctx.strokeStyle = 'rgba(139,115,85,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (cH * i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#8B7355';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 4), pad.left - 6, y + 3);
    }

    // Line + Area
    const points = data.map((d, i) => ({
      x: pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW),
      y: pad.top + cH - (d.minutes / maxVal) * cH
    }));

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, 'rgba(255,140,107,0.25)');
    grad.addColorStop(1, 'rgba(255,140,107,0.02)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + cH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const cp1x = (points[i - 1].x + points[i].x) / 2;
      ctx.bezierCurveTo(cp1x, points[i - 1].y, cp1x, points[i].y, points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#FF8C6B';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Dots
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FF8C6B';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Value label
      ctx.fillStyle = '#2C1810';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      if (data[i].minutes > 0) {
        ctx.fillText(data[i].minutes, p.x, p.y - 10);
      }
    });

    // X labels
    data.forEach((d, i) => {
      const label = d.month.slice(5); // "01", "02", ...
      ctx.fillStyle = '#8B7355';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label + '月', points[i].x, H - 8);
    });
  }

  // ─── Heatmap Click → History Day ───

  onHeatmapClick(e) {
    const rect = this.heatmapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.heatmapCanvas.width / rect.width / (window.devicePixelRatio || 1));
    const y = (e.clientY - rect.top) * (this.heatmapCanvas.height / rect.height / (window.devicePixelRatio || 1));

    const cellSize = 14;
    const cellGap = 3;
    const totalW = cellSize + cellGap;
    const labelW = 22;

    const col = Math.floor((x - labelW) / totalW);
    const row = Math.floor((y - 2) / totalW);

    if (col < 0 || col >= 13 || row < 0 || row >= 7) return;

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (13 * 7 - 1) - ((today.getDay() + 6) % 7));

    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + col * 7 + row);
    if (cellDate > today) return;

    const dateStr = cellDate.toISOString().slice(0, 10);
    this.historyDatePicker.value = dateStr;
    this.loadHistoryDay();
  }

  async loadHistoryDay() {
    const date = this.historyDatePicker.value;
    if (!date) return;

    try {
      const data = await api.getDailyTaskStats(date);
      this.historySection.style.display = '';
      document.getElementById('history-date-label').textContent = date + ' 任务分布';
      this.drawHistoryPie(data);
      this.renderHistoryTaskList(data);
    } catch (e) {
      console.error('Failed to load history day:', e);
    }
  }

  drawHistoryPie(data) {
    const canvas = this.historyPieCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 160;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const outerR = 68, innerR = 44;
    const tasks = data.tasks || [];
    const total = data.total_minutes || 0;

    const legendEl = document.getElementById('history-pie-legend');
    legendEl.innerHTML = '';

    if (tasks.length === 0 || total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fill();
      ctx.fillStyle = '#8B7355';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', cx, cy + 4);
      return;
    }

    let startAngle = -Math.PI / 2;
    tasks.forEach((t, i) => {
      const slice = (t.total_minutes / total) * Math.PI * 2;
      const color = this.pieColors[i % this.pieColors.length];

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
      ctx.arc(cx, cy, innerR, startAngle + slice, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      startAngle += slice;

      const pct = Math.round((t.total_minutes / total) * 100);
      legendEl.innerHTML += `
        <div class="legend-item">
          <span class="legend-dot" style="background:${color}"></span>
          <span>${this.escHtml(t.title)}</span>
          <span class="legend-mins">${t.total_minutes}m</span>
        </div>`;
    });

    ctx.fillStyle = '#1C1C1E';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 6);
    ctx.fillStyle = '#8B7355';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('分钟', cx, cy + 14);
  }

  renderHistoryTaskList(data) {
    const listEl = document.getElementById('history-task-list');
    const tasks = data.tasks || [];
    const total = data.total_minutes || 0;

    if (tasks.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>该日无专注记录</p></div>';
      return;
    }

    listEl.innerHTML = tasks.map((t, i) => {
      const pct = total > 0 ? (t.total_minutes / total) * 100 : 0;
      const color = this.pieColors[i % this.pieColors.length];
      return `
        <div class="daily-task-row">
          <span class="daily-task-name">${this.escHtml(t.title)}</span>
          <div class="daily-task-bar-bg">
            <div class="daily-task-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="daily-task-mins">${t.total_minutes}m</span>
        </div>`;
    }).join('');
  }

  escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}
