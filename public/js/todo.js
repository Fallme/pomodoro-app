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

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.filter;
        this.render();
      });
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.render();
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
          <div class="emoji">📝</div>
          <p>还没有任务，添加一个吧</p>
        </div>`;
      return;
    }

    const stateLabels = { waiting: '等待', in_progress: '进行中', completed: '完成', abandoned: '废弃' };

    this.listEl.innerHTML = this.tasks.map(t => {
      const dots = Array.from({ length: 5 }, (_, i) =>
        `<span class="dot ${i < (6 - t.priority) ? 'filled' : ''}"></span>`
      ).join('');

      const actions = t.state === 'completed' || t.state === 'abandoned'
        ? `<button class="delete" onclick="todo.deleteTask(${t.id})" title="删除">🗑</button>`
        : `
          <button onclick="todo.cycleState(${t.id}, '${t.state}')" title="切换状态">→</button>
          <button class="delete" onclick="todo.deleteTask(${t.id})" title="删除">🗑</button>`;

      return `
        <div class="task-card ${t.state}">
          <div class="task-state-bar ${t.state}"></div>
          <div class="task-body">
            <div class="task-title">${this.escHtml(t.title)}</div>
            <div class="task-meta">
              <span class="task-state-badge ${t.state}">${stateLabels[t.state]}</span>
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
