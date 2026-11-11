const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture() {
  const context = vm.createContext({ console, Date, Math, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } });
  const run = code => vm.runInContext(code, context);
  run(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8'));
  return run;
}
test('text result deletion removes cloud documents and preserves other tests', async () => {
  const run = fixture();
  run(`const removed=[]; AppData.loadCollection=async()=>[{id:'real-doc',studentId:1,testId:'gone'},{id:'keep',studentId:2,testId:'live'}]; AppData.removeDocument=async(c,id)=>removed.push(c+'/'+id);`);
  await run(`AppData.deleteTextMemorizeResultsByTestId('gone')`);
  assert.equal(run(`removed.join(',')`), 'textMemorizeResults/real-doc');
  assert.equal(run('FirebaseStore.textMemorizeResults[0].id'), 'keep');
});
test('failed cloud result deletion retains cached results for retry', async () => {
  const run = fixture();
  run(`FirebaseStore.textMemorizeResults=[{id:'old',testId:'gone'}]; AppData.loadCollection=async()=>FirebaseStore.textMemorizeResults; AppData.removeDocument=async()=>{throw Error('offline')};`);
  await assert.rejects(run(`AppData.deleteTextMemorizeResultsByTestId('gone')`), /offline/);
  assert.equal(run('FirebaseStore.textMemorizeResults.length'), 1);
});
test('orphan cleanup never deletes using unverified source cache', async () => {
  const run = fixture();
  run(`FirebaseStore.tests=[]; FirebaseStore.vocabTestResults=[{testId:'live'}]; AppData.removeDocument=async()=>{throw Error('must not delete')};`);
  assert.equal(await run('AppData.cleanupOrphanVocabTestResults()'), 0);
});
test('default vocabulary retains Wordmaster but never restores retired special sets', () => {
  const run = fixture();
  run(`const WORDMASTER_2000_SETS=[{id:'wm2000_day_01',words:[]}];
    const MOCK_EXAM_VOCAB_SETS=[{id:'retired-special',words:[]}];`);
  assert.equal(run(`getDefaultVocabSets().some(s=>s.id==='wm2000_day_01')`), true);
  assert.equal(run(`getDefaultVocabSets().some(s=>s.id==='retired-special')`), false);
});
test('vocabulary cutoffs respect teacher settings for ordinary mock exam titles', () => {
  const run = fixture();
  run(`const window={}; const document={addEventListener(){}};`);
  run(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'));
  assert.equal(run(`App.getBaseVocabCutoffScore({title:'모의고사 단어',vocabCutoffs:{2:75}},2)`), 75);
  assert.equal(run(`App.getAllTextMemorizePassages().length`), 0);
});

for (const hasStudents of [true, false]) {
  test(`admin profile management has no creation form with ${hasStudents ? 'existing' : 'no'} students`, () => {
    const run = fixture();
    run(`const window={}; const grid={innerHTML:''};
      const document={addEventListener(){},getElementById:id=>id==='adminStudentsEditGrid'?grid:null};
      FirebaseStore.studentsLoaded=true;
      FirebaseStore.students=${hasStudents ? JSON.stringify([{id:7,name:'학생',target:'영어 1등급',accessMode:'CALENDAR_ONLY'}]) : '[]'};`);
    run(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'));
    run('App.renderAdminStudentsTab()');
    const html = run('grid.innerHTML');
    assert.doesNotMatch(html, /newStudentName|newStudentTarget|newStudentAccessMode|handleAddStudentProfile|새 학생 프로필|학생 프로필 추가/);
    assert.equal(run('typeof App.handleAddStudentProfile'), 'undefined');
    if (hasStudents) {
      assert.match(html, /id="editStudentName_7" value="학생"/);
      assert.match(html, /id="editStudentTarget_7" value="영어 1등급"/);
      assert.match(html, /id="editStudentAccessMode_7"/);
      assert.match(html, /value="CALENDAR_ONLY" selected/);
      assert.match(html, /App.handleSaveStudentProfile\(7\)/);
      assert.match(html, /App.confirmDeleteStudentProfile\(7\)/);
    } else {
      assert.equal(html.trim(), '');
    }
    assert.equal(run('typeof App.handleSaveStudentProfile'), 'function');
    assert.equal(run('typeof App.confirmDeleteStudentProfile'), 'function');
    assert.equal(run('typeof AppData.addStudent'), 'function');
  });
}

test('admin exam list omits the retest column for every exam type without moving its controls', () => {
  const run = fixture();
  run(`const window={addEventListener(){}};
    const elements={};
    const document={addEventListener(){},getElementById:id=>elements[id]||(elements[id]={innerHTML:'',innerText:''})};
    FirebaseStore.studentsLoaded=true;
    FirebaseStore.students=[{id:7,name:'학생',target:'목표'}];`);
  for (const file of ['app.js', 'grammar_data.js', 'grammar.js', 'weekly_review.js']) {
    run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  }
  run(`App.state.adminSelectedStudentId=7;
    App.state.isAdminLoggedIn=true;
    AppData.getWeeklyReviewResult=()=>null;
    const examTypes=['VOCAB','TEXT_MEMORIZE','PRACTICE','GRAMMAR','VOCAB_REVIEW','OTHER'];
    const exams=examTypes.map(type=>({id:type,type,studentId:7,date:'2026-11-09',time:'00:00',endTime:'23:59',title:type,scope:'범위',status:'SCHEDULED',retestStatus:'RETEST_PENDING',grammarParts:['concept'],questions:[]}));
    AppData.getTestsByStudentId=()=>exams;
    App.renderAdminTestsTab();`);
  const html = run('elements.adminTestsTableBody.innerHTML').replaceAll('&#039;', "'");
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, 6);
  for (const row of rows) assert.equal((row.match(/<td\b/g) || []).length, 5);
  assert.doesNotMatch(html, /quickUpdateRetestStatus|toggleTextMemorizeAllowRetest|재시험 없음|결과 \/ 채점/);
  assert.match(html, /App.viewTextMemorizeExamPaper\('TEXT_MEMORIZE'\)/);
  assert.match(html, /App.startPracticeTest\('PRACTICE'\)/);
  assert.match(html, /App.openGrammarAssignmentModal\('GRAMMAR'\)/);
  assert.match(html, /App.openWeeklyReviewModal\('VOCAB_REVIEW'\)/);
  assert.match(html, /App.confirmDeleteTest\('VOCAB'\)/);
  run('exams.length=0; App.renderAdminTestsTab()');
  assert.match(run('elements.adminTestsTableBody.innerHTML'), /colspan="5"/);
});

function adminExamFixture() {
  const run = fixture();
  run(`const window={addEventListener(){}}; const elements={};
    const document={addEventListener(){},getElementById:id=>elements[id]||(elements[id]={innerHTML:'',innerText:''})};
    FirebaseStore.studentsLoaded=true;
    FirebaseStore.students=[{id:7,name:'학생',target:'목표'}];`);
  for (const file of ['app.js', 'grammar_data.js', 'grammar.js', 'weekly_review.js']) {
    run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  }
  run(`App.state.adminSelectedStudentId=7; App.state.isAdminLoggedIn=true;
    const exams=[]; AppData.getTestsByStudentId=()=>exams;
    AppData.getWeeklyReviewResult=()=>null;`);
  return run;
}

test('admin exam rows share date, title, score, status and action layouts across exam types', () => {
  const run = adminExamFixture();
  run(`for(const type of ['VOCAB','TEXT_MEMORIZE','PRACTICE','GRAMMAR','VOCAB_REVIEW','OTHER'])
    exams.push({id:type,type,studentId:7,date:'2026-11-09',time:'00:00',endTime:'23:59',title:'제목',scope:'범위',status:'SCHEDULED',grammarParts:['concept'],questions:[]});
    App.renderAdminTestsTab();`);
  const rows = run('elements.adminTestsTableBody.innerHTML').match(/<tr\b[\s\S]*?<\/tr>/g);
  const cells = rows.map(row => [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]);
  for (const row of cells) {
    assert.equal(row.length, 5);
    assert.deepEqual(row.map(cell => cell[1]), cells[0].map(cell => cell[1]), 'same column spacing/alignment');
    assert.match(row[0][2], /2026-11-09/);
    assert.match(row[1][2], /범위/);
    assert.match(row[1][2], /admin-exam-type/);
    assert.match(row[2][2], /기준:/);
    assert.match(row[2][2], /점수:/);
    assert.doesNotMatch(row[3][2], /점수|80점/);
    assert.match(row[4][2], /admin-exam-actions/);
  }
});

test('admin score column preserves zero scores and keeps weekly review progress in status', () => {
  const run = adminExamFixture();
  run(`exams.push(
    {id:'plain',type:'VOCAB',date:'2026-11-09',score:0,cutoff:0,status:'FAIL'},
    {id:'practice',type:'PRACTICE',date:'2026-11-09',practiceResult:{score:0},status:'PASS'},
    {id:'grammar',type:'GRAMMAR',date:'2026-11-09',grammarParts:['concept'],grammarResults:{concept:{score:0,status:'FAIL'}},status:'FAIL'},
    {id:'weekly',type:'VOCAB_REVIEW',date:'2026-11-09',questions:[],status:'SCHEDULED'});
    AppData.getWeeklyReviewResult=()=>({completed:false,rounds:[{score:0}],remainingIds:['word']});
    App.renderAdminTestsTab();`);
  const rows = run('elements.adminTestsTableBody.innerHTML').match(/<tr\b[\s\S]*?<\/tr>/g);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    assert.match(cells[2][1], />[^<]*0(?:점)?</);
    assert.doesNotMatch(cells[3][1], /0점/);
  }
  assert.match(rows[3], /남은 1개/);
  assert.doesNotMatch(rows[3], /마감<|회차/);
});

