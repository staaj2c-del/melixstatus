let currentUser = null;
let statusOptions = [];
let statusMap = {};
let lastBotKeyPlain = null;

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatClock(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
}

function formatStatus(s) {
  if (statusMap[s] && statusMap[s].label) return statusMap[s].label;
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || s;
}

function toast(msg, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type || 'success'}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function showLogin() {
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('dash-section').classList.add('hidden');
}

function showDash(user) {
  currentUser = user;
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('dash-section').classList.remove('hidden');
  document.getElementById('currentUser').textContent = user.username;
  if (user.role === 'admin') {
    document.getElementById('usersTab').style.display = '';
    document.getElementById('statusesTab').style.display = '';
    document.getElementById('integrationsTab').style.display = '';
  }
  loadStatusesCache().then(() => loadServices());
}

async function loadStatusesCache() {
  try {
    statusOptions = await Store.getStatuses(false);
    statusMap = {};
    statusOptions.forEach(s => { statusMap[s.key] = s; });
  } catch (_) {
    statusOptions = [
      { key: 'operational', label: 'Operational', color: '#22C55E' },
      { key: 'degraded', label: 'Degraded', color: '#EAB308' },
      { key: 'outage', label: 'Outage', color: '#EF4444' },
      { key: 'maintenance', label: 'Maintenance', color: '#2DD4E8' }
    ];
    statusMap = {};
    statusOptions.forEach(s => { statusMap[s.key] = s; });
  }
}

function statusSelectHtml(current, id) {
  return statusOptions.map(s =>
    `<option value="${esc(s.key)}" ${s.key === current ? 'selected' : ''}>${esc(s.label)}</option>`
  ).join('');
}

// Tabs
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    const section = tab.getAttribute('data-section');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`section-${section}`);
    if (el) el.classList.add('active');
    if (section === 'services') loadServices();
    if (section === 'incidents') loadIncidents();
    if (section === 'statuses') loadStatusOptions();
    if (section === 'integrations') loadIntegrations();
    if (section === 'users') loadUsers();
    if (section === 'log') loadAdminEvents();
  });
});

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errorEl.style.display = 'none';
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  try {
    const data = await Store.login(
      document.getElementById('username').value,
      document.getElementById('password').value
    );
    showDash(data);
  } catch (err) {
    errorEl.textContent = err.message || 'Invalid credentials';
    errorEl.style.display = 'block';
  }
  btn.textContent = 'Sign In';
  btn.disabled = false;
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  Store.logout();
  showLogin();
});

