class PomodoroTimer {
  constructor() {
    this.settings = this.loadSettings();
    this.state = { phase: 'idle', sessionType: 'focus', remaining: 0, totalDuration: 0, endTime: 0, completedPomodoros: 0, linkedTaskId: null, rafId: null };
    this.audioCtx = null;

    this.timeEl = document.getElementById('timer-time');
    this.phaseEl = document.getElementById('timer-phase');
    this.cycleEl = document.getElementById('timer-cycle');
    this.circleEl = document.getElementById('ring-progress');
    this.taskSelect = document.getElementById('timer-task-select');

    this.btnStart = document.getElementById('btn-start');
    this.btnPause = document.getElementById('btn-pause');
    this.btnReset = document.getElementById('btn-reset');
    this.btnSkip = document.getElementById('btn-skip');

    this.btnStart.addEventListener('click', () => this.start());
    this.btnPause.addEventListener('click', () => this.pause());
    this.btnReset.addEventListener('click', () => this.reset());
    this.btnSkip.addEventListener('click', () => this.skip());

    this.taskSelect.addEventListener('change', () => {
      this.state.linkedTaskId = this.taskSelect.value ? Number(this.taskSelect.value) : null;
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.phase === 'running') {
        this.updateDisplay(Math.max(0, this.state.endTime - Date.now()));
      }
    });

    this.setSession('focus');
    this.updateButtons();
  }

  loadSettings() {
    const defaults = { focusDuration: 25, shortBreakDuration: 5, longBreakDuration: 15, pomodorosPerCycle: 4 };
    try {
      const saved = JSON.parse(localStorage.getItem('pomodoro-settings'));
      return saved ? { ...defaults, ...saved } : defaults;
    } catch { return defaults; }
  }

  getDurationMs(type) {
    const map = { focus: this.settings.focusDuration, short_break: this.settings.shortBreakDuration, long_break: this.settings.longBreakDuration };
    return (map[type] || 25) * 60 * 1000;
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
  }

  pause() {
    if (this.state.phase !== 'running') return;
    this.state.remaining = Math.max(0, this.state.endTime - Date.now());
    this.state.phase = 'paused';
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    this.updateButtons();
  }

  reset() {
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    this.state.phase = 'idle';
    this.state.totalDuration = this.getDurationMs(this.state.sessionType);
    this.state.remaining = this.state.totalDuration;
    this.updateDisplay(this.state.remaining);
    this.updateProgress(1);
    this.updateButtons();
  }

  skip() {
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    this.state.phase = 'idle';
    this.advancePhase();
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

    // Log session
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
    this.advancePhase();
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

  updateDisplay(remaining) {
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    this.timeEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  updateProgress(ratio) {
    const r = 115;
    const c = 2 * Math.PI * r;
    this.circleEl.style.strokeDashoffset = c * (1 - ratio);
  }

  updatePhaseDisplay() {
    const labels = { focus: '专注时间', short_break: '短休息', long_break: '长休息' };
    this.phaseEl.textContent = labels[this.state.sessionType];
    this.phaseEl.className = 'phase-badge ' + this.state.sessionType;

    this.circleEl.className = 'ring-progress';
    if (this.state.sessionType === 'short_break') this.circleEl.classList.add('break');
    if (this.state.sessionType === 'long_break') this.circleEl.classList.add('long-break');

    const n = this.state.completedPomodoros + 1;
    const total = this.settings.pomodorosPerCycle;
    this.cycleEl.textContent = `${n} / ${total}`;
  }

  updateButtons() {
    const running = this.state.phase === 'running';
    const paused = this.state.phase === 'paused';
    this.btnStart.style.display = running ? 'none' : '';
    this.btnPause.style.display = running ? '' : 'none';
    this.btnStart.textContent = paused ? '继续' : '开始';
  }

  async refreshTaskList() {
    try {
      const data = await api.getTasks('all', 'date');
      const tasks = data.tasks.filter(t => t.state === 'waiting' || t.state === 'in_progress');
      const current = this.taskSelect.value;
      this.taskSelect.innerHTML = '<option value="">不关联任务</option>' +
        tasks.map(t => `<option value="${t.id}" ${t.id == current ? 'selected' : ''}>${t.title}</option>`).join('');
    } catch (e) { console.error('Failed to refresh task list:', e); }
  }

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
      new Notification('🍅 番茄钟', { body: msgs[this.state.sessionType] });
    }
  }

  openSettings() {
    document.getElementById('s-focus').value = this.settings.focusDuration;
    document.getElementById('s-short').value = this.settings.shortBreakDuration;
    document.getElementById('s-long').value = this.settings.longBreakDuration;
    document.getElementById('s-cycles').value = this.settings.pomodorosPerCycle;
  }

  saveSettings() {
    this.settings.focusDuration = Math.max(1, Number(document.getElementById('s-focus').value) || 25);
    this.settings.shortBreakDuration = Math.max(1, Number(document.getElementById('s-short').value) || 5);
    this.settings.longBreakDuration = Math.max(1, Number(document.getElementById('s-long').value) || 15);
    this.settings.pomodorosPerCycle = Math.max(1, Number(document.getElementById('s-cycles').value) || 4);
    localStorage.setItem('pomodoro-settings', JSON.stringify(this.settings));
    this.setSession(this.state.sessionType);
  }
}
