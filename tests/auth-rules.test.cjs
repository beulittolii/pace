const {before,after,beforeEach,test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const f=require('firebase/firestore');
f.setLogLevel('silent'); // Expected permission failures are asserted below.
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pace-auth',firestore:{rules:fs.readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();
 await f.setDoc(f.doc(db,'admins','teacher'),{enabled:true});
 await f.setDoc(f.doc(db,'invites','AB12CD'),{code:'AB12CD',status:'unused',createdBy:'teacher',createdAt:f.serverTimestamp()});
});});
function engine(uid){
 const db=env.authenticatedContext(uid,{email:`${uid}@accounts.pace.invalid`}).firestore();
 const auth=new Function('window',fs.readFileSync('auth.js','utf8')+';return window.PaceAuth;')({document:{},crypto:globalThis.crypto});
 auth.raw=f;auth.db=db;auth.auth={currentUser:{uid,email:`${uid}@accounts.pace.invalid`,displayName:'학생'}};
 return {auth,db};
}
test('actual redemption writes one member/profile and consumes the invitation',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');
 const member=(await f.getDoc(f.doc(db,'members','student1'))).data();
 assert.equal(member.inviteCode,'AB12CD');assert.equal((await f.getDoc(f.doc(db,'students',String(member.studentId)))).data().accountUid,'student1');
 assert.equal((await f.getDoc(f.doc(db,'invites','AB12CD'))).data().status,'used');
 await auth.redeem('AB12CD'); // retry after response loss
 assert.equal((await f.getDoc(f.doc(db,'members','student1'))).data().studentId,member.studentId);
});
test('simultaneous redemption allows exactly one account',async()=>{
 const a=engine('student1'),b=engine('student2');
 const outcomes=await Promise.allSettled([a.auth.redeem('AB12CD'),b.auth.redeem('AB12CD')]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 await env.withSecurityRulesDisabled(async c=>assert.equal((await f.getDocs(f.collection(c.firestore(),'members'))).size,1));
});
test('cancelled code and standalone member/profile writes are rejected',async()=>{
 const {auth,db}=engine('student1');
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'invites','AB12CD'),{status:'cancelled'}));
 await assert.rejects(()=>auth.redeem('AB12CD'));
 await assertFails(f.setDoc(f.doc(db,'members','student1'),{uid:'student1',studentId:1000000000001,inviteCode:'AB12CD'}));
 await assertFails(f.setDoc(f.doc(db,'students','1000000000001'),{id:1000000000001,accountUid:'student1'}));
});
test('unregistered accounts cannot enumerate codes, read learning data, or grant admin',async()=>{
 const {db}=engine('student1');
 await assertFails(f.getDocs(f.collection(db,'invites')));
 await assertFails(f.getDocs(f.collection(db,'students')));
 await assertFails(f.setDoc(f.doc(db,'admins','student1'),{enabled:true}));
 await assertFails(f.setDoc(f.doc(db,'invites','AA12BB'),{status:'unused'}));
 await assertFails(f.getDocs(f.collection(db,'academicRecords')));
});
test('teacher issues/cancels codes, but consumed codes cannot be reset',async()=>{
 const db=env.authenticatedContext('teacher').firestore();
 await assertSucceeds(f.setDoc(f.doc(db,'invites','ZZ99YY'),{code:'ZZ99YY',status:'unused',createdBy:'teacher',createdAt:f.serverTimestamp()}));
 await assertFails(f.setDoc(f.doc(db,'invites','AAAAAA'),{code:'AAAAAA',status:'unused',createdBy:'teacher',createdAt:f.serverTimestamp()}));
 await assertSucceeds(f.updateDoc(f.doc(db,'invites','ZZ99YY'),{status:'cancelled'}));
 await engine('student1').auth.redeem('AB12CD');
 await assertFails(f.updateDoc(f.doc(db,'invites','AB12CD'),{status:'unused'}));
 await assertFails(f.deleteDoc(f.doc(db,'invites','AB12CD')));
});
test('members read only own records; client role flags cannot bypass rules',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');
 const id=(await f.getDoc(f.doc(db,'members','student1'))).data().studentId;
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await f.setDoc(f.doc(db,'tests','own'),{studentId:id,type:'VOCAB',status:'SCHEDULED'});await f.setDoc(f.doc(db,'tests','other'),{studentId:42,type:'VOCAB'});});
 await assertSucceeds(f.getDocs(f.query(f.collection(db,'tests'),f.where('studentId','==',id))));
 await assertFails(f.getDocs(f.collection(db,'tests')));
 await assertFails(f.getDoc(f.doc(db,'tests','other')));
 await assertFails(f.updateDoc(f.doc(db,'tests','own'),{studentId:42}));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests','own'),{status:'PASS',score:90}));
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'students',String(id)),{linking:true}));
 await assertFails(f.updateDoc(f.doc(db,'tests','own'),{score:100}));
});
test('academic storage and grammar/weekly writes remain scoped to the student',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');const id=(await f.getDoc(f.doc(db,'members','student1'))).data().studentId;
 await assertSucceeds(f.setDoc(f.doc(db,'academicRecords',`academicSchoolGrades_${id}`),{studentId:id,kind:'academicSchoolGrades',items:[],updatedAt:f.serverTimestamp()}));
 await assertFails(f.setDoc(f.doc(db,'academicRecords','academicSchoolGrades_42'),{studentId:42,kind:'academicSchoolGrades',items:[]}));
 const review={id:`weekly_review_${id}_2026-11-02`,type:'VOCAB_REVIEW',studentId:id,weekStart:'2026-11-02',reviewStage:'LOCKED'};
 await assertSucceeds(f.setDoc(f.doc(db,'tests',review.id),review));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests',review.id),{reviewStage:'READY',questions:[],sourceTestIds:[],assignedDays:5,weekdayCompletion:[],unresolvedCount:0}));
 await env.withSecurityRulesDisabled(c=>f.setDoc(f.doc(c.firestore(),'tests','grammar'),{studentId:id,type:'GRAMMAR',grammarStage:'concept'}));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests','grammar'),{grammarStartedAt:new Date().toISOString(),grammarResults:{},grammarStage:'practice'}));
});

