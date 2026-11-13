const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(mode) {
  const student = { id: 1, accountUid: 'user1', target: '기존 목표', ...(mode ? { examMode: mode } : {}) };
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', disabled: false, open: false, innerHTML: '', setAttribute() {}, removeAttribute() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; }, querySelectorAll() { return []; } }); return nodes.get(id); };
  const document = { getElementById: node, activeElement: { focus() {} }, querySelector: () => ({ value: 'motion' }), querySelectorAll: () => [] };
  const window = { document };
  const data = { getStudentById: id => Number(id) === 1 ? student : null, refreshCloudScreens() {} };
  const context = vm.createContext({ window, document, console, AppData: data, FirebaseStore: { students: [student] }, App: { state: { selectedStudentId: 1 }, toast() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../auth.js'), 'utf8'), context);
  const auth = window.PaceAuth;
  auth.ready = async () => {};
  auth.auth = { currentUser: { uid: 'user1' } }; auth.member = { studentId: 1 }; auth.generation = 1;
  const saved = [];
  auth.raw = { doc: (_, collection, id) => `${collection}/${id}`, updateDoc: async (ref, patch) => saved.push([ref, patch]) };
  const file = path.join(__dirname, '../exam_mode.js');
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return { window, auth, student, saved, node, context, presentation: window.ExamPresentation };
}

test('only known modes bypass the first choice and student settings are shared by exam kind', async () => {
  const f = fixture('classic');
  assert.ok(f.presentation, 'shared exam presentation must exist');
  for (const [student, expected] of [[{}, null], [{ examMode: 'other' }, null], [{ examMode: 'classic' }, 'classic'], [{ examMode: 'motion' }, 'motion']]) assert.equal(f.presentation.getMode(student), expected);
  assert.equal(await f.presentation.ensureMode(1), 'classic');
  assert.equal(f.node('examModeDialog').open, false);
});

test('first choice waits for successful account persistence and cancellation makes no write', async () => {
  const f = fixture();
  assert.ok(f.presentation, 'shared exam presentation must exist');
  const pending = f.presentation.ensureMode(1);
  assert.equal(f.node('examModeDialog').open, true);
  assert.equal(f.student.examMode, undefined);
  await f.presentation.confirm();
  assert.equal(await pending, 'motion');
  assert.equal(f.student.examMode, 'motion');
  assert.deepEqual(JSON.parse(JSON.stringify(f.saved)), [['students/1', { examMode: 'motion' }]]);
  delete f.student.examMode;
  const cancelled = f.presentation.ensureMode(1);
  f.presentation.cancelPending();
  assert.equal(await cancelled, null);
  assert.equal(f.saved.length, 1);
});

test('save failures keep the choice open, leave cache unchanged and allow retry', async () => {
  const f = fixture(); assert.ok(f.presentation, 'shared exam presentation must exist');
  const pending = f.presentation.ensureMode(1);
  f.auth.raw.updateDoc = async () => { throw Error('offline'); };
  await f.presentation.confirm();
  assert.equal(f.student.examMode, undefined);
  assert.equal(f.node('examModeDialog').open, true);
  assert.match(f.node('examModeMessage').textContent, /offline/);
  f.presentation.cancelPending(); assert.equal(await pending, null);
});

test('mode writes reject invalid values, unlinked students and session changes without cache mutation', async () => {
  const f = fixture();
  assert.equal(typeof f.auth.persistExamMode, 'function');
  await assert.rejects(f.auth.persistExamMode('unknown'), /모드/);
  f.student.accountUid = 'other'; await assert.rejects(f.auth.persistExamMode('motion'), /계정/);
  f.student.accountUid = 'user1';
  f.auth.raw.updateDoc = async () => { f.auth.generation++; };
  await assert.rejects(f.auth.persistExamMode('motion'), /로그인/);
  assert.equal(f.student.examMode, undefined);
});

test('identity changes during either save resolution path cancel the chooser instead of leaving a pending start', async () => {
  for (const timing of ['during-write', 'after-save']) {
    const f = fixture();
    const pending = f.presentation.ensureMode(1);
    if (timing === 'during-write') f.auth.raw.updateDoc = async () => { f.auth.generation++; };
    else {
      const persist = f.auth.persistExamMode.bind(f.auth);
      f.auth.persistExamMode = async mode => { await persist(mode); f.auth.generation++; return mode; };
    }
    await f.presentation.confirm();
    assert.equal(f.node('examModeDialog').open, false, timing);
    assert.equal(f.presentation.pending, null, timing);
    assert.equal(await pending, null, timing);
  }
});
