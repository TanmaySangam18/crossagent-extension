const DEFAULT_BACKEND = 'https://pleasing-art-production-e68e.up.railway.app';

function genId() {
  return 'ca_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

chrome.storage.sync.get(['userId', 'userEmail', 'backendUrl'], stored => {
  let userId = stored.userId;
  if (!userId) { userId = genId(); chrome.storage.sync.set({ userId }); }
  document.getElementById('uid').textContent = userId;
  if (stored.userEmail) document.getElementById('email').value = stored.userEmail;
  document.getElementById('backend').value = stored.backendUrl || DEFAULT_BACKEND;
  loadStats(userId, stored.backendUrl || DEFAULT_BACKEND);
});

document.getElementById('save').addEventListener('click', () => {
  const url = document.getElementById('backend').value.trim().replace(/\/$/, '') || DEFAULT_BACKEND;
  chrome.storage.sync.get(['userId'], s => {
    const userId = s.userId || genId();
    chrome.storage.sync.set({ userEmail: document.getElementById('email').value.trim(), userId, backendUrl: url }, () => {
      const saved = document.getElementById('saved');
      saved.style.display = 'block';
      setTimeout(() => { saved.style.display = 'none'; }, 2000);
      loadStats(userId, url);
    });
  });
});

async function loadStats(userId, backendUrl) {
  const base = (backendUrl || DEFAULT_BACKEND).replace(/\/$/, '');

  // Usage (interactions)
  try {
    const u = await fetch(`${base}/memory/usage?userId=${userId}`).then(r => r.json());
    document.getElementById('stat-interactions').textContent = u.count ?? '–';
    document.getElementById('stat-limit').textContent = u.limit ?? 200;
    const pct = Math.min(100, Math.round(((u.count || 0) / (u.limit || 200)) * 100));
    document.getElementById('usage-fill').style.width = pct + '%';
    document.getElementById('usage-lbl').textContent =
      u.allowed
        ? `${u.count} of ${u.limit} memory API calls used · native routing is unlimited`
        : 'API limit reached — native routing still works · resets next month';
  } catch {
    document.getElementById('usage-lbl').textContent = 'Could not reach backend.';
  }

  // Memory count
  try {
    const m = await fetch(`${base}/memory/list?userId=${userId}`).then(r => r.json());
    document.getElementById('stat-memories').textContent = (m.memories || []).length;
  } catch {
    document.getElementById('stat-memories').textContent = '–';
  }
}
