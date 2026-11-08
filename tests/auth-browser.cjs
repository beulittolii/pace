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
  for(const file of ['weekly_review_logic.js','grammar_data.js','data.js','grammar_store.js','weekly_review_store.js','app.js','grammar.js','weekly_review.js','pace.js','auth.js','auth-data.js']) await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(()=>{App.init();document.getElementById('initialLoadingSkeleton')?.remove();});
  assert.equal(await page.locator('#rememberLogin').isChecked(),false);
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
    PaceAuth.ready=async function(){this.auth={};this.f={browserLocalPersistence:'local',browserSessionPersistence:'session',setPersistence:async(a,p)=>authCalls.push(p),signInWithEmailAndPassword:async()=>authCalls.push('login')};};
    PaceAuth.enter=async()=>{};
  });
  await page.getByRole('button',{name:'← 로그인',exact:true}).click();
  await page.locator('#studentLoginId').fill('test_student');await page.locator('#studentLoginPassword').fill('password123');
  await page.locator('#landingView form button[type=submit]').click();
  await page.waitForFunction(()=>authCalls.length===2);
  assert.deepEqual(await page.evaluate(()=>authCalls),['session','login']);
  await page.locator('#rememberLogin').check();await page.locator('#landingView form button[type=submit]').click();
  await page.waitForFunction(()=>authCalls.length===4);
  assert.deepEqual(await page.evaluate(()=>authCalls.slice(2)),['local','login']);
  assert.deepEqual(errors,[]);console.log('PASS: signup steps, validation, mobile, motion, login persistence selection');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
