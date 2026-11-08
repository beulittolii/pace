// Run with NODE_PATH pointing to a Playwright installation. All cloud writes are
// replaced by an in-memory transaction store; no production Firebase is loaded.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const errors = [];
let browser;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } else if (['/style.css', '/pace.css'].includes(pathname)) {
    res.setHeader('Content-Type', 'text/css');
    res.end(fs.readFileSync(path.join(root, pathname.slice(1))));
  } else { res.statusCode = 404; res.end(); }
});

async function loadApp(page) {
  for (const file of ['weekly_review_logic.js', 'grammar_data.js', 'data.js', 'grammar_store.js', 'weekly_review_store.js', 'app.js', 'grammar.js', 'weekly_review.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
  await page.evaluate(() => {
    document.getElementById('initialLoadingSkeleton')?.remove();
    window.testDocuments = new Map(JSON.parse(localStorage.getItem('test_documents') || '[]'));
    window.failNextTransaction = false;
    window.transactionCount = 0;
    window.firebaseDB = {};
    window.firebaseFns = {
      doc: (_, collection, id) => `${collection}/${id}`,
      runTransaction: async (_, update) => {
        window.transactionCount++;
        if (window.holdNextTransaction) {
          window.holdNextTransaction = false;
          await new Promise(resolve => { window.releaseTestTransaction = resolve; });
        }
        if (window.failNextTransaction) { window.failNextTransaction = false; throw new Error('테스트 저장 실패'); }
        const pending = [];
        const result = await update({
          get: async ref => ({ exists: () => testDocuments.has(ref), data: () => testDocuments.has(ref) ? structuredClone(testDocuments.get(ref)) : undefined }),
          delete: ref => pending.push([ref, null]),
          set: (ref, data) => pending.push([ref, structuredClone(data)])
        });
        pending.forEach(([ref, data]) => data === null ? testDocuments.delete(ref) : testDocuments.set(ref, data));
        localStorage.setItem('test_documents', JSON.stringify([...testDocuments]));
        return result;
      }
    };
    if (!testDocuments.has('students/501')) testDocuments.set('students/501', { id: 501, name: '문법 테스트 학생', target: '가정법 이해' });
    FirebaseStore.students = [structuredClone(testDocuments.get('students/501'))];
    FirebaseStore.tests = [...testDocuments].filter(([key]) => key.startsWith('tests/')).map(([,value]) => value);
    FirebaseStore.vocabReviewResults = [...testDocuments].filter(([key]) => key.startsWith('vocabReviewResults/')).map(([,value]) => value);
    App.state.isAdminLoggedIn = true;
    App.state.isStudentLoggedIn = false;
    App.state.adminSelectedStudentId = 501;
    App.state.selectedStudentId = 501;
    App.bindEvents();
  });
}

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
  const page = await browser.newPage({ viewport:{width:1280,height:950} });
  await page.clock.install({time:new Date('2026-11-06T12:00:00Z')});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  const url = `http://127.0.0.1:${server.address().port}`;
  async function setup() {
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.addStyleTag({content:'.hidden{display:none!important}'});
    await page.addScriptTag({content:fs.readFileSync(process.env.TAILWIND_SCRIPT_PATH || '/tmp/yem-tailwind-test.js','utf8')});
    await page.evaluate(()=>document.body.classList.add('tailwind-test-ready'));
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('header')).position==='sticky');
    await loadApp(page);
  }
  await setup();
  await page.evaluate(() => {
    FirebaseStore.vocabSets=[{id:'reviewset',title:'복습 원본',words:[{en:'apple',ko:'사과'},{en:'banana',ko:'바나나'},{en:'orange',ko:'오렌지'},{en:'grape',ko:'포도'},{en:'melon',ko:'멜론'},{en:'peach',ko:'복숭아'}]}];
    FirebaseStore.tests=Array.from({length:5},(_,i)=>({id:'source'+i,type:'VOCAB',studentId:501,date:`2026-11-0${i+2}`,status:'SCHEDULED',vocabSetIds:['reviewset'],title:'평일 단어'}));
    FirebaseStore.vocabTestResults=[{id:'source_result',testId:'source0',studentId:501,direction:2,completedAt:'2026-11-06T01:00:00Z',questionDetails:FirebaseStore.vocabSets[0].words.slice(0,4).map((word,i)=>({word,isCorrect:i>=2}))}];
    for(const [collection,items] of [['tests',FirebaseStore.tests],['vocabSets',FirebaseStore.vocabSets],['vocabTestResults',FirebaseStore.vocabTestResults]]) items.forEach(item=>testDocuments.set(`${collection}/${item.id}`,structuredClone(item)));
    FirebaseStore.reviewSourcesReady={tests:true,vocabSets:true,vocabTestResults:false};
    AppData.queueWeeklyReviews();
  });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>AppData.getTests().some(t=>t.type==='VOCAB_REVIEW')),false,'partial cloud loading cannot create review');
  await page.evaluate(()=>{ FirebaseStore.reviewSourcesReady.vocabTestResults=true;AppData.queueWeeklyReviews(); });
  await page.waitForFunction(()=>AppData.getTests().some(t=>t.type==='VOCAB_REVIEW'));
  const id=await page.evaluate(()=>AppData.getTests().find(t=>t.type==='VOCAB_REVIEW').id);
  await page.evaluate(id=>App.openWeeklyReviewModal(id),id);
  await page.waitForTimeout(250);
  assert.ok(await page.locator('#detailModalBody').innerText().then(t=>t.includes('5일치 단어 시험 완료 후')));
  assert.equal(await page.evaluate(id=>AppData.getTests().find(t=>t.id===id).reviewStage,id),'LOCKED');
  await page.evaluate(id=>App.startWeeklyReview(id),id);
  assert.notEqual(await page.evaluate(()=>App.state.view),'weeklyReview','placeholder cannot start');
  await page.evaluate(()=>{
    FirebaseStore.tests.filter(t=>t.id==='source0'||t.id==='source2').forEach(t=>{t.status='PASS';testDocuments.set('tests/'+t.id,structuredClone(t));});
    AppData.queueWeeklyReviews();
  });
  await page.waitForFunction(()=>document.querySelector('.weekly-review-weekday-count')?.textContent==='단어 테스트 2/5일 완료');
  assert.deepEqual(await page.locator('.weekly-review-weekdays li').evaluateAll(items=>items.map(item=>item.dataset.completed)),['true','false','true','false','false']);
  assert.equal(await page.locator('.weekly-review-day-circle svg').count(),2);
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:950});
    const positions=await page.locator('.weekly-review-day-circle').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {y:r.y,width:r.width,height:r.height};}));
    assert.ok(positions.every(p=>p.y===positions[0].y && p.width===36 && p.height===36));
    await page.screenshot({path:`/tmp/yem-weekly-review-weekdays-${width}.png`,fullPage:true});
  }
  for(const day of ['화','목','금']) await page.getByRole('checkbox',{name:day+'요일 제외'}).check();
  await page.evaluate(()=>AppData.refreshCloudScreens());
  assert.equal(await page.locator('[name="weeklyReviewExcludedDay"]:checked').count(),3,'live refresh preserves unsaved selection');
  await page.evaluate(()=>{window.failNextTransaction=true;});
  await page.locator('#weeklyReviewDaysSave').click();
  await page.waitForFunction(()=>!App._weeklyReviewDaysSaving);
  assert.equal(await page.locator('[name="weeklyReviewExcludedDay"]:checked').count(),3,'failed save preserves selection');
  assert.equal(await page.evaluate(id=>AppData.getTests().find(t=>t.id===id).excludedWeekdays.length,id),0);
  await page.locator('#weeklyReviewDaysSave').click();
  await page.waitForFunction(()=>document.querySelector('.weekly-review-weekday-count')?.textContent==='단어 테스트 2/2일 완료');
  assert.equal(await page.evaluate(id=>AppData.getTests().find(t=>t.id===id).reviewStage,id),'READY');
  assert.equal(await page.locator('.weekly-review-day-circle.is-excluded').count(),3);
  await page.screenshot({path:'/tmp/yem-weekly-review-excluded-mobile.png',fullPage:true});
  await page.evaluate(id=>{App.state.isAdminLoggedIn=false;App.openWeeklyReviewModal(id)},id);
  assert.equal(await page.locator('[name="weeklyReviewExcludedDay"]').count(),0,'student cannot configure exclusions');
  assert.equal(await page.locator('#weeklyReviewDelete').count(),0,'student cannot delete reviews');
  assert.equal(await page.locator('.weekly-review-day-circle.is-excluded').count(),3);
  await page.evaluate(id=>{App.state.isAdminLoggedIn=true;App.openWeeklyReviewModal(id)},id);
  await page.getByRole('checkbox',{name:'화요일 제외'}).uncheck();
  await page.locator('#weeklyReviewDaysSave').click();
  await page.waitForFunction(()=>document.querySelector('.weekly-review-weekday-count')?.textContent==='단어 테스트 2/3일 완료');
  assert.equal(await page.evaluate(id=>AppData.getTests().find(t=>t.id===id).reviewStage,id),'LOCKED');
  for(const day of ['목','금']) await page.getByRole('checkbox',{name:day+'요일 제외'}).uncheck();
  await page.locator('#weeklyReviewDaysSave').click();
  await page.waitForFunction(()=>document.querySelector('.weekly-review-weekday-count')?.textContent==='단어 테스트 2/5일 완료');
  await page.evaluate(()=>{
    FirebaseStore.tests.filter(t=>t.type==='VOCAB').forEach(t=>{t.status='PASS';testDocuments.set('tests/'+t.id,structuredClone(t));});
    AppData.queueWeeklyReviews();
  });
  await page.waitForFunction(id=>AppData.getTests().find(t=>t.id===id).reviewStage==='READY',id);
  await page.waitForFunction(()=>document.getElementById('detailModalBody').innerText.includes('2026-11-07 00:00부터'));

  // Calendar badge is the exact same renderer and dimensions as regular vocabulary.
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:950});
    const boxes=await page.evaluate(id=>{
      const review=AppData.getTests().find(t=>t.id===id), host=document.createElement('div');host.style.width='160px';
      host.innerHTML=App.renderCalendarLearningTest(review,'주간 복습','fa-rotate','openWeeklyReviewModal')+App.renderCalendarLearningTest({...review,type:'VOCAB'},'단어 테스트','fa-spell-check','openVocabTestScheduleModal');document.body.appendChild(host);
      const metrics=[...host.children].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return [r.width,r.height,s.backgroundColor,s.color];});host.remove();return metrics;
    },id);
    assert.deepEqual(boxes[0],boxes[1]);
    assert.equal(await page.locator('#detailModalStudentBadge').innerText(),'문법 테스트 학생 학생 · 주간 복습');
    await page.screenshot({path:`/tmp/yem-weekly-review-modal-${width}.png`,fullPage:true});
  }
  // Open after Saturday, exercising actual transaction grading against frozen questions.
  await page.clock.setFixedTime(new Date('2026-11-07T03:00:00Z'));
  await page.evaluate(id=>App.startWeeklyReview(id),id);
  assert.equal(await page.locator('#weeklyReviewView').isVisible(),true);
  assert.equal(await page.evaluate(()=>App.state.weeklyReview.questions.length),4);
  assert.equal(await page.locator('[data-review-paper] fieldset').count(),4,'all questions render on one page');
  assert.equal(await page.locator('.weekly-review-nav').count(),0,'no question navigation');
  const spellingId=await page.evaluate(()=>App.state.weeklyReview.questions.find(q=>q.mode==='SPELLING').id);
  await page.locator('#weeklyReviewInput_'+spellingId).fill('temporary answer');
  assert.equal(await page.locator('#weeklyReviewAnsweredCount').innerText(),'1 / 4문항 작성');
  assert.equal(await page.evaluate(()=>Object.values(App.state.weeklyReview.answers)[0]),'temporary answer');
  await page.evaluate(()=>App.leaveWeeklyReview());
  assert.equal(await page.evaluate(id=>AppData.getWeeklyReviewResult(id),id),null,'leaving an unfinished round has no result or penalty');
  await page.evaluate(id=>App.startWeeklyReview(id),id);
  assert.equal(await page.evaluate(()=>Object.keys(App.state.weeklyReview.answers).length),0);
  await page.locator('#testDetailModal').waitFor({state:'hidden'});
  await page.screenshot({path:'/tmp/yem-weekly-review-question-mobile.png',fullPage:true});
  let dialogText='';
  page.once('dialog',async dialog=>{dialogText=dialog.message();await dialog.dismiss();});
  await page.locator('#weeklyReviewSubmit').click();
  assert.match(dialogText,/4문제/);assert.equal(await page.evaluate(()=>AppData.getWeeklyReviewResult(App.state.weeklyReview.id)),null);
  // Fail-save preserves screen and answers, and is retryable.
  const answerQuestion=async q=> {
    if(q.mode==='CHOICE') await page.locator('#weeklyReviewQuestion_'+q.id+' label').nth(q.choices.indexOf(q.word.ko)).click();
    else await page.locator('#weeklyReviewInput_'+q.id).fill(q.word.en);
  };
  for(const q of await page.evaluate(()=>App.state.weeklyReview.questions.slice(0,2))) await answerQuestion(q);
  await page.evaluate(()=>{window.failNextTransaction=true;});
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#weeklyReviewSubmit').click();
  await page.waitForFunction(()=>document.getElementById('weeklyReviewSubmit')?.textContent==='다시 제출');
  assert.equal(await page.evaluate(()=>Object.keys(App.state.weeklyReview.answers).length),2);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#weeklyReviewSubmit').click();
  await page.waitForSelector('#weeklyReviewRetry');
  let result=await page.evaluate(id=>AppData.getWeeklyReviewResult(id),id);
  assert.equal(result.firstScore,50);assert.equal(result.remainingIds.length,2);
  assert.equal(await page.locator('.weekly-review-current-score').innerText(),'50점');
  assert.equal(await page.locator('.vocab-wrong-answer-list').evaluate(el=>getComputedStyle(el).maxHeight),'320px');
  assert.match(await page.locator('.vocab-wrong-answer-list').innerText(),/내가 적은 답:.*|정답:/);
  assert.equal(await page.locator('#weeklyReviewView').innerText().then(text=>text.includes('모범답안') || text.includes('틀렸던 단어가 익숙해지는 시간')),false);
  assert.match(await page.locator('.grammar-result-back').innerText(),/학습공간으로 돌아가기/);
  await page.screenshot({path:'/tmp/yem-weekly-review-mobile.png',fullPage:true});
  // Real reload discards unfinished round answers and restores last committed result.
  await setup();
  await page.evaluate(id=>App.openWeeklyReviewModal(id),id);
  assert.match(await page.locator('#detailModalBody').innerText(),/남은 단어/);
  await page.evaluate(id=>App.showWeeklyReviewResult(id),id);
  await page.locator('#weeklyReviewRetry').click();
  assert.equal(await page.evaluate(()=>App.state.weeklyReview.questions.length),2);
  await answerQuestion(await page.evaluate(()=>App.state.weeklyReview.questions[0]));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#weeklyReviewSubmit').click();
  await page.waitForSelector('#weeklyReviewRetry');
  result=await page.evaluate(id=>AppData.getWeeklyReviewResult(id),id);
  assert.equal(result.firstScore,50);assert.equal(result.remainingIds.length,1);
  await page.locator('#weeklyReviewRetry').click();
  await answerQuestion(await page.evaluate(()=>App.state.weeklyReview.questions[0]));
  await page.locator('#weeklyReviewSubmit').click();
  await page.waitForFunction(()=>document.getElementById('weeklyReviewView').innerText.includes('COMPLETE'));
  result=await page.evaluate(id=>AppData.getWeeklyReviewResult(id),id);
  assert.equal(result.completed,true);assert.equal(result.firstScore,50);assert.equal(result.rounds.length,3);
  assert.equal(await page.locator('.weekly-review-current-score').innerText(),'100점','latest score shown while first score stays in history');
  assert.equal(await page.evaluate(()=>testDocuments.get('vocabTestResults/source_result').questionDetails.filter(q=>!q.isCorrect).length),2,'original score unchanged');
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:950});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no overflow at ${width}`);
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:`/tmp/yem-weekly-review-complete-${width}.png`,fullPage:true});
  }
  // Submitted standalone previews must keep their day controls enabled and preserve grades.
  const previewBefore=await page.evaluate(id=>{
    const original=AppData.getTests().find(t=>t.id===id), preview=structuredClone(original);
    preview.id='completed_preview';preview.isPreview=true;preview.sourceTestIds=[];
    preview.weeklyReviewResult.id=preview.id;
    testDocuments.set('tests/'+preview.id,structuredClone(preview));
    AppData.cacheGrammarTests([preview]);App.hideModal('testDetailModal');App.openWeeklyReviewModal(preview.id);
    return {questions:JSON.stringify(preview.questions),result:JSON.stringify(preview.weeklyReviewResult)};
  },id);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#testDetailModal').isVisible(),true,'pending close cannot hide a reopened modal');
  assert.equal(await page.getByRole('checkbox',{name:'금요일 제외'}).isEnabled(),true);
  await page.getByRole('checkbox',{name:'금요일 제외'}).check();
  await page.locator('#weeklyReviewDaysSave').click();
  await page.waitForFunction(()=>!App._weeklyReviewDaysSaving && AppData.getTests().find(t=>t.id==='completed_preview').requiredDays===4);
  await setup();
  await page.evaluate(()=>App.openWeeklyReviewModal('completed_preview'));
  assert.equal(await page.getByRole('checkbox',{name:'금요일 제외'}).isChecked(),true,'saved preview exclusions survive reload');
  assert.equal(await page.getByRole('checkbox',{name:'금요일 제외'}).isEnabled(),true);
  const previewAfter=await page.evaluate(()=>{const t=AppData.getTests().find(t=>t.id==='completed_preview');return {questions:JSON.stringify(t.questions),result:JSON.stringify(t.weeklyReviewResult)}});
  assert.deepEqual(previewAfter,previewBefore,'preview questions and submitted grades are unchanged');
  await page.screenshot({path:'/tmp/yem-completed-preview-day-controls.png',fullPage:true});
  // Delete from the modal: cancel, failed save/retry, then success.
  assert.equal(await page.locator('#weeklyReviewDelete').isVisible(),true);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#weeklyReviewDelete').click();
  assert.equal(await page.evaluate(()=>testDocuments.has('tests/completed_preview')),true,'cancel preserves preview');
  await page.evaluate(()=>{window.failNextTransaction=true;});
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#weeklyReviewDelete').click();
  await page.waitForFunction(()=>!App._weeklyReviewDeleting);
  assert.equal(await page.evaluate(()=>AppData.getTests().some(t=>t.id==='completed_preview')),true,'failed delete preserves preview');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#weeklyReviewDelete').click();
  await page.waitForFunction(()=>!testDocuments.has('tests/completed_preview'));
  await page.locator('#testDetailModal').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>AppData.getWeeklyReviewResult('completed_preview')),null);
  // Delete a completed real review from the administrator list as well.
  await page.evaluate(()=>App.showAdminDashboard());
  const reviewRow=page.locator('#adminTestsTableBody tr').filter({has:page.locator(`button[onclick="App.openWeeklyReviewModal('${id}')"]`)});
  page.once('dialog',dialog=>dialog.accept());
  await reviewRow.getByRole('button',{name:'주간 복습 삭제',exact:true}).click();
  await page.waitForFunction(id=>!AppData.getTests().some(t=>t.id===id),id);
  assert.equal(await page.evaluate(id=>testDocuments.has('tests/'+id),id),false);
  assert.equal(await page.evaluate(()=>testDocuments.get('vocabTestResults/source_result').questionDetails.filter(q=>!q.isCorrect).length),2,'deleting review preserves original grades');
  await setup();
  await page.evaluate(()=>{FirebaseStore.reviewSourcesReady={tests:true,vocabSets:true,vocabTestResults:true};AppData.queueWeeklyReviews();});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(id=>AppData.getTests().some(t=>t.id===id),id),false,'deletion survives reload and automatic generation');
  assert.equal(await page.evaluate(id=>AppData.isWeeklyReviewDeleted(id,501),id),true);
  assert.deepEqual(errors,[]);
  console.log('Weekly review browser checks passed: readiness, generation, KST opening, unified modal, all questions on one page, progress counter, blank confirmation/cancel, save retry, reload, 3 rounds, score preservation, mobile/desktop, admin deletion from list/modal, cancellation, failed-delete retry, no regeneration.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser) await browser.close();server.close();});
