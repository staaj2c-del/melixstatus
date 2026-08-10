(function () {
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSection = document.getElementById('login-section');
  const dashSection = document.getElementById('dash-section');
  const logoutBtn = document.getElementById('logout-btn');
  const userDisplay = document.getElementById('user-display');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // ── Auth ─────────────────────────────────
  if (Store.token) {
    Store.getMe().then(user => showDash(user)).catch(() => { Store.logout(); showLogin(); });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const username = document.getElementById('login-user').value;
    const password = document.getElementById('login-pass').value;
    try {
      const user = await Store.login(username, password);
      showDash(user);
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  logoutBtn.addEventListener('click', () => {
    Store.logout();
    loginSection.classList.remove('hidden');
    dashSection.classList.add('hidden');
  });

  function showLogin() {
    loginSection.classList.remove('hidden');
    dashSection.classList.add('hidden');
  }

  function showDash(user) {
    loginSection.classList.add('hidden');
    dashSection.classList.remove('hidden');
    userDisplay.textContent = `${user.username} (${user.role})`;
    loadServicesTab();
    loadUsersTab();
    loadEventsTab();
  }

  // ── Tabs ─────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'tab-services') loadServicesTab();
      if (tab.dataset.tab === 'tab-users') loadUsersTab();
      if (tab.dataset.tab === 'tab-events') loadEventsTab();
    });
  });

  // ── Services Tab ─────────────────────────
  async function loadServicesTab() {
    const el = document.getElementById('svc-list');
    el.innerHTML = '<p class="loading">Loading...</p>';
    try {
      const services = await Store.getServices();
      el.innerHTML = services.map(s => `
        <div class="svc-row" data-id="${s._id}">
          <div>
            <div class="name">${esc(s.name)}</div>
            <div class="desc">${esc(s.description || '')}</div>
          </div>
          <div class="flex-between gap">
            <select data-action="status" data-id="${s._id}">
              <option value="operational" ${s.status === 'operational' ? 'selected' : ''}>Operational</option>
              <option value="degraded" ${s.status === 'degraded' ? 'selected' : ''}>Degraded</option>
              <option value="outage" ${s.status === 'outage' ? 'selected' : ''}>Outage</option>
              <option value="maintenance" ${s.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
            </select>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${s._id}">×</button>
          </div>
        </div>
      `).join('');

      el.querySelectorAll('select[data-action="status"]').forEach(sel => {
        sel.addEventListener('change', async () => {
          try {
            await Store.updateService(sel.dataset.id, { status: sel.value });
            loadServicesTab();
          } catch (err) { alert(err.message); }
        });
      });

      el.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this service?')) return;
          try {
            await Store.deleteService(btn.dataset.id);
            loadServicesTab();
          } catch (err) { alert(err.message); }
        });
      });
    } catch (err) {
      el.innerHTML = `<p class="loading" style="color:var(--pink)">${err.message}</p>`;
    }
  }

  document.getElementById('add-svc-btn').addEventListener('click', () => {
    document.getElementById('modal-add-svc').classList.add('show');
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').classList.remove('show');
    });
  });

  document.getElementById('svc-save').addEventListener('click', async () => {
    const name = document.getElementById('svc-name').value.trim();
    const desc = document.getElementById('svc-desc').value.trim();
    const status = document.getElementById('svc-status').value;
    if (!name) return alert('Service name required');
    try {
      await Store.createService({ name, description: desc, status });
      document.getElementById('modal-add-svc').classList.remove('show');
      document.getElementById('svc-name').value = '';
      document.getElementById('svc-desc').value = '';
      loadServicesTab();
    } catch (err) { alert(err.message); }
  });

  // ── Users Tab ────────────────────────────
  async function loadUsersTab() {
    const el = document.getElementById('user-list');
    el.innerHTML = '<p class="loading">Loading...</p>';
    try {
      const users = await Store.getUsers();
      el.innerHTML = `
        <table class="user-table">
          <thead><tr><th>Username</th><th>Role</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${esc(u.username)}</td>
                <td>${esc(u.role)}</td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" data-action="del-user" data-id="${u._id}">Delete</button>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      el.querySelectorAll('button[data-action="del-user"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this user?')) return;
          try {
            await Store.deleteUser(btn.dataset.id);
            loadUsersTab();
          } catch (err) { alert(err.message); }
        });
      });
    } catch (err) {
      el.innerHTML = `<p class="loading" style="color:var(--pink)">${err.message}</p>`;
    }
  }

  document.getElementById('add-user-btn').addEventListener('click', () => {
    document.getElementById('modal-add-user').classList.add('show');
  });

  document.getElementById('user-save').addEventListener('click', async () => {
    const username = document.getElementById('user-name').value.trim();
    const password = document.getElementById('user-pass').value;
    const role = document.getElementById('user-role').value;
    if (!username || !password) return alert('Username and password required');
    try {
      await Store.createUser({ username, password, role });
      document.getElementById('modal-add-user').classList.remove('show');
      document.getElementById('user-name').value = '';
      document.getElementById('user-pass').value = '';
      loadUsersTab();
    } catch (err) { alert(err.message); }
  });

  // ── Events Tab ───────────────────────────
  async function loadEventsTab() {
    const el = document.getElementById('event-list');
    el.innerHTML = '<p class="loading">Loading...</p>';
    try {
      const events = await Store.getEvents();
      if (events.length === 0) {
        el.innerHTML = '<p class="loading">No events yet.</p>';
        return;
      }
      el.innerHTML = events.map(e => `
        <div class="event-item">
          <span class="event-type ${e.type}">${esc(e.type)}</span>
          <div>
            <div class="event-message">${esc(e.message)}</div>
            <div class="event-time">${new Date(e.createdAt).toLocaleString()}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = `<p class="loading" style="color:var(--pink)">${err.message}</p>`;
    }
  }

  document.getElementById('post-event-btn').addEventListener('click', async () => {
    const type = document.getElementById('event-type').value;
    const message = document.getElementById('event-msg').value.trim();
    if (!message) return alert('Event message required');
    try {
      await Store.createEvent({ type, message });
      document.getElementById('event-msg').value = '';
      loadEventsTab();
    } catch (err) { alert(err.message); }
  });

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();

