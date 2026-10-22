export const STATUSES = Object.freeze(['Saved', 'Applied', 'Interview', 'Offer', 'Rejected']);
export const PRIORITIES = Object.freeze(['Low', 'Normal', 'High']);
export const DATA_VERSION = 1;

const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const validDate = (value) => {
  if (value === '' || value == null) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? '' : value;
};

export function normaliseApplication(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Each application must be an object.');
  const company = text(input.company, 120);
  const role = text(input.role, 120);
  if (!company || !role) throw new TypeError('Company and job title are required.');
  const status = STATUSES.includes(input.status) ? input.status : 'Applied';
  const priority = PRIORITIES.includes(input.priority) ? input.priority : 'Normal';
  let url = text(input.url, 1000);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) url = '';
      else url = parsed.href;
    } catch { url = ''; }
  }
  const now = options.now ?? new Date().toISOString();
  const id = text(input.id, 80) || makeId();
  return {
    id,
    company,
    role,
    status,
    priority,
    location: text(input.location, 120),
    source: text(input.source, 120),
    appliedDate: validDate(input.appliedDate) || validDate(input.createdDate) || now.slice(0, 10),
    followUpDate: validDate(input.followUpDate),
    url,
    notes: text(input.notes, 4000),
    createdAt: text(input.createdAt, 40) || now,
    updatedAt: text(input.updatedAt, 40) || now
  };
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `af-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function validateImport(payload) {
  if (!payload || typeof payload !== 'object') throw new TypeError('Backup must be a JSON object or an applications array.');
  const rows = Array.isArray(payload.applications) ? payload.applications : Array.isArray(payload) ? payload : null;
  if (!rows) throw new TypeError('Backup does not contain an applications array.');
  if (rows.length > 5000) throw new RangeError('A backup can contain at most 5,000 applications.');
  const seen = new Set();
  const applications = rows.map((row) => normaliseApplication(row));
  for (const app of applications) {
    if (seen.has(app.id)) app.id = makeId();
    seen.add(app.id);
  }
  return applications;
}

export function getStats(applications, today = new Date().toISOString().slice(0, 10)) {
  const active = applications.filter((a) => !['Offer', 'Rejected'].includes(a.status));
  const due = applications.filter((a) => a.followUpDate && a.followUpDate <= today && !['Offer', 'Rejected'].includes(a.status));
  return {
    total: applications.length,
    interviews: applications.filter((a) => a.status === 'Interview').length,
    offers: applications.filter((a) => a.status === 'Offer').length,
    followups: due.length,
    active: active.length,
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, applications.filter((a) => a.status === s).length]))
  };
}

export function filterApplications(applications, { query = '', status = 'all', view = 'all', today = new Date().toISOString().slice(0, 10), sort = 'updated' } = {}) {
  const q = String(query).trim().toLocaleLowerCase();
  const filtered = applications.filter((a) => {
    const searchable = [a.company, a.role, a.location, a.source, a.notes].join(' ').toLocaleLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (status !== 'all' && a.status !== status) return false;
    if (view === 'followups' && (!a.followUpDate || ['Offer', 'Rejected'].includes(a.status))) return false;
    if (view === 'due' && (!a.followUpDate || a.followUpDate > today || ['Offer', 'Rejected'].includes(a.status))) return false;
    return true;
  });
  const compareDate = (a, b, key, direction = 1) => (a[key] || (direction > 0 ? '9999-12-31' : '0000-01-01')).localeCompare(b[key] || (direction > 0 ? '9999-12-31' : '0000-01-01')) * direction;
  const sorters = {
    updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    'applied-desc': (a, b) => compareDate(a, b, 'appliedDate', -1),
    'applied-asc': (a, b) => compareDate(a, b, 'appliedDate', 1),
    company: (a, b) => a.company.localeCompare(b.company) || a.role.localeCompare(b.role),
    followup: (a, b) => compareDate(a, b, 'followUpDate')
  };
  return filtered.sort(sorters[sort] || sorters.updated);
}

export function toCsv(applications) {
  const columns = [
    ['company', 'Company'], ['role', 'Job title'], ['status', 'Status'], ['priority', 'Priority'],
    ['location', 'Location'], ['source', 'Source'], ['appliedDate', 'Applied date'],
    ['followUpDate', 'Follow-up date'], ['url', 'Job URL'], ['notes', 'Notes']
  ];
  const cell = (value) => {
    const str = String(value ?? '');
    // Spreadsheet formula injection defense for text cells.
    const safe = /^[\s]*[=+@]/.test(str) || /^[\s]*-[0-9]/.test(str) ? `'${str}` : str;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [columns.map(([, title]) => cell(title)).join(','), ...applications.map((a) => columns.map(([key]) => cell(a[key])).join(','))].join('\r\n') + '\r\n';
}

export function serializeBackup(applications) {
  return JSON.stringify({ app: 'ApplyFlow', version: DATA_VERSION, exportedAt: new Date().toISOString(), applications }, null, 2);
}

export function mergeApplications(existing, incoming) {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const app of incoming) {
    if (byId.has(app.id)) {
      const replacement = { ...app, id: makeId() };
      byId.set(replacement.id, replacement);
    } else byId.set(app.id, app);
  }
  return Array.from(byId.values());
}
