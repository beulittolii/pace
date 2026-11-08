const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const result=(time='2026-11-08T10:00:00.000Z')=>({studentId:1,testId:'test1',setId:'set1',direction:3,score:100,total:1,correctCount:1,passed:true,startedAt:time,completedAt:time,questionDetails:[{word:{en:'apple',ko:'사과'},isCorrect:true}]});
function fixture(storage=new Map(), docs=new Map()) {
  const events={}, schedules=[];
  let serial=0;
  const context=vm.createContext({console:{log(){},warn(){}},Date,Math,setTimeout,clearTimeout,crypto:{randomUUID:()=>String(++serial)+'-'+Math.random()},setInterval(){},navigator:{onLine:false},localStorage:{
    get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)
  },document:{getElementById:()=>null,addEventListener:(e,f)=>events[e]=f}});
  const run=code=>vm.runInContext(code,context);
  run(fs.readFileSync(path.join(__dirname,'../data.js'),'utf8'));
  const auth={auth:{currentUser:{uid:'alice'}},member:{studentId:1},db:{},raw:{
    doc:(_,collection,id)=>collection+'/'+id,
    getDoc:async key=>({exists:()=>docs.has(key),data:()=>docs.get(key)}),
    setDoc:async(key,data,options)=>docs.set(key,options?.merge?{...docs.get(key),...data}:data),
    runTransaction:async(_,callback)=>{
      const writes=[];
      const output=await callback({get:async key=>({exists:()=>docs.has(key),data:()=>docs.get(key)}),set:(key,data)=>writes.push([key,data])});
      writes.forEach(([key,data])=>docs.set(key,JSON.parse(JSON.stringify(data))));
      return output;
    }
  }};
  context.window={PaceAuth:auth,addEventListener:(e,f)=>events[e]=f};
  context.App={updateVocabScheduleStatus:async id=>schedules.push(id)};
  run(fs.readFileSync(path.join(__dirname,'../vocab-sync.js'),'utf8'));
  run(`FirebaseStore.vocabTestResults=[]; FirebaseStore.tests=[]; FirebaseStore.students=[{id:1,accountUid:'alice',accessMode:'FULL'}];`);
  docs.set('tests/test1',{id:'test1',studentId:1,type:'VOCAB'});
  return {run,storage,docs,auth,context,events,schedules,save:async r=>{context.input=r;return run('AppData.saveVocabTestResult(input)');},flush:async()=>{context.navigator.onLine=true;await run('AppData.flushPendingVocabResults()');}};
}
test('offline completion is durable and survives a fresh app instance',async()=>{
  const a=fixture();await a.save(result());
  assert.equal(a.storage.size,1);assert.equal(a.docs.size,1);
  const b=fixture(a.storage,a.docs);
  assert.equal(b.run('AppData.getVocabTestResults()[0].score'),100);
  assert.equal(b.run('AppData.getVocabTestResults()[0].questionDetails[0].word.en'),'apple');
  await b.flush();assert.equal(b.storage.size,0);
  assert.equal(b.docs.get('vocabTestResults/1_set1_3_test1').score,100);
  assert.deepEqual(b.schedules,['test1']);
});
test('failed uploads retain durable results and retry without duplicate attempts',async()=>{
  const f=fixture();await f.save(result());
  const original=f.auth.raw.runTransaction;
  f.auth.raw.runTransaction=async()=>{throw Error('permission denied');};
  await f.flush();assert.equal(f.storage.size,1);
  f.auth.raw.runTransaction=original;
  f.context.App.updateVocabScheduleStatus=async()=>{throw Error('schedule offline');};
  await f.flush();assert.equal(f.storage.size,1);
  f.context.App.updateVocabScheduleStatus=async()=>{};
  await f.flush();assert.equal(f.storage.size,0);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').attempts.length,1);
});
test('pending records are isolated by authenticated account and survive logout cache clearing',async()=>{
  const f=fixture();await f.save(result());
  f.auth.auth.currentUser={uid:'bob'};f.auth.member={studentId:2};
  f.run('FirebaseStore.vocabTestResults=[]');
  assert.equal(f.run('AppData.getVocabTestResults().length'),0);
  await f.flush();assert.equal(f.storage.size,1);
  f.auth.auth.currentUser={uid:'alice'};f.auth.member={studentId:1};
  await f.flush();assert.equal(f.storage.size,0);
});
test('server snapshots cannot hide pending answers; multiple rounds merge idempotently',async()=>{
  const f=fixture();await f.save(result());
  f.run('FirebaseStore.vocabTestResults=[]');
  await f.save({...result('2026-11-08T11:00:00.000Z'),score:80});
  assert.equal(f.run('AppData.getVocabTestResults()[0].attempts.length'),2);
  await f.flush();assert.equal(f.storage.size,0);
  const saved=f.docs.get('vocabTestResults/1_set1_3_test1');
  assert.equal(saved.attempts.length,2);assert.equal(saved.score,80);
});
test('upload keeps a newer attempt queued while an older write is in flight',async()=>{
  const f=fixture();await f.save(result());
  const original=f.auth.raw.runTransaction;
  let release,started;
  const entered=new Promise(r=>started=r);
  f.auth.raw.runTransaction=async(...args)=>{started();await new Promise(r=>release=r);return original(...args);};
  const pending=f.flush();await entered;
  await f.save({...result('2026-11-08T11:00:00.000Z'),score:90});
  release();await pending;
  assert.equal(f.storage.size,1);
  f.auth.raw.runTransaction=original;await f.flush();
  assert.equal(f.storage.size,0);assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').score,90);
});
test('deleted schedules never resurrect as a side effect of retry',async()=>{
  const f=fixture();await f.save(result());f.docs.delete('tests/test1');
  await f.flush();assert.equal(f.storage.size,1);assert.equal(f.docs.size,0);
});
test('storage quota failures reject instead of pretending results were saved',async()=>{
  const f=fixture();f.context.localStorage.setItem=()=>{throw Error('quota exceeded');};
  await assert.rejects(f.save(result()),/quota/);
  assert.equal(f.storage.size,0);
});
test('later server attempts are not overwritten by an older offline completion',async()=>{
  const f=fixture();await f.save(result());
  const remote={...result('2026-11-09T10:00:00.000Z'),score:70,attempts:[{...result('2026-11-09T10:00:00.000Z'),score:70}]};
  f.docs.set('vocabTestResults/1_set1_3_test1',remote);
  await f.flush();const saved=f.docs.get('vocabTestResults/1_set1_3_test1');
  assert.equal(saved.score,70);assert.equal(saved.attempts.length,2);
});
test('online event restores signed-in profile after offline reload before syncing',async()=>{
  const f=fixture();await f.save(result());f.auth.member=null;
  let restored=false;
  f.auth.enter=async()=>{restored=true;f.auth.member={studentId:1};};
  f.context.navigator.onLine=true;f.events.online();
  await new Promise(r=>setTimeout(r,15));
  assert.equal(restored,true);assert.equal(f.storage.size,0);
});

