const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const documents = new Map();
  const context = vm.createContext({ console, Date, Math, setTimeout, clearTimeout });
  vm.runInContext(`
    const FirebaseStore = { tests: [] };
    const LOCAL_CACHE_KEYS = { tests: 'tests' };
    function setLocalCache() {}
    function shouldKeepTest(t) { return t.date >= '2026-11-01'; }
    const App = { state: { isAdminLoggedIn: true } };
    const AppData = {
      isFirebaseReady() { return true; },
      getTests() { return FirebaseStore.tests; },
      refreshCloudScreens() {}
    };
    const window = { firebaseDB: {} };
  `, context);
  const fakeFns = {
    doc: (_, collection, id) => `${collection}/${id}`,
    runTransaction: async (_, callback) => {
      const pending = [];
      const value = await callback({
        get: async ref => ({ exists: () => documents.has(ref), data: () => documents.has(ref) ? JSON.parse(JSON.stringify(documents.get(ref))) : undefined }),
        delete: ref => pending.push([ref, null]),
        set: (ref, data) => pending.push([ref, JSON.parse(JSON.stringify(data))])
      });
      pending.forEach(([ref, data]) => data === null ? documents.delete(ref) : documents.set(ref, data));
      return value;
    }
  };
  context.fakeFns = fakeFns;
  vm.runInContext('window.firebaseFns = fakeFns;', context);
  for (const file of ['grammar_data.js', 'grammar_store.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  return { context, documents, run: code => vm.runInContext(code, context), plain: code => JSON.parse(JSON.stringify(vm.runInContext(code, context))) };
}

const assignment = `{ studentId: 1, date: '2026-11-06', time: '00:00', endTime: '23:59', parts: ['concept', 'practice'] }`;

test('concept blanks cover every template token with stable unique IDs and count whitespace as missing', () => {
  const f = fixture();
  const blanks = f.plain('GrammarLogic.blanks(GRAMMAR_UNIT)');
  assert.ok(blanks.length >= 30);
  assert.equal(new Set(blanks.map(b => b.id)).size, blanks.length);
  assert.equal(f.run('GrammarLogic.missing(GRAMMAR_UNIT, {})'), blanks.length);
  f.run("const a = Object.fromEntries(GrammarLogic.blanks(GRAMMAR_UNIT).map(b => [b.id, '  ']));");
  assert.equal(f.run('GrammarLogic.missing(GRAMMAR_UNIT, a)'), blanks.length);
  assert.equal(f.run('GrammarLogic.missing(GRAMMAR_UNIT, Object.fromEntries(GrammarLogic.blanks(GRAMMAR_UNIT).map(b => [b.id, b.answer])))'), 0);
});

test('practical has ten five-choice questions and correctly grades 70/80/100', () => {
  const f = fixture();
  const questions = f.plain('GRAMMAR_UNIT.questions');
  assert.equal(questions.length, 10);
  assert.ok(questions.every(q => q.choices.length === 5 && q.answer >= 1 && q.answer <= 5 && q.explanation));
  for (const count of [7, 8, 10]) {
    const result = f.plain(`GrammarLogic.gradePractice(GRAMMAR_UNIT, Object.fromEntries(GRAMMAR_UNIT.questions.map((q, i) => [i, i < ${count} ? q.answer : q.answer % 5 + 1])))`);
    assert.equal(result.score, count * 10);
    assert.equal(result.passed, count >= 8);
  }
  assert.equal(f.plain('GrammarLogic.gradePractice(GRAMMAR_UNIT, {})').score, 0);
  assert.equal(f.plain('GrammarLogic.gradePractice(GRAMMAR_UNIT, {})').answers[0], null);
  assert.throws(() => f.run('GrammarLogic.gradePractice(GRAMMAR_UNIT, Object.fromEntries(GRAMMAR_UNIT.questions.map((q, i) => [i, "1"])))'), /10문제/);
});

test('manual concept grading requires all filled answers to be marked and includes empty answers in denominator', () => {
  const f = fixture();
  f.run("const blanks = GrammarLogic.blanks(GRAMMAR_UNIT); const answers = Object.fromEntries(blanks.map(b => [b.id, b.answer]));");
  assert.throws(() => f.run("GrammarLogic.gradeConcept(GRAMMAR_UNIT, Object.fromEntries(blanks.map(b => [b.id, '다른 답안'])), {})"), /모든 빈칸/);
  assert.equal(f.plain('GrammarLogic.gradeConcept(GRAMMAR_UNIT, answers, {})').score, 100);
  const result = f.plain('GrammarLogic.gradeConcept(GRAMMAR_UNIT, {}, Object.fromEntries(blanks.map(b => [b.id, true])))');
  assert.equal(result.score, 0);
  assert.equal(result.totalCount, f.run('blanks.length'));
  assert.ok(Object.values(result.marks).every(v => !v));
  const passed = f.plain('GrammarLogic.gradeConcept(GRAMMAR_UNIT, answers, Object.fromEntries(blanks.map(b => [b.id, true])))');
  assert.equal(passed.score, 100);
  assert.equal(passed.passed, true);
});

test('first assignment requires both parts, snapshots content and blocks unattempted/pending retests', async () => {
  const f = fixture();
  await assert.rejects(f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['concept'] })`), /최초 시험/);
  const first = await f.run(`AppData.assignGrammarTest(${assignment})`);
  assert.equal(first.grammarParts.length, 2);
  const rootId = first.id;
  await assert.rejects(f.run(`AppData.assignGrammarTest(${assignment})`), /미달이 확정/);
  f.context.rootId = rootId;
  await f.run("AppData.updateGrammarTest(rootId, t => { t.grammarResults.concept = { waitingGrading: true }; t.grammarStage = 'practice'; })");
  await assert.rejects(f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['concept'] })`), /미달이 확정/);
  f.run('GRAMMAR_UNIT.questions[0].answer = 5;');
  assert.equal(f.documents.get(`tests/${rootId}`).grammarContent.questions[0].answer, 2);
});