test('admin list shows explicit timed deadlines and clears stale rows when students disappear', () => {
  const run = adminExamFixture();
  run(`exams.push({id:'timed',type:'GRAMMAR',date:'2026-11-09',time:'14:00',endTime:'23:59',grammarParts:['concept'],status:'SCHEDULED'});
    App.renderAdminTestsTab();`);
  assert.match(run('elements.adminTestsTableBody.innerHTML'), /14:00\s*~\s*23:59/);
  assert.doesNotMatch(run('elements.adminTestsTableBody.innerHTML'), /하루종일/);
  run('FirebaseStore.students=[]; App.renderAdminTestsTab()');
  assert.doesNotMatch(run('elements.adminTestsTableBody.innerHTML'), /timed/);
  assert.equal(run('elements.adminSelectedStudentInfo.innerHTML'), '');
  assert.equal(run('elements.adminTestCountBadge.innerText'), '총 0개');
});

function studentDeletionFixture(records) {
  const run = fixture();
  run(`const window = { firebaseDB: {} }; const store = new Map(${JSON.stringify(records)});
    const reads = []; let active = 0; let peak = 0; let failPath = ''; let beforeRead = null;
    const snapshot = path => ({ id: path.split('/')[1], ref: path,
      exists: () => store.has(path), data: () => store.get(path) });
    window.firebaseFns = {
      collection: (_, name) => name,
      getDocs: async name => ({ docs: [...store.keys()].filter(path => path.startsWith(name + '/')).map(snapshot) }),
      runTransaction: async (_, update) => {
        active++; peak = Math.max(peak, active);
        try {
          await new Promise(resolve => setTimeout(resolve, 1));
          const writes = [];
          const result = await update({ get: async path => {
            reads.push(path); if (beforeRead) beforeRead(path);
            if (path === failPath) throw Error('offline'); return snapshot(path);
          }, delete: path => writes.push(() => store.delete(path)),
            update: (path, patch) => writes.push(() => store.set(path, { ...store.get(path), ...patch })) });
          writes.forEach(write => write()); return result;
        } finally { active--; }
      }
    };
    AppData.removeDocument = async (collection, id) => {
      if (active) throw Error('cleanup transactions still running');
      store.delete(collection + '/' + id);
    };
    FirebaseStore.studentsLoaded = true;
    FirebaseStore.students = [{ id: 7, name: '삭제 학생' }, { id: 8, name: '유지 학생' }];
    FirebaseStore.tests = [{ id: 'gone', studentId: 7 }, { id: 'keep', studentId: 8 }];
    FirebaseStore.vocabSets = [{ id: 'shared', studentIds: [7, 8] }];
  `);
  return run;
}

