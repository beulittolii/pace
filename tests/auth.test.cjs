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
