const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateCode, validateAccount, normalizeCode, normalizeId } = require('../auth.js');
test('invites are six uppercase letters/digits and always include both', () => {
  const codes = new Set();
  for (let i=0;i<10000;i++) {
    const code = generateCode();
    assert.match(code,/^[A-Z0-9]{6}$/); assert.match(code,/[A-Z]/); assert.match(code,/[0-9]/);
    codes.add(code);
  }
  assert.ok(codes.size > 9950);
});
test('account validation and normalization', () => {
  assert.equal(normalizeCode(' a1b2c3 '),'A1B2C3'); assert.equal(normalizeId(' Student_1 '),'student_1');
  const account = {name:'학생',loginId:'student_1',password:'my-password',confirmation:'my-password'};
  assert.doesNotThrow(() => validateAccount(account));
  for (const change of [{name:''},{loginId:'ab'},{loginId:'ADMIN'},{password:'1234'},{confirmation:'different'}]) assert.throws(() => validateAccount({...account,...change}));
});

function passwordFixture() {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const controls = Array.from({length:5}, () => ({disabled:false}));
  const fields = {
    currentPassword:{value:'old-password'}, newPassword:{value:'new-password'},
    confirmNewPassword:{value:'new-password'}, passwordSettingsMessage:{textContent:''},
    passwordSettingsForm:{setAttribute(){},removeAttribute(){},querySelectorAll(){return controls;},reset(){for(const key of ['currentPassword','newPassword','confirmNewPassword']) fields[key].value='';}},
    passwordSettingsDialog:{close(){this.closed=true;}}
  };
  const calls = [];
  const window = {document:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../auth.js'),'utf8'), {
    window, document:{getElementById:id=>fields[id]}, App:{toast:(...args)=>calls.push(['toast',...args])}
  });
  const auth = window.PaceAuth;
  auth.ready = async()=>{};
  auth.auth = {currentUser:{uid:'student1',email:'student1@accounts.pace.invalid'}};
  auth.f = {
    EmailAuthProvider:{credential:(email,password)=>({email,password})},
    reauthenticateWithCredential:async(user,credential)=>calls.push(['reauth',user.uid,credential]),
    updatePassword:async(user,password)=>calls.push(['update',user.uid,password])
  };
  return {auth,fields,calls,controls};
}

function loginFixture(remember = false) {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const icon = {className:'fa-solid fa-eye'};
  const fields = {
    studentLoginId:{value:' Student_1 '}, studentLoginPassword:{value:'my-password',type:'password'},
    rememberLogin:{checked:remember}, loginError:{textContent:'',classList:{add(){},remove(){}}},
    loginPasswordToggle:{attributes:{},setAttribute(key,value){this.attributes[key]=value;},querySelector(){return icon;}}
  };
  const attributes = {};
  const label = {textContent:'로그인'};
  const loginIcon = {className:'fa-solid fa-right-to-bracket'};
  const button = {disabled:false, setAttribute(k,v){attributes[k]=v;},querySelector(s){return s==='span' ? label : loginIcon;}};
  const form = {setAttribute(k,v){attributes[k]=v;},removeAttribute(k){delete attributes[k];}};
  const visuals = [];
  const window = {document:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../auth.js'),'utf8'), {
    window, document:{getElementById:id=>fields[id],querySelector:s=>s.endsWith('form')?form:button},
    App:{showLoadingSkeleton:role=>visuals.push(role || 'login'),finishInitialLoading:()=>visuals.push('hide'),showLanding:async()=>visuals.push('landing')}
  });
  const auth = window.PaceAuth, calls = [];
  auth.ready = async()=>{};
  auth.auth = {currentUser:null};
  auth.f = {
    browserLocalPersistence:'local',inMemoryPersistence:'memory',browserSessionPersistence:'session',
    setPersistence:async(a,p)=>calls.push(['persistence',p]),
    signInWithEmailAndPassword:async(a,email,password)=>{calls.push(['login',email,password]);a.currentUser={uid:'student1'};}
  };
  const realEnter = auth.enter.bind(auth);
  auth.enter = async()=>calls.push(['enter']);
  return {auth,fields,icon,button,calls,label,loginIcon,attributes,visuals,realEnter};
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

