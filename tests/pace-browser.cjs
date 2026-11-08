// Isolated rendering/data tests: no Firebase SDK or production network requests.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
let browser;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')); }
  else if (['/style.css', '/pace.css', '/pace-symbol.svg'].includes(pathname)) {
    res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'image/svg+xml');
    res.end(fs.readFileSync(path.join(root, pathname.slice(1))));
  } else { res.statusCode = 404; res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
  await page.route('**/*', route => {
    if (route.request().url().startsWith('http://127.0.0.1:')) return route.continue();
    if (/firebase|firestore/.test(route.request().url())) externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: fs.readFileSync(process.env.TAILWIND_SCRIPT_PATH || '/private/tmp/yem-tailwind-test.js', 'utf8') + '\n' + inline.find(code => code.includes('tailwind.config')) });
  await page.evaluate(() => document.body.classList.add('tailwind-test-ready'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('header')).position === 'sticky' && getComputedStyle(document.getElementById('vocabTestView')).display === 'none');
  for (const file of ['weekly_review_logic.js', 'grammar_data.js', 'data.js', 'grammar_store.js', 'weekly_review_store.js', 'app.js', 'grammar.js', 'weekly_review.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
  await page.addScriptTag({ content: inline.find(code => code.includes('const AcademicManager =')) });
  await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'pace.js'), 'utf8') });
  await page.evaluate(() => {
    AppData.queueWeeklyReviews = () => {};
    document.getElementById('initialLoadingSkeleton')?.remove();
    FirebaseStore.students = [{ id: 501, name: '검증 학생', target: '나의 목표', loginId: 'pace-test', password: '1234' }, { id: 502, name: '빈 기록 학생', accessMode: 'CALENDAR_ONLY' }];
    FirebaseStore.studentsLoaded = true; FirebaseStore.testsLoaded = true;
    FirebaseStore.tests = [
      { id: 'v1', studentId: 501, type: 'VOCAB', title: '단어 1', date: App.getTodayDateString(), status: 'PASS', score: '객관식 80점 · 스펠링 100점' },
      { id: 'v2', studentId: 501, type: 'VOCAB', title: '단어 2', date: App.getTodayDateString(), status: 'PASS', score: '90점 (9/10)' },
      { id: 'v3', studentId: 501, type: 'VOCAB', title: '미응시', date: App.getTodayDateString(), status: 'SCHEDULED', score: '' },
      { id: 'other', studentId: 502, type: 'VOCAB', title: '다른 학생', date: App.getTodayDateString(), status: 'PASS', score: 100 }
    ];
    FirebaseStore.vocabTestResults = [
      { id: 'a0', testId: 'v1', studentId: 501, direction: 2, score: 20, completedAt: '2026-11-01T00:00:00Z' },
      { id: 'a', testId: 'v1', studentId: 501, direction: 2, score: 80, completedAt: '2026-11-02T00:00:00Z' },
      { id: 'b', testId: 'v1', studentId: 501, direction: 3, score: 100 },
      { id: 'c', testId: 'v1', studentId: 501, direction: 4, score: 10, waitingGrading: true },
      { id: 'd', testId: 'other', studentId: 502, direction: 2, score: 100 }
    ];
    FirebaseStore.vocabSets = [];
    AcademicManager.hookIntoApp();
    App.init();
  });
  assert.equal(await page.title(), 'PACE');
  assert.equal(await page.getByRole('button', { name: '학생 체험' }).count(), 0);
  for (const width of [390, 639, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(await page.locator('#mobileSidebarToggleBtn').isVisible(), false, 'Login hides the menu at every viewport');
    await page.evaluate(() => App.openMobileSidebar());
    assert.equal(await page.locator('#mobileSidebarBackdrop').isVisible(), false);
  }
  assert.equal(await page.getByText('01 — 시작하기', { exact: true }).count(), 0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: '/private/tmp/pace-production-login.png', fullPage: true });
  // Authentication is exercised by auth-integration.cjs; seed the authenticated UI fixture here.
  await page.evaluate(() => { App.state.isStudentLoggedIn = true; App.selectStudent(501); });
  await page.locator('.pace-home-panels').waitFor();
  assert.equal(await page.locator('#landingView').isVisible(), false, 'Login stays hidden after navigation');
  assert.match(await page.locator('#studentBanner').innerText(), /검증 학생/);
  assert.equal(await page.getByRole('button', { name: '아직 배정된 복습이 없어요' }).isEnabled(), false);
  assert.deepEqual(await page.evaluate(() => App.paceScoreRecords(501).map(r => r.score).sort((a,b)=>a-b)), [80,90,100]);
  await page.getByRole('button', { name: '나의 성적 살펴보기' }).click();
  await page.locator('#paceReportView:not(.hidden)').waitFor();
  assert.equal(await page.locator('.pace-report-score').innerText(), '90점');
  assert.equal(await page.locator('.pace-history>div').count(), 3);
  await page.evaluate(() => { FirebaseStore.vocabTestResults.find(r => r.id === 'c').gradedByAdmin = true; AppData.refreshCloudScreens(); });
  assert.equal(await page.locator('.pace-report-score').innerText(), '70점', 'Live grading updates report');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#studentSidebar').isVisible(), false);
    await page.screenshot({ path: `/private/tmp/pace-production-report-${width}.png`, fullPage: true });
    await page.locator('#paceReportView').getByRole('button', { name: '학습공간으로 돌아가기' }).click();
    await page.locator('.pace-home-panels').waitFor();
    assert.equal(await page.locator('#paceReportView').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `/private/tmp/pace-production-home-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '나의 성적 살펴보기' }).click();
  }
  await page.evaluate(() => { App.state.isAdminLoggedIn = true; App.state.selectedStudentId = 502; FirebaseStore.tests = []; App.renderPaceReport(); });
  assert.equal(await page.locator('.pace-report-score').innerText(), '—');
  assert.match(await page.locator('.pace-history').innerText(), /아직 채점이 완료된/);
  await page.evaluate(async () => { App.state.isAdminLoggedIn = false; await App.selectStudent(502); });
  assert.equal(await page.locator('.pace-home-panels').isVisible(), true, 'English-only students see review and scores');
  assert.equal(await page.locator('#studentSidebar').isVisible(), false);
  await page.getByRole('button', { name: '나의 성적 살펴보기' }).click();
  assert.equal(await page.locator('#paceReportView').isVisible(), true);
  assert.equal(await page.locator('.pace-report-score').innerText(), '—');
  await page.evaluate(() => {
    const date = App.getTodayDateString();
    FirebaseStore.tests = [
      { id: 'other', studentId: 502, type: 'VOCAB', title: '영어 전용 학생 성적', date, status: 'PASS', score: 100 },
      { id: 'english-review', studentId: 502, type: 'VOCAB_REVIEW', date, weekStart: WeeklyReviewLogic.monday(date), reviewStage: 'LOCKED', questions: [], weekdayCompletion: [false,false,false,false,false] }
    ];
    AppData.refreshCloudScreens();
  });
  assert.equal(await page.locator('.pace-report-score').innerText(), '100점', 'English-only report uses own results');
  await page.locator('#paceReportView').getByRole('button', { name: '학습공간으로 돌아가기' }).click();
  await page.getByRole('button', { name: '복습 준비 현황 보기' }).click();
  assert.equal(await page.locator('#testDetailModal').isVisible(), true);
  assert.equal(await page.locator('[data-weekly-review-modal="english-review"]').count(), 1);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#testDetailModal .modal-content')).opacity) === 1);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.screenshot({ path: `/private/tmp/pace-detail-${width}.png` });
    assert.equal(await page.locator('#testDetailModal .modal-content').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  }
  await page.getByRole('button', { name: '상세 닫기', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('testDetailModal').classList.contains('hidden'));
  await page.evaluate(() => {
    const date=App.getTodayDateString(), weekStart=WeeklyReviewLogic.monday(date);
    const tests=[{id:'preview',type:'VOCAB_REVIEW',isPreview:true,date,weekStart},{id:'actual',type:'VOCAB_REVIEW',date,weekStart}];
    window.selectedReview=App.paceReview(tests).id;
  });
  assert.equal(await page.evaluate(() => selectedReview), 'actual');
  await page.evaluate(() => {
    FirebaseStore.vocabSets = [{ id: 'preview-words', title: 'Preview words', words: [{ en: 'apple', ko: '사과' }] }];
    FirebaseStore.tests = [501, 502].flatMap(studentId => ['REGULAR', 'VOCAB', 'PRACTICE', 'VOCAB_REVIEW'].map(type => ({
      id: `parity-${studentId}-${type}`, studentId, type, title: `${type} 일정`, date: App.getTodayDateString(),
      status: 'SCHEDULED', vocabSetId: 'preview-words', questions: [], reviewStage: 'LOCKED',
      weekStart: WeeklyReviewLogic.monday(App.getTodayDateString()), weekdayCompletion: [false, false, false, false, false]
    })));
  });
  // Admin preview shares the student renderer, permissions, and navigation.
  for (const studentId of [501, 502]) {
    await page.evaluate(async id => {
      App.state.isAdminLoggedIn = false;
      App.state.isStudentLoggedIn = true;
      await App.selectStudent(id);
    }, studentId);
    const studentMarkup = await page.locator('#studentDashboardView').innerHTML();
    const readDetails = () => page.evaluate(id => {
      const details = {};
      for (const test of AppData.getTestsByStudentId(id)) {
        App.openTestDetailModal(test.id);
        details[test.type] = document.getElementById('detailModalBody').innerHTML;
        App.closeAllModals();
      }
      return details;
    }, studentId);
    const studentDetails = await readDetails();
    await page.evaluate(async id => {
      App.state.isAdminLoggedIn = true;
      App.state.isStudentLoggedIn = false;
      App.state.adminSelectedStudentId = id;
      await App.selectStudent(id);
    }, studentId);
    assert.equal(await page.locator('#studentDashboardView').innerHTML(), studentMarkup);
    assert.deepEqual(await readDetails(), studentDetails, 'Every schedule detail matches the student view');
    for (const detail of Object.values(await readDetails())) {
      assert.doesNotMatch(detail, /전체 수정|일정 이동|시간 연장|체험 및 풀이|요일 제외 설정/);
    }
    if (studentId === 502) {
      assert.equal(await page.locator('#studentSidebar').isVisible(), false);
      for (const tab of ['Assessment', 'SchoolGrade', 'TargetUniv', 'Notice']) {
        assert.equal(await page.locator(`#stuTab${tab}`).isVisible(), false);
        assert.equal(await page.locator(`#stuContent${tab}`).isVisible(), false);
      }
    }
    assert.equal(await page.locator('#headerNavActions button').count(), 1);
    assert.equal(await page.locator('#headerNavActions').innerText(), '관리자 탭으로 돌아가기');
    assert.equal(await page.evaluate(() => App.state.isAdminLoggedIn), false);
    assert.equal(await page.evaluate(() => App.isCalendarOnlyStudent()), studentId === 502);
    await page.evaluate(() => App.handleLogoClick());
    assert.equal(await page.evaluate(() => App.state.view), 'student');
    await page.locator('#headerNavActions button').click();
    await page.waitForFunction(() => App.state.view === 'admin');
    assert.equal(await page.evaluate(() => App.state.isAdminLoggedIn && !App.state.isStudentLoggedIn && !App.state.isAdminStudentPreview), true);
    assert.equal(await page.evaluate(() => App.state.adminSelectedStudentId), studentId);
  }
  await page.evaluate(async () => { App.state.isAdminLoggedIn = true; await App.showAdminDashboard(); App.openAddTestModal(); });
  assert.equal(await page.getByRole('button', { name: '문법 테스트 추가', exact: true }).count(), 0);
  assert.deepEqual(await page.locator('.test-type-options input').evaluateAll(els => els.map(el => el.value)), ['VOCAB', 'PRACTICE', 'TEXT_MEMORIZE', 'GRAMMAR']);
  assert.equal(await page.locator('[name="formTestType"]:checked').inputValue(), 'VOCAB');
  for (const type of ['GRAMMAR', 'PRACTICE', 'TEXT_MEMORIZE', 'VOCAB', 'GRAMMAR']) {
    await page.locator(`.test-type-options input[value="${type}"]`).check();
    assert.equal(await page.locator('#formGrammarSection').isVisible(), type === 'GRAMMAR');
    assert.equal(await page.locator('#formStudentSection').isVisible(), type !== 'GRAMMAR');
  }
  assert.equal(await page.locator('#grammarAssignmentModal').isVisible(), false);
  assert.equal(await page.locator('[name="formGrammarPart"]:checked').count(), 2);
  await page.locator('#formTeacherNote').fill('통합 창 문법 배정');
  await page.evaluate(() => {
    window.originalAssignGrammarTest = AppData.assignGrammarTest;
    AppData.assignGrammarTest = async input => { window.savedGrammarAssignment = input; };
  });
  await page.locator('#adminTestFormModal button[type="submit"]').click();
  await page.waitForFunction(() => Boolean(window.savedGrammarAssignment));
  assert.deepEqual(await page.evaluate(() => savedGrammarAssignment.parts), ['concept', 'practice']);
  assert.equal(await page.evaluate(() => savedGrammarAssignment.note), '통합 창 문법 배정');
  await page.evaluate(() => { AppData.assignGrammarTest = window.originalAssignGrammarTest; });
  await page.waitForFunction(() => document.getElementById('adminTestFormModal').classList.contains('hidden'));
  const vocabRow = page.locator('#adminTestsTableBody tr').filter({ hasText: 'VOCAB 일정' });
  assert.equal(await vocabRow.locator('td:nth-child(2)>div:first-child>span:first-child').innerText(), '단어');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await vocabRow.locator('td:nth-child(2)>div:first-child>span:first-child').evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
    await page.screenshot({ path: `/private/tmp/pace-admin-types-${width}.png`, fullPage: true });
  }
  await page.evaluate(() => App.showLanding());
  await page.setViewportSize({ width: 390, height: 950 });
  assert.equal(await page.locator('#mobileSidebarToggleBtn').isVisible(), false, 'Returning to login hides the menu');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log('PACE production checks passed: login, student identity, actual grades, pending exclusion, live update, empty state, permissions, review selection, mobile/desktop.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
