document.addEventListener('DOMContentLoaded', () => {
  const timer = new PomodoroTimer();
  const todo = new TodoApp();
  const stats = new StatsDashboard();

  // Tab navigation
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

  // Settings modal
  const settingsBtn = document.getElementById('settings-btn');
  const modalOverlay = document.getElementById('settings-overlay');

  settingsBtn.addEventListener('click', () => {
    timer.openSettings();
    modalOverlay.classList.add('open');
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('open');
  });

  document.getElementById('settings-save').addEventListener('click', () => {
    timer.saveSettings();
    modalOverlay.classList.remove('open');
  });

  document.getElementById('settings-cancel').addEventListener('click', () => {
    modalOverlay.classList.remove('open');
  });

  // Notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Initial load
  todo.loadTasks();
  timer.refreshTaskList();
});