// Services
async function loadServices() {
  try {
    await loadStatusesCache();
    const services = await Store.getServices();
    const tbody = document.getElementById('servicesTableBody');
    document.getElementById('svcCount').textContent = `(${services.length})`;
    tbody.innerHTML = services.map(s => {
      const color = (statusMap[s.status] && statusMap[s.status].color) || '#8A8D9B';
      return `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.description || '')}</td>
        <td>
          <div class="status-cell">
            <span class="status-dot" style="background:${esc(color)}"></span>
            <select class="status-select" data-id="${s._id}" onchange="updateServiceStatus('${s._id}', this.value)">
              ${statusSelectHtml(s.status, s._id)}
            </select>
          </div>
        </td>
        <td>${timeAgo(s.updatedAt)}</td>
        <td class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="editService('${s._id}','${esc(s.name).replace(/'/g, "\\'")}','${esc(s.description || '').replace(/'/g, "\\'")}')">Edit</button>
          ${currentUser && currentUser.role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteService('${s._id}')">Delete</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    const sel = document.getElementById('incServices');
    if (sel) {
      sel.innerHTML = services.map(s =>
        `<option value="${s._id}">${esc(s.name)}</option>`
      ).join('');
    }
  } catch (e) {
    toast(e.message || 'Failed to load services', 'error');
  }
}

async function updateServiceStatus(id, status) {
  try {
    await Store.updateService(id, { status });
    toast(`Status updated to ${formatStatus(status)}`, 'success');
    loadServices();
  } catch (e) {
    toast(e.message || 'Failed to update status', 'error');
    loadServices();
  }
}

const serviceModal = document.getElementById('serviceModal');
document.getElementById('addServiceBtn').addEventListener('click', () => {
  document.getElementById('serviceModalTitle').textContent = 'Add Service';
  document.getElementById('svcId').value = '';
  document.getElementById('svcName').value = '';
  document.getElementById('svcDesc').value = '';
  serviceModal.classList.add('open');
});
document.getElementById('cancelServiceBtn').addEventListener('click', () => serviceModal.classList.remove('open'));
serviceModal.addEventListener('click', (e) => { if (e.target === serviceModal) serviceModal.classList.remove('open'); });

function editService(id, name, desc) {
  document.getElementById('serviceModalTitle').textContent = 'Edit Service';
  document.getElementById('svcId').value = id;
  document.getElementById('svcName').value = name;
  document.getElementById('svcDesc').value = desc;
  serviceModal.classList.add('open');
}

document.getElementById('serviceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('svcId').value;
  const body = {
    name: document.getElementById('svcName').value,
    description: document.getElementById('svcDesc').value
  };
  try {
    if (id) await Store.updateService(id, body);
    else await Store.createService(body);
    toast(id ? 'Service updated' : 'Service added', 'success');
    serviceModal.classList.remove('open');
    loadServices();
  } catch (err) {
    toast(err.message || 'Failed to save service', 'error');
  }
});

async function deleteService(id) {
  if (!confirm('Delete this service? This cannot be undone.')) return;
  try {
    await Store.deleteService(id);
    toast('Service deleted', 'success');
    loadServices();
  } catch (e) {
    toast(e.message || 'Failed to delete', 'error');
  }
}

// Incidents
async function loadIncidents() {
  try {
    const incidents = await Store.getIncidents('?limit=50');
    document.getElementById('incCount').textContent = `(${incidents.length})`;
    const list = document.getElementById('incidentsAdminList');
    if (!incidents.length) {
      list.innerHTML = '<div class="empty-state">No incidents yet.</div>';
      return;
    }
    list.innerHTML = incidents.map(inc => `
      <div class="incident-admin-card">
        <h4>${esc(inc.title)}</h4>
        <div class="incident-admin-meta">
          <span class="incident-impact ${esc(inc.impact)}">${esc(inc.impact)}</span>
          Status: <strong>${esc((inc.status || '').replace(/_/g, ' '))}</strong>
          · ${(inc.serviceNames || []).map(esc).join(', ') || 'No services'}
          · ${timeAgo(inc.startedAt || inc.createdAt)}
        </div>
        <div class="incident-admin-actions">
          <button class="btn btn-cyan btn-sm" onclick="openIncidentUpdate('${inc._id}','${esc(inc.title).replace(/'/g, "\\'")}','${esc(inc.status)}')">Post update</button>
          ${!['resolved', 'completed'].includes(inc.status)
            ? `<button class="btn btn-secondary btn-sm" onclick="resolveIncident('${inc._id}')">Resolve</button>`
            : ''}
          ${currentUser && currentUser.role === 'admin'
            ? `<button class="btn btn-danger btn-sm" onclick="deleteIncident('${inc._id}')">Delete</button>`
            : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    toast(e.message || 'Failed to load incidents', 'error');
  }
}

const incidentModal = document.getElementById('incidentModal');
document.getElementById('addIncidentBtn').addEventListener('click', async () => {
  await loadServices();
  document.getElementById('incTitle').value = '';
  document.getElementById('incMessage').value = '';
  document.getElementById('incImpact').value = 'minor';
  document.getElementById('incStatus').value = 'investigating';
  [...document.getElementById('incServices').options].forEach(o => { o.selected = false; });
  incidentModal.classList.add('open');
});
document.getElementById('cancelIncidentBtn').addEventListener('click', () => incidentModal.classList.remove('open'));
incidentModal.addEventListener('click', (e) => { if (e.target === incidentModal) incidentModal.classList.remove('open'); });

document.getElementById('incidentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sel = document.getElementById('incServices');
  const serviceIds = [...sel.selectedOptions].map(o => o.value);
  try {
    await Store.createIncident({
      title: document.getElementById('incTitle').value,
      impact: document.getElementById('incImpact').value,
      status: document.getElementById('incStatus').value,
      message: document.getElementById('incMessage').value || undefined,
      serviceIds
    });
    toast('Incident created — Discord notified if enabled', 'success');
    incidentModal.classList.remove('open');
    loadIncidents();
  } catch (err) {
    toast(err.message || 'Failed to create incident', 'error');
  }
});

const incidentUpdateModal = document.getElementById('incidentUpdateModal');
function openIncidentUpdate(id, title, status) {
  document.getElementById('incUpdateId').value = id;
  document.getElementById('incUpdateTitle').textContent = title;
  document.getElementById('incUpdateStatus').value = status || 'investigating';
  document.getElementById('incUpdateMessage').value = '';
  incidentUpdateModal.classList.add('open');
}
document.getElementById('cancelIncidentUpdateBtn').addEventListener('click', () => incidentUpdateModal.classList.remove('open'));
incidentUpdateModal.addEventListener('click', (e) => {
  if (e.target === incidentUpdateModal) incidentUpdateModal.classList.remove('open');
});

document.getElementById('incidentUpdateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('incUpdateId').value;
  try {
    await Store.addIncidentUpdate(id, {
      status: document.getElementById('incUpdateStatus').value,
      message: document.getElementById('incUpdateMessage').value
    });
    toast('Update posted — Discord notified if enabled', 'success');
    incidentUpdateModal.classList.remove('open');
    loadIncidents();
  } catch (err) {
    toast(err.message || 'Failed to post update', 'error');
  }
});