test('only failed areas may be reassigned and the newest assignment prevents duplicates', async () => {
  const f = fixture();
  const first = await f.run(`AppData.assignGrammarTest(${assignment})`);
  f.context.rootId = first.id;
  await f.run("AppData.updateGrammarTest(rootId, t => { t.grammarResults = { concept: { score: 70, passed: false }, practice: { score: 80, passed: true } }; t.grammarStage = 'done'; })");
  assert.deepEqual(f.plain("GrammarLogic.eligible(AppData.getTests(), 1, 'subjunctive')"), ['concept']);
  await assert.rejects(f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['practice'] })`), /미달이 확정/);
  const retest = await f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['concept'] })`);
  assert.equal(retest.grammarRootId, first.id);
  assert.equal(retest.grammarStage, 'concept');
  assert.equal(retest.grammarSequence, 1);
  assert.deepEqual(f.plain("GrammarLogic.eligible(AppData.getTests(), 1, 'subjunctive')"), []);
  await assert.rejects(f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['concept'] })`), /미달이 확정/);
  assert.equal(f.documents.get(`tests/${first.id}`).grammarResults.practice.score, 80);
});

test('transaction failures do not mutate local state or lock concept answers', async () => {
  const f = fixture();
  const first = await f.run(`AppData.assignGrammarTest(${assignment})`);
  f.context.rootId = first.id;
  f.run("window.firebaseFns.runTransaction = async () => { throw new Error('offline'); };");
  await assert.rejects(f.run("AppData.updateGrammarTest(rootId, t => { t.grammarStage = 'practice'; })"), /offline/);
  assert.equal(f.plain('AppData.getTests()[0]').grammarStage, 'concept');
});

test('both failed areas may be reassigned together, and a practical-only retest starts directly in practice', async () => {
  const f = fixture();
  const first = await f.run(`AppData.assignGrammarTest(${assignment})`);
  f.context.rootId = first.id;
  await f.run("AppData.updateGrammarTest(rootId, t => { t.grammarResults = { concept: { score: 50, passed: false }, practice: { score: 70, passed: false } }; t.grammarStage = 'done'; })");
  assert.deepEqual(f.plain("GrammarLogic.eligible(AppData.getTests(), 1, 'subjunctive')"), ['concept', 'practice']);
  const practical = await f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['practice'] })`);
  assert.equal(practical.grammarStage, 'practice');
  assert.deepEqual(f.plain("GrammarLogic.eligible(AppData.getTests(), 1, 'subjunctive')"), ['concept']);
  await assert.rejects(f.run(`AppData.assignGrammarTest(${assignment})`), /미달이 확정/);
  assert.equal(f.run('AppData.getTests().length'), 2, 'a rejected multi-part reassignment must not partially create a concept test');
  f.context.practicalId = practical.id;
  await f.run("AppData.updateGrammarTest(practicalId, t => { t.grammarResults.practice = { score: 70, passed: false }; t.grammarStage = 'done'; })");
  const both = await f.run(`AppData.assignGrammarTest(${assignment})`);
  assert.equal(both.grammarParts.length, 2);
  assert.equal(both.grammarStage, 'concept');
  assert.equal(both.grammarRootId, first.id);
});