function loadingFixture(role = 'student') {
  const fixture = loginFixture();
  const {auth,realEnter,visuals} = fixture;
  auth.enter = realEnter;
  auth.clearData = ()=>{auth.admin=false;auth.member=null;};
  auth.identity = async()=>{auth.admin=role==='admin';auth.member=role==='student'?{studentId:1}:null;};
  auth.loadData = async()=>{};
  auth.home = ()=>visuals.push('home');
  auth.open = step=>visuals.push(`signup-${step}`);
  auth.close = ()=>{};
  auth.watchMembership = ()=>{};
  return fixture;
}

test('authentication shows button loading before the data skeleton and rejects duplicate submissions', async()=>{
  const {auth,button,label,loginIcon,attributes,visuals,calls}=loadingFixture();
  const signing=deferred(), data=deferred();
  auth.f.signInWithEmailAndPassword=async()=>{calls.push(['login']);await signing.promise;auth.auth.currentUser={uid:'student1'};};
  auth.loadData=()=>data.promise;
  const pending=auth.login();
  await new Promise(setImmediate);
  assert.equal(button.disabled,true);
  assert.equal(label.textContent,'로그인 중…');
  assert.equal(attributes['aria-busy'],'true');
  assert.match(loginIcon.className,/pace-login-spinner/);
  assert.deepEqual(visuals,[]);
  await auth.login();
  assert.equal(calls.filter(c=>c[0]==='login').length,1);
  signing.resolve();await new Promise(setImmediate);
  assert.deepEqual(visuals,['login','student']);
  data.resolve();await pending;
  assert.deepEqual(visuals,['login','student','home','hide']);
  assert.equal(button.disabled,false);
  assert.equal(label.textContent,'로그인');
  assert.equal(attributes['aria-busy'],undefined);
  assert.equal(loginIcon.className,'fa-solid fa-right-to-bracket');
});

test('failed authentication restores button without showing the skeleton and permits retry', async()=>{
  const {auth,fields,label,button,visuals}=loadingFixture();
  const signIn=auth.f.signInWithEmailAndPassword;
  auth.f.signInWithEmailAndPassword=async()=>{throw {code:'auth/invalid-credential'};};
  await auth.login();
  assert.deepEqual(visuals,[]);
  assert.match(fields.loginError.textContent,/아이디 또는 비밀번호/);
  assert.equal(button.disabled,false);assert.equal(label.textContent,'로그인');
  auth.f.signInWithEmailAndPassword=signIn;
  await auth.login();
  assert.deepEqual(visuals,['login','student','home','hide']);
});

test('data failure closes the skeleton, restores landing and allows a successful retry', async()=>{
  const {auth,fields,button,visuals}=loadingFixture();
  auth.loadData=async()=>{throw Error('데이터 연결 실패');};
  await auth.login();
  assert.deepEqual(visuals,['login','student','hide','landing']);
  assert.equal(fields.loginError.textContent,'데이터 연결 실패');
  assert.equal(auth.member,null);assert.equal(button.disabled,false);
  auth.loadData=async()=>{};
  await auth.login();
  assert.deepEqual(visuals.slice(4),['login','student','home','hide']);
});

test('admin, automatic sign-in and incomplete membership leave no skeleton over the destination', async()=>{
  const admin=loadingFixture('admin');
  await admin.auth.enter();
  assert.deepEqual(admin.visuals,['login','admin','home','hide']);
  const incomplete=loadingFixture('none');
  await incomplete.auth.login();
  assert.deepEqual(incomplete.visuals,['login','signup-2','hide']);
  const signup=loadingFixture();
  await signup.auth.enter(false);
  assert.deepEqual(signup.visuals,[]);
});

test('unchecked auto-login uses memory only; checked auto-login uses persistent local storage', async()=>{
  for (const remember of [false,true]) {
    const {auth,fields,button,calls}=loginFixture(remember);
    await auth.login();
    assert.deepEqual(calls,[['persistence',remember?'local':'memory'],['login','student_1@accounts.pace.invalid','my-password'],['enter']]);
    assert.equal(fields.studentLoginPassword.value,'');
    assert.equal(fields.studentLoginPassword.type,'password');
    assert.equal(button.disabled,false);
    assert.equal(auth.busy,false);
  }
});