test('only teachers can delete weekly reviews and modify automatic-regeneration suppression',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');
 const id=(await f.getDoc(f.doc(db,'members','student1'))).data().studentId;
 const reviewId=`weekly_review_${id}_2026-11-02`;
 const teacher=env.authenticatedContext('teacher').firestore();
 await assertSucceeds(f.setDoc(f.doc(teacher,'tests',reviewId),{id:reviewId,type:'VOCAB_REVIEW',studentId:id,weekStart:'2026-11-02'}));
 await assertFails(f.deleteDoc(f.doc(db,'tests',reviewId)));
 await assertFails(f.updateDoc(f.doc(db,'students',String(id)),{deletedWeeklyReviewIds:[reviewId]}));
 const batch=f.writeBatch(teacher);
 batch.update(f.doc(teacher,'students',String(id)),{deletedWeeklyReviewIds:[reviewId]});
 batch.delete(f.doc(teacher,'tests',reviewId));
 await assertSucceeds(batch.commit());
 assert.deepEqual((await f.getDoc(f.doc(db,'students',String(id)))).data().deletedWeeklyReviewIds,[reviewId]);
 await assertFails(f.updateDoc(f.doc(db,'students',String(id)),{deletedWeeklyReviewIds:[]}));
});

async function calendarStudent() {
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');
 const id=(await f.getDoc(f.doc(db,'members','student1'))).data().studentId;
 const schedule={id:'calendar-vocab',studentId:id,type:'VOCAB',date:'2026-11-09',title:'배정된 단어',cutoff:80,status:'SCHEDULED',retestStatus:'NONE'};
 await env.withSecurityRulesDisabled(async c=>{
  const admin=c.firestore();
  await f.updateDoc(f.doc(admin,'students',String(id)),{accessMode:'CALENDAR_ONLY'});
  for(const item of [schedule,{...schedule,id:'other-vocab',studentId:42},{...schedule,id:'grammar',type:'GRAMMAR',grammarStage:'concept',grammarResults:{}},{...schedule,id:'text',type:'TEXT_MEMORIZE',allowRetest:true},{...schedule,id:'practice',type:'PRACTICE',allowRetest:true},{...schedule,id:'regular',type:'REGULAR'}]) await f.setDoc(f.doc(admin,'tests',item.id),item);
 });
 return {auth,db,id,schedule};
}

