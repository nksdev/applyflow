import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseApplication, validateImport, getStats, filterApplications, toCsv, serializeBackup, mergeApplications, STATUSES } from '../core.js';

const sample = (overrides = {}) => normaliseApplication({ company: 'Example Labs', role: 'Security Intern', status: 'Applied', appliedDate: '2026-10-01', ...overrides }, { now: '2026-10-22T00:00:00.000Z' });

test('normaliseApplication trims fields and applies safe defaults', () => {
  const app = normaliseApplication({ company: '  Example  ', role: '  Analyst  ', status: 'Made up', priority: 'Urgent', url: 'javascript:alert(1)', notes: 'x'.repeat(9000) }, { now: '2026-10-22T00:00:00.000Z' });
  assert.equal(app.company, 'Example');
  assert.equal(app.role, 'Analyst');
  assert.equal(app.status, 'Applied');
  assert.equal(app.priority, 'Normal');
  assert.equal(app.url, '');
  assert.equal(app.notes.length, 4000);
});

test('normaliseApplication rejects missing company or role', () => {
  assert.throws(() => normaliseApplication({ role: 'Engineer' }), /required/);
  assert.throws(() => normaliseApplication({ company: 'Example' }), /required/);
});

test('normaliseApplication rejects invalid dates and non-http URLs', () => {
  const app = sample({ appliedDate: '2026-02-30', followUpDate: 'tomorrow', url: 'file:///etc/passwd' });
  assert.equal(app.appliedDate, '2026-10-22');
  assert.equal(app.followUpDate, '');
  assert.equal(app.url, '');
});

test('validateImport accepts both supported backup forms and rejects invalid payloads', () => {
  assert.equal(validateImport({ applications: [sample()] }).length, 1);
  assert.equal(validateImport([sample()]).length, 1);
  assert.throws(() => validateImport(null), /JSON object/);
  assert.throws(() => validateImport({ records: [] }), /applications array/);
  assert.throws(() => validateImport({ applications: Array(5001).fill({ company: 'X', role: 'Y' }) }), /5,000/);
});

test('validateImport makes duplicate IDs unique', () => {
  const app = sample({ id: 'same' });
  const result = validateImport({ applications: [app, app] });
  assert.equal(result.length, 2);
  assert.notEqual(result[0].id, result[1].id);
});

test('getStats reports totals, interviews, offers, due follow-ups and pipeline', () => {
  const apps = [
    sample({ status: 'Interview', followUpDate: '2026-10-20' }),
    sample({ company: 'Beta', status: 'Offer', followUpDate: '2026-10-18' }),
    sample({ company: 'Gamma', status: 'Applied', followUpDate: '2026-10-24' }),
    sample({ company: 'Delta', status: 'Rejected', followUpDate: '2026-10-12' })
  ];
  const stats = getStats(apps, '2026-10-22');
  assert.equal(stats.total, 4);
  assert.equal(stats.interviews, 1);
  assert.equal(stats.offers, 1);
  assert.equal(stats.followups, 1);
  assert.equal(stats.active, 2);
  assert.equal(stats.byStatus.Rejected, 1);
  assert.deepEqual(Object.keys(stats.byStatus), STATUSES);
});

test('filterApplications filters searchable fields, status, due and follow-up queues', () => {
  const apps = [
    sample({ id: 'a', company: 'Acme', status: 'Applied', followUpDate: '2026-10-20' }),
    sample({ id: 'b', company: 'Beta', status: 'Interview', followUpDate: '2026-10-25' }),
    sample({ id: 'c', company: 'Gamma', status: 'Offer', followUpDate: '2026-10-20' })
  ];
  assert.deepEqual(filterApplications(apps, { query: 'acm' }).map((a) => a.id), ['a']);
  assert.deepEqual(filterApplications(apps, { status: 'Interview' }).map((a) => a.id), ['b']);
  assert.deepEqual(filterApplications(apps, { view: 'due', today: '2026-10-22' }).map((a) => a.id), ['a']);
  assert.deepEqual(filterApplications(apps, { view: 'followups', today: '2026-10-22' }).map((a) => a.id), ['a', 'b']);
});

test('filterApplications sorts dates and company names', () => {
  const apps = [sample({ id: 'b', company: 'Zeta', appliedDate: '2026-10-08' }), sample({ id: 'a', company: 'Alpha', appliedDate: '2026-10-12' })];
  assert.deepEqual(filterApplications(apps, { sort: 'company' }).map((a) => a.company), ['Alpha', 'Zeta']);
  assert.deepEqual(filterApplications(apps, { sort: 'applied-desc' }).map((a) => a.id), ['a', 'b']);
  assert.deepEqual(filterApplications(apps, { sort: 'applied-asc' }).map((a) => a.id), ['b', 'a']);
});

test('toCsv quotes fields, escapes quotes, and guards spreadsheet formula injection', () => {
  const csv = toCsv([sample({ company: 'Example, Inc.', notes: 'He said "hello"', role: '=HYPERLINK("https://bad")' })]);
  assert.match(csv, /"Example, Inc\."/);
  assert.match(csv, /"He said ""hello"""/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /\r\n$/);
});

test('serializeBackup contains app metadata and records', () => {
  const text = serializeBackup([sample()]);
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, 'ApplyFlow');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.applications.length, 1);
});

test('mergeApplications keeps existing records and imports records with ID collisions', () => {
  const old = sample({ id: 'same', company: 'Old' });
  const incoming = sample({ id: 'same', company: 'New' });
  const merged = mergeApplications([old], [incoming]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].company, 'Old');
  assert.equal(merged[1].company, 'New');
  assert.notEqual(merged[0].id, merged[1].id);
});
