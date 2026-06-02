class TodoApp {
  constructor() {
    this.tasks = [];
    this.filter = 'all';
    this.sortBy = 'date';
    this.editingTask = null;
    this.editPriority = 3;
    this.editState = 'waiting';
    this.listEl = document.getElementById('task-list');
    this.inputEl = document.getElementById('task-input');
    this.priorityEl = document.getElementById('task-priority');

    // Edit sheet refs
    this.editSheet = document.getElementById('edit-sheet');
    this.editTitleEl = document.getElementById('edit-title');
    this.editPriorityRow = document.getElementById('edit-priority-row');
    this.editStateRow = document.getElementById('edit-state-row');
    this.editSaveBtn = document.getElementById('edit-save-btn');

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

    // Edit sheet: priority buttons
    this.editPriorityRow.querySelectorAll('.ep-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editPriority = Number(btn.dataset.p);
        this.editPriorityRow.querySelectorAll('.ep-btn').forEach(b => b.classList.toggle('selected', Number(b.dataset.p) === this.editPriority));
      });
    });

    // Edit sheet: state buttons
    this.editStateRow.querySelectorAll('.es-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editState = btn.dataset.state;
        this.editStateRow.querySelectorAll('.es-btn').forEach(b => b.classList.toggle('selected', b.dataset.state === this.editState));
      });
    });

    // Edit sheet: save
    this.editSaveBtn.addEventListener('click', () => this.saveEdit());

    // Edit sheet: close on overlay click
    document.getElementById('sheet-overlay').addEventListener('click', () => this.closeEditSheet());
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

      const actions = `
        <button class="task-action-btn" onclick="todo.openEditSheet(${t.id})" title="编辑">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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

  openEditSheet(id) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;
    this.editingTask = task;
    this.editPriority = task.priority;
    this.editState = task.state;

    this.editTitleEl.value = task.title;
    this.editPriorityRow.querySelectorAll('.ep-btn').forEach(b =>
      b.classList.toggle('selected', Number(b.dataset.p) === this.editPriority));
    this.editStateRow.querySelectorAll('.es-btn').forEach(b =>
      b.classList.toggle('selected', b.dataset.state === this.editState));

    document.getElementById('sheet-overlay').classList.add('open');
    this.editSheet.classList.add('open');
  }

  closeEditSheet() {
    document.getElementById('sheet-overlay').classList.remove('open');
    this.editSheet.classList.remove('open');
    this.editingTask = null;
  }

  async saveEdit() {
    if (!this.editingTask) return;
    const title = this.editTitleEl.value.trim();
    if (!title) return;
    try {
      await api.updateTask(this.editingTask.id, {
        title,
        priority: this.editPriority,
        state: this.editState
      });
      this.closeEditSheet();
      await this.loadTasks();
    } catch (e) {
      console.error('Failed to save edit:', e);
    }
  }

  escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}
