const Store = {
  token: localStorage.getItem('melix_token') || null,

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  },

  async login(username, password) {
    const data = await this.request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.token = data.token;
    localStorage.setItem('melix_token', data.token);
    return data;
  },

  logout() {
    this.token = null;
    localStorage.removeItem('melix_token');
  },

  getOverallStatus() { return this.request('/api/overall-status'); },
  getServices() { return this.request('/api/services'); },
  getServicesWithUptime() { return this.request('/api/services/with-uptime'); },
  getEvents() { return this.request('/api/events'); },
  getMe() { return this.request('/api/me'); },
  getIncidents(params = '') { return this.request(`/api/incidents${params}`); },
  getStatuses(all = false) { return this.request(`/api/statuses${all ? '?all=1' : ''}`); },

  updateService(id, body) {
    return this.request(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  createService(body) {
    return this.request('/api/services', { method: 'POST', body: JSON.stringify(body) });
  },
  deleteService(id) {
    return this.request(`/api/services/${id}`, { method: 'DELETE' });
  },
  createEvent(body) {
    return this.request('/api/events', { method: 'POST', body: JSON.stringify(body) });
  },
  getUsers() { return this.request('/api/users'); },
  createUser(body) {
    return this.request('/api/users', { method: 'POST', body: JSON.stringify(body) });
  },
  deleteUser(id) {
    return this.request(`/api/users/${id}`, { method: 'DELETE' });
  },
  updateUserPassword(id, password) {
    return this.request(`/api/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
  },
  createIncident(body) {
    return this.request('/api/incidents', { method: 'POST', body: JSON.stringify(body) });
  },
  updateIncident(id, body) {
    return this.request(`/api/incidents/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  addIncidentUpdate(id, body) {
    return this.request(`/api/incidents/${id}/updates`, { method: 'POST', body: JSON.stringify(body) });
  },
  deleteIncident(id) {
    return this.request(`/api/incidents/${id}`, { method: 'DELETE' });
  },

  createStatus(body) {
    return this.request('/api/statuses', { method: 'POST', body: JSON.stringify(body) });
  },
  updateStatus(id, body) {
    return this.request(`/api/statuses/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  deleteStatus(id) {
    return this.request(`/api/statuses/${id}`, { method: 'DELETE' });
  },

  getSettings() { return this.request('/api/settings'); },
  updateSettings(body) {
    return this.request('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
  },
  regenerateBotKey() {
    return this.request('/api/settings/bot-key/regenerate', { method: 'POST', body: '{}' });
  },
  testDiscord() {
    return this.request('/api/settings/discord/test', { method: 'POST', body: '{}' });
  }
};

