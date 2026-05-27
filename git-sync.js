const { execSync } = require('child_process');
const path = require('path');

const GIT_TOKEN = process.env.GIT_TOKEN;
const GIT_REPO = process.env.GIT_REPO; // e.g. https://github.com/user/repo.git
const GIT_BRANCH = process.env.GIT_BRANCH || 'main';

function isGitConfigured() {
  return GIT_TOKEN && GIT_REPO;
}

function gitCmd(cmd) {
  if (!isGitConfigured()) return null;
  try {
    const result = execSync(cmd, {
      cwd: path.join(__dirname),
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (e) {
    console.error(`Git command failed: ${cmd}`, e.message);
    return null;
  }
}

function configureAuth() {
  if (!isGitConfigured()) return;
  // Inject token into repo URL for push/pull
  const authUrl = GIT_REPO.replace('https://', `https://${GIT_TOKEN}@`);
  gitCmd(`git remote set-url origin "${authUrl}" || git remote add origin "${authUrl}"`);
  gitCmd('git config user.email "pomodoro-bot@local"');
  gitCmd('git config user.name "Pomodoro Bot"');
}

function pull() {
  if (!isGitConfigured()) {
    console.log('[git-sync] Not configured, skipping pull');
    return;
  }
  console.log('[git-sync] Pulling latest data...');
  configureAuth();
  const result = gitCmd(`git pull origin ${GIT_BRANCH} --ff-only`);
  console.log('[git-sync] Pull result:', result || 'up to date');
}

function push() {
  if (!isGitConfigured()) return;
  configureAuth();
  const dbPath = path.join(__dirname, 'data', 'pomodoro.db');

  // Stage only the database file
  gitCmd(`git add "${dbPath}"`);

  // Check if there are changes to commit
  const status = gitCmd('git status --porcelain data/pomodoro.db');
  if (!status) return; // no changes

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  gitCmd(`git commit -m "data: update ${now}"`);
  const pushResult = gitCmd(`git push origin ${GIT_BRANCH}`);
  console.log('[git-sync] Pushed data update');
}

// Debounce: batch rapid writes into a single push
let pushTimer = null;
function debouncedPush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    push();
    pushTimer = null;
  }, 3000);
}

module.exports = { pull, push: debouncedPush, isGitConfigured };
