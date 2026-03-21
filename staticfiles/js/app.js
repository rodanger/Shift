/* ================================================================
   Shift & Invoice Tracker — Frontend JS
   Connects to Django REST + JWT backend at API_BASE
   ================================================================ */

const API_BASE = '/api';

/* ── State ─────────────────────────────────────────────────────── */
let accessToken  = localStorage.getItem('sit_access')  || null;
let refreshToken = localStorage.getItem('sit_refresh') || null;
let currentUser  = null;
let currentPage  = 'dashboard';

/* ── Bootstrap instances ────────────────────────────────────────── */
let shiftModal, invoiceModal, toastEl, toastInst;

document.addEventListener('DOMContentLoaded', () => {
  shiftModal   = new bootstrap.Modal(document.getElementById('modal-shift'));
  invoiceModal = new bootstrap.Modal(document.getElementById('modal-invoice'));
  toastEl      = document.getElementById('sit-toast');
  toastInst    = new bootstrap.Toast(toastEl, { delay: 3000 });

  if (accessToken) { initApp(); }

  // Live preview total in shift modal
  ['shift-start','shift-end','shift-rate'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateShiftPreview);
  });
});

/* ── API helper ─────────────────────────────────────────────────── */
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });

  // Token expired → try refresh
  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined
      });
    } else {
      logout(); return null;
    }
  }
  return res;
}

async function tryRefresh() {
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken })
  });
  if (res.ok) {
    const data = await res.json();
    accessToken = data.access;
    localStorage.setItem('sit_access', accessToken);
    return true;
  }
  return false;
}

