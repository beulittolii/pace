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

function profileFixture() {
  const vm = require('node:vm'), fs = require('node:fs');
  const calls = [], controls = [{disabled:false},{disabled:false}];
  const fields = {
    learningGoal:{value:'매일 단어 30개',focus(){calls.push(['focus','goal']);}},
    currentPassword:{focus(){calls.push(['focus','password']);}},
    goalSettingsMessage:{textContent:''},passwordSettingsMessage:{textContent:''},
    passwordSettingsDialog:{open:false,classList:{toggle(){}},showModal(){this.open=true;},close(){this.open=false;}},
  };
  for (const name of ['goal','university','password','examMode']) {
    fields[`${name}SettingsTab`] = {setAttribute(key,value){this[key]=value;},focus(){calls.push(['tab',name]);}};
    fields[`${name}SettingsForm`] = {hidden:false,setAttribute(){},removeAttribute(){},querySelectorAll(){return controls;},reset(){calls.push(['reset',name]);}};
  }
  const student = {id:1,target:'기존 목표',accountUid:'student1'};
  const store = {students:[student]};
  const app = {toast:(...args)=>calls.push(['toast',...args])};
  const data = {getStudentById:id=>store.students.find(s=>s.id===id),refreshCloudScreens:()=>calls.push(['refresh'])};
  const window = {document:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../auth.js'),'utf8'), {
    window,document:{getElementById:id=>fields[id],activeElement:{focus(){calls.push(['opener']);}}},
    App:app,AppData:data,FirebaseStore:store,AcademicManager:{prepareTargetUnivEditor:id=>calls.push(['university',id])}
  });
  const auth = window.PaceAuth;
  auth.ready = async()=>{};
  auth.auth = {currentUser:{uid:'student1'}};
  auth.member = {studentId:1};
  auth.ref = (collection,id)=>`${collection}/${id}`;
  auth.raw = {updateDoc:async(ref,patch)=>calls.push(['write',ref,{...patch}])};
  return {auth,fields,calls,controls,student,app,data};
}

test('profile opens on goals, supports keyboard tabs, and preserves goals but clears hidden passwords',()=>{
  const {auth,fields,calls}=profileFixture();
  auth.openProfileSettings();
  assert.equal(fields.learningGoal.value,'기존 목표');
  assert.equal(fields.goalSettingsForm.hidden,false);
  assert.equal(fields.passwordSettingsForm.hidden,true);
  assert.equal(fields.goalSettingsTab['aria-selected'],'true');
  assert.equal(fields.passwordSettingsTab.tabIndex,-1);
  assert.deepEqual(calls.at(-1),['focus','goal']);
  fields.learningGoal.value='작성 중';
  auth.profileTabKeydown({key:'ArrowRight',preventDefault(){}},'goal');
  assert.equal(fields.universitySettingsForm.hidden,false);
  assert.equal(fields.passwordSettingsForm.hidden,true);
  auth.profileTabKeydown({key:'ArrowRight',preventDefault(){}},'university');
  assert.equal(fields.passwordSettingsForm.hidden,false);
  assert.equal(fields.learningGoal.value,'작성 중');
  auth.profileTabKeydown({key:'Home',preventDefault(){}},'password');
  assert.equal(fields.passwordSettingsForm.hidden,true);
  assert.deepEqual(calls.at(-2),['reset','password']);
  auth.closePasswordSettings();
  auth.openPasswordSettings();
  assert.equal(fields.passwordSettingsForm.hidden,false);
  assert.deepEqual(calls.at(-1),['focus','password']);
});

test('goal saves only a trimmed target, refreshes the home and supports clearing',async()=>{
  for(const value of ['  매일 단어 30개  ','   ']) {
    const {auth,fields,calls,student,controls}=profileFixture();
    fields.learningGoal.value=value;
    await auth.saveGoal();
    assert.deepEqual(calls[0],['write','students/1',{target:value.trim()}]);
    assert.equal(student.target,value.trim());
    assert.ok(calls.some(c=>c[0]==='refresh'));
    assert.equal(fields.passwordSettingsDialog.open,false);
    assert.ok(controls.every(c=>!c.disabled));
  }
});

test('invalid, unlinked or failed goal writes preserve the existing profile and show an error',async()=>{
  for(const reason of ['long','missing','owner','linking','network']) {
    const {auth,fields,calls,student}=profileFixture();
    fields.passwordSettingsDialog.open=true;
    if(reason==='long') fields.learningGoal.value='a'.repeat(201);
    if(reason==='missing') auth.member=null;
    if(reason==='owner') student.accountUid='other';
    if(reason==='linking') student.linking=true;
    if(reason==='network') auth.raw.updateDoc=async()=>{throw {code:'auth/network-request-failed'};};
    await auth.saveGoal();
    assert.equal(student.target,'기존 목표');
    assert.ok(fields.goalSettingsMessage.textContent);
    assert.equal(fields.passwordSettingsDialog.open,true);
    assert.ok(!calls.some(c=>c[0]==='refresh'||c[0]==='write'));
  }
});