test('first upload works when deployed rules deny reading a nonexistent result',async()=>{
  const f=fixture();await f.save(result());
  const base=f.auth.raw.runTransaction;
  f.auth.raw.runTransaction=async(db,callback)=>base(db,tx=>callback({
    ...tx,get:async ref=>{
      if(ref.startsWith('vocabTestResults/')&&!f.docs.has(ref)) throw {code:'permission-denied'};
      return tx.get(ref);
    }
  }));
  await f.flush();
  assert.equal(f.storage.size,0);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').score,100);
});
test('ownership bootstrap preserves existing server grades and history',async()=>{
  const f=fixture();await f.save(result());
  const remote={...result('2026-11-09T10:00:00.000Z'),score:55,gradedByAdmin:true};
  f.docs.set('vocabTestResults/1_set1_3_test1',remote);
  f.auth.raw.runTransaction=async()=>{throw {code:'unavailable'};};
  await f.flush();
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').score,55);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').gradedByAdmin,true);
  assert.equal(f.storage.size,1);
});
test('one deleted schedule does not block other results waiting to sync',async()=>{
  const f=fixture();await f.save(result());f.docs.delete('tests/test1');
  f.docs.set('tests/test2',{id:'test2',studentId:1,type:'VOCAB'});
  await f.save({...result(),testId:'test2'});
  await f.flush();
  assert.equal(f.storage.size,1);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test2').score,100);
});
test('owner-only initialization records do not appear as completed results',()=>{
  const f=fixture();f.run('FirebaseStore.vocabTestResults=[{studentId:1,id:"pending"}]');
  assert.equal(f.run('AppData.getVocabTestResults().length'),0);
});

test('calendar-only students sync offline assigned vocabulary results when the online event fires',async()=>{
  const f=fixture();f.run("FirebaseStore.students[0].accessMode='CALENDAR_ONLY'");
  await f.save(result());assert.equal(f.storage.size,1);
  f.context.navigator.onLine=true;f.events.online();
  await f.run('AppData.flushPendingVocabResults()');
  assert.equal(f.storage.size,0);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').score,100);
  assert.deepEqual(f.schedules,['test1']);
  assert.equal(f.run('FirebaseStore.students[0].accessMode'),'CALENDAR_ONLY');
});

test('calendar-only ownership bootstrap includes the schedule without overwriting existing grades',async()=>{
  const f=fixture();f.run("FirebaseStore.students[0].accessMode='CALENDAR_ONLY'");await f.save(result());
  f.docs.set('vocabTestResults/1_set1_3_test1',{...result('2026-11-09T10:00:00.000Z'),score:55,gradedByAdmin:true});
  const original=f.auth.raw.setDoc;
  let bootstrap;
  f.auth.raw.setDoc=async(ref,data,options)=>{
    bootstrap=JSON.parse(JSON.stringify(data));
    if(!data.testId) throw {code:'permission-denied'};
    return original(ref,data,options);
  };
  await f.flush();
  assert.deepEqual(bootstrap,{studentId:1,testId:'test1'});
  assert.equal(f.storage.size,0);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').score,55);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').gradedByAdmin,true);
});

test('calendar-only queues survive old deployed rules until permissions are updated',async()=>{
  const f=fixture();f.run("FirebaseStore.students[0].accessMode='CALENDAR_ONLY'");await f.save(result());
  const original=f.auth.raw.setDoc;
  f.auth.raw.setDoc=async()=>{throw {code:'permission-denied'};};
  await f.flush();assert.equal(f.storage.size,1);
  f.auth.raw.setDoc=original;
  await f.flush();assert.equal(f.storage.size,0);
  assert.equal(f.docs.get('vocabTestResults/1_set1_3_test1').attempts.length,1);
});

test('calendar-only sync still blocks unassigned results, linking profiles and mismatched accounts',async()=>{
  for(const setup of ["input.testId=null","FirebaseStore.students[0].linking=true","FirebaseStore.students[0].accountUid='other'"]) {
    const f=fixture();f.run("FirebaseStore.students[0].accessMode='CALENDAR_ONLY'");
    f.context.input=result();f.run(setup);
    await f.run('AppData.saveVocabTestResult(input)');
    await f.flush();
    assert.equal(f.storage.size,1);
    assert.equal([...f.docs.keys()].some(key=>key.startsWith('vocabTestResults/')),false);
    assert.deepEqual(f.schedules,[]);
  }
});
