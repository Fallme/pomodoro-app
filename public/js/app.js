document.addEventListener('DOMContentLoaded', () => {
  const timer = new PomodoroTimer();
  const todo = new TodoApp();
  const stats = new StatsDashboard();

  // Make todo available globally for inline onclick handlers
  window.todo = todo;

  // Tab navigation (bottom bar)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

      if (btn.dataset.tab === 'stats') stats.refresh();
      if (btn.dataset.tab === 'todo') todo.loadTasks();
      if (btn.dataset.tab === 'timer') timer.refreshTaskList();
    });
  });

  // Notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Initial load
  todo.loadTasks();
  timer.refreshTaskList();
});
