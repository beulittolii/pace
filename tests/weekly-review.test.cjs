const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  const documents = new Map();
  const context = vm.createContext({ console, setTimeout, clearTimeout, Date, Math });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','data.js'),'utf8'), context);
  vm.runInContext(`
    Object.assign(FirebaseStore, { students: [{id:1,name:'학생'}], tests: [], vocabTestResults: [], vocabSets: [], vocabReviewResults: [] });
    const App = { state: { isAdminLoggedIn: true, selectedStudentId: 1 }, convertKorToEng: v => v === 'ㅁㅔㅔㅣㄷ' ? 'apple' : v };
    Object.assign(AppData, {
      getTests: () => FirebaseStore.tests, getVocabTestResults: () => FirebaseStore.vocabTestResults, getVocabSets: () => FirebaseStore.vocabSets,
      isFirebaseReady: () => true, getVocabTestResultDocumentId: r => r.id,
      cacheGrammarTests(records) { FirebaseStore.tests = [...FirebaseStore.tests.filter(t => !records.some(r => r.id === t.id)), ...records]; }
    });
    const window = { firebaseDB: {} };
  `, context);
  let transactionTail = Promise.resolve();
  context.fakeFns = { doc: (_, col, id) => `${col}/${id}`, runTransaction: (_, callback) => {
    // Serial commits emulate Firestore's conflict retry outcome for concurrent callers.
    const task = transactionTail.then(async () => {
      const pending = [];
      const result = await callback({ get: async ref => ({ exists: () => documents.has(ref), data: () => structuredClone(documents.get(ref)) }), set: (ref, value) => pending.push([ref, structuredClone(value)]), delete: ref => pending.push([ref,null]) });
      pending.forEach(([ref,value]) => value === null ? documents.delete(ref) : documents.set(ref,value));
      return result;
    });
    transactionTail = task.catch(() => {});
    return task;
  } };
  vm.runInContext('window.firebaseFns = fakeFns', context);
  for (const file of ['weekly_review_logic.js','weekly_review_store.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  const run = code => vm.runInContext(code,context);
  const plain = code => JSON.parse(JSON.stringify(run(code)));
  run(`
    const words = Array.from({length:60}, (_,i) => ({en:i === 0 ? 'apple' : 'word'+i, ko:'뜻'+i}));
    const tests = Array.from({length:5},(_,i) => ({id:'source'+i,studentId:1,type:'VOCAB',date:'2026-11-0'+(i+2),status:'PASS',vocabSetIds:['set']}));
    const detail = (i, correct) => ({word:words[i],isCorrect:correct,spellingCorrect:correct});
    const results = [{id:'result',testId:'source0',studentId:1,direction:2,startedAt:'2026-11-02T01:00:00Z',completedAt:'2026-11-02T01:10:00Z',questionDetails:[detail(0,false),detail(1,true),detail(2,true),detail(3,true)],wrongAnswers:[]}];
    const sets = [{id:'set',words}];
    const build = () => WeeklyReviewLogic.build({tests,results,sets,studentId:1,monday:'2026-11-02'});
    FirebaseStore.tests=tests; FirebaseStore.vocabTestResults=results; FirebaseStore.vocabSets=sets;
  `);
  function persist() { for (const [collection,array] of [['students',plain('FirebaseStore.students')],['tests',plain('tests')],['vocabTestResults',plain('results')],['vocabSets',plain('sets')]]) array.forEach(value => documents.set(`${collection}/${value.id}`,value)); }
  return { run, plain, documents, persist };
}
test('requires all five weekdays and every test final PASS including integrated admin grading', () => {
  const f=fixture(); assert.ok(f.run('build()'));
  f.run("tests.push({...tests[0],id:'extra',status:'FAIL'})"); assert.equal(f.run('build()'),null);
  f.run('tests.pop(); tests.pop()'); assert.equal(f.run('build()'),null);
  f.run("tests.push({id:'last',type:'VOCAB',studentId:1,date:'2026-11-06',status:'PASS',vocabSetIds:['set']}); results.push({...results[0],id:'integrated',direction:4,passed:true,waitingGrading:true})");
  assert.equal(f.run('build()'),null);
  f.run('results[1].waitingGrading=false'); assert.equal(f.run('build()'),null);
  f.run('results[1].gradedByAdmin=true'); assert.ok(f.run('build()'));
});
test('Korea Saturday midnight is the sole opening boundary, without a closing deadline', () => {
  const f=fixture();
  for (const [time,want] of [['2026-11-06T14:59:59Z',false],['2026-11-06T15:00:00Z',true],['2026-11-15T00:00:00Z',true]]) assert.equal(f.run(`WeeklyReviewLogic.available(build(),new Date('${time}'))`),want);
  assert.equal(f.run("WeeklyReviewLogic.monday('2026-11-08')"),'2026-11-02');
});
test('no wrong answers skips the review; unresolved old errors request admin repair', () => {
  const f=fixture(); f.run('results[0].questionDetails=[detail(0,true)]'); assert.equal(f.run('build()'),null);
  f.run("results[0].questionDetails=[]; results[0].wrongAnswers=[{question:'app',correct:'틀린 원본'}]");
  assert.equal(f.run('build().status'),'REVIEW_DATA_NEEDED'); assert.equal(f.run('build().questions.length'),0);
});
test('legacy exact recovery, deduped attempts, prior errors despite subsequent pass, spelling priority', () => {
  const f=fixture();
  f.run(`results[0].attempts=[{startedAt:'old',completedAt:'oldend',wrongAnswers:[{question:'apple (뜻0)',answer:'x',correct:'뜻0'}]}, {startedAt:'old',completedAt:'oldend',wrongAnswers:[{question:'apple (뜻0)',answer:'x',correct:'뜻0'}]}];
    results[0].questionDetails=[detail(0,true),detail(1,true)];
    results.push({...results[0],id:'spell',direction:3,attempts:[],questionDetails:[detail(0,false)]});`);
  assert.equal(f.run("build().questions.find(q=>q.word.en==='apple').mistakeCount"),2);
  assert.equal(f.run("build().questions.find(q=>q.word.en==='apple').mode"),'SPELLING');
  f.run("results.push({...results[0],id:'new',direction:4,passed:true,gradedByAdmin:true,attempts:[],questionDetails:[{...detail(4,false),spellingCorrect:true}]})");
  assert.equal(f.run("build().questions.find(q=>q.word.en==='word4').mode"),'CHOICE');
});
test('30 error cap plus ten truly correct words; frequency then recency; distinct English words', () => {
  const f=fixture(); f.run(`results[0].questionDetails=words.map((w,i)=>detail(i,i>=45));
    results[0].attempts=[{startedAt:'old',completedAt:'old',questionDetails:[detail(44,false)]}];`);
  assert.equal(f.run('build().questions.length'),40);
  assert.equal(f.run('build().questions[0].word.en'),'word44');
  assert.equal(f.run('build().questions.filter(q=>!q.mistakeCount).length'),10);
  assert.equal(f.run('build().questions.filter(q=>q.mode==="CHOICE").every(q=>q.choices.length===5 && new Set(q.choices).size===5)'),true);
  f.run("sets.push({id:'set2',words:[{en:'APPLE',ko:'사과'}]}); tests[0].vocabSetIds.push('set2'); results[0].questionDetails.push({word:{en:'APPLE',ko:'사과'},isCorrect:false})");
  assert.equal(f.run("build().questions.filter(q=>q.word.en.toLowerCase()==='apple').length"),1);
});
test('few correct words are not padded; missing choice materials request repair', () => {
  const f=fixture(); assert.equal(f.run('build().questions.length'),4);
  f.run('sets[0].words=words.slice(0,2)'); assert.equal(f.run('build().status'),'REVIEW_DATA_NEEDED');
});

test('choice-only source yields only choice review questions including correct words', () => {
  const f=fixture();f.run('tests.forEach(t=>t.vocabQuestionCounts={2:10,3:0,4:0})');
  assert.equal(f.run('build().questions.length'),4);
  assert.equal(f.run('build().questions.every(q=>q.mode==="CHOICE")'),true);
});

test('spelling-only source yields only spelling review questions including correct words', () => {
  const f=fixture();f.run('tests.forEach(t=>t.vocabQuestionCounts={2:0,3:10,4:0});results[0].direction=3');
  assert.equal(f.run('build().questions.length'),4);
  assert.equal(f.run('build().questions.every(q=>q.mode==="SPELLING")'),true);
});

test('disabled results cannot contribute errors, unknown words, sources or pending grading blockers', () => {
  const f=fixture();f.run(`tests.forEach(t=>t.vocabQuestionCounts={2:10,3:0,4:0});
    results.push({...results[0],id:'old-spelling',direction:3,questionDetails:[detail(44,false)]});
    results.push({...results[0],id:'old-integrated',direction:4,passed:false,waitingGrading:true,questionDetails:[],wrongAnswers:[{question:'unknown',correct:'unknown'}]});`);
  assert.equal(f.run('build()?.status'),'SCHEDULED');
  assert.equal(f.run('build().questions.length'),4);
  assert.equal(f.run('build().questions.every(q=>q.sources.every(s=>s.direction===2))'),true);
  assert.equal(f.run('WeeklyReviewLogic.prepare({tests,results,sets,studentId:1,monday:"2026-11-02"}).reviewStage'),'READY');
});

test('mixed assignment weeks keep each correct word within its own actual source modes', () => {
  const f=fixture();f.run(`tests[0].vocabQuestionCounts={2:10,3:0,4:0};tests[1].vocabQuestionCounts={2:0,3:10,4:0};
    results.push({...results[0],id:'spelling',testId:'source1',direction:3,questionDetails:[detail(4,false),detail(5,true),detail(6,true),detail(7,true)]});`);
  for(let i=0;i<15;i++) {
    assert.equal(f.run('build().questions.filter(q=>q.sources.every(s=>s.direction===2)).every(q=>q.mode==="CHOICE")'),true);
    assert.equal(f.run('build().questions.filter(q=>q.sources.every(s=>s.direction===3)).every(q=>q.mode==="SPELLING")'),true);
  }
});

test('definition-only reviews stay spelling-only and integrated sources keep both existing review modes', () => {
  const f=fixture();f.run('tests.forEach(t=>t.isEnglishDefTest=true);results[0].direction=5');
  assert.equal(f.run('build().questions.every(q=>q.mode==="SPELLING")'),true);
  f.run('tests.forEach(t=>{t.isEnglishDefTest=false;t.vocabQuestionCounts={2:0,3:0,4:10}});results[0].direction=4;results[0].passed=true;results[0].gradedByAdmin=true');
  assert.deepEqual(f.plain('[...new Set(build().questions.map(q=>q.mode))].sort()'),['CHOICE','SPELLING']);
});
test('automatic marking follows existing spelling trim/case/Korean keyboard rules', () => {
  const f=fixture(); f.run("const qs=[{id:'s',mode:'SPELLING',word:words[0]},{id:'c',mode:'CHOICE',word:words[1]}]");
  assert.equal(f.run("WeeklyReviewLogic.grade(qs,{s:'  APPLE ',c:'뜻1'}).score"),100);
  assert.equal(f.run("WeeklyReviewLogic.grade(qs,{s:'ㅁㅔㅔㅣㄷ',c:'뜻1'},App.convertKorToEng).score"),100);
  assert.equal(f.run("WeeklyReviewLogic.grade(qs,{s:'  ',c:'x'}).remainingIds.length"),2);
});
test('concurrent generation uses one frozen student/week document; live server pending blocks stale client', async () => {
  const f=fixture(); f.persist();
  const [a,b]=await Promise.all([f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})"),f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})")]);
  assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b))); assert.equal([...f.documents.keys()].filter(k=>k.startsWith('tests/weekly_review')).length,1);
  f.run('results[0].questionDetails=[]'); f.persist();
  const frozen=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})"); assert.deepEqual(JSON.parse(JSON.stringify(frozen.questions)),JSON.parse(JSON.stringify(a.questions)));
  const g=fixture();g.persist();g.documents.get('tests/source4').status='SCHEDULED';
  assert.equal((await g.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})")).reviewStage,'LOCKED');
});
test('round transaction retains initial score, resumes only errors, dedupes double submit, never writes source grades', async () => {
  const f=fixture();f.persist(); const original=JSON.stringify(f.documents.get('vocabTestResults/result'));
  const review=f.plain('build()'); review.date='2026-11-01'; f.documents.set('tests/'+review.id,review);
  f.run(`FirebaseStore.tests.push(${JSON.stringify(review)}); const id='${review.id}'; const answers=Object.fromEntries(${JSON.stringify(review.questions)}.map(q=>[q.id,q.mode==='CHOICE'?q.word.ko:q.word.en])); delete answers.w1;`);
  const first=await f.run('AppData.submitWeeklyReviewRound(id,1,answers)');assert.equal(first.firstScore,75);assert.equal(first.remainingIds.length,1);
  const duplicate=await f.run('AppData.submitWeeklyReviewRound(id,1,{})'); assert.equal(duplicate.rounds.length,1);
  const second=await f.run("AppData.submitWeeklyReviewRound(id,2,{w1:'뜻0'})"); assert.equal(second.completed,true); assert.equal(second.firstScore,75);assert.equal(second.initialWrongCount,1);assert.equal(second.rounds.length,2);
  assert.equal(f.documents.get('tests/'+review.id).status,'PASS'); assert.equal(JSON.stringify(f.documents.get('vocabTestResults/result')),original);
  await assert.rejects(f.run('AppData.submitWeeklyReviewRound(id,3,{})'),/변경/);
});
test('first perfect round completes immediately; unavailable rounds and skipped round numbers reject', async () => {
  const f=fixture(); const review=f.plain('build()'); review.date='2099-01-03';f.documents.set('tests/'+review.id,review); f.run(`const id='${review.id}'`);
  await assert.rejects(f.run('AppData.submitWeeklyReviewRound(id,1,{})'),/응시/);
  review.date='2026-11-01';f.documents.set('tests/'+review.id,review);
  await assert.rejects(f.run('AppData.submitWeeklyReviewRound(id,2,{})'),/변경/);
  f.run(`const answers=Object.fromEntries(${JSON.stringify(review.questions)}.map(q=>[q.id,q.mode==='CHOICE'?q.word.ko:q.word.en]))`);
  const perfect=await f.run('AppData.submitWeeklyReviewRound(id,1,answers)');assert.equal(perfect.completed,true);assert.equal(perfect.firstScore,100);
});
test('actual vocabulary save preserves pre-rollout detailed history without changing existing attempt counts; backup includes progress', async () => {
  const context=vm.createContext({console,Date,Math,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem:()=>{}}});
  const run=code=>vm.runInContext(code,context);
  for(const file of ['data.js','weekly_review_logic.js']) run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  run(`AppData.writeDocument=async()=>{};
    const old={studentId:1,setId:'s',testId:'source0',direction:3,score:0,correctCount:0,total:1,passed:false,startedAt:'old',completedAt:'oldend',questionDetails:[{word:{en:'apple',ko:'사과'},isCorrect:false}],wrongAnswers:[]};
    FirebaseStore.vocabTestResults=[{...old,attempts:[{startedAt:'old',completedAt:'oldend',wrongAnswers:[]}]}];`);
  await run(`AppData.saveVocabTestResult({...old,score:100,passed:true,startedAt:'new',completedAt:'newend',questionDetails:[{word:{en:'apple',ko:'사과'},isCorrect:true}]})`);
  assert.equal(run('FirebaseStore.vocabTestResults[0].attempts.length'),2);
  assert.equal(run('WeeklyReviewLogic.attempts(FirebaseStore.vocabTestResults[0]).filter(a=>a.questionDetails?.some(q=>!q.isCorrect)).length'),1);
  run('FirebaseStore.vocabTestResults=[old]');
  await run(`AppData.saveVocabTestResult({...old,score:100,passed:true,startedAt:'new',completedAt:'newend',questionDetails:[{word:{en:'apple',ko:'사과'},isCorrect:true}]})`);
  assert.equal(run('FirebaseStore.vocabTestResults[0].attempts.length'),1,'legacy attempt counter behavior retained');
  assert.equal(run('WeeklyReviewLogic.attempts(FirebaseStore.vocabTestResults[0]).length'),2,'legacy detailed result still available for review');
  run("FirebaseStore.tests=[{id:'review',type:'VOCAB_REVIEW',date:'2026-11-07',weeklyReviewResult:{id:'review',firstScore:70}}]");
  assert.equal(run('AppData.exportData().vocabReviewResults[0].firstScore'),70);
});
test('same legacy word repeated across sets is restored once; equal mistake counts rank by recency', () => {
  const f=fixture(); f.run(`
    sets.push({id:'duplicate',words:[words[0]]});tests[0].vocabSetIds.push('duplicate');
    results[0].questionDetails=[];
    results[0].attempts=[{startedAt:'a',completedAt:'2026-11-03T00:00:00Z',wrongAnswers:[{question:'apple (뜻0)',correct:'뜻0'}]}, {startedAt:'b',completedAt:'2026-11-05T00:00:00Z',wrongAnswers:[{question:'word1 (뜻1)',correct:'뜻1'}]}];
  `);
  assert.equal(f.run('build().questions.length'),2);
  assert.equal(f.run('build().questions[0].word.en'),'word1');
  assert.equal(f.run('build().questions[1].word.en'),'apple');
});
test('first weekly vocabulary assignment creates a Saturday placeholder without questions and cannot start', async () => {
  const f=fixture();f.run("tests.splice(1);tests[0].status='SCHEDULED';results.splice(0)");f.persist();
  const locked=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");
  assert.equal(locked.date,'2026-11-07');assert.equal(locked.reviewStage,'LOCKED');assert.equal(locked.questions.length,0);
  assert.equal(locked.assignedDays,1);assert.equal(locked.completedDays,0);
  f.run(`const locked=${JSON.stringify(locked)}`);
  assert.equal(f.run("WeeklyReviewLogic.available(locked,new Date('2026-11-08T00:00:00Z'))"),false);
  await assert.rejects(f.run(`AppData.submitWeeklyReviewRound('${locked.id}',1,{})`),/응시/);
});
test('same placeholder unlocks after every weekday passes, preserves creation time, and freezes content exactly once', async () => {
  const f=fixture();f.run("tests[4].status='SCHEDULED'");f.persist();
  const first=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");assert.equal(first.reviewStage,'LOCKED');assert.equal(first.completedDays,4);
  f.run("tests[4].status='PASS'");f.persist();
  const ready=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");
  assert.equal(ready.id,first.id);assert.equal(ready.createdAt,first.createdAt);assert.equal(ready.reviewStage,'READY');assert.ok(ready.questions.length);
  f.run('results[0].questionDetails=[]');f.persist();
  const frozen=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");assert.equal(JSON.stringify(frozen.questions),JSON.stringify(ready.questions));
});
test('pending integrated grading and multiple daily tests keep the precreated review locked', () => {
  const f=fixture();f.run("const prepare=()=>WeeklyReviewLogic.prepare({tests,results,sets,studentId:1,monday:'2026-11-02'});results.push({...results[0],id:'admin',direction:4,passed:true,waitingGrading:true})");
  assert.equal(f.run('prepare().reviewStage'),'LOCKED');assert.equal(f.run('prepare().completedDays'),4);
  f.run('results[1].gradedByAdmin=true;results[1].waitingGrading=false');assert.equal(f.run('prepare().reviewStage'),'READY');
  f.run("tests.push({...tests[0],id:'extra',status:'SCHEDULED'})");assert.equal(f.run('prepare().reviewStage'),'LOCKED');
  f.run("tests[5].status='PASS'");assert.equal(f.run('prepare().reviewStage'),'READY');
});
test('no assignment creates nothing; a completed no-error week marks its precreated review complete without an empty exam', () => {
  const f=fixture();f.run("const prepare=()=>WeeklyReviewLogic.prepare({tests,results,sets,studentId:1,monday:'2026-11-02'});results[0].questionDetails=[detail(0,true)]");
  assert.equal(f.run('prepare().reviewStage'),'NO_ERRORS');assert.equal(f.run('prepare().status'),'PASS');assert.equal(f.run('prepare().questions.length'),0);
  assert.equal(f.run("WeeklyReviewLogic.available(prepare(),new Date('2026-11-08T00:00:00Z'))"),false);
  f.run('tests.splice(0)');assert.equal(f.run('prepare()'),null);
});
test('weekday checks identify the exact completed days and refresh when days change without changing the count', () => {
  const f=fixture();f.run("tests.forEach((t,i)=>t.status=(i===0||i===2)?'PASS':'SCHEDULED');const prepare=()=>WeeklyReviewLogic.prepare({tests,results,sets,studentId:1,monday:'2026-11-02'});const before=prepare()");
  assert.deepEqual(f.plain('before.weekdayCompletion'),[true,false,true,false,false]);assert.equal(f.run('before.completedDays'),2);
  f.run("tests[0].status='SCHEDULED';tests[1].status='PASS';const after=prepare()");
  assert.deepEqual(f.plain('after.weekdayCompletion'),[false,true,true,false,false]);assert.equal(f.run('after.completedDays'),2);
  assert.equal(f.run('WeeklyReviewLogic.samePreparation(before,after)'),false);
});
test('excluded days need no assignment or pass and are omitted from both scope and required day count', () => {
  const f=fixture();f.run("tests.splice(3);const p=WeeklyReviewLogic.prepare({tests,results,sets,studentId:1,monday:'2026-11-02',excludedWeekdays:[3,4]})");
  assert.equal(f.run('p.reviewStage'),'READY');assert.equal(f.run('p.requiredDays'),3);assert.equal(f.run('p.completedDays'),3);
  assert.deepEqual(f.plain('p.sourceTestIds'),['source0','source1','source2']);
  f.run("results.push({...results[0],id:'wed',testId:'source2',questionDetails:[detail(44,false)]});const withoutWed=WeeklyReviewLogic.prepare({tests,results,sets,studentId:1,monday:'2026-11-02',excludedWeekdays:[2,3,4]})");
  assert.equal(f.run("withoutWed.questions.some(q=>q.word.en==='word44')"),false);
  assert.equal(f.run("withoutWed.questions.every(q=>q.sources.every(s=>s.testId!=='source2'))"),true);
});
test('excluding all weekdays removes the review requirement without producing an empty exam', () => {
  const f=fixture();f.run("tests.forEach(t=>t.status='SCHEDULED');const p=WeeklyReviewLogic.prepare({tests,results,sets,studentId:1,monday:'2026-11-02',excludedWeekdays:[0,1,2,3,4]})");
  assert.equal(f.run('p.requiredDays'),0);assert.equal(f.run('p.completedDays'),0);assert.equal(f.run('p.reviewStage'),'EXCLUDED');assert.equal(f.run('p.status'),'PASS');assert.equal(f.run('p.questions.length'),0);
  assert.equal(f.run("WeeklyReviewLogic.available(p,new Date('2026-11-08T00:00:00Z'))"),false);
});
test('teacher can exclude a pending day to unlock, restore it to relock, and automatic sync keeps the saved exclusions', async () => {
  const f=fixture();f.run("tests[4].status='SCHEDULED'");f.persist();
  const review=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");f.run(`const id='${review.id}'`);
  const ready=await f.run('AppData.configureWeeklyReviewDays(id,[4])');assert.equal(ready.reviewStage,'READY');assert.equal(ready.requiredDays,4);assert.equal(ready.completedDays,4);assert.deepEqual(JSON.parse(JSON.stringify(ready.excludedWeekdays)),[4]);
  assert.equal(ready.reviewRevision,2);
  const locked=await f.run('AppData.configureWeeklyReviewDays(id,[])');assert.equal(locked.reviewStage,'LOCKED');assert.equal(locked.requiredDays,5);assert.equal(locked.questions.length,0);assert.equal(locked.reviewRevision,3);
  await f.run('AppData.configureWeeklyReviewDays(id,[4])');
  const synced=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");assert.deepEqual(JSON.parse(JSON.stringify(synced.excludedWeekdays)),[4]);assert.equal(synced.reviewStage,'READY');
  assert.equal(f.documents.get('tests/source4').status,'SCHEDULED','original vocabulary status unchanged');
});
test('students cannot configure excluded days, malformed days reject, and save failure preserves prior configuration', async () => {
  const f=fixture();f.persist();const review=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");f.run(`const id='${review.id}';App.state.isAdminLoggedIn=false`);
  await assert.rejects(f.run('AppData.configureWeeklyReviewDays(id,[4])'),/관리자/);
  f.run('App.state.isAdminLoggedIn=true');
  for(const invalid of ['[-1]','[5]','["1"]']) await assert.rejects(f.run(`AppData.configureWeeklyReviewDays(id,${invalid})`),/요일/);
  f.run("window.firebaseFns.runTransaction=async()=>{throw new Error('저장 실패')}");
  await assert.rejects(f.run('AppData.configureWeeklyReviewDays(id,[4])'),/저장 실패/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.documents.get('tests/'+review.id).excludedWeekdays)),[]);
});
test('changing exclusions rejects stale active papers and submitted history remains protected', async () => {
  const f=fixture();f.persist();const review=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");f.run(`const id='${review.id}'`);
  const changed=await f.run('AppData.configureWeeklyReviewDays(id,[4])');changed.date='2026-11-01';f.documents.set('tests/'+changed.id,structuredClone(changed));
  await assert.rejects(f.run('AppData.submitWeeklyReviewRound(id,1,{},1)'),/범위를 변경/);
  f.run(`const answers=Object.fromEntries(${JSON.stringify(changed.questions)}.map(q=>[q.id,q.mode==='CHOICE'?q.word.ko:q.word.en]))`);
  const result=await f.run(`AppData.submitWeeklyReviewRound(id,1,answers,${changed.reviewRevision})`);assert.equal(result.completed,true);
  const before=JSON.stringify(f.documents.get('tests/'+changed.id));
  await assert.rejects(f.run('AppData.configureWeeklyReviewDays(id,[3,4])'),/이미 제출/);
  assert.equal(JSON.stringify(f.documents.get('tests/'+changed.id)),before);
});
test('completed standalone preview permits excluding and restoring weekdays without altering questions or grades', async () => {
  const f=fixture();const preview=f.plain('build()');preview.id='preview';preview.isPreview=true;
  preview.weeklyReviewResult={id:'preview',studentId:1,completed:true,firstScore:50,remainingIds:[],rounds:[{number:1,score:50,details:[],remainingIds:[]}]};
  preview.status='PASS';f.documents.set('tests/preview',structuredClone(preview));
  f.run(`tests.splice(0);tests.push(${JSON.stringify(preview)});results.splice(0)`);
  const originalQuestions=JSON.stringify(preview.questions), originalResult=JSON.stringify(preview.weeklyReviewResult);
  const saved=await f.run("AppData.configureWeeklyReviewDays('preview',[1,4])");
  assert.deepEqual(JSON.parse(JSON.stringify(saved.excludedWeekdays)),[1,4]);assert.equal(saved.requiredDays,3);
  assert.equal(JSON.stringify(saved.questions),originalQuestions);assert.equal(JSON.stringify(saved.weeklyReviewResult),originalResult);
  const excluded=await f.run("AppData.configureWeeklyReviewDays('preview',[0,1,2,3,4])");assert.equal(excluded.reviewStage,'EXCLUDED');
  const restored=await f.run("AppData.configureWeeklyReviewDays('preview',[])");assert.equal(restored.reviewStage,'READY');assert.equal(restored.status,'PASS');assert.equal(restored.requiredDays,5);
  assert.equal(JSON.stringify(restored.weeklyReviewResult),originalResult);
});

