const Store = {
  token: localStorage.getItem('melix_token') || null,

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
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
  getEvents() { return this.request('/api/events'); },

  async getMe() {
    const data = await this.request('/api/me');
    return data;
  },

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
  }
};