test('calendar-only students can bootstrap, save and update assigned vocabulary results and their schedule status',async()=>{
 const {db,id}=await calendarStudent();
 const ref=f.doc(db,'vocabTestResults','calendar-result');
 await assertSucceeds(f.setDoc(ref,{studentId:id,testId:'calendar-vocab'},{merge:true}));
 await assertSucceeds(f.runTransaction(db,async tx=>{
  const current=await tx.get(ref);
  tx.set(ref,{...current.data(),setId:'set',direction:3,score:100,passed:true,attempts:[{score:100}]});
 }));
 await assertSucceeds(f.updateDoc(ref,{score:90,attempts:[{score:100},{score:90}]}));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests','calendar-vocab'),{status:'PASS',score:'스펠링 90점',retestStatus:'NONE'}));
 assert.equal((await f.getDoc(ref)).data().attempts.length,2);
 // Recover an owner-only initialization document left by an earlier app release.
 await env.withSecurityRulesDisabled(c=>f.setDoc(f.doc(c.firestore(),'vocabTestResults','legacy-stub'),{studentId:id}));
 await assertSucceeds(f.setDoc(f.doc(db,'vocabTestResults','legacy-stub'),{studentId:id,testId:'calendar-vocab'},{merge:true}));
});

test('calendar-only vocabulary exceptions cannot change configuration, other students, or unrelated learning records',async()=>{
 const {db,id}=await calendarStudent();
 const own=f.doc(db,'tests','calendar-vocab');
 for(const patch of [{studentId:42},{type:'GRAMMAR'},{date:'2026-11-10'},{cutoff:0},{allowRetest:true},{grammarResults:{}},{questions:[]}]) await assertFails(f.updateDoc(own,patch));
  for(const testId of ['other-vocab','regular']) await assertFails(f.updateDoc(f.doc(db,'tests',testId),{status:'PASS',score:100}));
 for(const data of [{studentId:42,testId:'other-vocab'},{studentId:id,testId:'other-vocab'},{studentId:id,testId:'grammar'},{studentId:id,testId:'text'},{studentId:id,testId:'missing'},{studentId:id},{studentId:id,testId:null}]) await assertFails(f.setDoc(f.doc(db,'vocabTestResults','blocked'),data));
 const result=f.doc(db,'vocabTestResults','own');
 await assertSucceeds(f.setDoc(result,{studentId:id,testId:'calendar-vocab',score:90}));
 await assertFails(f.updateDoc(result,{studentId:42}));
 await assertFails(f.updateDoc(result,{testId:'other-vocab'}));
 await assertFails(f.deleteDoc(result));
 await assertFails(f.deleteDoc(own));
  await assertFails(f.setDoc(f.doc(db,'textMemorizeResults','blocked'),{studentId:id,testId:'calendar-vocab',score:100}));
 await assertFails(f.setDoc(f.doc(db,'academicRecords',`academicSchoolGrades_${id}`),{studentId:id,kind:'academicSchoolGrades',items:[]}));
  await assertFails(f.setDoc(f.doc(db,'tests',`weekly_review_42_2026-11-09`),{studentId:42,type:'VOCAB_REVIEW',weekStart:'2026-11-09'}));
 await assertFails(f.updateDoc(f.doc(db,'students',String(id)),{accessMode:'FULL'}));
 await env.withSecurityRulesDisabled(c=>f.setDoc(f.doc(c.firestore(),'tests','another-own-vocab'),{studentId:id,type:'VOCAB'}));
 await assertFails(f.updateDoc(result,{testId:'another-own-vocab'}));
 // Calendar-only access must not weaken the linking/account ownership lock.
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'students',String(id)),{linking:true}));
 await assertFails(f.updateDoc(result,{score:100}));
 await assertFails(f.updateDoc(own,{score:100}));
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'students',String(id)),{linking:false,accountUid:'other-user'}));
 await assertFails(f.updateDoc(result,{score:100}));
 await assertFails(f.updateDoc(own,{score:100}));
});

