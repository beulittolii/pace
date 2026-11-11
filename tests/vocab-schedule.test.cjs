const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture(now = '2026-11-11T12:00:00') {
  let instant = new Date(now).getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const context = vm.createContext({ console: { log() {}, warn() {}, error: console.error },
    Date: Clock, Math, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} } });
  const run = code => vm.runInContext(code, context);
  run(read('data.js'));
  run(`const window = {}; const elements = {}; let formType = 'VOCAB';
    const element = id => elements[id] || (elements[id] = {
      value: '', checked: false, innerHTML: '', innerText: '',
      classList: { values: new Set(), add(c) { this.values.add(c); },
        remove(c) { this.values.delete(c); }, contains(c) { return this.values.has(c); },
        toggle(c, force) { const on = force ?? !this.contains(c); on ? this.add(c) : this.remove(c); return on; } }
    });
    const document = { addEventListener() {}, getElementById: element,
      querySelector: selector => selector.includes('formTestType') ? { value: formType }
        : selector.includes('formRetestStatus') ? { value: 'NONE' } : element(selector),
      querySelectorAll: selector => selector.includes('formStudentCheckbox') ? [{ value: '1' }]
        : selector === '.form-time-applicable' ? [element('formTimeSection'), element('formEndTimeSection')] : [] };
  `);
  run(read('app.js'));
  run(`const notices = []; const saved = [];
    App.toast = (message, type) => notices.push({ message, type });
    ['closeAdminTestFormModal', 'renderAdminDashboard', 'renderAdminTestsTab', 'renderStudentDashboard',
      'closeTestDetailModal', 'showModal', 'hideModal', 'renderGrammarAssignmentParts'].forEach(k => App[k] = () => {});
    AppData.saveOrUpdateTest = async t => { saved.push(t); return t; };
    FirebaseStore.studentsLoaded = true; FirebaseStore.students = [{ id: 1, name: '학생' }];
    const set = { id: 'set', title: 'Day 1', words: Array.from({ length: 50 }, (_, i) => ({ en: 'word' + i, ko: '뜻' + i })) };
    AppData.getVocabSets = () => [set];
    const exam = { id: 'exam', title: '단어 테스트', type: 'VOCAB', studentId: 1,
      date: '2026-11-11', time: '18:00', endTime: '19:00', vocabSetId: 'set',
      vocabQuestionCounts: { 2: 10, 3: 0, 4: 0 }, status: 'SCHEDULED' };
    FirebaseStore.tests = [exam]; FirebaseStore.vocabTestResults = [];
    element('formTitle').value = '단어 테스트'; element('formDate').value = '2026-11-11';
    element('formTime').value = '18:00'; element('formEndTime').value = '19:00';
    element('formVocabSetId').value = 'set';
    [2, 3, 4, 5].forEach(d => element('formVocabCutoff_' + d).value = '80');
    const status = () => App.getTestTimeStatus(exam);
    const save = () => App.handleSaveTestForm({ preventDefault() {} });
  `);
  return { run, at: value => { instant = new Date(value).getTime(); } };
}

test('vocabulary opens at assigned-day 05:00 and closes at next-day 05:00 ignoring legacy times', () => {
  const f = fixture();
  for (const [time, expected] of [
    ['2026-11-10T12:00:00', 'NOT_STARTED'],
    ['2026-11-11T04:59:59.999', 'NOT_STARTED'],
    ['2026-11-11T05:00:00', 'IN_PROGRESS'],
    ['2026-11-11T23:59:59.999', 'IN_PROGRESS'],
    ['2026-11-12T00:00:00', 'IN_PROGRESS'],
    ['2026-11-12T04:59:59.999', 'IN_PROGRESS'],
    ['2026-11-12T05:00:00', 'EXPIRED']
  ]) {
    f.at(time);
    assert.equal(f.run('status().status'), expected, time);
    assert.equal(f.run('status().canStart'), expected === 'IN_PROGRESS', time);
  }
});

test('vocabulary without stored times remains open throughout the final 04:59 minute across calendar rollovers', () => {
  const f = fixture();
  f.run("exam.time = ''; exam.endTime = ''");
  for (const [date, next] of [['2026-11-30', '2026-12-01'], ['2026-12-31', '2027-01-01'], ['2028-02-29', '2028-03-01']]) {
    f.run(`exam.date = '${date}'`);
    f.at(`${next}T04:59:59.999`);
    assert.equal(f.run('status().canStart'), true, date);
    f.at(`${next}T05:00:00`);
    assert.equal(f.run('status().status'), 'EXPIRED', date);
  }
});

