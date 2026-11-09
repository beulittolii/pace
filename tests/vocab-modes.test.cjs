const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  const context = vm.createContext({ console, Date, Math, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} } });
  const run = code => vm.runInContext(code, context);
  run(read('data.js'));
  run(`const window={}; const elements={};
    const element=id=>elements[id]||(elements[id]={value:'',checked:false,classList:{add(){},remove(){},toggle(){}},innerHTML:'',innerText:''});
    const document={addEventListener(){},getElementById:element,
      querySelector:selector=>({value:selector.includes('formTestType')?'VOCAB':'SCHEDULED'}),
      querySelectorAll:selector=>selector.includes('formStudentCheckbox')?[{value:'1'}]:[]};`);
  run(read('app.js'));
  run(`const notices=[]; App.toast=(message,type)=>notices.push({message,type});
    App.closeAdminTestFormModal=()=>{}; App.renderAdminDashboard=()=>{};
    App.closeTestDetailModal=()=>{}; App.showVocabTestView=()=>{}; App.renderVocabQuestion=()=>{};
    const saved=[]; AppData.saveOrUpdateTest=async t=>{saved.push(t);return t};
    FirebaseStore.studentsLoaded=true; FirebaseStore.students=[{id:1,name:'학생'}];
    const words=Array.from({length:50},(_,i)=>({en:'word'+i,ko:'뜻'+i}));
    const set={id:'set',title:'Day 1',words}; AppData.getVocabSets=()=>[set];
    const exam={id:'exam',type:'VOCAB',studentId:1,date:'2026-11-10',vocabSetId:'set',vocabQuestionCounts:{2:0,3:10,4:0}};
    FirebaseStore.tests=[exam]; FirebaseStore.vocabTestResults=[];
    element('formTitle').value='단어 테스트';element('formDate').value='2026-11-10';
    element('formVocabSetId').value='set';
    [2,3,4,5].forEach(d=>element('formVocabCutoff_'+d).value='80');
    const save=()=>App.handleSaveTestForm({preventDefault(){}});`);
  return { run, plain: code => JSON.parse(JSON.stringify(run(code))) };
}

test('explicit zero omits modes while missing/null and legacy positive counts preserve defaults', () => {
  const f=fixture();
  assert.deepEqual(f.plain('AppData.getVocabDirections(exam)'),[3]);
  for (const [source,want] of [['{}',40],['{vocabQuestionCounts:{2:null}}',40],['{vocabQuestionCount_2:15}',15],['{vocabQuestionCounts:{2:0},vocabQuestionCount_2:15}',0]]) {
    assert.equal(f.run(`AppData.getVocabQuestionCount(${source},2)`),want);
  }
  assert.deepEqual(f.plain('AppData.getVocabDirections({})'),[2,3,4]);
  assert.deepEqual(f.plain('AppData.getVocabDirections({isEnglishDefTest:true,vocabQuestionCounts:{2:0,3:0,4:0}})'),[5]);
});

test('save retains zero and blank counts and summarizes only active cutoffs', async () => {
  const f=fixture();f.run(`element('formVocabQuestionCount_2').value='0';element('formVocabQuestionCount_4').value='0';
    element('formVocabCutoff_2').value='20';element('formVocabCutoff_3').value='85';`);
  await f.run('save()');
  assert.equal(f.run('saved.length'),1);
  assert.deepEqual(f.plain('saved[0].vocabQuestionCounts'),{2:0,3:null,4:0,5:null});
  assert.equal(f.run('saved[0].cutoff'),'스펠링 85점');
  assert.equal(f.run('saved[0].cutoffScore'),85);
  assert.equal(f.run('saved[0].vocabCutoff'),85);
});

test('all-zero and invalid ordinary counts cannot save', async () => {
  for (const counts of [[0,0,0],[1,10,0],[4,10,0],[-1,10,0],[5.5,10,0],[201,10,0]]) {
    const f=fixture();f.run(`[2,3,4].forEach((d,i)=>element('formVocabQuestionCount_'+d).value=String(${JSON.stringify(counts)}[i]));`);
    await f.run('save()');assert.equal(f.run('saved.length'),0,`counts: ${counts}`);
    assert.equal(f.run('notices.at(-1).type'),'error');
  }
});

test('editing an assignment preserves excluded zero counts', () => {
  const f=fixture();
  f.run(`['renderStudentCheckboxes','onEnglishDefTestToggle','toggleTextMemorizeCutoffType','toggleTestFormType','showModal','renderFormVocabSetSelect','initPracticeQuestionsForm','renderTextMemorizePassages'].forEach(k=>App[k]=()=>{});`);
  f.run("App.openEditTestModal('exam')");
  assert.equal(Number(f.run("element('formVocabQuestionCount_2').value")),0);
  assert.notEqual(f.run("element('formVocabQuestionCount_2').value"),'');
  assert.equal(Number(f.run("element('formVocabQuestionCount_3').value")),10);
});

test('excluded buttons disappear before checking old passed results', () => {
  const f=fixture();f.run("FirebaseStore.vocabTestResults=[{studentId:1,setId:'set',testId:'exam',direction:2,passed:true,score:100}]");
  assert.equal(f.run("App.renderVocabTestButton(set,1,2,'객관식','','exam')"),'');
  assert.match(f.run("App.renderVocabTestButton(set,1,3,'스펠링','','exam')"),/스펠링/);
});

test('prerequisites skip omitted stages but retain the preceding enabled stage', () => {
  const f=fixture();
  assert.equal(f.run("App.isVocabTestUnlocked(1,'set',3,'exam').unlocked"),true);
  f.run('exam.vocabQuestionCounts={2:10,3:0,4:10}');
  assert.equal(f.run("App.isVocabTestUnlocked(1,'set',4,'exam').requiredLabel"),'객관식');
  f.run("FirebaseStore.vocabTestResults=[{studentId:1,setId:'set',testId:'exam',direction:2,passed:true}]");
  assert.equal(f.run("App.isVocabTestUnlocked(1,'set',4,'exam').unlocked"),true);
  f.run('exam.vocabQuestionCounts={2:0,3:0,4:10}');
  assert.equal(f.run("App.isVocabTestUnlocked(1,'set',4,'exam').unlocked"),true);
});

test('direct start of omitted mode creates no attempt even with a passed prerequisite', () => {
  const f=fixture();f.run("App.startVocabTest('set',1,2,'exam')");
  assert.equal(f.run('App.state.vocabTest'),null);
  assert.equal(f.run('notices.at(-1).type'),'error');
});

test('final status and score use only active results, ignoring excluded failures and pending grading', async () => {
  const f=fixture();f.run(`FirebaseStore.vocabTestResults=[
    {testId:'exam',direction:3,passed:true,score:90},
    {testId:'exam',direction:2,passed:false,score:0},
    {testId:'exam',direction:4,passed:false,score:60,waitingGrading:true}];`);
  await f.run("App.updateVocabScheduleStatus('exam')");
  assert.equal(f.run('exam.status'),'PASS');assert.equal(f.run('exam.score'),'스펠링 90점');
  f.run('exam.vocabQuestionCounts={2:0,3:0,4:0}');
  await f.run("App.updateVocabScheduleStatus('exam')");assert.equal(f.run('exam.status'),'SCHEDULED');
});