test('English-only students can submit text memorization and practice without granting themselves retests',async()=>{
 const {db,id}=await calendarStudent();
 const result=f.doc(db,'textMemorizeResults','text-result');
 await assertSucceeds(f.setDoc(result,{studentId:id,testId:'text',score:70,passed:false}));
 await assertSucceeds(f.updateDoc(result,{score:100,passed:true}));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests','text'),{status:'PASS',score:'100점',textMemorizeResult:{score:100},allowRetest:false}));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests','practice'),{status:'PASS',score:'90점',retestStatus:'NONE',practiceResult:{score:90},allowRetest:false}));
 for(const testId of ['text','practice']) {
  const ref=f.doc(db,'tests',testId);
  for(const patch of [{allowRetest:true},{studentId:42},{type:'VOCAB'},{date:'2026-11-10'},{cutoff:0},{teacherNote:'changed'},{grammarResults:{}},{questions:[]}]) await assertFails(f.updateDoc(ref,patch));
 }
 for(const data of [{studentId:42,testId:'text'},{studentId:id,testId:'other-vocab'},{studentId:id,testId:'grammar'},{studentId:id,testId:'missing'},{studentId:id},{studentId:id,testId:null}]) await assertFails(f.setDoc(f.doc(db,'textMemorizeResults','blocked'),data));
 await env.withSecurityRulesDisabled(c=>f.setDoc(f.doc(c.firestore(),'tests','another-text'),{studentId:id,type:'TEXT_MEMORIZE'}));
 await assertFails(f.updateDoc(result,{testId:'another-text'}));
 await assertFails(f.updateDoc(result,{studentId:42}));
 await assertFails(f.deleteDoc(result));
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'students',String(id)),{linking:true}));
 await assertFails(f.updateDoc(result,{score:80}));
 await assertFails(f.updateDoc(f.doc(db,'tests','text'),{score:80}));
 await assertFails(f.updateDoc(f.doc(db,'tests','practice'),{score:80}));
});

async function learningStore(db,id) {
 const plain=value=>JSON.parse(JSON.stringify(value));
 const sdk={...f,runTransaction:(database,update)=>f.runTransaction(database,tx=>update({get:ref=>tx.get(ref),set:(ref,data)=>tx.set(ref,plain(data))}))};
 // Keep weekly availability independent of the machine's current date.
 class ReviewDate extends Date { constructor(...args){super(...(args.length?args:['2026-11-14T00:00:00+09:00']));} }
 const context=vm.createContext({console,Date:ReviewDate,Math,setTimeout,clearTimeout,window:{firebaseDB:db,firebaseFns:sdk}});
 const run=code=>vm.runInContext(code,context);
 run(`const FirebaseStore={tests:[],students:[],vocabTestResults:[],vocabSets:[]};
  const LOCAL_CACHE_KEYS={tests:'tests'};function setLocalCache(){}
  const App={state:{isAdminLoggedIn:false,selectedStudentId:${id}},convertKorToEng:v=>v};
  const AppData={isFirebaseReady:()=>true,getTests:()=>FirebaseStore.tests,getVocabTestResults:()=>FirebaseStore.vocabTestResults,getVocabSets:()=>FirebaseStore.vocabSets,refreshCloudScreens(){}};`);
 for(const file of ['grammar_data.js','grammar_store.js','weekly_review_logic.js','weekly_review_store.js']) run(fs.readFileSync(file,'utf8'));
 context.records=(await f.getDocs(f.query(f.collection(db,'tests'),f.where('studentId','==',id)))).docs.map(doc=>({...doc.data(),id:doc.id}));
 run('FirebaseStore.tests=records');
 return {context,run};
}

test('actual English-only text result save updates only the assigned test, not unrelated schedules',async()=>{
 const {db,id}=await calendarStudent();
 const writes=[];
 const sdk={...f,
  getDocs:ref=>f.getDocs(f.query(ref,f.where('studentId','==',id))),
  setDoc:(ref,data)=>{writes.push(ref.path);return f.setDoc(ref,JSON.parse(JSON.stringify(data)));}
 };
 const context=vm.createContext({console,Date,Math,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){}},window:{firebaseDB:db,firebaseFns:sdk}});
 const run=code=>vm.runInContext(code,context);
 run(fs.readFileSync('data.js','utf8'));
 context.records=(await f.getDocs(f.query(f.collection(db,'tests'),f.where('studentId','==',id)))).docs.map(doc=>({...doc.data(),id:doc.id}));
 context.studentId=id;
 run('FirebaseStore.tests=records;AppData.isFirebaseReady=()=>true');
 await assertSucceeds(run("AppData.saveTextMemorizeResult(studentId,'text',{score:100,correct:1,total:1,passed:true})"));
 assert.deepEqual(writes,['tests/text',`textMemorizeResults/tm_${id}_text`]);
 assert.equal((await f.getDoc(f.doc(db,'tests','text'))).data().status,'PASS');
 assert.equal((await f.getDoc(f.doc(db,'tests','regular'))).data().status,'SCHEDULED');
 assert.equal((await f.getDoc(f.doc(db,'textMemorizeResults',`tm_${id}_text`))).data().score,100);
});