test('administrator extensions, late permission and completed states keep their existing behavior', () => {
  const f = fixture('2026-11-12T06:00:00');
  f.run("exam.extendedDate = '2026-11-13'; exam.extendedEndTime = '10:30'");
  assert.equal(f.run('status().canStart'), true);
  f.at('2026-11-13T10:30:59');
  assert.equal(f.run('status().canStart'), true);
  f.at('2026-11-13T10:31:00');
  assert.equal(f.run('status().status'), 'EXPIRED');
  f.run('exam.allowLate = true');
  assert.equal(f.run('status().canStart'), true);
  f.at('2026-11-11T04:59:59');
  assert.equal(f.run('status().status'), 'NOT_STARTED');
  for (const update of ["exam.status = 'PASS'", "exam.status = 'SCHEDULED'; exam.retestStatus = 'RETEST_PASS'"]) {
    f.run(update);
    assert.equal(f.run('status().status'), 'COMPLETED');
    assert.equal(f.run('status().canStart'), false);
  }
});

test('regular and practice tests keep their configured deadline and existing early-access rules', () => {
  const f = fixture('2026-11-11T17:59:59');
  f.run("exam.type = 'REGULAR'; exam.time = '17:00'");
  assert.equal(f.run('status().canStart'), true);
  f.at('2026-11-11T16:59:59');
  assert.equal(f.run('status().status'), 'NOT_STARTED');
  f.run("exam.type = 'PRACTICE'");
  assert.equal(f.run('status().canStart'), true);
  f.at('2026-11-11T19:01:00');
  assert.equal(f.run('status().status'), 'EXPIRED');
});

test('vocabulary buttons and direct starts cannot bypass the date window', () => {
  const f = fixture();
  for (const [time, label] of [['2026-11-11T04:59:59', '응시 시작 전'], ['2026-11-12T05:00:00', '응시 기한 종료']]) {
    f.at(time);
    assert.match(f.run("App.renderVocabTestButton(set, 1, 2, '객관식', '', 'exam')"), new RegExp(label));
    f.run("App.startVocabTest('set', 1, 2, 'exam')");
    assert.equal(f.run('App.state.vocabTest'), null);
    assert.equal(f.run('notices.length > 0'), true);
  }
  f.at('2026-11-12T04:59:59.999');
  assert.match(f.run("App.renderVocabTestButton(set, 1, 2, '객관식', '', 'exam')"), /테스트 시작/);
});

test('only vocabulary assignment controls hide times and switching types restores them', () => {
  const f = fixture();
  for (const type of ['REGULAR', 'VOCAB', 'PRACTICE', 'TEXT_MEMORIZE', 'GRAMMAR', 'VOCAB']) {
    // Passage rendering belongs to another form, not the time-control contract.
    f.run(`App.renderTextMemorizePassages = () => {}; formType = '${type}'; App.toggleTestFormType()`);
    for (const id of ['formTimeSection', 'formEndTimeSection']) {
      assert.equal(f.run(`element('${id}').classList.contains('hidden')`), type === 'VOCAB', type);
    }
  }
});

test('new and edited vocabulary assignments discard stale time values when saved', async () => {
  for (const id of ['', 'exam']) {
    const f = fixture();
    f.run(`element('formTestId').value = '${id}'`);
    await f.run('save()');
    assert.equal(f.run('saved.length'), 1, id || 'new');
    assert.equal(f.run('saved[0].date'), '2026-11-11');
    assert.equal(f.run('saved[0].time'), '');
    assert.equal(f.run('saved[0].endTime'), '');
  }
});

test('rescheduling vocabulary uses only the new date while other exam time controls remain available', async () => {
  const f = fixture('2026-11-12T04:59:59.999');
  f.run("App.openRescheduleModal('exam')");
  assert.equal(f.run("element('rescheduleTimeSection').classList.contains('hidden')"), true);
  f.run("element('rescheduleTargetDate').value = '2026-11-12'; element('rescheduleTargetTime').value = '09:00'; element('rescheduleTargetEndTime').value = '10:00'");
  await f.run('App.confirmRescheduleTest()');
  assert.equal(f.run('saved[0].time'), '');
  assert.equal(f.run('saved[0].endTime'), '');
  assert.equal(f.run('status().status'), 'NOT_STARTED');
  f.at('2026-11-13T04:59:59.999');
  assert.equal(f.run('status().canStart'), true);
  f.run("exam.type = 'REGULAR'; App.openRescheduleModal('exam')");
  assert.equal(f.run("element('rescheduleTimeSection').classList.contains('hidden')"), false);
  f.run("element('rescheduleTargetTime').value = '09:00'; element('rescheduleTargetEndTime').value = '10:00'");
  await f.run('App.confirmRescheduleTest()');
  assert.equal(f.run('saved.at(-1).time'), '09:00');
  assert.equal(f.run('saved.at(-1).endTime'), '10:00');
});