test('manual score conversion rounds scores and preserves the 80-point inclusive cutoff', () => {
  const f = fixture();
  f.run("const blanks = GrammarLogic.blanks(GRAMMAR_UNIT); const answers = Object.fromEntries(blanks.map(b => [b.id, '검토 답안']));");
  for (const count of [0, 27, 28, 34]) {
    const result = f.plain(`GrammarLogic.gradeConcept(GRAMMAR_UNIT, answers, Object.fromEntries(blanks.map((b, i) => [b.id, i < ${count}])))`);
    assert.equal(result.score, Math.round(count / result.totalCount * 100));
    assert.equal(result.passed, result.score >= 80);
  }
});

test('deleting a retest restores the previous result and deleting the first test removes its chain', async () => {
  const f = fixture();
  const first = await f.run(`AppData.assignGrammarTest(${assignment})`);
  f.context.rootId = first.id;
  await f.run("AppData.updateGrammarTest(rootId, t => { t.grammarResults.concept = { passed: false, score: 70 }; t.grammarStage = 'done'; })");
  const retest = await f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['concept'] })`);
  f.context.retestId = retest.id;
  await f.run('AppData.deleteGrammarTest(retestId)');
  assert.equal(f.run('AppData.getTests().length'), 1);
  assert.equal(f.run('AppData.getTests()[0].grammarLatest.concept'), first.id);
  assert.deepEqual(f.plain("GrammarLogic.eligible(AppData.getTests(), 1, 'subjunctive')"), ['concept']);
  await f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['concept'] })`);
  await f.run('AppData.deleteGrammarTest(rootId)');
  assert.equal(f.run('AppData.getTests().length'), 0);
  assert.equal(f.documents.size, 0);
});

test('passing the failed part on a retest completes the original schedule without rewriting its grade', async () => {
  const f = fixture();
  const first = await f.run(`AppData.assignGrammarTest(${assignment})`);
  f.context.rootId = first.id;
  await f.run("AppData.updateGrammarTest(rootId, t => { t.grammarResults = { concept: { score: 70, passed: false }, practice: { score: 80, passed: true } }; t.grammarStage = 'done'; })");
  const retest = await f.run(`AppData.assignGrammarTest({ ...${assignment}, parts: ['concept'] })`);
  f.context.retestId = retest.id;
  const state = () => f.run("GrammarLogic.schedulePartState(AppData.getTests().find(t=>t.id===rootId), 'concept', AppData.getTests())");
  assert.equal(state(), 'FAIL', 'an assigned but unattempted retest is not a pass');
  await f.run("AppData.updateGrammarTest(retestId, t => { t.grammarResults.concept = { waitingGrading: true }; })");
  assert.equal(state(), 'FAIL', 'pending manual grading is not a pass');
  await f.run("AppData.updateGrammarTest(retestId, t => { t.grammarResults.concept = { score: 80, passed: true }; t.grammarStage = 'done'; })");
  assert.equal(state(), 'PASS');
  assert.equal(f.run("GrammarLogic.schedulePartState(AppData.getTests().find(t=>t.id===rootId), 'practice', AppData.getTests())"), 'PASS');
  assert.equal(f.documents.get(`tests/${first.id}`).grammarResults.concept.score, 70);
  assert.equal(f.documents.get(`tests/${first.id}`).grammarResults.concept.passed, false);
  assert.equal(f.run("GrammarLogic.partState(AppData.getTests().find(t=>t.id===rootId),'concept')"), 'FAIL');
  await f.run('AppData.deleteGrammarTest(retestId)');
  assert.equal(state(), 'FAIL', 'deleting the passing retest restores the original schedule state');
});