test('student deletion transacts only on matching records and preserves all other student data', async () => {
  const records = [
    ['students/7', { id: 7 }], ['students/8', { id: 8 }],
    ['tests/gone', { studentId: 7 }], ['tests/keep', { studentId: 8 }],
    ['vocabTestResults/gone', { studentId: '7' }], ['textMemorizeResults/gone', { studentId: 7 }],
    ['academicRecords/gone', { studentId: 7, items: [] }], ['members/gone', { studentId: 7 }],
    ['vocabSets/shared', { studentIds: [7, '7', 8], words: [{ en: 'keep' }] }],
    ['academicData/academicTargetUnivs', { items: { 7: [{ name: 'gone' }], 8: [{ name: 'keep' }] } }],
    ['academicData/academicAssessments', { items: [{ studentId: 7 }, { studentId: 8 }], count: 2 }],
    ...Array.from({ length: 150 }, (_, i) => [`vocabSets/other${i}`, { studentIds: [8] }])
  ];
  const run = studentDeletionFixture(records);
  assert.equal(await run('AppData.deleteStudent(7)'), true);
  assert.equal(run('reads.length'), 8, 'unrelated records must not start transactions');
  assert.equal(run("store.has('students/7')"), false);
  assert.equal(run("store.has('members/gone')"), false);
  for (const collection of ['tests', 'vocabTestResults', 'textMemorizeResults', 'academicRecords']) {
    assert.equal(run(`store.has('${collection}/gone')`), false, collection);
  }
  assert.equal(run("store.get('vocabSets/shared').studentIds.join(',')"), '8');
  assert.equal(run("store.get('vocabSets/shared').words[0].en"), 'keep');
  assert.equal(run("Object.keys(store.get('academicData/academicTargetUnivs').items).join(',')"), '8');
  assert.equal(run("store.get('academicData/academicAssessments').count"), 1);
  for (const [key, value] of records.filter(([key]) => key === 'students/8' || key === 'tests/keep' || key.startsWith('vocabSets/other'))) {
    assert.deepEqual(JSON.parse(run(`JSON.stringify(store.get('${key}'))`)), value);
  }
  assert.equal(run('FirebaseStore.students.map(s => s.id).join(",")'), '8');
});