async function resolveIncident(id) {
  try {
    await Store.addIncidentUpdate(id, {
      status: 'resolved',
      message: 'This incident has been resolved.'
    });
    toast('Incident resolved', 'success');
    loadIncidents();
  } catch (e) {
    toast(e.message || 'Failed to resolve', 'error');
  }
}

async function deleteIncident(id) {
  if (!confirm('Delete this incident?')) return;
  try {
    await Store.deleteIncident(id);
    toast('Incident deleted', 'success');
    loadIncidents();
  } catch (e) {
    toast(e.message || 'Failed to delete', 'error');
  }
}

// Status options
async function loadStatusOptions() {
  try {
    const items = await Store.getStatuses(true);
    statusOptions = items.filter(s => s.enabled);
    statusMap = {};
    items.forEach(s => { statusMap[s.key] = s; });
    document.getElementById('statusOptCount').textContent = `(${items.length})`;
    const tbody = document.getElementById('statusesTableBody');
    tbody.innerHTML = items.map(s => `
      <tr class="${s.enabled ? '' : 'row-disabled'}">
        <td><span class="status-dot lg" style="background:${esc(s.color)}"></span></td>
        <td><code>${esc(s.key)}</code></td>
        <td><strong>${esc(s.label)}</strong>${s.isSystem ? ' <span class="badge">system</span>' : ''}${s.isDefault ? ' <span class="badge badge-green">default</span>' : ''}</td>
        <td>${esc(s.severity)}</td>
        <td>${s.uptimeWeight}%</td>
        <td>${s.enabled ? 'Yes' : 'No'}</td>
        <td class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick='editStatus(${JSON.stringify(s)})'>Edit</button>
          ${!s.isSystem ? `<button class="btn btn-danger btn-sm" onclick="deleteStatusOpt('${s._id}')">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    toast(e.message || 'Failed to load statuses', 'error');
  }
}

const statusModal = document.getElementById('statusModal');
document.getElementById('addStatusBtn').addEventListener('click', () => {
  document.getElementById('statusModalTitle').textContent = 'Add Status';
  document.getElementById('statusId').value = '';
  document.getElementById('statusKey').value = '';
  document.getElementById('statusKey').disabled = false;
  document.getElementById('statusKeyGroup').style.display = '';
  document.getElementById('statusLabel').value = '';
  document.getElementById('statusColor').value = '#8A8D9B';
  document.getElementById('statusSeverity').value = 'warn';
  document.getElementById('statusUptime').value = '100';
  statusModal.classList.add('open');
});
document.getElementById('cancelStatusBtn').addEventListener('click', () => statusModal.classList.remove('open'));
statusModal.addEventListener('click', (e) => { if (e.target === statusModal) statusModal.classList.remove('open'); });

function editStatus(s) {
  document.getElementById('statusModalTitle').textContent = 'Edit Status';
  document.getElementById('statusId').value = s._id;
  document.getElementById('statusKey').value = s.key;
  document.getElementById('statusKey').disabled = true;
  document.getElementById('statusKeyGroup').style.display = 'none';
  document.getElementById('statusLabel').value = s.label;
  document.getElementById('statusColor').value = s.color || '#8A8D9B';
  document.getElementById('statusSeverity').value = s.severity || 'info';
  document.getElementById('statusUptime').value = s.uptimeWeight ?? 100;
  statusModal.classList.add('open');
}

document.getElementById('statusForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('statusId').value;
  const body = {
    label: document.getElementById('statusLabel').value,
    color: document.getElementById('statusColor').value,
    severity: document.getElementById('statusSeverity').value,
    uptimeWeight: Number(document.getElementById('statusUptime').value)
  };
  try {
    if (id) {
      await Store.updateStatus(id, body);
      toast('Status updated', 'success');
    } else {
      body.key = document.getElementById('statusKey').value || undefined;
      await Store.createStatus(body);
      toast('Status created', 'success');
    }
    statusModal.classList.remove('open');
    loadStatusOptions();
    loadStatusesCache();
  } catch (err) {
    toast(err.message || 'Failed to save status', 'error');
  }
});

