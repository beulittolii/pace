const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),esbuild=require('esbuild');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const f=require('firebase/firestore');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),projectId='demo-pace-auth';
(async()=>{
 const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}});
 await env.clearFirestore();
 await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`,{method:'DELETE'});
 const adminResponse=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@accounts.pace.invalid',password:'admin-password-123',returnSecureToken:true})});
 const admin=await adminResponse.json();assert.ok(admin.localId);
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();await f.setDoc(f.doc(db,'admins',admin.localId),{enabled:true});
  await f.setDoc(f.doc(db,'invites','AB12CD'),{code:'AB12CD',status:'unused',createdBy:admin.localId,createdAt:f.serverTimestamp()});
  await f.setDoc(f.doc(db,'students','12'),{id:12,name:'기존 학생',target:'나의 목표',accessMode:'FULL',password:'old-test-password'});
  await f.setDoc(f.doc(db,'academicData','academicSchoolGrades'),{items:[{id:'grade1',studentId:12,score:90}]});
  await f.setDoc(f.doc(db,'tests','existing-test'),{id:'existing-test',studentId:12,type:'REGULAR',title:'기존 시험',date:'2026-11-09',status:'SCHEDULED'});
 });
 const migrationBackup=fs.mkdtempSync(path.join(os.tmpdir(),'pace-migration-test-'));
 const migrate=(apply)=>execFileSync(process.execPath,['scripts/auth-admin.cjs','migrate',...(apply?['--apply']:[])],{cwd:root,env:{...process.env,PACE_FIREBASE_PROJECT:projectId,PACE_AUTH_BACKUP_DIR:migrationBackup},encoding:'utf8'});
 assert.match(migrate(false),/Dry run only/);
 await env.withSecurityRulesDisabled(async c=>assert.equal((await f.getDoc(f.doc(c.firestore(),'students','12'))).data().password,'old-test-password'));
 migrate(true);
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();assert.equal((await f.getDoc(f.doc(db,'students','12'))).data().password,undefined);
  assert.equal((await f.getDoc(f.doc(db,'academicRecords','academicSchoolGrades_12'))).data().items[0].score,90);
  await f.updateDoc(f.doc(db,'academicRecords','academicSchoolGrades_12'),{items:[{id:'grade1',studentId:12,score:95}]});
 });
 migrate(true);
 await env.withSecurityRulesDisabled(async c=>assert.equal((await f.getDoc(f.doc(c.firestore(),'academicRecords','academicSchoolGrades_12'))).data().items[0].score,95));
 fs.rmSync(migrationBackup,{recursive:true,force:true});
 const bundled=await esbuild.build({stdin:{contents:`
 import {initializeApp} from 'firebase/app';import * as a from 'firebase/auth';import * as f from 'firebase/firestore';
 const app=initializeApp({apiKey:'fake-api-key',projectId:'demo-pace-auth',authDomain:'localhost'});
 window.firebaseAuth=a.getAuth(app);a.connectAuthEmulator(window.firebaseAuth,'http://127.0.0.1:9099',{disableWarnings:true});
 window.firebaseDB=f.getFirestore(app);f.connectFirestoreEmulator(window.firebaseDB,'127.0.0.1',8080);
 window.firebaseAuthFns=a;window.firebaseFns=f;window.firebaseReady=true;window.dispatchEvent(new CustomEvent('firebase-ready'));
 `,resolveDir:root},nodePaths:(process.env.NODE_PATH||'').split(path.delimiter),bundle:true,write:false,platform:'browser',format:'iife'});
 const sdk=bundled.outputFiles[0].text;
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script type="module">[\s\S]*?<\/script>/,'<script src="/firebase-test.js"></script>').replace('https://cdn.tailwindcss.com','/tailwind-test.js');
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(name==='/firebase-test.js'){res.setHeader('Content-Type','text/javascript');res.end(sdk);return;}
  if(name==='/tailwind-test.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(process.env.TAILWIND_SCRIPT_PATH||'/private/tmp/yem-tailwind-test.js'));return;}
  const file=path.resolve(root,'.'+name);
  if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()) {res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));}
  else{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`,profile=fs.mkdtempSync(path.join(os.tmpdir(),'pace-auth-browser-'));
 const executablePath=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 let context;
 const start=async()=>{const c=await chromium.launchPersistentContext(profile,{executablePath,headless:true,viewport:{width:1440,height:1000}});await c.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());return c;};
 try {
  context=await start();let page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>PaceAuth.auth && !PaceAuth.auth.currentUser);
  await page.getByRole('button',{name:/처음이신가요/}).click();await page.locator('[data-step="0"] button').click();
  await page.locator('#signupName').fill('가입 테스트');await page.locator('#signupId').fill('integration_student');await page.locator('#signupPassword').fill('password-123');await page.locator('#signupConfirmation').fill('password-123');await page.locator('[data-step="1"] button[type=submit]').click();
  await page.locator('#inviteCode').fill('XX99XX');await page.locator('[data-step="2"] button').click();
  await page.waitForFunction(()=>!PaceAuth.busy && PaceAuth.auth.currentUser);
  assert.match(await page.locator('#signupError').innerText(),/사용할 수 없는/);
  await page.reload();await page.waitForFunction(()=>PaceAuth.step===2&&!document.getElementById('signupView').hidden);
  await page.locator('#inviteCode').fill('AB12CD');await page.locator('[data-step="2"] button').click();
  await page.waitForFunction(()=>PaceAuth.step===3,{timeout:15000});
  await page.screenshot({path:'/private/tmp/pace-signup-complete.png',fullPage:true});
  await page.locator('[data-step="3"] button').click();await page.waitForFunction(()=>App.state.isStudentLoggedIn);
  const uid=await page.evaluate(()=>PaceAuth.auth.currentUser.uid);
  const second=await context.newPage();await second.goto(url);await second.waitForFunction(()=>PaceAuth.auth && PaceAuth.f);
  assert.equal(await second.evaluate(()=>PaceAuth.auth.currentUser),null,'session login does not cross into a fresh tab');
  await second.close();await page.evaluate(()=>PaceAuth.logout());
  await page.locator('#studentLoginId').fill('integration_student');await page.locator('#studentLoginPassword').fill('password-123');await page.locator('#rememberLogin').check();await page.locator('#landingView form button[type=submit]').click();await page.waitForFunction(()=>App.state.isStudentLoggedIn);
  await context.close();context=await start();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>App.state.isStudentLoggedIn);
  assert.equal(await page.evaluate(()=>PaceAuth.auth.currentUser.uid),uid,'remembered login survives browser restart');
  await page.evaluate(()=>PaceAuth.logout());
  await page.locator('#studentLoginId').fill('admin');await page.locator('#studentLoginPassword').fill('admin-password-123');assert.equal(await page.locator('#studentLoginId').inputValue(),'admin');assert.equal(await page.locator('#studentLoginPassword').inputValue(),'admin-password-123');await page.locator('#landingView form button[type=submit]').click();await page.waitForFunction(()=>!PaceAuth.busy); assert.equal(await page.evaluate(()=>PaceAuth.admin),true,await page.locator('#loginError').innerText());await page.waitForFunction(()=>App.state.isAdminLoggedIn);
  await page.evaluate(()=>App.switchAdminTab('students'));await page.waitForSelector('#paceAccountAdmin .invite-row');
  assert.equal(await page.locator('#newStudentPassword').count(),0);
  await page.getByRole('button',{name:'초대 코드 발급',exact:true}).click();await page.waitForFunction(()=>document.getElementById('latestInvite')?.textContent.includes('새 초대 코드:'));
  assert.match(await page.locator('#latestInvite').innerText(),/[A-Z0-9]{6}$/);
  await page.locator(`#link_${uid}`).selectOption('12');await page.locator(`#link_${uid}`).locator('..').getByRole('button',{name:'연결',exact:true}).click();
  await page.waitForFunction(uid=>PaceAuth.members?.find(m=>m.uid===uid)?.studentId===12,uid);
  await page.screenshot({path:'/private/tmp/pace-invite-admin.png',fullPage:true});
  await page.evaluate(()=>PaceAuth.logout());await page.locator('#studentLoginId').fill('integration_student');await page.locator('#studentLoginPassword').fill('password-123');await page.locator('#landingView form button[type=submit]').click();await page.waitForFunction(()=>App.state.isStudentLoggedIn&&App.state.selectedStudentId===12);
  assert.equal(await page.evaluate(()=>AppData.getTests()[0]?.id),'existing-test');
  assert.deepEqual(errors,[]);console.log('PASS: actual signup/recovery, session/local persistence, browser restart, admin issuance and existing-student linking');
 } finally {await context?.close();server.close();await env.cleanup();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
