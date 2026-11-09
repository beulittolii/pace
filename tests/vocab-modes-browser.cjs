// Actual admin form and student attempt flow, isolated from production Firebase.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const errors = [];
const server = http.createServer((req,res) => {
  const pathname=new URL(req.url,'http://localhost').pathname;
  if (['/style.css','/pace.css'].includes(pathname)) {
    res.setHeader('Content-Type','text/css');
    res.end(fs.readFileSync(path.join(root,pathname.slice(1))));
    return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
});
let browser;
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
  await page.addScriptTag({content:fs.readFileSync(process.env.TAILWIND_SCRIPT_PATH || '/private/tmp/yem-tailwind-test.js','utf8')});
  await page.addStyleTag({content:'.hidden{display:none!important}*,*::before,*::after{transition:none!important;animation:none!important}'});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('header')).position==='sticky');
  for(const file of ['data.js','grammar_data.js','grammar_store.js','weekly_review_logic.js','app.js','grammar.js','weekly_review.js']) {
    await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  }
  await page.evaluate(()=>{
    document.getElementById('initialLoadingSkeleton').remove();
    FirebaseStore.studentsLoaded=true;FirebaseStore.students=[{id:1,name:'학생'}];
    FirebaseStore.tests=[];FirebaseStore.vocabTestResults=[];
    FirebaseStore.vocabSets=[{id:'set',book:'기본 단어장',title:'Day 1',studentIds:[1],words:Array.from({length:50},(_,i)=>({en:'word'+i,ko:'뜻'+i}))}];
    App.state.isAdminLoggedIn=true;
    window.saved=[];window.notices=[];
    App.toast=(message,type)=>notices.push({message,type});
    App.renderAdminDashboard=()=>{};
    AppData.saveOrUpdateTest=async record=>{const test={...record,id:record.id||'new'};saved.push(test);FirebaseStore.tests=[test];return test};
    App.openAddTestModal();
    document.querySelector('[name="formStudentCheckbox"]').checked=true;
    document.getElementById('formVocabSetId').value='set';
    document.getElementById('formVocabQuestionCount_2').value='0';
    document.getElementById('formVocabQuestionCount_3').value='10';
    document.getElementById('formVocabQuestionCount_4').value='0';
  });
  assert.equal(await page.locator('#formVocabQuestionCount_2').evaluate(el=>el.checkValidity()),true,'native form accepts zero');
  await page.evaluate(()=>App.handleSaveTestForm({preventDefault(){}}));
  assert.deepEqual(await page.evaluate(()=>saved[0].vocabQuestionCounts),{2:0,3:10,4:0,5:null});
  await page.evaluate(()=>App.openEditTestModal('new'));
  assert.equal(await page.locator('#formVocabQuestionCount_2').inputValue(),'0');
  assert.equal(await page.locator('#formVocabQuestionCount_4').inputValue(),'0');
  await page.evaluate(()=>{
    const test=FirebaseStore.tests[0];
    test.allowLate=true;
    const set=FirebaseStore.vocabSets[0];
    const host=document.createElement('div');host.id='modeButtons';
    host.innerHTML=[2,3,4].map(dir=>App.renderVocabTestButton(set,1,dir,App.getVocabDirectionLabel(dir),'',test.id)).join('');
    document.body.appendChild(host);
  });
  assert.match(await page.locator('#modeButtons').innerText(),/스펠링/);
  assert.doesNotMatch(await page.locator('#modeButtons').innerText(),/객관식|통합|단계 잠김/);
  await page.evaluate(()=>App.startVocabTest('set',1,2,'new'));
  assert.equal(await page.evaluate(()=>App.state.vocabTest),null);
  await page.evaluate(()=>{
    App.prefetchVocabPhonetics=()=>{};
    App.renderVocabQuestion=()=>{}; // Do not start timers/audio; inspect the real prepared attempt.
    App.startVocabTest('set',1,3,'new');
  });
  assert.equal(await page.evaluate(()=>App.state.vocabTest.questions.length),10);
  assert.equal(await page.evaluate(()=>App.state.vocabTest.direction),3);
  await page.evaluate(()=>{
    App.state.vocabTest=null;
    [2,3,4].forEach(dir=>document.getElementById('formVocabQuestionCount_'+dir).value='0');
  });
  await page.evaluate(()=>App.handleSaveTestForm({preventDefault(){}}));
  assert.equal(await page.evaluate(()=>saved.length),1,'all-zero edit does not save');
  assert.equal(await page.evaluate(()=>notices.at(-1).type),'error');

  // Measure the real modal/list DOM with production CSS, not just hidden buttons.
  const combinations=[[3],[2],[4],[2,3],[2,4],[3,4],[2,3,4]];
  for (const width of [1280,768,640,390]) {
    await page.setViewportSize({width,height:1050});
    for (const enabled of combinations) {
      await page.evaluate(enabled=>{
        const exam=FirebaseStore.tests[0];
        exam.vocabQuestionCounts=Object.fromEntries([2,3,4].map(dir=>[dir,enabled.includes(dir)?10:0]));
        FirebaseStore.vocabTestResults=enabled.length>1?[{studentId:1,setId:'set',testId:exam.id,direction:enabled[0],passed:true,score:90}]:[];
        document.getElementById('adminTestFormModal').classList.add('hidden');
        App.openVocabTestScheduleModal(exam.id);
        let host=document.getElementById('layoutList');
        if (!host) {host=document.createElement('section');host.id='layoutList';host.style.cssText='max-width:960px;margin:auto';document.body.appendChild(host);}
        host.innerHTML=App.renderStudentVocabSection(1);
      },enabled);
      for (const selector of ['#detailModalBody .pace-schedule-stages','#layoutList .pace-schedule-stages']) {
        const layout=await page.locator(selector).evaluate(grid=>{
          const style=getComputedStyle(grid), rect=grid.getBoundingClientRect();
          return {left:rect.left+parseFloat(style.paddingLeft),width:rect.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),gap:parseFloat(style.columnGap)||0,
            cards:[...grid.children].map(card=>{const r=card.getBoundingClientRect(),s=getComputedStyle(card);return {x:r.left,y:r.top,width:r.width,right:r.right,bottom:r.bottom,borderRight:parseFloat(s.borderRightWidth),borderBottom:parseFloat(s.borderBottomWidth)};})};
        });
        const message=`${selector}, ${width}px, modes ${enabled}`;
        assert.equal(layout.cards.length,enabled.length,message);
        const columns=width<=640?1:enabled.length;
        const expectedWidth=(layout.width-layout.gap*(columns-1))/columns;
        layout.cards.forEach((card,i)=>{
          assert.ok(Math.abs(card.width-expectedWidth)<1,`${message}: card must fill its share (${card.width} vs ${expectedWidth})`);
          assert.ok(Math.abs(card.x-(layout.left+(i%columns)*(expectedWidth+layout.gap)))<1,`${message}: no empty slot`);
          if(columns>1) assert.ok(Math.abs(card.y-layout.cards[0].y)<1,`${message}: same row`);
          else if(i>0) assert.ok(card.y>=layout.cards[i-1].bottom-1,`${message}: stacked without overlap`);
          assert.ok(card.right<=width+1,`${message}: no horizontal overflow`);
        });
        if(selector.includes('detailModalBody')) {
          const last=layout.cards.at(-1);
          assert.equal(last.borderRight,0,`${message}: no trailing vertical divider`);
          assert.equal(last.borderBottom,0,`${message}: no trailing horizontal divider`);
        }
      }
      if ([1280,390].includes(width) && ['3','2,4','2,3,4'].includes(enabled.join(','))) {
        await page.screenshot({path:path.join(process.env.PACE_TEST_OUTPUT_DIR || process.env.TMPDIR || '/tmp',`pace-vocab-layout-${width}-${enabled.length}.png`)});
      }
    }
  }
  assert.deepEqual(errors,[]);
  console.log('Vocabulary mode browser checks passed: assignment/attempt safeguards and adaptive modal/list geometry for all 7 mode combinations at 1280/768/640/390px.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