test('both failed areas need their own passing retest, and separate chains never affect the original', () => {
  const f = fixture();
  f.run(`const root={id:'root',type:'GRAMMAR',studentId:1,grammarUnitId:'subjunctive',grammarRootId:'root',grammarSequence:0,
    grammarParts:['concept','practice'],grammarResults:{concept:{passed:false,score:60},practice:{passed:false,score:70}}};
    const concept={...root,id:'concept-retest',grammarSequence:1,grammarParts:['concept'],grammarResults:{concept:{passed:true,score:80}}};
    const practice={...root,id:'practice-retest',grammarSequence:2,grammarParts:['practice'],grammarResults:{practice:{passed:true,score:90}}};
    FirebaseStore.tests=[root,concept];`);
  const states = () => f.plain("root.grammarParts.map(p=>GrammarLogic.schedulePartState(root,p,AppData.getTests()))");
  assert.deepEqual(states(), ['PASS', 'FAIL']);
  f.run('FirebaseStore.tests.push(practice)');
  assert.deepEqual(states(), ['PASS', 'PASS']);
  for (const change of ["grammarRootId:'other-root'", 'studentId:2', "grammarUnitId:'other-unit'"]) {
    f.run(`FirebaseStore.tests=[root,{...concept,${change}},{...practice,${change}}]`);
    assert.deepEqual(states(), ['FAIL', 'FAIL']);
  }
  f.run(`FirebaseStore.tests=[root,concept,practice,{...concept,id:'newer',grammarSequence:3,grammarResults:{concept:{passed:false,score:50}}}]`);
  assert.deepEqual(states(), ['FAIL', 'PASS'], 'an older pass cannot override the newest failed retest');
});

test('calendar and admin status turn green after retest while historical scores stay unchanged', () => {
  const context = vm.createContext({ console, Date, Math, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} },
    window: { addEventListener() {} }, document: { addEventListener() {}, getElementById: () => null } });
  const run = code => vm.runInContext(code, context);
  for (const file of ['grammar_data.js', 'data.js', 'app.js', 'grammar.js']) run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  run(`const root={id:'root',type:'GRAMMAR',title:'문법 테스트',studentId:1,date:'2026-11-09',grammarUnitId:'subjunctive',grammarRootId:'root',grammarSequence:0,
    grammarParts:['concept','practice'],grammarResults:{concept:{passed:false,score:70},practice:{passed:true,score:90}}};
    const retest={...root,id:'retest',date:'2026-11-10',grammarSequence:1,grammarParts:['concept'],grammarResults:{concept:{passed:true,score:80}}};
    FirebaseStore.tests=[root,retest];`);
  assert.equal(run('App.getTestBadgeStyle(root).tag'), '완료');
  const calendar = run("App.buildCalendarCell(9,'2026-11-09',false,FirebaseStore.tests,'2026-11-11')");
  assert.match(calendar, /bg-emerald-100/);
  assert.match(calendar, /문법 테스트 · 완료/);
  assert.match(calendar, /fa-circle-check/);
  const row = run('App.renderGrammarAdminRow(root)');
  assert.match(row, /재시험 통과/);
  assert.match(row, /개념 70점/);
  assert.match(run('App.grammarSummary(root)'), /70점 · 미달/);
  assert.equal(run('App.getTestBadgeStyle(retest).tag'), '완료');
  run('retest.grammarResults.concept={waitingGrading:true};');
  assert.match(run('App.getTestBadgeStyle(root).class'), /bg-rose-100/);
  assert.doesNotMatch(run("App.buildCalendarCell(9,'2026-11-09',false,FirebaseStore.tests,'2026-11-11')"), /문법 테스트 · 완료/);
});