/* ── Auth ───────────────────────────────────────────────────────── */
function switchAuthTab(tab) {
  document.getElementById('form-login').classList.toggle('d-none', tab !== 'login');
  document.getElementById('form-register').classList.toggle('d-none', tab !== 'register');
  document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register-btn').classList.toggle('active', tab === 'register');
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  err.classList.add('d-none');
  setLoading(btn, true);

  const res = await api('/auth/login/', {
    method: 'POST', auth: false,
    body: { username: v('login-email'), password: v('login-password') }
  });

  setLoading(btn, false);
  if (!res) return;

  if (res.ok) {
    const data = await res.json();
    accessToken  = data.access;
    refreshToken = data.refresh;
    localStorage.setItem('sit_access',  accessToken);
    localStorage.setItem('sit_refresh', refreshToken);
    initApp();
  } else {
    const data = await res.json();
    err.textContent = data.detail || 'Incorrect credentials';
    err.classList.remove('d-none');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('reg-btn');
  const err = document.getElementById('reg-error');
  err.classList.add('d-none');
  setLoading(btn, true);

  const res = await api('/auth/register/', {
    method: 'POST', auth: false,
    body: {
      email:        v('reg-email'),
      username:     v('reg-username'),
      full_name:    v('reg-fullname'),
      password:     v('reg-password'),
      password2:    v('reg-password2'),
      default_rate: v('reg-rate') || '0',
      currency:     v('reg-currency'),
    }
  });

  setLoading(btn, false);
  if (!res) return;

  if (res.ok) {
    showToast('Account created. Please log in.', 'success');
    switchAuthTab('login');
    document.getElementById('login-email').value = v('reg-email');
  } else {
    const data = await res.json();
    err.textContent = flattenErrors(data);
    err.classList.remove('d-none');
  }
}

function logout() {
  accessToken = refreshToken = null;
  localStorage.removeItem('sit_access');
  localStorage.removeItem('sit_refresh');
  document.getElementById('screen-app').classList.add('d-none');
  document.getElementById('screen-auth').classList.remove('d-none');
  currentUser = null;
}

/* ── Init app ───────────────────────────────────────────────────── */
async function initApp() {
  document.getElementById('screen-auth').classList.add('d-none');
  document.getElementById('screen-app').classList.remove('d-none');

  const res = await api('/auth/profile/');
  if (!res || !res.ok) { logout(); return; }
  currentUser = await res.json();

  const displayName = currentUser.full_name || currentUser.username || '?';
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('sidebar-avatar').textContent   = initials;
  document.getElementById('sidebar-username').textContent = displayName;

  navigate('dashboard');
}

/* ── Navigation ─────────────────────────────────────────────────── */
function navigate(page) {
  currentPage = page;

  document.querySelectorAll('.page-section').forEach(s => s.classList.add('d-none'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.remove('d-none');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  const titles = { dashboard:'Dashboard', shifts:'Shifts', invoices:'Invoices', profile:'Profile' };
  document.getElementById('page-title').textContent = titles[page] || page;

  document.getElementById('btn-new-shift').classList.toggle('d-none', page !== 'shifts');
  document.getElementById('btn-gen-invoice').classList.toggle('d-none', page !== 'invoices');

  // close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  if (page === 'dashboard') loadDashboard();
  if (page === 'shifts')    loadShifts();
  if (page === 'invoices')  loadInvoices();
  if (page === 'profile')   loadProfile();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ── Dashboard ──────────────────────────────────────────────────── */
async function loadDashboard() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth() + 1;

  // Summary stats
  const summaryRes = await api(`/shifts/summary/?year=${year}&month=${month}`);
  if (summaryRes && summaryRes.ok) {
    const s = await summaryRes.json();
    const cur = currentUser?.currency || 'CAD';
    document.getElementById('stat-shifts').textContent = s.shift_count;
    document.getElementById('stat-hours').textContent  = `${s.total_hours}h`;
    document.getElementById('stat-pay').textContent    = formatMoney(s.total_pay, cur);
  }

  // Recent shifts
  const shiftsRes = await api(`/shifts/?ordering=-date&page_size=5`);
  const recentEl  = document.getElementById('dash-recent-shifts');
  if (shiftsRes && shiftsRes.ok) {
    const data = await shiftsRes.json();
    const items = data.results || data;
    if (!items.length) {
      recentEl.innerHTML = `<div class="empty-state"><i class="bi bi-clock"></i><p>No shifts yet</p></div>`;
    } else {
      recentEl.innerHTML = items.slice(0,5).map(s => `
        <div class="dash-shift-row">
          <span class="dash-shift-date">${fmtDate(s.date)}</span>
          <span class="flex-fill text-truncate">${s.client || '—'} ${s.role ? '· ' + s.role : ''}</span>
          <span class="badge-status badge-${s.status}">${labelStatus(s.status)}</span>
          <span class="dash-shift-pay">${formatMoney(s.total_pay, currentUser?.currency)}</span>
        </div>`).join('');
    }
  }

  // Invoice count
  const invRes = await api('/invoices/');
  if (invRes && invRes.ok) {
    const data = await invRes.json();
    const items = data.results || data;
    const pending = items.filter(i => i.status === 'draft' || i.status === 'sent').length;
    document.getElementById('stat-invoices').textContent = pending;

    const invEl = document.getElementById('dash-recent-invoices');
    if (!items.length) {
      invEl.innerHTML = `<div class="empty-state"><i class="bi bi-receipt"></i><p>No invoices yet</p></div>`;
    } else {
      invEl.innerHTML = items.slice(0,4).map(inv => `
        <div class="dash-shift-row">
          <span class="dash-shift-date" style="font-size:11px">${inv.invoice_number}</span>
          <span class="flex-fill text-truncate">${inv.client_name || '—'}</span>
          <span class="badge-status badge-${inv.status}">${inv.status}</span>
          <span class="dash-shift-pay">${formatMoney(inv.total, currentUser?.currency)}</span>
        </div>`).join('');
    }
  }
}

/* ── Shifts ─────────────────────────────────────────────────────── */
async function loadShifts() {
  // populate year filter
  const yearSel = document.getElementById('filter-year');
  if (!yearSel.options.length) {
    const y = new Date().getFullYear();
    for (let i = y; i >= y - 3; i--) {
      const o = new Option(i, i);
      if (i === y) o.selected = true;
      yearSel.add(o);
    }
  }

  let url = '/shifts/?ordering=-date';
  const year   = v('filter-year');
  const month  = v('filter-month');
  const status = v('filter-status');
  const client = v('filter-client');
  if (year)   url += `&year=${year}`;
  if (month)  url += `&month=${month}`;
  if (status) url += `&status=${status}`;
  if (client) url += `&client=${encodeURIComponent(client)}`;

  const res = await api(url);
  const tbody = document.getElementById('shifts-tbody');

  if (!res || !res.ok) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Error loading shifts</td></tr>`;
    return;
  }

  const data  = await res.json();
  const items = data.results || data;

  // Summary bar
  const cur = currentUser?.currency || 'CAD';
  const totalHours = items.reduce((a, s) => a + parseFloat(s.hours_worked || 0), 0);
  const totalPay   = items.reduce((a, s) => a + parseFloat(s.total_pay   || 0), 0);
  document.getElementById('shifts-summary-bar').innerHTML = `
    <span class="summary-pill"><i class="bi bi-list-ul"></i> <strong>${items.length}</strong> shifts</span>
    <span class="summary-pill"><i class="bi bi-clock"></i> <strong>${totalHours.toFixed(1)}h</strong></span>
    <span class="summary-pill"><i class="bi bi-cash-stack"></i> <strong>${formatMoney(totalPay, cur)}</strong></span>
  `;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">No shifts found for this filter</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(s => `
    <tr>
      <td><span class="text-mono">${fmtDate(s.date)}</span></td>
      <td><span class="text-mono">${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)}</span></td>
      <td>
        <div class="fw-500">${s.client || '—'}</div>
        ${s.role ? `<div class="text-muted" style="font-size:11px">${s.role}</div>` : ''}
      </td>
      <td class="text-end text-mono">${parseFloat(s.hours_worked).toFixed(2)}h</td>
      <td class="text-end text-mono fw-500">${formatMoney(s.total_pay, cur)}</td>
      <td><span class="badge-status badge-${s.status}">${labelStatus(s.status)}</span></td>
      <td class="text-center">
        <div class="d-flex gap-1 justify-content-center">
          ${s.status === 'pending' ? `
            <button class="btn btn-sm sit-btn-ghost py-0 px-2" onclick="editShift(${s.id})" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
          ` : ''}
          <button class="btn btn-sm sit-btn-ghost py-0 px-2 text-danger" onclick="deleteShift(${s.id})" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function clearFilters() {
  document.getElementById('filter-month').value  = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-client').value = '';
  loadShifts();
}

function openShiftModal(shift = null) {
  document.getElementById('shift-modal-title').textContent = shift ? 'Edit shift' : 'New shift';
  document.getElementById('shift-id').value       = shift?.id || '';
  document.getElementById('shift-date').value     = shift?.date || todayISO();
  document.getElementById('shift-start').value    = shift?.start_time?.slice(0,5) || '';
  document.getElementById('shift-end').value      = shift?.end_time?.slice(0,5)   || '';
  document.getElementById('shift-rate').value     = shift?.hourly_rate || currentUser?.default_rate || '';
  document.getElementById('shift-client').value   = shift?.client   || '';
  document.getElementById('shift-role').value     = shift?.role     || '';
  document.getElementById('shift-location').value = shift?.location || '';
  document.getElementById('shift-notes').value    = shift?.notes    || '';
  document.getElementById('shift-error').classList.add('d-none');
  updateShiftPreview();
  shiftModal.show();
}

async function editShift(id) {
  const res = await api(`/shifts/${id}/`);
  if (res && res.ok) { openShiftModal(await res.json()); }
}

async function deleteShift(id) {
  if (!confirm('Delete this shift?')) return;
  const res = await api(`/shifts/${id}/`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Shift deleted', 'success');
    loadShifts();
    if (currentPage === 'dashboard') loadDashboard();
  } else {
    showToast('Failed to delete shift', 'danger');
  }
}

async function saveShift(e) {
  e.preventDefault();
  const btn = document.getElementById('shift-save-btn');
  const err = document.getElementById('shift-error');
  err.classList.add('d-none');
  setLoading(btn, true);

  const id   = v('shift-id');
  const body = {
    date:        v('shift-date'),
    start_time:  v('shift-start'),
    end_time:    v('shift-end'),
    hourly_rate: v('shift-rate'),
    client:      v('shift-client'),
    role:        v('shift-role'),
    location:    v('shift-location'),
    notes:       v('shift-notes'),
  };

  const res = id
    ? await api(`/shifts/${id}/`, { method: 'PATCH', body })
    : await api('/shifts/',       { method: 'POST',  body });

  setLoading(btn, false);
  if (res && res.ok) {
    showToast(id ? 'Shift updated' : 'Shift saved', 'success');
    shiftModal.hide();
    loadShifts();
    if (currentPage === 'dashboard') loadDashboard();
  } else if (res) {
    const data = await res.json();
    err.textContent = flattenErrors(data);
    err.classList.remove('d-none');
  }
}

function updateShiftPreview() {
  const start = v('shift-start'), end = v('shift-end'), rate = parseFloat(v('shift-rate'));
  const el = document.getElementById('shift-preview-total');
  if (!start || !end || !rate) { el.textContent = '–'; return; }
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const total = (mins / 60) * rate;
  el.textContent = formatMoney(total, currentUser?.currency);
}

/* ── Invoices ───────────────────────────────────────────────────── */
async function loadInvoices() {
  const res = await api('/invoices/');
  const container = document.getElementById('invoices-list');

  if (!res || !res.ok) {
    container.innerHTML = `<div class="col-12 text-danger text-center py-4">Error loading invoices</div>`;
    return;
  }

  const data  = await res.json();
  const items = data.results || data;
  const cur   = currentUser?.currency || 'CAD';

  if (!items.length) {
    container.innerHTML = `
      <div class="col-12">
        <div class="empty-state py-5">
          <i class="bi bi-receipt-cutoff" style="font-size:48px"></i>
          <p class="mt-2">No invoices yet. Generate one from the Shifts view.</p>
        </div>
      </div>`;
    return;
  }

  const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

  container.innerHTML = items.map(inv => `
    <div class="col-md-6 col-xl-4">
      <div class="invoice-card">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <div class="invoice-card-num">${inv.invoice_number}</div>
            <div class="invoice-card-period">${MONTHS[inv.period_month]} ${inv.period_year}</div>
          </div>
          <span class="badge-status badge-${inv.status}">${inv.status}</span>
        </div>
        <div class="invoice-card-total my-2">${formatMoney(inv.total, cur)}</div>
        <div class="text-muted mb-3" style="font-size:12px">
          ${inv.client_name || '—'} · ${inv.shifts?.length || 0} shift(s)
        </div>
        <div class="d-flex gap-2 flex-wrap">
          ${inv.status === 'draft' ? `
            <button class="btn sit-btn-primary btn-sm" onclick="markInvoice(${inv.id},'sent')">
              <i class="bi bi-send me-1"></i>Send
            </button>` : ''}
          ${inv.status === 'sent' ? `
            <button class="btn sit-btn-primary btn-sm" onclick="markInvoice(${inv.id},'paid')">
              <i class="bi bi-check2-circle me-1"></i>Mark as paid
            </button>` : ''}
          <button class="btn sit-btn-ghost btn-sm" onclick="downloadExcel(${inv.id})" title="Download Excel">
            <i class="bi bi-file-earmark-spreadsheet me-1"></i>Excel
          </button>
          ${inv.status !== 'paid' ? `
            <button class="btn btn-sm sit-btn-ghost text-danger" onclick="deleteInvoice(${inv.id},${inv.status === 'draft'})">
              <i class="bi bi-trash"></i>
            </button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function openInvoiceModal() {
  const now = new Date();
  document.getElementById('inv-year').value  = now.getFullYear();
  document.getElementById('inv-month').value = now.getMonth() + 1;
  document.getElementById('inv-client').value       = '';
  document.getElementById('inv-client-addr').value  = '';
  document.getElementById('inv-tax').value           = '0';
  document.getElementById('inv-due').value           = '';
  document.getElementById('inv-notes').value         = '';
  document.getElementById('invoice-error').classList.add('d-none');
  invoiceModal.show();
}

async function generateInvoice(e) {
  e.preventDefault();
  const btn = document.getElementById('invoice-gen-btn');
  const err = document.getElementById('invoice-error');
  err.classList.add('d-none');
  setLoading(btn, true);

  const res = await api('/invoices/generate/', {
    method: 'POST',
    body: {
      year:           parseInt(v('inv-year')),
      month:          parseInt(v('inv-month')),
      client_name:    v('inv-client'),
      client_address: v('inv-client-addr'),
      tax_rate:       parseFloat(v('inv-tax')) || 0,
      due_date:       v('inv-due') || null,
      notes:          v('inv-notes'),
    }
  });

  setLoading(btn, false);
  if (res && res.ok) {
    showToast('Invoice generated successfully', 'success');
    invoiceModal.hide();
    loadInvoices();
  } else if (res) {
    const data = await res.json();
    err.textContent = data.detail || flattenErrors(data);
    err.classList.remove('d-none');
  }
}

async function markInvoice(id, status) {
  const res = await api(`/invoices/${id}/status/`, { method: 'PATCH', body: { status } });
  if (res && res.ok) {
    showToast(`Invoice marked as ${status}`, 'success');
    loadInvoices();
  } else {
    showToast('Could not update invoice', 'danger');
  }
}

async function deleteInvoice(id, isDraft) {
  if (!isDraft) {
    if (!confirm('Void this invoice? Shifts will return to pending status.')) return;
    const voidRes = await api(`/invoices/${id}/status/`, { method: 'PATCH', body: { status: 'void' } });
    if (!voidRes || !voidRes.ok) { showToast('Error voiding invoice', 'danger'); return; }
  } else {
    if (!confirm('Delete this draft invoice?')) return;
  }

  const res = await api(`/invoices/${id}/delete/`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Invoice deleted', 'success');
    loadInvoices();
  } else {
    showToast('Could not delete invoice', 'danger');
  }
}

/* ── Profile ────────────────────────────────────────────────────── */
async function loadProfile() {
  const res = await api('/auth/profile/');
  if (!res || !res.ok) return;
  const u = await res.json();
  document.getElementById('p-fullname').value = u.full_name    || '';
  document.getElementById('p-phone').value    = u.phone        || '';
  document.getElementById('p-rate').value     = u.default_rate || '';
  document.getElementById('p-currency').value = u.currency     || 'CAD';
  document.getElementById('p-prefix').value   = u.invoice_prefix || 'INV';
  document.getElementById('p-address').value  = u.address      || '';
  document.getElementById('p-bank').value     = u.bank_details || '';
}

async function saveProfile(e) {
  e.preventDefault();
  const msg = document.getElementById('profile-msg');
  msg.classList.add('d-none');

  const res = await api('/auth/profile/', {
    method: 'PATCH',
    body: {
      full_name:      v('p-fullname'),
      phone:          v('p-phone'),
      default_rate:   v('p-rate'),
      currency:       v('p-currency'),
      invoice_prefix: v('p-prefix'),
      address:        v('p-address'),
      bank_details:   v('p-bank'),
    }
  });

  if (res && res.ok) {
    currentUser = await res.json();
    const initials = (currentUser.full_name || currentUser.username || '?')
      .split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('sidebar-avatar').textContent   = initials;
    document.getElementById('sidebar-username').textContent = currentUser.full_name || currentUser.username;
    showToast('Profile updated', 'success');
    msg.textContent = 'Changes saved successfully.';
    msg.className   = 'alert alert-success mt-3 py-2 small';
    msg.classList.remove('d-none');
  } else if (res) {
    const data = await res.json();
    msg.textContent = flattenErrors(data);
    msg.className   = 'alert alert-danger mt-3 py-2 small';
    msg.classList.remove('d-none');
  }
}

/* ── Excel download (with JWT auth) ────────────────────────────── */
async function downloadExcel(id) {
  const res = await fetch(`${API_BASE}/invoices/${id}/export/excel/`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) { showToast('Error downloading Excel', 'danger'); return; }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `invoice-${id}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Helpers ────────────────────────────────────────────────────── */
function v(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function setLoading(btn, on) {
  btn.querySelector('.btn-text').classList.toggle('d-none', on);
  btn.querySelector('.btn-spinner').classList.toggle('d-none', !on);
  btn.disabled = on;
}

function showToast(msg, type = '') {
  document.getElementById('toast-msg').textContent = msg;
  toastEl.className = `toast align-items-center border-0 sit-toast ${type}`;
  toastInst.show();
}

function formatMoney(amount, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: currency || 'CAD', maximumFractionDigits: 2
  }).format(parseFloat(amount) || 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function labelStatus(s) {
  return { pending:'Pending', invoiced:'Invoiced', paid:'Paid' }[s] || s;
}

function flattenErrors(data) {
  if (typeof data === 'string') return data;
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' | ');
}