test('admin deletes locked, ready, blocked and completed reviews without deleting source tests or grades', async () => {
  for (const stage of ['LOCKED','READY','DATA_NEEDED','COMPLETE']) {
    const f=fixture();f.persist();
    const review=f.plain('build()');review.reviewStage=stage;
    review.status=stage==='DATA_NEEDED'?'REVIEW_DATA_NEEDED':stage==='COMPLETE'?'PASS':'SCHEDULED';
    review.weeklyReviewResult={id:review.id,studentId:1,completed:stage==='COMPLETE',rounds:[{number:1,score:50}]};
    f.documents.set('tests/'+review.id,structuredClone(review));
    f.run(`const id='${review.id}';FirebaseStore.tests.push(${JSON.stringify(review)});FirebaseStore.vocabReviewResults=[${JSON.stringify(review.weeklyReviewResult)}]`);
    const before=JSON.stringify([...f.documents].filter(([key])=>key.startsWith('vocabTestResults/')||key.startsWith('tests/source')));
    await f.run('AppData.deleteWeeklyReview(id)');
    assert.equal(f.documents.has('tests/'+review.id),false);
    assert.equal(f.run('AppData.getTests().some(t=>t.id===id)'),false);
    assert.equal(f.run('AppData.getWeeklyReviewResult(id)'),null);
    assert.deepEqual(f.documents.get('students/1').deletedWeeklyReviewIds,[review.id]);
    assert.equal(f.run('AppData.isWeeklyReviewDeleted(id,1)'),true);
    assert.equal(JSON.stringify([...f.documents].filter(([key])=>key.startsWith('vocabTestResults/')||key.startsWith('tests/source'))),before);
  }
});

