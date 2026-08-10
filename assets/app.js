let statusMap = {};

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatStatus(s) {
  if (statusMap[s] && statusMap[s].label) return statusMap[s].label;
  const map = {
    operational: 'Operational',
    degraded: 'Degraded Performance',
    outage: 'Major Outage',
    maintenance: 'Under Maintenance',
    no_data: 'No data'
  };
  return map[s] || (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || s;
}

function statusColor(s) {
  if (statusMap[s] && statusMap[s].color) return statusMap[s].color;
  const map = {
    operational: '#22C55E',
    degraded: '#EAB308',
    outage: '#EF4444',
    maintenance: '#2DD4E8',
    no_data: '#d0d4dc'
  };
  return map[s] || '#8A8D9B';
}

function formatIncidentStatus(s) {
  return (s || '').replace(/_/g, ' ');
}

function formatDayLabel(isoOrDate) {
  const d = new Date(isoOrDate);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function statusClass(overall) {
  return `is-${overall || 'unknown'}`;
}

async function loadStatusMap() {
  try {
    const list = await Store.getStatuses(false);
    statusMap = {};
    list.forEach(s => { statusMap[s.key] = s; });
  } catch (_) { /* keep defaults */ }
}

async function loadOverallStatus() {
  try {
    const data = await Store.getOverallStatus();
    const banner = document.getElementById('statusBanner');
    const label = document.getElementById('statusLabel');
    banner.className = `status-banner ${statusClass(data.status)}`;
    if (data.color && !['operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'].includes(data.status)) {
      banner.style.background = data.color;
    } else {
      banner.style.background = '';
    }
    label.textContent = data.label;
    document.title = `Melix Status — ${data.label}`;
  } catch (_) {
    document.getElementById('statusLabel').textContent = 'Unable to load status';
    document.getElementById('statusBanner').className = 'status-banner is-unknown';
  }
}

function barLabel(day) {
  const date = formatDayLabel(day.date + 'T00:00:00.000Z');
  const status = formatStatus(day.status === 'no_data' ? 'operational' : day.status);
  if (day.status === 'no_data') return `${date}\nNo data`;
  return `${date}\n${status}`;
}

function renderUptimeBars(history) {
  return `
    <div class="uptime-bars" role="img" aria-label="90 day uptime history">
      ${(history || []).map(day => {
        const known = ['operational', 'degraded', 'outage', 'maintenance', 'no_data'].includes(day.status);
        const style = known ? '' : `style="background:${esc(statusColor(day.status))}"`;
        return `
        <div class="uptime-bar ${known ? day.status : 'custom'}"
             ${style}
             data-tip="${esc(barLabel(day))}"
             title="${esc(barLabel(day).replace('\n', ' — '))}"></div>`;
      }).join('')}
    </div>
    <div class="uptime-meta">
      <span>90 days ago</span>
      <span class="line"></span>
      <span class="uptime-pct">${Number(history && history.length ? (history.reduce((a, d) => a + (d.uptimePercent || 100), 0) / history.length) : 100).toFixed(2)} % uptime</span>
      <span class="line"></span>
      <span>Today</span>
    </div>
  `;
}

async function loadServices() {
  const list = document.getElementById('servicesList');
  try {
    const services = await Store.getServicesWithUptime();
    if (!services.length) {
      list.innerHTML = '<div class="empty-state">No services configured yet.</div>';
      return;
    }
    list.innerHTML = services.map(s => {
      const known = ['operational', 'degraded', 'outage', 'maintenance'].includes(s.status);
      const colorStyle = known ? '' : `style="color:${esc(statusColor(s.status))}"`;
      return `
      <div class="service-row">
        <div class="service-row-top">
          <span class="service-name">
            ${esc(s.name)}
            ${s.description ? `<span class="service-desc">· ${esc(s.description)}</span>` : ''}
          </span>
          <span class="service-status ${known ? s.status : 'custom'}" ${colorStyle}>${formatStatus(s.status)}</span>
        </div>
        ${renderUptimeBars(s.history)}
      </div>`;
    }).join('');

    list.querySelectorAll('.service-row').forEach((row, i) => {
      const pct = services[i].uptime;
      if (pct != null) {
        const el = row.querySelector('.uptime-pct');
        if (el) el.textContent = `${Number(pct).toFixed(2)} % uptime`;
      }
    });
  } catch (_) {
    list.innerHTML = '<div class="empty-state">Failed to load services. Check API connection.</div>';
  }
}

function renderIncidentCard(inc) {
  const updates = [...(inc.updates || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const services = (inc.serviceNames || []).join(', ');
  return `
    <article class="incident-card">
      <h3 class="incident-title">${esc(inc.title)}</h3>
      <div class="incident-meta">
        <span class="incident-impact ${esc(inc.impact)}">${esc(inc.impact || 'minor')}</span>
        ${services ? esc(services) + ' · ' : ''}
        ${formatDateTime(inc.startedAt || inc.createdAt)}
        ${inc.resolvedAt ? ` · Resolved ${formatDateTime(inc.resolvedAt)}` : ''}
      </div>
      <ul class="incident-updates">
        ${updates.map(u => `
          <li class="incident-update ${esc(u.status)}">
            <span class="update-status">${esc(formatIncidentStatus(u.status))}</span>
            <span class="update-time">— ${formatDateTime(u.createdAt)}</span>
            <p class="update-message">${esc(u.message)}</p>
          </li>
        `).join('')}
      </ul>
    </article>
  `;
}

function groupByDay(incidents) {
  const map = new Map();
  for (const inc of incidents) {
    const key = dayKey(inc.startedAt || inc.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(inc);
  }
  return map;
}

async function loadIncidents() {
  const activeEl = document.getElementById('activeIncidents');
  const activeSection = document.getElementById('activeIncidentsSection');
  const pastEl = document.getElementById('pastIncidents');

  try {
    const all = await Store.getIncidents('?limit=50');
    const active = all.filter(i => !['resolved', 'completed'].includes(i.status));
    const past = all.filter(i => ['resolved', 'completed'].includes(i.status));

    if (active.length) {
      activeSection.hidden = false;
      activeEl.innerHTML = active.map(renderIncidentCard).join('');
    } else {
      activeSection.hidden = true;
      activeEl.innerHTML = '';
    }

    if (!past.length) {
      pastEl.innerHTML = '<div class="empty-state">No incidents reported in the last 90 days.</div>';
      return;
    }

    const grouped = groupByDay(past);
    const days = [...grouped.keys()].sort((a, b) => b.localeCompare(a));
    pastEl.innerHTML = days.map(day => `
      <div class="incident-day">
        <div class="incident-day-label">${formatDayLabel(day + 'T00:00:00.000Z')}</div>
        ${grouped.get(day).map(renderIncidentCard).join('')}
      </div>
    `).join('');
  } catch (_) {
    pastEl.innerHTML = '<div class="empty-state">Failed to load incidents.</div>';
  }
}

(function setupTooltip() {
  const tip = document.getElementById('barTooltip');
  if (!tip) return;
  document.addEventListener('mousemove', (e) => {
    const bar = e.target.closest('.uptime-bar');
    if (!bar) {
      tip.hidden = true;
      return;
    }
    const text = bar.getAttribute('data-tip') || '';
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = e.clientX + 'px';
    tip.style.top = e.clientY + 'px';
  });
  document.addEventListener('mouseleave', () => { tip.hidden = true; });
})();

async function refresh() {
  await loadStatusMap();
  await Promise.all([loadOverallStatus(), loadServices(), loadIncidents()]);
}

refresh();
setInterval(refresh, 30000);