test('pending goal writes block duplicate saves, tab changes and closing; changed sessions cannot update the cache',async()=>{
  const {auth,fields,student,calls}=profileFixture(), pending=deferred();
  auth.openProfileSettings();
  auth.raw.updateDoc=async()=>{calls.push(['write']);await pending.promise;};
  const saving=auth.saveGoal();
  await new Promise(setImmediate);
  await auth.saveGoal();
  auth.switchProfileTab('password');auth.closePasswordSettings();
  assert.equal(fields.passwordSettingsDialog.open,true);
  assert.equal(fields.passwordSettingsForm.hidden,true);
  assert.equal(calls.filter(c=>c[0]==='write').length,1);
  auth.auth.currentUser={uid:'other'};
  pending.resolve();await saving;
  assert.equal(student.target,'기존 목표');
  assert.match(fields.goalSettingsMessage.textContent,/로그인 상태/);
});

test('home renders escaped learning goals separately from university goals and hides cleared goals',()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  const {app,student,data}=profileFixture(),banner={innerHTML:''};
  Object.assign(app,{state:{isStudentLoggedIn:true,selectedStudentId:1},escapeHtml:value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),getTodayDateString:()=> '2026-11-10',grammarStatistics:()=>({total:0,passed:0})});
  data.getTestsByStudentId=()=>[];
  student.name='학생';student.target='<img src=x>\n매일 공부';
  vm.runInNewContext(fs.readFileSync(require.resolve('../pace.js'),'utf8'),{App:app,AppData:data,document:{getElementById:()=>banner},WeeklyReviewLogic:{monday:()=> '2026-11-09'},AcademicManager:{getTargetUnivs:()=>({1:[{rank:1,name:'목표 대학',major:'학과'}]})}});
  app.renderPaceHome();
  assert.match(banner.innerHTML,/나의 목표/);
  assert.match(banner.innerHTML,/&lt;img src=x&gt;\n매일 공부/);
  assert.match(banner.innerHTML,/목표 대학 · 학과/);
  assert.doesNotMatch(banner.innerHTML,/<img/);
  student.target='';app.renderPaceHome();
  assert.doesNotMatch(banner.innerHTML,/나의 목표/);
  assert.doesNotMatch(banner.innerHTML,/목표 수정|학습 목표 설정|목표 대학 설정|openProfileSettings|openTargetUnivModal/);
});

test('university saves block profile navigation and other profile submissions',async()=>{
  const {auth,fields,calls}=profileFixture();
  auth.openProfileSettings('university');
  auth.universityBusy=true;
  auth.switchProfileTab('password');auth.closePasswordSettings();
  await auth.saveGoal();await auth.changePassword();
  assert.equal(fields.universitySettingsForm.hidden,false);
  assert.equal(fields.passwordSettingsForm.hidden,true);
  assert.equal(fields.passwordSettingsDialog.open,true);
  assert.ok(!calls.some(c=>c[0]==='write'));
});

function universityFixture() {
  const fs=require('node:fs'),vm=require('node:vm');
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const start=html.indexOf('  openTargetUnivModal(studentId');
  const end=html.indexOf('  getAdminSelectedStudentId()',start);
  const fields={},calls=[],controls=[{disabled:false},{disabled:false}];
  const classes=()=>({add(){},remove(){},contains:()=>true});
  fields.targetUnivSettingsMessage={textContent:''};
  fields.formTargetUnivStudentId={value:'1'};
  fields.formTargetUnivStudentSelectWrap={classList:classes()};
  fields.formTargetUnivStudentSelect={value:'1',setAttribute(){}};
  fields.targetUnivEditorForm={reset(){calls.push(['reset']);},setAttribute(){},removeAttribute(){},querySelectorAll:selector=>selector==='input[id], select[id]'?[]:controls};
  for(const name of ['profileUniversityEditor','adminUniversityEditor']) fields[name]={appendChild:form=>calls.push(['mount',name,form])};
  fields.passwordSettingsDialog={open:true};
  fields.academicTargetUnivModal={classList:classes(),querySelector:()=>({classList:classes()})};
  for(const rank of [1,2,3]) {
    fields[`targetUniv${rank}Card`]={open:false};
    fields[`targetUniv${rank}Summary`]={textContent:''};
    fields[`targetUniv${rank}Select`]={value:'',options:[{value:'서울대학교'}],setAttribute(){}};
    for(const key of ['Name','Major','Type','Grade','Min']) fields[`targetUniv${rank}${key}`]={value:'',focus(){calls.push(['focus',rank,key]);}};
    fields[`targetUniv${rank}Type`].value='학생부종합';
  }
  fields.targetUniv1Name.value='서울대학교';fields.targetUniv1Major.value='컴퓨터공학부';
  const auth={member:{studentId:1},auth:{currentUser:{uid:'student1'}},generation:1,ready:async()=>{},error:e=>e.message,
    saveAcademic:async(kind,data)=>calls.push(['save',kind,JSON.parse(JSON.stringify(data))]),
    openProfileSettings:tab=>calls.push(['profile',tab]),closePasswordSettings:()=>calls.push(['close'])};
  const manager=vm.runInNewContext(`({${html.slice(start,end)}})`,{
    PaceAuth:auth,document:{getElementById:id=>fields[id]},App:{state:{adminSelectedStudentId:1}},
    AppData:{getStudents:()=>[{id:1,name:'학생'}]},localStorage:{setItem:(key,value)=>calls.push(['cache',key,value])}
  });
  Object.assign(manager,{getTargetUnivs:()=>({1:[{rank:1,name:'서울대학교',major:'컴퓨터공학부'}]}),storageKeys:{targetUnivs:'universities'},findUnivKey:name=>name,
    updateModalUnivLogo(){},escapeHtml:value=>value,notify:message=>calls.push(['toast',message]),enhanceStudentDashboard:()=>calls.push(['refresh']),renderStudentTargetUnivs(){}});
  return {manager,fields,auth,calls,controls};
}