test('deleted reviews never regenerate, even from stale clients and concurrent generation', async () => {
  const f=fixture();f.persist();
  const review=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");
  f.run(`const id='${review.id}'`);
  await Promise.all([f.run('AppData.deleteWeeklyReview(id)'),f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})")]);
  assert.equal(f.documents.has('tests/'+review.id),false);
  // Simulate another browser that has not received the updated student snapshot yet.
  f.run('FirebaseStore.students=[{id:1}];FirebaseStore.tests=tests;App.state.isAdminLoggedIn=false');
  assert.equal(await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})"),null);
  assert.equal(f.documents.has('tests/'+review.id),false);
  await assert.rejects(f.run('AppData.submitWeeklyReviewRound(id,1,{})'),/찾을 수 없습니다/);
});

test('deleting a preview preserves other deletion markers and does not suppress the actual weekly review', async () => {
  const f=fixture();f.run("FirebaseStore.students[0].deletedWeeklyReviewIds=['older-review']");f.persist();
  const preview=f.plain('build()');preview.id='preview';preview.isPreview=true;
  f.documents.set('tests/preview',preview);f.run(`FirebaseStore.tests.push(${JSON.stringify(preview)})`);
  await f.run("AppData.deleteWeeklyReview('preview')");
  assert.deepEqual(f.documents.get('students/1').deletedWeeklyReviewIds,['older-review','preview']);
  assert.ok(await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})"));
});