async function deleteStatusOpt(id) {
  if (!confirm('Delete this status option?')) return;
  try {
    await Store.deleteStatus(id);
    toast('Status deleted', 'success');
    loadStatusOptions();
    loadStatusesCache();
  } catch (e) {
    toast(e.message || 'Failed to delete', 'error');
  }
}

// Integrations
async function loadIntegrations() {
  try {
    const s = await Store.getSettings();
    document.getElementById('discordEnabled').checked = !!s.discordEnabled;
    document.getElementById('discordWebhookUrl').value = s.discordWebhookUrl || '';
    document.getElementById('discordMention').value = s.discordMention || '';
    document.getElementById('statusPageUrl').value = s.statusPageUrl || '';
    document.getElementById('botApiKeyEnabled').checked = s.botApiKeyEnabled !== false;

    const display = document.getElementById('botApiKeyDisplay');
    const copyBtn = document.getElementById('copyBotKeyBtn');
    if (lastBotKeyPlain) {
      display.textContent = lastBotKeyPlain;
      copyBtn.style.display = '';
      document.getElementById('botKeyHint').textContent = 'Copy and store this key now. It will be masked after you leave this page.';
    } else if (s.botApiKeySet) {
      display.textContent = s.botApiKeyMasked || '•••• set';
      copyBtn.style.display = 'none';
      document.getElementById('botKeyHint').textContent = 'Key is set. Rotate to get a new full key.';
    } else {
      display.textContent = 'Not generated';
      copyBtn.style.display = 'none';
    }

    document.getElementById('botEndpointsHelp').textContent =
`Base: ${typeof API_BASE !== 'undefined' ? API_BASE : 'https://melix-status.vercel.app'}

GET  /api/bot/snapshot          → full status dump
GET  /api/bot/poll?since=ISO    → changes since timestamp
GET  /api/bot/overall
GET  /api/bot/services
GET  /api/bot/incidents?active=1

Header: X-API-Key: <your-key>
   or:  Authorization: Bot <your-key>`;
  } catch (e) {
    toast(e.message || 'Failed to load settings', 'error');
  }
}

document.getElementById('saveDiscordBtn').addEventListener('click', async () => {
  try {
    await Store.updateSettings({
      discordEnabled: document.getElementById('discordEnabled').checked,
      discordWebhookUrl: document.getElementById('discordWebhookUrl').value.trim(),
      discordMention: document.getElementById('discordMention').value.trim(),
      statusPageUrl: document.getElementById('statusPageUrl').value.trim()
    });
    toast('Discord settings saved', 'success');
    loadIntegrations();
  } catch (e) {
    toast(e.message || 'Failed to save', 'error');
  }
});

document.getElementById('testDiscordBtn').addEventListener('click', async () => {
  try {
    await Store.updateSettings({
      discordEnabled: document.getElementById('discordEnabled').checked,
      discordWebhookUrl: document.getElementById('discordWebhookUrl').value.trim(),
      discordMention: document.getElementById('discordMention').value.trim(),
      statusPageUrl: document.getElementById('statusPageUrl').value.trim()
    });
    await Store.testDiscord();
    toast('Test message sent to Discord', 'success');
  } catch (e) {
    toast(e.message || 'Test failed', 'error');
  }
});

document.getElementById('saveBotSettingsBtn').addEventListener('click', async () => {
  try {
    await Store.updateSettings({
      botApiKeyEnabled: document.getElementById('botApiKeyEnabled').checked
    });
    toast('Bot settings saved', 'success');
  } catch (e) {
    toast(e.message || 'Failed to save', 'error');
  }
});

document.getElementById('regenBotKeyBtn').addEventListener('click', async () => {
  if (!confirm('Generate a new bot API key? The old key will stop working immediately.')) return;
  try {
    const data = await Store.regenerateBotKey();
    lastBotKeyPlain = data.botApiKey;
    toast('New bot API key generated — copy it now', 'success');
    loadIntegrations();
  } catch (e) {
    toast(e.message || 'Failed to generate key', 'error');
  }
});

