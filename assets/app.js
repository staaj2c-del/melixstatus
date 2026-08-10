(async function () {
  const overallEl = document.getElementById('overall');
  const badgeEl = document.getElementById('status-badge');
  const dotEl = document.getElementById('nav-dot');
  const servicesEl = document.getElementById('services');
  const eventsEl = document.getElementById('events');
  const tickerEl = document.getElementById('ticker');

  function setStatus(status, label) {
    overallEl.textContent = label;
    badgeEl.textContent = label;
    badgeEl.className = `status-badge ${status}`;
    dotEl.className = `dot ${status}`;
    document.title = `Melix Status — ${label}`;
  }

  function statusClass(s) {
    if (s === 'operational') return 'operational';
    if (s === 'degraded') return 'degraded';
    if (s === 'outage') return 'outage';
    if (s === 'maintenance') return 'maintenance';
    return '';
  }

  function statusLabel(s) {
    if (s === 'operational') return 'Operational';
    if (s === 'degraded') return 'Degraded';
    if (s === 'outage') return 'Outage';
    if (s === 'maintenance') return 'Maintenance';
    return s;
  }

  function timeAgo(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  try {
    const [status, services, events] = await Promise.all([
      Store.getOverallStatus(),
      Store.getServices(),
      Store.getEvents()
    ]);

    setStatus(status.status, status.label);

    // Services
    if (services.length === 0) {
      servicesEl.innerHTML = '<p class="loading">No services configured yet.</p>';
    } else {
      servicesEl.innerHTML = services.map(s => `
        <div class="service-card">
          <div class="service-info">
            <h3>${esc(s.name)}</h3>
            <p>${esc(s.description || '')}</p>
          </div>
          <span class="service-status ${statusClass(s.status)}">${statusLabel(s.status)}</span>
        </div>
      `).join('');
    }

    // Events
    if (events.length === 0) {
      eventsEl.innerHTML = '<p class="loading">No recent events.</p>';
    } else {
      eventsEl.innerHTML = events.map(e => `
        <div class="event-item">
          <span class="event-type ${e.type}">${esc(e.type)}</span>
          <div>
            <div class="event-message">${esc(e.message)}</div>
            <div class="event-time">${timeAgo(e.createdAt)}</div>
          </div>
        </div>
      `).join('');
    }

    // Ticker
    if (events.length > 0) {
      const tickerText = events.map(e => `[${e.type}] ${e.message}`).join('  ');
      tickerEl.innerHTML = `<span>${esc(tickerText)}</span><span>${esc(tickerText)}</span>`;
    }
  } catch (err) {
    console.error('Failed to load status:', err);
    servicesEl.innerHTML = '<p class="loading" style="color:var(--pink)">Failed to load services. Check API connection.</p>';
  }
})();

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