test('student, offline, invalid targets, changed ownership and failed deletes preserve existing records', async () => {
  const f=fixture();f.persist();
  const review=await f.run("AppData.createWeeklyReview({studentId:1,monday:'2026-11-02'})");
  f.run(`const id='${review.id}';App.state.isAdminLoggedIn=false`);
  await assert.rejects(f.run('AppData.deleteWeeklyReview(id)'),/관리자/);
  f.run('App.state.isAdminLoggedIn=true;AppData.isFirebaseReady=()=>false');
  await assert.rejects(f.run('AppData.deleteWeeklyReview(id)'),/클라우드/);
  f.run('AppData.isFirebaseReady=()=>true');
  await assert.rejects(f.run("AppData.deleteWeeklyReview('source0')"),/찾을 수 없습니다/);
  f.documents.get('tests/'+review.id).studentId=2;
  await assert.rejects(f.run('AppData.deleteWeeklyReview(id)'),/변경/);
  f.documents.get('tests/'+review.id).studentId=1;
  f.run("window.firebaseFns.runTransaction=async()=>{throw new Error('삭제 실패')}");
  await assert.rejects(f.run('AppData.deleteWeeklyReview(id)'),/삭제 실패/);
  assert.equal(f.documents.has('tests/'+review.id),true);
  assert.equal(f.run('AppData.getTests().some(t=>t.id===id)'),true);
  assert.equal(f.documents.get('students/1').deletedWeeklyReviewIds,undefined);
});

test('actual generic test deletion routes weekly reviews through persistent suppression', async () => {
  const context=vm.createContext({console,Date,Math,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem:()=>{}}});
  const run=code=>vm.runInContext(code,context);
  run(fs.readFileSync(path.join(__dirname,'..','data.js'),'utf8'));
  run("FirebaseStore.tests=[{id:'review',type:'VOCAB_REVIEW',date:'2026-11-07'}];let deleted=null;AppData.deleteWeeklyReview=async id=>{deleted=id};AppData.removeDocument=async()=>{throw new Error('Must use review deletion')}");
  await run("AppData.deleteTest('review')");
  assert.equal(run('deleted'),'review');
});
