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
