import { STATUSES, normaliseApplication, validateImport, getStats, filterApplications, toCsv, serializeBackup, mergeApplications, makeId } from './core.js';

const STORAGE_KEY = 'applyflow.applications.v1';
const THEME_KEY = 'applyflow.theme.v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const today = () => new Date().toISOString().slice(0, 10);
let applications = loadApplications();
let toastTimer;

function loadApplications() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return validateImport(Array.isArray(parsed) ? parsed : parsed.applications);
  } catch (error) {
    console.error('Could not read saved ApplyFlow data:', error);
    queueMicrotask(() => notify('Saved data could not be read. Import a backup to restore it.', 'error'));
    return [];
  }
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, applications }));
    return true;
  } catch (error) {
    console.error('Could not save ApplyFlow data:', error);
    notify('Browser storage is full or unavailable. Export a backup and free space.', 'error');
    return false;
  }
}
function safeText(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function prettyDate(value) {
  if (!value) return 'No date';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? 'No date' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
function initials(company) { return company.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?'; }
function statusClass(status) { return status.toLowerCase(); }
function isDue(app) { return app.followUpDate && app.followUpDate <= today() && !['Offer', 'Rejected'].includes(app.status); }
function applicationMarkup(app, options = {}) {
  const due = isDue(app);
  const followup = app.followUpDate ? `<span class="meta-item ${due ? 'meta-due' : ''}"><span aria-hidden="true">◷</span> ${due ? 'Due ' : ''}${safeText(prettyDate(app.followUpDate))}</span>` : '';
  const link = app.url ? `<a class="meta-item job-link" href="${safeText(app.url)}" target="_blank" rel="noopener noreferrer">Open posting ↗</a>` : '';
  const note = app.notes ? `<p class="application-note">${safeText(app.notes)}</p>` : '';
  return `<article class="application-row ${options.compact ? 'is-compact' : ''}" data-record-id="${safeText(app.id)}">
    <div class="company-avatar" aria-hidden="true">${safeText(initials(app.company))}</div>
    <div class="application-main"><div class="application-title-row"><h3>${safeText(app.role)}</h3><span class="status-badge status-${statusClass(app.status)}">${safeText(app.status)}</span></div><div class="company-name">${safeText(app.company)}${app.location ? ` <span>·</span> ${safeText(app.location)}` : ''}</div><div class="application-meta"><span class="meta-item">Applied ${safeText(prettyDate(app.appliedDate))}</span>${followup}${link}${app.priority === 'High' ? '<span class="priority-tag">High priority</span>' : ''}</div>${note}</div>
    <div class="row-actions"><button class="row-action" data-edit="${safeText(app.id)}" aria-label="Edit ${safeText(app.company)} application" title="Edit">✎</button><button class="row-action delete-action" data-delete="${safeText(app.id)}" aria-label="Delete ${safeText(app.company)} application" title="Delete">×</button></div>
  </article>`;
}
function notify(message, type = 'success') {
  const region = $('#toast-region');
  if (!region) return;
  region.innerHTML = `<div class="toast toast-${type}"><span aria-hidden="true">${type === 'error' ? '!' : '✓'}</span><span>${safeText(message)}</span><button aria-label="Dismiss notification">×</button></div>`;
  region.querySelector('button').addEventListener('click', () => { region.innerHTML = ''; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { region.innerHTML = ''; }, 4200);
}
function getApplication(id) { return applications.find((a) => a.id === id); }
function renderRecent() {
  const latest = filterApplications(applications, { sort: 'updated' }).slice(0, 4);
  $('#recent-list').innerHTML = latest.map((a) => applicationMarkup(a, { compact: true })).join('');
  $('#recent-empty').hidden = latest.length > 0;
  $('#recent-list').hidden = latest.length === 0;
}
function renderPipeline(stats) {
  const activeStatuses = ['Saved', 'Applied', 'Interview'];
  $('#pipeline-bars').innerHTML = STATUSES.map((status) => {
    const count = stats.byStatus[status];
    const percent = applications.length ? Math.round(count / applications.length * 100) : 0;
    return `<div class="pipeline-row"><div class="pipeline-label"><span>${safeText(status)}</span><strong>${count}</strong></div><div class="pipeline-track"><span class="pipeline-fill fill-${statusClass(status)}" style="width:${percent}%"></span></div></div>`;
  }).join('');
  $('#pipeline-active').textContent = `${activeStatuses.reduce((n, s) => n + stats.byStatus[s], 0)} active`;
}
function renderApplications() {
  const filtered = filterApplications(applications, { query: $('#search-input').value, status: $('#status-filter').value, sort: $('#sort-select').value });
  $('#applications-list').innerHTML = filtered.map((a) => applicationMarkup(a)).join('');
  $('#applications-empty').hidden = filtered.length > 0;
  $('#applications-list').hidden = filtered.length === 0;
  $('#record-count').textContent = `${filtered.length} of ${applications.length} application${applications.length === 1 ? '' : 's'}`;
}
function renderFollowups() {
  const filtered = filterApplications(applications, { view: 'followups', sort: 'followup' });
  $('#followups-list').innerHTML = filtered.map((a) => applicationMarkup(a)).join('');
  $('#followups-list').hidden = filtered.length === 0;
  $('#followups-empty').hidden = filtered.length > 0;
  $('#followup-queue-count').textContent = `${filtered.length} ITEM${filtered.length === 1 ? '' : 'S'}`;
}
function render() {
  const stats = getStats(applications, today());
  $('#stat-total').textContent = stats.total;
  $('#stat-interviews').textContent = stats.interviews;
  $('#stat-offers').textContent = stats.offers;
  $('#stat-followups').textContent = stats.followups;
  $('#followup-caption').textContent = stats.followups ? `${stats.followups} need attention` : 'Nothing to miss';
  $('#nav-total').textContent = stats.total;
  renderRecent(); renderPipeline(stats); renderApplications(); renderFollowups();
}
function switchView(name) {
  const target = ['overview', 'applications', 'followups'].includes(name) ? name : 'overview';
  $$('.view').forEach((view) => view.classList.toggle('is-visible', view.id === `view-${target}`));
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === target));
  const labels = { overview: 'Overview', applications: 'Applications', followups: 'Follow-ups' };
  $('#page-title').textContent = labels[target];
  if (target === 'applications') $('#search-input').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openDialog(id) { const dialog = document.getElementById(id); if (!dialog.open) dialog.showModal(); }
function closeDialog(id) { const dialog = document.getElementById(id); if (dialog.open) dialog.close(); }
function clearForm() { $('#application-form').reset(); $('#record-id').value = ''; $('#applied-date').value = today(); $('#form-title').textContent = 'Add application'; $('#save-record').textContent = 'Save application'; $('#form-error').hidden = true; }
function openApplicationForm(id = '') {
  clearForm();
  if (id) {
    const app = getApplication(id);
    if (!app) return notify('That application could not be found.', 'error');
    $('#record-id').value = app.id;
    for (const key of ['company', 'role', 'status', 'priority', 'location', 'source', 'notes']) $(`#${key}`).value = app[key] ?? '';
    $('#job-url').value = app.url ?? '';
    $('#applied-date').value = app.appliedDate;
    $('#follow-up-date').value = app.followUpDate;
    $('#form-title').textContent = 'Edit application';
    $('#save-record').textContent = 'Save changes';
  }
  openDialog('application-dialog');
  setTimeout(() => $('#company').focus(), 30);
}
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function handleSubmit(event) {
  event.preventDefault();
  const id = $('#record-id').value;
  const existing = id ? getApplication(id) : null;
  const source = {
    id: id || makeId(), company: $('#company').value, role: $('#role').value,
    status: $('#status').value, priority: $('#priority').value, location: $('#location').value,
    source: $('#source').value, appliedDate: $('#applied-date').value, followUpDate: $('#follow-up-date').value,
    url: $('#job-url').value, notes: $('#notes').value, createdAt: existing?.createdAt
  };
  try {
    if (source.url) {
      const u = new URL(source.url);
      if (!['http:', 'https:'].includes(u.protocol)) throw new TypeError('The job posting URL must start with http:// or https://.');
    }
    const next = normaliseApplication(source);
    const prev = applications;
    applications = existing ? applications.map((a) => a.id === id ? next : a) : [next, ...applications];
    if (!persist()) { applications = prev; return; }
    closeDialog('application-dialog'); clearForm(); render();
    notify(existing ? 'Application updated.' : 'Application added.');
  } catch (error) {
    $('#form-error').textContent = error.message || 'Please check the form and try again.';
    $('#form-error').hidden = false;
  }
}
function handleDelete(id) {
  const app = getApplication(id);
  if (!app) return;
  if (!window.confirm(`Delete the application for ${app.role} at ${app.company}? This cannot be undone.`)) return;
  const previous = applications;
  applications = applications.filter((a) => a.id !== id);
  if (!persist()) { applications = previous; return; }
  render(); notify('Application deleted.');
}
function applyTheme(theme) {
  const actual = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = actual;
  $('#theme-toggle').textContent = actual === 'dark' ? '◐' : '◑';
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${actual === 'dark' ? 'light' : 'dark'} theme`);
  try { localStorage.setItem(THEME_KEY, actual); } catch { /* The theme remains usable for this session. */ }
}
function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch { /* optional preference */ }
  applyTheme(saved);
}
function installEvents() {
  $$('.nav-item[data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.go)));
  $$('[data-action="add"]').forEach((b) => b.addEventListener('click', () => openApplicationForm()));
  $('#add-first').addEventListener('click', () => openApplicationForm());
  $('#application-form').addEventListener('submit', handleSubmit);
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(b.dataset.close)));
  $('#search-input').addEventListener('input', renderApplications);
  $('#status-filter').addEventListener('change', renderApplications);
  $('#sort-select').addEventListener('change', renderApplications);
  $('#clear-filters').addEventListener('click', () => { $('#search-input').value = ''; $('#status-filter').value = 'all'; $('#sort-select').value = 'updated'; renderApplications(); });
  document.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]'); if (edit) return openApplicationForm(edit.dataset.edit);
    const del = event.target.closest('[data-delete]'); if (del) return handleDelete(del.dataset.delete);
  });
  $('#theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#open-settings').addEventListener('click', () => openDialog('settings-dialog'));
  $('#profile-button').addEventListener('click', () => openDialog('settings-dialog'));
  $('#export-json').addEventListener('click', () => { downloadFile(`applyflow-backup-${today()}.json`, serializeBackup(applications), 'application/json;charset=utf-8'); notify('JSON backup exported.'); });
  $('#export-csv').addEventListener('click', () => { downloadFile(`applyflow-applications-${today()}.csv`, '\ufeff' + toCsv(applications), 'text/csv;charset=utf-8'); notify('CSV export ready for spreadsheets.'); });
  $('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new RangeError('Import file exceeds 5 MB.');
      const parsed = JSON.parse(await file.text());
      const incoming = validateImport(parsed);
      const next = $('#import-mode').value === 'replace' ? incoming : mergeApplications(applications, incoming);
      if ($('#import-mode').value === 'replace' && !window.confirm(`Replace your current ${applications.length} application(s) with ${incoming.length} imported record(s)? Export a backup first if required.`)) return;
      const previous = applications; applications = next;
      if (!persist()) { applications = previous; return; }
      render(); closeDialog('settings-dialog'); notify(`${incoming.length} record(s) imported.`);
    } catch (error) { notify(error.message || 'Could not import this file.', 'error'); }
    finally { event.target.value = ''; }
  });
  $('#delete-all').addEventListener('click', () => {
    if (!applications.length) return notify('There are no applications to delete.');
    if (!window.confirm(`Delete all ${applications.length} applications stored in this browser? Export a backup first if required.`)) return;
    const previous = applications; applications = [];
    if (!persist()) { applications = previous; return; }
    render(); closeDialog('settings-dialog'); notify('All local application records deleted.');
  });
  // Clicking a dialog's backdrop closes it without intercepting clicks inside the form.
  $$('.app-dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $$('.app-dialog[open]').forEach((dialog) => dialog.close()); });
}

initTheme(); installEvents(); render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error) => console.warn('Offline mode could not be enabled:', error)));
}