test('student cleanup overlaps network work without unbounded transaction fan-out', async () => {
  const run = studentDeletionFixture(Array.from({ length: 25 }, (_, i) => [`tests/own${i}`, { studentId: 7 }]));
  await run('AppData.deleteStudent(7)');
  assert.ok(run('peak') > 1, 'serial transactions cause the observed unresponsive deletion');
  assert.ok(run('peak') <= 10, 'cleanup must not flood Firestore');
  assert.equal(run('active'), 0);
  assert.equal(run('store.size'), 0);
});

test('cleanup failure settles active writes, preserves the student and allows a safe retry', async () => {
  const run = studentDeletionFixture([
    ['students/7', { id: 7 }],
    ...Array.from({ length: 15 }, (_, i) => [`tests/own${i}`, { studentId: 7 }])
  ]);
  run("failPath = 'tests/own2'");
  await assert.rejects(run('AppData.deleteStudent(7)'), /offline/);
  assert.equal(run('active'), 0, 'no background cleanup writes after reporting failure');
  assert.equal(run("store.has('students/7')"), true);
  assert.equal(run('FirebaseStore.students.length'), 2);
  run("failPath = ''");
  await run('AppData.deleteStudent(7)');
  assert.equal(run('store.size'), 0);
});

test('a failed learning-record cleanup cannot delete the student membership in the same parallel chunk', async () => {
  const run = studentDeletionFixture([
    ['students/7', { id: 7 }], ['tests/own', { studentId: 7 }],
    ['members/account', { uid: 'account', studentId: 7 }]
  ]);
  run("failPath = 'tests/own'");
  await assert.rejects(run('AppData.deleteStudent(7)'), /offline/);
  assert.equal(run("store.has('students/7')"), true);
  assert.equal(run("store.has('members/account')"), true, 'failed cleanup must not revoke student sign-in');
  run("failPath = ''");
  await run('AppData.deleteStudent(7)');
  assert.equal(run('store.size'), 0);
});