test('password eye toggles masking, accessible label and pressed state without changing the password', ()=>{
  const {auth,fields,icon}=loginFixture();
  auth.toggleLoginPassword();
  assert.equal(fields.studentLoginPassword.type,'text');
  assert.equal(fields.studentLoginPassword.value,'my-password');
  assert.equal(fields.loginPasswordToggle.attributes['aria-label'],'비밀번호 숨기기');
  assert.equal(fields.loginPasswordToggle.attributes['aria-pressed'],'true');
  assert.equal(icon.className,'fa-solid fa-eye-slash');
  auth.toggleLoginPassword();
  assert.equal(fields.studentLoginPassword.type,'password');
  assert.equal(fields.studentLoginPassword.value,'my-password');
  assert.equal(fields.loginPasswordToggle.attributes['aria-label'],'비밀번호 표시');
  assert.equal(fields.loginPasswordToggle.attributes['aria-pressed'],'false');
  assert.equal(icon.className,'fa-solid fa-eye');
});

test('successful login hides a revealed password and clears it', async()=>{
  const {auth,fields}=loginFixture();
  auth.toggleLoginPassword();
  await auth.login();
  assert.equal(fields.studentLoginPassword.type,'password');
  assert.equal(fields.studentLoginPassword.value,'');
  assert.equal(fields.loginPasswordToggle.attributes['aria-pressed'],'false');
});

test('persistence failures cannot sign in with an unintended remembered session', async()=>{
  const {auth,fields,calls,button}=loginFixture();
  auth.f.setPersistence=async()=>{throw Error('persistence unavailable');};
  await auth.login();
  assert.equal(calls.length,0);
  assert.equal(fields.loginError.textContent,'persistence unavailable');
  assert.equal(button.disabled,false);
  assert.equal(auth.busy,false);
});

test('password changes reauthenticate the current account before updating and clear secrets', async()=>{
  const {auth,fields,calls,controls}=passwordFixture();
  await auth.changePassword();
  assert.deepEqual(calls.map(c=>c[0]),['reauth','update','toast']);
  assert.equal(calls[0][2].password,'old-password');
  assert.equal(calls[1][2],'new-password');
  assert.equal(fields.passwordSettingsDialog.closed,true);
  assert.equal(fields.currentPassword.value,'');
  assert.ok(controls.every(c=>!c.disabled));
});

test('invalid new passwords never call authentication', async()=>{
  for(const change of [{currentPassword:''},{newPassword:'short'},{confirmNewPassword:'different'},{newPassword:'old-password',confirmNewPassword:'old-password'}]) {
    const {auth,fields,calls}=passwordFixture();
    for(const [key,value] of Object.entries(change)) fields[key].value=value;
    await auth.changePassword();
    assert.equal(calls.length,0);
    assert.ok(fields.passwordSettingsMessage.textContent);
  }
});

test('failed reauthentication keeps dialog open and does not update the password', async()=>{
  const {auth,fields,calls,controls}=passwordFixture();
  auth.f.reauthenticateWithCredential=async()=>{throw {code:'auth/invalid-credential'};};
  await auth.changePassword();
  assert.equal(calls.length,0);
  assert.match(fields.passwordSettingsMessage.textContent,/현재 비밀번호/);
  assert.equal(fields.passwordSettingsDialog.closed,undefined);
  assert.ok(controls.every(c=>!c.disabled));
  assert.equal(auth.passwordBusy,false);
});

test('account changes during reauthentication cannot update a different account', async()=>{
  const {auth,fields,calls}=passwordFixture();
  auth.f.reauthenticateWithCredential=async()=>{auth.auth.currentUser={uid:'other'};};
  await auth.changePassword();
  assert.equal(calls.length,0);
  assert.match(fields.passwordSettingsMessage.textContent,/로그인 상태/);
});

test('double submission cannot send duplicate password changes', async()=>{
  const {auth,calls}=passwordFixture();
  let resume;
  auth.f.reauthenticateWithCredential=()=>new Promise(resolve=>{resume=resolve;});
  const pending=auth.changePassword();
  await Promise.resolve();
  await auth.changePassword();
  resume(); await pending;
  assert.equal(calls.filter(c=>c[0]==='update').length,1);
});