document.getElementById('copyBotKeyBtn').addEventListener('click', async () => {
  const text = lastBotKeyPlain || document.getElementById('botApiKeyDisplay').textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', 'success');
  } catch (_) {
    toast('Copy failed — select the key manually', 'error');
  }
});

// Users
async function loadUsers() {
  try {
    const users = await Store.getUsers();
    document.getElementById('userCount').textContent = `(${users.length})`;
    document.getElementById('usersTableBody').innerHTML = users.map(u => `
      <tr>
        <td><strong>${esc(u.username)}</strong></td>
        <td style="font-size:11px;font-weight:600;letter-spacing:0.04em;">${esc(u.role).toUpperCase()}</td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td class="table-actions">
          <button class="btn btn-cyan btn-sm" onclick="changePassword('${u._id}','${esc(u.username)}')">Password</button>
          ${String(u._id) !== String(currentUser.id || currentUser._id) ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u._id}')">Remove</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    toast(e.message || 'Failed to load users', 'error');
  }
}

const userModal = document.getElementById('userModal');
document.getElementById('addUserBtn').addEventListener('click', () => {
  document.getElementById('userModalTitle').textContent = 'Add User';
  document.getElementById('userId').value = '';
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newRole').value = 'editor';
  userModal.classList.add('open');
});
document.getElementById('cancelUserBtn').addEventListener('click', () => userModal.classList.remove('open'));
userModal.addEventListener('click', (e) => { if (e.target === userModal) userModal.classList.remove('open'); });

document.getElementById('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await Store.createUser({
      username: document.getElementById('newUsername').value,
      password: document.getElementById('newPassword').value,
      role: document.getElementById('newRole').value
    });
    toast('User created', 'success');
    userModal.classList.remove('open');
    loadUsers();
  } catch (err) {
    toast(err.message || 'Failed to create user', 'error');
  }
});

async function deleteUser(id) {
  if (!confirm('Remove this user? This cannot be undone.')) return;
  try {
    await Store.deleteUser(id);
    toast('User removed', 'success');
    loadUsers();
  } catch (e) {
    toast(e.message || 'Failed to remove user', 'error');
  }
}

// Password
const passwordModal = document.getElementById('passwordModal');
function changePassword(id, username) {
  document.getElementById('pwUserId').value = id;
  document.getElementById('pwUsername').textContent = username;
  document.getElementById('newUserPassword').value = '';
  passwordModal.classList.add('open');
}
document.getElementById('cancelPasswordBtn').addEventListener('click', () => passwordModal.classList.remove('open'));
passwordModal.addEventListener('click', (e) => { if (e.target === passwordModal) passwordModal.classList.remove('open'); });

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('pwUserId').value;
  try {
    await Store.updateUserPassword(id, document.getElementById('newUserPassword').value);
    toast('Password updated', 'success');
    passwordModal.classList.remove('open');
  } catch (err) {
    toast(err.message || 'Failed to update password', 'error');
  }
});

// Events
async function loadAdminEvents() {
  try {
    const events = await Store.getEvents();
    const list = document.getElementById('adminEventsList');
    if (!events.length) {
      list.innerHTML = '<div class="event-row"><span class="ts">--:--:--</span> No events recorded.</div>';
      return;
    }
    list.innerHTML = events.map(e => {
      const cls = (e.type === 'MOD' || e.type === 'OUTAGE' || e.type === 'UPDATE' || e.type === 'INCIDENT') ? 'tag-mod' : 'tag-sys';
      return `<div class="event-row"><span class="ts">${formatClock(e.createdAt)}</span><span class="${cls}">[${esc(e.type)}]</span> ${esc(e.message)}</div>`;
    }).join('');
  } catch (e) {
    toast(e.message || 'Failed to load events', 'error');
  }
}

document.getElementById('postEventBtn').addEventListener('click', async () => {
  const input = document.getElementById('eventMessage');
  const msg = input.value.trim();
  if (!msg) return;
  try {
    await Store.createEvent({ type: 'MOD', message: msg });
    input.value = '';
    toast('Update posted', 'success');
    loadAdminEvents();
  } catch (e) {
    toast(e.message || 'Failed to post update', 'error');
  }
});

// Init
(async () => {
  if (!Store.token) {
    showLogin();
    return;
  }
  try {
    const user = await Store.getMe();
    showDash(user);
  } catch (_) {
    Store.logout();
    showLogin();
  }
})();