test('cleanup rechecks current ownership and shared assignments inside each transaction', async () => {
  const run = studentDeletionFixture([
    ['students/7', { id: 7 }], ['tests/moved', { studentId: 7 }],
    ['vocabSets/shared', { studentIds: [7, 8] }]
  ]);
  run(`beforeRead = path => {
    if (path === 'tests/moved') store.set(path, { studentId: 8 });
    if (path === 'vocabSets/shared') store.set(path, { studentIds: [7, 8, 9] });
  }`);
  await run('AppData.deleteStudent(7)');
  assert.equal(run("store.get('tests/moved').studentId"), 8);
  assert.equal(run("store.get('vocabSets/shared').studentIds.join(',')"), '8,9');
});

test('unresponsive cloud reads time out before deleting any student data', async () => {
  const run = studentDeletionFixture([['students/7', { id: 7 }]]);
  run(`const withTimeout = AppData.withCloudTimeout.bind(AppData);
    AppData.withCloudTimeout = (operation, label) => withTimeout(operation, label, 5);
    window.firebaseFns.getDocs = () => new Promise(() => {});`);
  const result = await Promise.race([
    run('AppData.deleteStudent(7)').then(() => 'unexpected success', error => error.message),
    new Promise(resolve => setTimeout(() => resolve('still pending'), 50))
  ]);
  assert.match(result, /응답 시간이 초과/);
  assert.equal(run("store.has('students/7')"), true);
  assert.equal(run('reads.length'), 0);
});

test('student delete button reports pending work and blocks duplicate submissions until failure or success', async () => {
  const run = fixture();
  run(`const window = {}; const button = { disabled: false, innerHTML: '삭제' };
    const document = { addEventListener() {}, getElementById: () => button };
    const confirm = () => true; console = { ...console, error() {} };
    FirebaseStore.studentsLoaded = true;
    FirebaseStore.students = [{ id: 7, name: '학생' }];
  `);
  run(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'));
  run(`const notices = []; let calls = 0; let fail;
    App.toast = (message, type) => notices.push({ message, type });
    App.renderAdminStudentsTab = () => {};
    AppData.deleteStudent = () => { calls++; return new Promise((resolve, reject) => fail = reject); };
    const first = App.confirmDeleteStudentProfile(7);
  `);
  assert.equal(run('button.disabled'), true);
  assert.match(run('button.innerHTML'), /삭제 중/);
  run("const duplicate = App.confirmDeleteStudentProfile('7')");
  assert.equal(run('calls'), 1);
  run("fail(Error('offline'))");
  await run('first');
  assert.equal(run('button.disabled'), false);
  assert.equal(run('button.innerHTML'), '삭제');
  assert.equal(run('notices.at(-1).type'), 'error');
  run('AppData.deleteStudent = async () => { calls++; FirebaseStore.students = []; return true; }');
  await run('App.confirmDeleteStudentProfile(7)');
  assert.equal(run('calls'), 2);
  assert.equal(run('App.state.adminSelectedStudentId'), null);
  assert.equal(run('notices.at(-1).type'), 'info');
});

test('a delete button created during an in-flight deletion restores its normal label after failure', async () => {
  const run = fixture();
  run(`const window = {}; let button = null;
    const document = { addEventListener() {}, getElementById: () => button };
    const confirm = () => true; console = { ...console, error() {} };
    FirebaseStore.studentsLoaded = true; FirebaseStore.students = [{ id: 7, name: '학생' }];
  `);
  run(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'));
  run(`let rejectDelete;
    App.toast = () => {};
    AppData.deleteStudent = () => new Promise((resolve, reject) => rejectDelete = reject);
    const pendingDelete = App.confirmDeleteStudentProfile(7);
    button = { disabled: true, innerHTML: '삭제 중…' };
    rejectDelete(Error('offline'));`);
  await run('pendingDelete');
  assert.match(run('button.innerHTML') || '', /삭제/);
  assert.doesNotMatch(run('button.innerHTML'), /삭제 중|undefined/);
  assert.equal(run('button.disabled'), false);
});
