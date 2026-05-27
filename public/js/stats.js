class StatsDashboard {
  constructor() {
    this.weeklyCanvas = document.getElementById('weekly-chart');
    this.monthlyCanvas = document.getElementById('monthly-chart');
    this.heatmapCanvas = document.getElementById('heatmap-chart');
  }

  async refresh() {
    try {
      const [stats, streak, weekly, monthly, checkins] = await Promise.all([
        api.getPomodoroStats(),
        api.getStreak(),
        api.getWeeklyChart(),
        api.getMonthlyTrend(),
        api.getCheckins()
      ]);

      this.updateCards(stats);
      this.updateStreak(streak.streak);
      this.drawWeeklyChart(weekly);
      this.drawMonthlyChart(monthly);
      this.drawHeatmap(checkins.checkins);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }

  updateCards(stats) {
    document.getElementById('stat-today').textContent = stats.today.minutes;
    document.getElementById('stat-today-count').textContent = stats.today.count + '个';
    document.getElementById('stat-week').textContent = stats.thisWeek.minutes;
    document.getElementById('stat-week-count').textContent = stats.thisWeek.count + '个';
    document.getElementById('stat-total').textContent = stats.total.minutes;
    document.getElementById('stat-total-count').textContent = stats.total.count + '个';
    document.getElementById('stat-avg').textContent = stats.avgDaily.minutes;
  }

  updateStreak(n) {
    document.getElementById('streak-num').textContent = n;
  }

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
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

    const weekData = new Array(7).fill(0);
    data.forEach(d => {
      const dt = new Date(d.day + 'T00:00:00');
      const idx = (dt.getDay() + 6) % 7;
      weekData[idx] = d.minutes;
    });

    const pad = { top: 15, right: 15, bottom: 30, left: 35 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;
    const maxVal = Math.max(...weekData, 30);
    const barW = cW / 7 * 0.55;
    const gap = cW / 7;

    // Grid lines
    ctx.strokeStyle = '#F0E6D8';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (cH * i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#B8A88A';
      ctx.font = '10px system-ui';
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
      ctx.beginPath();
      const r = Math.min(4, barW / 2);
      if (barH > 0) {
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
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(days[i], x + barW / 2, H - 8);
    });
  }

  drawMonthlyChart(data) {
    const canvas = this.monthlyCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    if (data.length === 0) {
      ctx.fillStyle = '#B8A88A';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', W / 2, H / 2);
      return;
    }

    const pad = { top: 15, right: 15, bottom: 30, left: 40 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map(d => d.minutes), 30);
    const step = cW / Math.max(data.length - 1, 1);

    const points = data.map((d, i) => ({
      x: pad.left + step * i,
      y: pad.top + cH - (d.minutes / maxVal) * cH
    }));

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, 'rgba(255,140,107,.25)');
    grad.addColorStop(1, 'rgba(255,140,107,.02)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + cH);
    ctx.lineTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const xc = (points[i - 1].x + points[i].x) / 2;
      const yc = (points[i - 1].y + points[i].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(points[points.length - 1].x, pad.top + cH);
    ctx.fill();

    // Line
    ctx.strokeStyle = '#FF8C6B';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const xc = (points[i - 1].x + points[i].x) / 2;
      const yc = (points[i - 1].y + points[i].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();

    // Dots
    points.forEach(p => {
      ctx.fillStyle = '#FF8C6B';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Labels
    ctx.fillStyle = '#8B7355';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      const label = d.month.slice(5);
      ctx.fillText(label, points[i].x, H - 8);
    });

    ctx.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const y = pad.top + cH - (cH * i / 3);
      ctx.fillText(Math.round(maxVal * i / 3), pad.left - 6, y + 3);
    }
  }

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
    ctx.fillStyle = '#B8A88A';
    ctx.font = '10px system-ui';
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

        ctx.fillStyle = dateSet.has(dateStr) ? '#FF8C6B' : '#F5EDE3';
        ctx.fill();
      }
    }
  }
}