test('English-only grammar store transactions can start, submit concept and submit practice',async()=>{
 const {db,id}=await calendarStudent(),store=await learningStore(db,id);
 await assertSucceeds(store.run("AppData.updateGrammarTest('grammar',t=>{t.grammarStartedAt=new Date().toISOString();})"));
 await assertSucceeds(store.run("AppData.updateGrammarTest('grammar',t=>{t.grammarResults.concept={answers:{},waitingGrading:true,score:null,passed:null,cutoffScore:80,completedAt:new Date().toISOString()};t.grammarStage='practice';t.status='SUBMITTED';})"));
 await assertSucceeds(store.run("AppData.updateGrammarTest('grammar',t=>{t.grammarResults.practice=GrammarLogic.gradePractice(GRAMMAR_UNIT,{});t.grammarStage='done';t.status='SUBMITTED';})"));
 const saved=(await f.getDoc(f.doc(db,'tests','grammar'))).data();
 assert.equal(saved.grammarStage,'done');assert.equal(saved.status,'SUBMITTED');
 assert.ok(saved.grammarResults.concept);assert.equal(saved.grammarResults.practice.score,0);
 for(const patch of [{studentId:42},{type:'VOCAB'},{date:'2026-11-10'},{grammarContent:{}},{grammarParts:[]},{grammarLatest:{}},{allowRetest:true},{practiceResult:{}}]) await assertFails(f.updateDoc(f.doc(db,'tests','grammar'),patch));
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'students',String(id)),{linking:true}));
 await assertFails(store.run("AppData.updateGrammarTest('grammar',t=>{t.grammarStage='concept';})"));
});

test('English-only weekly store can create, unlock and submit its own weekly review',async()=>{
 const {db,id}=await calendarStudent(),store=await learningStore(db,id);
 store.context.studentId=id;
 const reviewId=`weekly_review_${id}_2026-11-09`;
 await assertSucceeds(store.run("AppData.createWeeklyReview({studentId,monday:'2026-11-09'})"));
 assert.equal((await f.getDoc(f.doc(db,'tests',reviewId))).data().reviewStage,'LOCKED');
 const words=['apple','banana','cherry','grape','lemon'].map((en,i)=>({en,ko:`뜻${i}`}));
 await env.withSecurityRulesDisabled(async c=>{
  const admin=c.firestore();
  await f.setDoc(f.doc(admin,'vocabSets','set'),{id:'set',words});
  for(let day=0;day<5;day++) {
   const testId=day===0?'calendar-vocab':`day-${day}`;
   await f.setDoc(f.doc(admin,'tests',testId),{id:testId,studentId:id,type:'VOCAB',date:`2026-11-${9+day<10?'0':''}${9+day}`,status:'PASS',vocabSetId:'set'});
   await f.setDoc(f.doc(admin,'vocabTestResults',`result-${day}`),{id:`result-${day}`,studentId:id,testId,direction:2,score:80,completedAt:'2026-11-09T10:00:00Z',questionDetails:[{word:words[0],isCorrect:false}]});
  }
 });
 store.context.tests=(await f.getDocs(f.query(f.collection(db,'tests'),f.where('studentId','==',id)))).docs.map(doc=>doc.data());
 store.context.results=(await f.getDocs(f.query(f.collection(db,'vocabTestResults'),f.where('studentId','==',id)))).docs.map(doc=>doc.data());
 store.context.sets=[{id:'set',words}];
 store.run('FirebaseStore.tests=tests;FirebaseStore.vocabTestResults=results;FirebaseStore.vocabSets=sets');
 await assertSucceeds(store.run("AppData.createWeeklyReview({studentId,monday:'2026-11-09'})"));
 const ready=(await f.getDoc(f.doc(db,'tests',reviewId))).data();
 assert.equal(ready.reviewStage,'READY');assert.ok(ready.questions.length);
 store.context.reviewId=reviewId;
 store.context.answers=Object.fromEntries(ready.questions.map(q=>[q.id,q.mode==='CHOICE'?q.word.ko:q.word.en]));
 await assertSucceeds(store.run('AppData.submitWeeklyReviewRound(reviewId,1,answers)'));
 const submitted=(await f.getDoc(f.doc(db,'tests',reviewId))).data();
 assert.equal(submitted.status,'PASS');assert.equal(submitted.weeklyReviewResult.rounds.length,1);
 for(const patch of [{excludedWeekdays:[0]},{studentId:42},{type:'VOCAB'},{weekStart:'2026-11-02'},{date:'2026-11-10'},{allowRetest:true}]) await assertFails(f.updateDoc(f.doc(db,'tests',reviewId),patch));
 await assertFails(f.getDoc(f.doc(db,'tests','weekly_review_42_2026-11-09')));
 await assertFails(f.getDoc(f.doc(db,'tests','missing')));
 await assertFails(f.setDoc(f.doc(db,'tests','arbitrary'),{studentId:id,type:'VOCAB_REVIEW',weekStart:'2026-11-09'}));
 await assertFails(f.setDoc(f.doc(db,'tests','new-grammar'),{studentId:id,type:'GRAMMAR'}));
 await assertFails(f.deleteDoc(f.doc(db,'tests',reviewId)));
});

