class TodoApp {
  constructor() {
    this.tasks = [];
    this.filter = 'all';
    this.sortBy = 'date';
    this.listEl = document.getElementById('task-list');
    this.inputEl = document.getElementById('task-input');
    this.priorityEl = document.getElementById('task-priority');

    document.getElementById('task-add-btn').addEventListener('click', () => this.addTask());
    this.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addTask(); });

    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.filter;
        this.render();
      });
    });
  }

  async loadTasks() {
    try {
      const data = await api.getTasks(this.filter, this.sortBy);
      this.tasks = data.tasks;
      this.render();
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  }

  async addTask() {
    const title = this.inputEl.value.trim();
    if (!title) return;
    const priority = Number(this.priorityEl.value);
    try {
      await api.createTask(title, priority);
      this.inputEl.value = '';
      await this.loadTasks();
    } catch (e) {
      console.error('Failed to create task:', e);
    }
  }

  async updateState(id, state) {
    try {
      await api.updateTask(id, { state });
      await this.loadTasks();
    } catch (e) {
      console.error('Failed to update task:', e);
    }
  }

  async deleteTask(id) {
    try {
      await api.deleteTask(id);
      await this.loadTasks();
    } catch (e) {
      console.error('Failed to delete task:', e);
    }
  }

  render() {
    if (this.tasks.length === 0) {
      this.listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <p>还没有任务</p>
        </div>`;
      return;
    }

    this.listEl.innerHTML = this.tasks.map((t, i) => {
      const dots = Array.from({ length: 5 }, (_, j) =>
        `<span class="priority-dot ${j < (6 - t.priority) ? 'filled' : ''}"></span>`
      ).join('');

      const isDone = t.state === 'completed' || t.state === 'abandoned';
      const actions = isDone
        ? `<button class="task-action-btn danger" onclick="todo.deleteTask(${t.id})" title="删除">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>`
        : `
          <button class="task-action-btn" onclick="todo.cycleState(${t.id}, '${t.state}')" title="切换状态">
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button class="task-action-btn danger" onclick="todo.deleteTask(${t.id})" title="删除">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>`;

      return `
        <div class="task-card ${t.state}" style="animation-delay:${i * 0.04}s">
          <div class="task-state-dot ${t.state}"></div>
          <div class="task-info">
            <div class="task-title">${this.escHtml(t.title)}</div>
            <div class="task-meta">
              <div class="priority-dots">${dots}</div>
            </div>
          </div>
          <div class="task-actions">${actions}</div>
        </div>`;
    }).join('');
  }

  cycleState(id, current) {
    const flow = { waiting: 'in_progress', in_progress: 'completed', completed: 'waiting', abandoned: 'waiting' };
    this.updateState(id, flow[current] || 'waiting');
  }

  escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}
