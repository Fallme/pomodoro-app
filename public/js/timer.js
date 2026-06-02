class PomodoroTimer {
  constructor() {
    this.settings = this.loadSettings();
    this.state = {
      phase: 'idle',
      sessionType: 'focus',
      remaining: 0,
      totalDuration: 0,
      endTime: 0,
      completedPomodoros: 0,
      linkedTaskId: null,
      linkedTaskTitle: null,
      rafId: null,
      pendingAdvance: false
    };
    this.tasks = [];
    this.audioCtx = null;
    this.toastEl = document.getElementById('toast');
    this.toastTimeout = null;

    // DOM refs
    this.timeEl = document.getElementById('timer-time');
    this.phaseEl = document.getElementById('timer-phase');
    this.cycleEl = document.getElementById('timer-cycle');
    this.circleEl = document.getElementById('ring-progress');
    this.btnStart = document.getElementById('btn-start');
    this.btnReset = document.getElementById('btn-reset');
    this.btnSkip = document.getElementById('btn-skip');
    this.taskBar = document.getElementById('timer-task-bar');
    this.taskLabel = document.getElementById('timer-task-label');
    this.sheetOverlay = document.getElementById('sheet-overlay');
    this.taskSheet = document.getElementById('task-sheet');
    this.sheetOptions = document.getElementById('sheet-options');

    // Events
    this.btnStart.addEventListener('click', () => this.toggleTimer());
    this.btnReset.addEventListener('click', () => this.reset());
    this.btnSkip.addEventListener('click', () => this.skip());
    this.taskBar.addEventListener('click', () => this.openTaskSheet());
    this.sheetOverlay.addEventListener('click', () => this.closeTaskSheet());

    // Visibility change - refresh display
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.phase === 'running') {
        this.updateDisplay(Math.max(0, this.state.endTime - Date.now()));
      }
    });

    this.setSession('focus');
    this.updateButtons();
    this.initSettings();
  }

  loadSettings() {
    const d = { focusDuration: 25, shortBreakDuration: 5, longBreakDuration: 15, pomodorosPerCycle: 4 };
    try {
      const s = JSON.parse(localStorage.getItem('pomodoro-settings'));
      return s ? { ...d, ...s } : d;
    } catch { return d; }
  }

  saveSettings() {
    localStorage.setItem('pomodoro-settings', JSON.stringify(this.settings));
  }

  getDurationMs(type) {
    const map = { focus: this.settings.focusDuration, short_break: this.settings.shortBreakDuration, long_break: this.settings.longBreakDuration };
    return (map[type] || 25) * 60 * 1000;
  }

  // ─── Settings UI ───

  initSettings() {
    const toggle = document.getElementById('settings-toggle');
    const panel = document.getElementById('settings-panel');

    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      panel.classList.toggle('open');
    });

    // Stepper buttons
    document.querySelectorAll('.setting-stepper button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.setting;
        const dir = Number(btn.dataset.dir);
        const mins = { focus: [1, 120], short: [1, 30], long: [1, 60], cycles: [1, 10] };
        const [min, max] = mins[key];
        const valEl = btn.parentElement.querySelector('.val');
        let val = Number(valEl.textContent) + dir;
        val = Math.max(min, Math.min(max, val));
        valEl.textContent = val;

        // Update settings
        const map = { focus: 'focusDuration', short: 'shortBreakDuration', long: 'longBreakDuration', cycles: 'pomodorosPerCycle' };
        this.settings[map[key]] = val;
        this.saveSettings();

        // Update display if idle
        if (this.state.phase === 'idle') {
          this.setSession(this.state.sessionType);
        }
      });
    });

    // Sync display values
    document.getElementById('s-focus').textContent = this.settings.focusDuration;
    document.getElementById('s-short').textContent = this.settings.shortBreakDuration;
    document.getElementById('s-long').textContent = this.settings.longBreakDuration;
    document.getElementById('s-cycles').textContent = this.settings.pomodorosPerCycle;
  }

  // ─── Timer Control ───

  toggleTimer() {
    if (this.state.phase === 'running') {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    if (this.state.phase === 'running') return;
    if (this.state.phase === 'idle') {
      this.state.totalDuration = this.getDurationMs(this.state.sessionType);
      this.state.remaining = this.state.totalDuration;
    }
    this.state.endTime = Date.now() + this.state.remaining;
    this.state.phase = 'running';
    this.updateButtons();
    this.tick();
    this.showToast('计时开始', 'info');
  }

  pause() {
    if (this.state.phase !== 'running') return;
    this.state.remaining = Math.max(0, this.state.endTime - Date.now());
    this.state.phase = 'paused';
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    this.updateButtons();
    this.showToast('已暂停', 'info');
  }

  reset() {
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    this.state.phase = 'idle';
    this.state.pendingAdvance = false;
    this.state.totalDuration = this.getDurationMs(this.state.sessionType);
    this.state.remaining = this.state.totalDuration;
    this.updateDisplay(this.state.remaining);
    this.updateProgress(1);
    this.updateButtons();
    this.showToast('计时器已重置', 'info');
  }

  skip() {
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    this.state.phase = 'idle';
    this.state.pendingAdvance = false;
    this.showToast('已跳过当前阶段', 'info');
    this.advancePhase();
  }

  setSession(type) {
    this.state.sessionType = type;
    this.state.totalDuration = this.getDurationMs(type);
    this.state.remaining = this.state.totalDuration;
    this.state.phase = 'idle';
    this.updateDisplay(this.state.remaining);
    this.updatePhaseDisplay();
    this.updateProgress(1);
    this.updateButtons();
  }

  tick() {
    if (this.state.phase !== 'running') return;
    const now = Date.now();
    this.state.remaining = Math.max(0, this.state.endTime - now);
    this.updateDisplay(this.state.remaining);
    this.updateProgress(this.state.remaining / this.state.totalDuration);
    if (this.state.remaining <= 0) {
      this.onComplete();
      return;
    }
    this.state.rafId = requestAnimationFrame(() => this.tick());
  }

  async onComplete() {
    this.state.phase = 'idle';
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    try {
      await api.logPomodoro({
        task_id: this.state.linkedTaskId,
        type: this.state.sessionType,
        duration_minutes: Math.round(this.state.totalDuration / 60000),
        completed: true
      });
    } catch (e) { console.error('Failed to log session:', e); }
    this.playSound();
    this.sendNotification();
    if (this.state.sessionType === 'focus') {
      if (this.state.linkedTaskId === null) {
        this.state.pendingAdvance = true;
        this.showToast('专注完成！请选择任务进行分配', 'warning');
        this.openTaskSheet();
      } else {
        this.showToast('专注完成！已记录到任务', 'success');
        this.advancePhase();
      }
    } else {
      this.showToast('休息结束，准备下一轮专注', 'info');
      this.advancePhase();
    }
  }

  advancePhase() {
    if (this.state.sessionType === 'focus') {
      this.state.completedPomodoros++;
      if (this.state.completedPomodoros >= this.settings.pomodorosPerCycle) {
        this.setSession('long_break');
        this.state.completedPomodoros = 0;
      } else {
        this.setSession('short_break');
      }
    } else {
      this.setSession('focus');
    }
  }

  // ─── Display ───

  updateDisplay(remaining) {
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    this.timeEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  updateProgress(ratio) {
    const c = 2 * Math.PI * 115;
    this.circleEl.style.strokeDashoffset = c * (1 - ratio);
  }

  updatePhaseDisplay() {
    const labels = { focus: '专注', short_break: '短休息', long_break: '长休息' };
    this.phaseEl.textContent = labels[this.state.sessionType];
    this.phaseEl.className = 'timer-phase';
    if (this.state.sessionType === 'short_break') this.phaseEl.classList.add('break');
    if (this.state.sessionType === 'long_break') this.phaseEl.classList.add('long-break');

    const n = this.state.completedPomodoros + 1;
    this.cycleEl.textContent = `${n} / ${this.settings.pomodorosPerCycle}`;
  }

  updateButtons() {
    const running = this.state.phase === 'running';
    this.btnStart.classList.toggle('running', running);
    // Swap icon: running = pause, else = play
    this.btnStart.innerHTML = running
      ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
  }

  // ─── Task Sheet ───

  async refreshTaskList() {
    try {
      const data = await api.getTasks('all', 'date');
      this.tasks = data.tasks.filter(t => t.state === 'waiting' || t.state === 'in_progress');
    } catch (e) { console.error('Failed to refresh tasks:', e); }
  }

  openTaskSheet() {
    this.sheetOptions.innerHTML = '';
    // "No task" option
    const noneBtn = document.createElement('button');
    noneBtn.className = 'sheet-option' + (this.state.linkedTaskId === null ? ' selected' : '');
    noneBtn.innerHTML = `
      <div class="so-dot" style="background:var(--text-tertiary)"></div>
      <span class="so-title">不关联任务</span>
      <svg class="so-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
    `;
    noneBtn.addEventListener('click', () => this.selectTask(null, '选择任务'));
    this.sheetOptions.appendChild(noneBtn);

    this.tasks.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'sheet-option' + (this.state.linkedTaskId === t.id ? ' selected' : '');
      const colors = { waiting: 'var(--text-tertiary)', in_progress: 'var(--accent)' };
      btn.innerHTML = `
        <div class="so-dot" style="background:${colors[t.state] || 'var(--text-tertiary)'}"></div>
        <span class="so-title">${t.title}</span>
        <svg class="so-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      `;
      btn.addEventListener('click', () => this.selectTask(t.id, t.title));
      this.sheetOptions.appendChild(btn);
    });

    this.sheetOverlay.classList.add('open');
    this.taskSheet.classList.add('open');
  }

  closeTaskSheet() {
    this.sheetOverlay.classList.remove('open');
    this.taskSheet.classList.remove('open');
  }

  selectTask(id, title) {
    this.state.linkedTaskId = id;
    this.state.linkedTaskTitle = title;
    this.taskLabel.textContent = title;
    this.taskLabel.classList.toggle('selected', id !== null);
    this.closeTaskSheet();
    if (this.state.pendingAdvance) {
      this.state.pendingAdvance = false;
      if (id !== null) {
        this.showToast(`已分配到任务：${title}`, 'success');
      }
      this.advancePhase();
    }
  }

  // ─── Sound & Notification ───

  playSound() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } catch {}
  }

  sendNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
      const msgs = { focus: '专注结束！休息一下吧', short_break: '休息结束，准备下一轮', long_break: '长休息结束，新循环开始' };
      new Notification('番茄钟', { body: msgs[this.state.sessionType] });
    }
  }

  showToast(message, type = 'info') {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastEl.textContent = message;
    this.toastEl.className = 'toast ' + type;
    requestAnimationFrame(() => {
      this.toastEl.classList.add('show');
    });
    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 3000);
  }
}