test('real offline outbox drains under calendar-only rules and updates the actual calendar schedule',async()=>{
 const {db,id,schedule}=await calendarStudent();
 const profile=(await f.getDoc(f.doc(db,'students',String(id)))).data();
 const storage=new Map();
 // Firestore rejects objects from a different VM realm; normalize only at the test boundary.
 const plain=value=>JSON.parse(JSON.stringify(value));
 const sdk={...f,setDoc:(ref,data,options)=>f.setDoc(ref,plain(data),options),runTransaction:(database,update)=>f.runTransaction(database,tx=>update({get:ref=>tx.get(ref),set:(ref,data)=>tx.set(ref,plain(data))}))};
 const context=vm.createContext({console:{...console,log(){}},Date,Math,setTimeout,clearTimeout,setInterval(){},crypto:globalThis.crypto,navigator:{onLine:false},
  document:{getElementById:()=>null,addEventListener(){}},localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  window:{firebaseDB:db,firebaseFns:sdk,PaceAuth:{auth:{currentUser:{uid:'student1'}},member:{studentId:id},admin:false,raw:sdk,db},addEventListener(){}}
 });
 const run=code=>vm.runInContext(code,context);
 for(const file of ['data.js','app.js','vocab-sync.js']) run(fs.readFileSync(file,'utf8'));
 context.profile=profile;context.schedule=schedule;
 run('FirebaseStore.students=[profile];FirebaseStore.tests=[schedule];FirebaseStore.vocabTestResults=[];AppData.isFirebaseReady=()=>true');
 for(const direction of [2,3,4]) {
  context.result={studentId:id,testId:schedule.id,setId:'set',direction,score:100,total:1,correctCount:1,passed:true,waitingGrading:false,gradedByAdmin:false,startedAt:'2026-11-09T10:00:00Z',completedAt:'2026-11-09T10:01:00Z',questionDetails:[{word:{en:'apple',ko:'사과'},isCorrect:true}]};
  await run('AppData.saveVocabTestResult(result)');
 }
 assert.equal(storage.size,3);
 run('navigator.onLine=true');await run('AppData.flushPendingVocabResults()');
 assert.equal(storage.size,0,'all results and calendar statuses must reach Firestore before clearing the outbox');
 await run('AppData.flushPendingVocabResults()');
 const saved=(await f.getDocs(f.query(f.collection(db,'vocabTestResults'),f.where('studentId','==',id)))).docs;
 assert.equal(saved.length,3);
 assert.ok(saved.every(doc=>doc.data().score===100&&doc.data().attempts.length===1));
 const updated=(await f.getDoc(f.doc(db,'tests',schedule.id))).data();
 assert.equal(updated.status,'PASS');assert.match(updated.score,/100점/);assert.equal(updated.cutoff,80);
 assert.equal((await f.getDoc(f.doc(db,'students',String(id)))).data().accessMode,'CALENDAR_ONLY');
});