test('university editor opens only inside student profiles and reuses the same form for administrators',()=>{
  const {manager,fields,calls}=universityFixture();
  manager.openTargetUnivModal(42);
  assert.deepEqual(calls,[['profile','university']]);
  manager.prepareTargetUnivEditor(1);
  assert.equal(calls[1][1],'profileUniversityEditor');
  assert.equal(fields.targetUniv1Name.value,'서울대학교');
  assert.equal(fields.targetUniv2Name.value,'');
  assert.equal(fields.targetUniv1Card.open,true);
  assert.equal(fields.targetUniv2Card.open,false);
  assert.equal(fields.targetUniv1Summary.textContent,'서울대학교 · 컴퓨터공학부');
  manager.openTargetUnivModal(1,true);
  assert.ok(calls.some(c=>c[0]==='mount'&&c[1]==='adminUniversityEditor'));
});

test('university saves persist before refreshing and preserve the editor on failure',async()=>{
  for(const failure of [false,true]) {
    const {manager,fields,auth,calls,controls}=universityFixture();
    if(failure) auth.saveAcademic=async()=>{throw Error('저장 실패');};
    await manager.handleSaveTargetUniv();
    assert.equal(auth.universityBusy,false);
    assert.ok(controls.every(c=>!c.disabled));
    if(failure) {
      assert.equal(fields.targetUnivSettingsMessage.textContent,'저장 실패');
      assert.ok(!calls.some(c=>['close','cache','toast'].includes(c[0])));
    } else {
      assert.equal(calls[0][0],'save');
      assert.equal(calls[0][1],'academicTargetUnivs');
      assert.equal(calls[0][2].items[1][0].name,'서울대학교');
      assert.deepEqual(calls.map(c=>c[0]),['save','cache','close','toast','refresh']);
    }
  }
});

test('university validation expands incomplete ranks and duplicate saves or changed sessions cannot update the cache',async()=>{
  for(const rank of [1,2,3]) {
    const {manager,fields,calls}=universityFixture();
    fields[`targetUniv${rank}Name`].value='대학';
    fields[`targetUniv${rank}Major`].value='';
    await manager.handleSaveTargetUniv();
    assert.equal(fields[`targetUniv${rank}Card`].open,true);
    assert.match(fields.targetUnivSettingsMessage.textContent,new RegExp(`${rank}지망`));
    assert.ok(!calls.some(c=>c[0]==='save'));
  }
  const {manager,auth,calls}=universityFixture(),pending=deferred();
  auth.saveAcademic=async()=>{calls.push(['save']);await pending.promise;};
  const saving=manager.handleSaveTargetUniv();await new Promise(setImmediate);
  await manager.handleSaveTargetUniv();
  assert.equal(calls.filter(c=>c[0]==='save').length,1);
  auth.generation++;pending.resolve();await saving;
  assert.ok(!calls.some(c=>c[0]==='cache'));
});

test('profile labels use password change and student university cards expose no separate editor buttons',()=>{
  const fs=require('node:fs'),html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const profile=html.slice(html.indexOf('<dialog id="passwordSettingsDialog"'),html.indexOf('<!-- 5. 목표 대학'));
  assert.match(profile,/>비밀번호 변경<\/button>/);
  assert.doesNotMatch(profile,/비밀번호 재설정/);
  assert.match(profile,/id="profileUniversityEditor"/);
  const cards=html.slice(html.indexOf('  renderStudentTargetUnivs()'),html.indexOf('  openTargetUnivModal(studentId'));
  assert.doesNotMatch(cards,/onclick|수정하기/);
});

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
