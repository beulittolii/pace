const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));}
  else if(/^\/(style\.css|pace\.css|auth\.css|pace-logo\.svg|pace-symbol\.svg)$/.test(name)) {res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'image/svg+xml');res.end(fs.readFileSync(path.join(root,name.slice(1))));}
  else {res.statusCode=404;res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({content:fs.readFileSync(process.env.TAILWIND_SCRIPT_PATH || '/private/tmp/yem-tailwind-test.js','utf8')+'\n'+inline.find(s=>s.includes('tailwind.config'))});
   for(const file of ['weekly_review_logic.js','grammar_data.js','grammar_paper.js','data.js','grammar_store.js','weekly_review_store.js','app.js','grammar.js','weekly_review.js','pace.js','auth.js','auth-data.js']) await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
   await page.evaluate(()=>{App.init();App.finishInitialLoading();});
   await page.waitForFunction(()=>document.getElementById('initialLoadingSkeleton').hidden);
  assert.equal(await page.locator('#rememberLogin').isChecked(),false);
  assert.equal(await page.getByText('비밀번호를 잊으셨나요? 관리자에게 문의해주세요.',{exact:true}).count(),0);
  await page.locator('#studentLoginPassword').fill('password123');
  await page.getByRole('button',{name:'비밀번호 표시',exact:true}).click();
  assert.equal(await page.locator('#studentLoginPassword').getAttribute('type'),'text');
  assert.equal(await page.locator('#studentLoginPassword').inputValue(),'password123');
  assert.equal(await page.locator('#loginPasswordToggle').getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'비밀번호 숨기기',exact:true}).click();
  assert.equal(await page.locator('#studentLoginPassword').getAttribute('type'),'password');
  await page.getByRole('button',{name:/처음이신가요/}).click();
  assert.match(await page.locator('[data-step="0"]').innerText(),/PACE에 오신 것을/);
  assert.equal(await page.locator('#inviteCode').isVisible(),false);
  assert.equal(await page.locator('[data-step="0"]').evaluate(e=>getComputedStyle(e).animationName),'pace-signup-in');
  await page.screenshot({path:'/private/tmp/pace-signup-welcome.png',fullPage:true});
  await page.locator('[data-step="0"] button').click();
  await page.locator('#signupName').fill('테스트 학생');await page.locator('#signupId').fill('test_student');
  await page.locator('#signupPassword').fill('password123');await page.locator('#signupConfirmation').fill('wrong');
  await page.locator('[data-step="1"] button[type=submit]').click();
  assert.match(await page.locator('#signupError').innerText(),/서로 달라/);
  await page.locator('#signupConfirmation').fill('password123');
  await page.locator('[data-step="1"] button[type=submit]').click();
  assert.equal(await page.locator('#inviteCode').isVisible(),true);
  await page.locator('#signupBack').click();assert.equal(await page.locator('#signupId').inputValue(),'test_student');
  await page.locator('[data-step="1"] button[type=submit]').click();
  await page.locator('#inviteCode').fill('a1b2c3');assert.equal(await page.locator('#inviteCode').inputValue(),'A1B2C3');
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:950});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/private/tmp/pace-signup-mobile.png',fullPage:true});
   await page.evaluate(()=>{
     window.authCalls=[];
     window.originalEnter=PaceAuth.enter;
    PaceAuth.ready=async function(){this.auth={};this.f={browserLocalPersistence:'local',inMemoryPersistence:'memory',setPersistence:async(a,p)=>authCalls.push(p),signInWithEmailAndPassword:async(a)=>{authCalls.push('login');a.currentUser={uid:'test-student'};}};};
    PaceAuth.enter=async()=>{};
  });
  await page.getByRole('button',{name:'← 로그인',exact:true}).click();
  await page.locator('#studentLoginId').fill('test_student');await page.locator('#studentLoginPassword').fill('password123');
  await page.locator('#landingView form button[type=submit]').click();
  await page.waitForFunction(()=>authCalls.length===2);
  assert.deepEqual(await page.evaluate(()=>authCalls),['memory','login']);
  assert.equal(await page.locator('#studentLoginPassword').inputValue(),'');
  await page.locator('#studentLoginPassword').fill('password123');
  await page.locator('#rememberLogin').check();await page.locator('#landingView form button[type=submit]').click();
  await page.waitForFunction(()=>authCalls.length===4);
   assert.deepEqual(await page.evaluate(()=>authCalls.slice(2)),['local','login']);
   await page.evaluate(()=>{
     PaceAuth.enter=window.originalEnter;
     PaceAuth.ready=async()=>{};
     PaceAuth.identity=async function(){this.admin=window.loginRole==='admin';this.member=window.loginRole==='student'?{studentId:1}:null;};
     PaceAuth.watchMembership=()=>{};
     App.selectStudent=()=>{App.state.view='student';document.getElementById('landingView').classList.add('hidden');document.getElementById('studentDashboardView').classList.remove('hidden');};
     App.showAdminDashboard=()=>{App.state.view='admin';document.getElementById('landingView').classList.add('hidden');document.getElementById('adminDashboardView').classList.remove('hidden');};
     window.prepareLogin=async(role='student')=>{
       PaceAuth.clearData();PaceAuth.close();await App.showLanding();
       window.loginRole=role;
       document.getElementById('studentLoginId').value='test_student';
       document.getElementById('studentLoginPassword').value='password123';
       PaceAuth.f.signInWithEmailAndPassword=()=>new Promise((resolve,reject)=>{
         window.resolveSignIn=()=>{PaceAuth.auth.currentUser={uid:'test-student'};resolve();};
         window.rejectSignIn=()=>reject({code:'auth/invalid-credential'});
       });
       PaceAuth.loadData=()=>new Promise((resolve,reject)=>{
         window.resolveData=resolve;window.rejectData=()=>reject(Error('데이터 연결 실패'));
       });
     };
   });
   const submit=page.locator('#landingView form button[type=submit]');
   const skeleton=page.locator('#initialLoadingSkeleton');
   for(const width of [390,768,1440]) {
     await page.setViewportSize({width,height:1000});
     await page.evaluate(()=>prepareLogin());
     await submit.click();
     assert.match(await submit.innerText(),/로그인 중/);
     assert.equal(await submit.isDisabled(),true);
     assert.equal(await page.locator('#landingView form').getAttribute('aria-busy'),'true');
     assert.equal(await submit.locator('i').evaluate(e=>getComputedStyle(e).animationName),'none');
     assert.equal(await skeleton.isVisible(),false);
     await page.evaluate(()=>resolveSignIn());
     await page.waitForFunction(()=>document.getElementById('initialLoadingSkeleton').classList.contains('initial-loading-skeleton--student'));
     assert.equal(await skeleton.isVisible(),true);
     assert.equal(await page.locator('#landingView').isVisible(),false);
     await page.keyboard.press('Tab');
     assert.equal(await page.evaluate(()=>!!document.activeElement.closest('main,header,aside,footer')),false);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no skeleton horizontal overflow');
     assert.equal(await skeleton.locator('.skeleton-shimmer').first().evaluate(e=>getComputedStyle(e).animationName),'none');
     await page.evaluate(()=>resolveData());
     await page.waitForFunction(()=>!PaceAuth.busy);
     await skeleton.waitFor({state:'hidden'});
     assert.equal(await skeleton.isVisible(),false);
     assert.equal(await page.locator('#studentDashboardView').isVisible(),true);
     assert.equal(await submit.locator('span').textContent(),'로그인');
   }
   // Authentication failure never replaces the login form with a skeleton.
   await page.evaluate(()=>prepareLogin());await submit.click();
   await page.evaluate(()=>rejectSignIn());await page.waitForFunction(()=>!PaceAuth.busy);
   assert.equal(await skeleton.isVisible(),false);
   assert.match(await page.locator('#loginError').innerText(),/아이디 또는 비밀번호/);
   assert.equal(await submit.isDisabled(),false);
   // Data failure returns to landing, and the same retained skeleton works on retry.
   await submit.click();await page.evaluate(()=>resolveSignIn());
   await page.waitForFunction(()=>!document.getElementById('initialLoadingSkeleton').classList.contains('initial-loading-skeleton--leaving'));
   await page.evaluate(()=>rejectData());await page.waitForFunction(()=>!PaceAuth.busy);
   assert.equal(await page.locator('#landingView').isVisible(),true);
   assert.match(await page.locator('#loginError').innerText(),/데이터 연결 실패/);
   await page.evaluate(()=>prepareLogin('admin'));await submit.click();await page.evaluate(()=>resolveSignIn());
   await page.waitForFunction(()=>document.getElementById('initialLoadingSkeleton').classList.contains('initial-loading-skeleton--admin'));
   await page.evaluate(()=>resolveData());await page.waitForFunction(()=>!PaceAuth.busy);
   assert.equal(await page.locator('#adminDashboardView').isVisible(),true);
   // Membership setup must not be covered by an orphaned loader.
   await page.evaluate(()=>prepareLogin('none'));await submit.click();await page.evaluate(()=>resolveSignIn());
   await page.waitForFunction(()=>!PaceAuth.busy);
   await skeleton.waitFor({state:'hidden'});
   assert.equal(await skeleton.isVisible(),false);
   assert.equal(await page.locator('#inviteCode').isVisible(),true);
   // A pending initial-hide timer cannot hide a newly shown skeleton.
   await page.evaluate(()=>{App.finishInitialLoading();App.showLoadingSkeleton('student');});
   await page.waitForTimeout(300);
   assert.equal(await skeleton.isVisible(),true);
   await page.evaluate(()=>App.finishInitialLoading());
   await page.waitForFunction(()=>document.getElementById('initialLoadingSkeleton').hidden);
   assert.equal(await skeleton.count(),1);
   // Restoring a session uses data loading directly, with no button login phase.
   await page.evaluate(()=>{window.loginRole='admin';window.restoring=PaceAuth.enter();});
   await page.waitForFunction(()=>document.getElementById('initialLoadingSkeleton').classList.contains('initial-loading-skeleton--admin'));
   assert.equal(await skeleton.isVisible(),true);
   await page.evaluate(async()=>{resolveData();await window.restoring;});
   await skeleton.waitFor({state:'hidden'});
   assert.equal(await skeleton.isVisible(),false);
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>prepareLogin());await submit.click();
   assert.equal(await submit.locator('i').evaluate(e=>getComputedStyle(e).animationName),'pace-login-spin');
   await page.evaluate(()=>rejectSignIn());await page.waitForFunction(()=>!PaceAuth.busy);
   assert.deepEqual(errors,[]);console.log('PASS: signup, login persistence, button → skeleton → dashboard, failures/retry, roles, session restoration, timer race, keyboard, responsive layouts and reduced motion');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
