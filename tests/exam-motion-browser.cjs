// Actual UI and stores; all external requests and production Firebase are blocked.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.superpowers/sdd/2026-11-13-exam-presentation');
fs.mkdirSync(artifacts, { recursive: true });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (name === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(html); }
  else if (['/style.css', '/pace.css', '/auth.css', '/exam_motion.css'].includes(name)) { res.setHeader('Content-Type', 'text/css'); res.end(fs.readFileSync(path.join(root, name.slice(1)))); }
  else { res.statusCode = 404; res.end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ content: fs.readFileSync(process.env.TAILWIND_SCRIPT_PATH || '/private/tmp/yem-tailwind-test.js', 'utf8') });
  for (const name of ['weekly_review_logic.js', 'grammar_data.js', 'grammar_paper.js', 'exam_mode.js', 'exam_motion.js', 'data.js', 'grammar_store.js', 'weekly_review_store.js', 'app.js', 'grammar.js', 'weekly_review.js', 'auth.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, name), 'utf8') });
  await page.evaluate(async () => {
    document.getElementById('initialLoadingSkeleton').remove();
    window.documents = new Map(); window.failWrite = false; window.failPreference = false;
    window.firebaseDB = {};
    window.firebaseFns = {
      doc: (_, collection, id) => `${collection}/${id}`,
      runTransaction: async (_, callback) => {
        if (window.failWrite) { window.failWrite = false; throw Error('테스트 저장 실패'); }
        const writes = [];
        const result = await callback({
          get: async ref => ({ exists: () => documents.has(ref), data: () => structuredClone(documents.get(ref)) }),
          set: (ref, data) => writes.push([ref, structuredClone(data)])
        });
        writes.forEach(([ref, data]) => documents.set(ref, data)); return result;
      }
    };
    FirebaseStore.students = [{ id: 501, name: '시험 모드 학생', target: '목표 보존', accountUid: 'student1' }];
    FirebaseStore.tests = [];
    PaceAuth.ready = async () => {};
    PaceAuth.auth = { currentUser: { uid: 'student1' } }; PaceAuth.member = { studentId: 501 }; PaceAuth.generation = 1;
    PaceAuth.raw = {
      doc: window.firebaseFns.doc,
      updateDoc: async (ref, patch) => {
        if (window.failPreference) throw Error('설정 저장 실패');
        documents.set(ref, { ...(documents.get(ref) || {}), ...structuredClone(patch) });
      }
    };
    window.AcademicManager = { prepareTargetUnivEditor() {} };
    App.state.isAdminLoggedIn = true; App.state.selectedStudentId = 501; App.state.adminSelectedStudentId = 501;
    const test = await AppData.assignGrammarTest({ studentId: 501, date: App.getTodayDateString(), time: '00:00', endTime: '23:59', unitId: 'relative-pronouns', parts: ['concept', 'practice'] });
    window.grammarId = test.id;
    App.state.isAdminLoggedIn = false; App.state.isStudentLoggedIn = true;
    await App.selectStudent(501);
  });
  await page.evaluate(() => App.openGrammarTestModal(grammarId));
  assert.equal(await page.locator('.grammar-result-row[role=listitem]').count(), 2);
  assert.ok((await page.locator('.grammar-study-download').boundingBox()).height >= 44);
  assert.equal(await page.locator('.grammar-result-row .result-index').count(), 0);
  await page.screenshot({ path: path.join(artifacts, 'grammar-detail-desktop.png') });
  // Cancellation and failed preference saves must not create an exam start.
  await page.evaluate(() => { void App.startGrammarTest(grammarId); });
  await page.locator('#examModeDialog[open]').waitFor();
  assert.equal(await page.evaluate(() => Boolean(App.grammarTestById(grammarId).grammarStartedAt)), false);
  await page.locator('#examModeDialog button[aria-label="닫기"]').click();
  await page.waitForFunction(() => !App._grammarModeSelecting);
  await page.evaluate(() => { window.failPreference = true; void App.startGrammarTest(grammarId); });
  await page.locator('#examModeDialog[open]').waitFor();
  await page.locator('[name="initialExamMode"][value="motion"]').check();
  await page.getByRole('button', { name: /선택하고 시작/ }).click();
  await page.waitForFunction(() => document.getElementById('examModeMessage').textContent.includes('설정 저장 실패'));
  assert.equal(await page.evaluate(() => App.state.grammarTest == null), true);
  await page.evaluate(() => { window.failPreference = false; });
  await page.getByRole('button', { name: /선택하고 시작/ }).click();
  await page.waitForSelector('#motionExamView.is-feeding');
  assert.equal(await page.locator('#motionExamPaper').evaluate(el => el.inert), true);
  await page.waitForFunction(() => !ExamMotionPaper.printing);
  assert.equal(await page.locator('#motionExamPaper .grammar-blank').count(), 42);
  assert.equal(await page.locator('.motion-masthead p').innerText(), '문법 테스트');
  assert.equal(await page.evaluate(() => FirebaseStore.students[0].examMode), 'motion');
  assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
  // A cloud preference change must not alter the active paper/session.
  await page.evaluate(() => { FirebaseStore.students[0].examMode = 'classic'; });
  assert.equal(await page.evaluate(() => App.state.grammarTest.presentationMode), 'motion');
  await page.screenshot({ path: path.join(artifacts, 'motion-concept-desktop.png') });
  await page.evaluate(() => {
    const answers = Object.fromEntries(GrammarLogic.blanks(App.state.grammarTest.test.grammarContent).map(b => [b.id, b.answer]));
    for (const input of document.querySelectorAll('#motionExamPaper [data-grammar-blank]')) { input.value = answers[input.dataset.grammarBlank]; input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  assert.match(await page.locator('#motionAnsweredCount').innerText(), /^42 \/ 42/);
  await page.getByRole('button', { name: '실전으로 넘어가기', exact: true }).click();
  await page.waitForSelector('[data-motion-question="9"]');
  assert.equal(await page.locator('[data-motion-question]').count(), 10);
  assert.equal(await page.locator('#motionExamPaper input[type="radio"]').count(), 50);
  assert.equal(await page.evaluate(() => ExamMotionPaper.printing), false);
  const first = page.locator('[data-motion-question="0"] .motion-options label');
  await first.nth(2).click();
  const sameInput = await first.nth(2).locator('input').evaluateHandle(el => el);
  await first.nth(2).locator('input').focus(); await page.keyboard.press('ArrowDown');
  assert.equal(await first.nth(3).locator('input').isChecked(), true);
  assert.equal(await sameInput.evaluate(el => el.isConnected), true);
  await page.evaluate(() => {
    const questions = App.state.grammarTest.test.grammarContent.questions;
    questions.forEach((q, i) => document.querySelector(`[name="motionGrammar${i}"][value="${q.answer}"]`).click());
  });
  await page.screenshot({ path: path.join(artifacts, 'motion-practice-desktop.png') });
  await page.setViewportSize({ width: 768, height: 980 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(artifacts, 'motion-practice-tablet.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(artifacts, 'motion-practice-mobile.png') });
  await page.evaluate(() => { window.failWrite = true; });
  await page.getByRole('button', { name: '답안 제출', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('motionSubmissionStatus').textContent.includes('제출 실패'));
  assert.equal(await page.locator('#motionExamPaper input:checked').count(), 10);
  assert.equal(await page.locator('#motionExamPaper').evaluate(el => el.inert), false);
  await page.getByRole('button', { name: '답안 제출', exact: true }).click();
  await page.waitForSelector('#grammarCompletionView:not(.hidden)');
  assert.equal(await page.evaluate(() => App.grammarTestById(grammarId).grammarResults.practice.score), 100);
  assert.equal(await page.evaluate(() => document.querySelector('main').inert), false);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  await page.evaluate(() => App.openGrammarTestModal(grammarId));
  assert.match(await page.locator('[data-grammar-result-widget=practice]').innerText(), /100/);
  assert.match(await page.locator('[data-grammar-result-widget=concept]').innerText(), /채점 대기/);
  await page.screenshot({ path: path.join(artifacts, 'grammar-detail-mobile.png') });
  await page.evaluate(() => App.closeAllModals());
  // Profile preference changes use actual auth save and retain the learning goal.
  await page.evaluate(() => { PaceAuth.openProfileSettings('examMode'); });
  await page.locator('[name="profileExamMode"][value="motion"]').check();
  await page.locator('#examModeSettingsForm button[type=submit]').click();
  await page.waitForFunction(() => document.getElementById('examModeSettingsMessage').textContent.includes('저장했어요'));
  assert.equal(await page.evaluate(() => FirebaseStore.students[0].target), '목표 보존');
  await page.locator('#passwordSettingsDialog button[aria-label="닫기"]').click();
  await page.evaluate(async () => {
    const test = { id: 'motion-review', type: 'VOCAB_REVIEW', studentId: 501, title: '주간 복습', date: '2026-11-01', weekStart: '2026-10-26', weekEnd: '2026-10-30', reviewStage: 'READY', status: 'SCHEDULED', reviewRevision: 1, questions: [
      { id: 'c1', mode: 'CHOICE', word: { en: 'accomplish', ko: '성취하다' }, choices: ['성취하다', '예상하다', '거절하다', '허락하다', '비교하다'] },
      { id: 's1', mode: 'SPELLING', word: { en: 'opportunity', ko: '기회' } }
    ] };
    documents.set('tests/motion-review', structuredClone(test)); FirebaseStore.tests.push(test);
    App.openWeeklyReviewModal(test.id);
  });
  await page.getByRole('button', { name: '테스트 응시', exact: true }).click();
  await page.waitForFunction(() => !ExamMotionPaper.printing);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.equal(await page.locator('.motion-masthead p').innerText(), '복습 테스트');
  assert.equal(await page.locator('.motion-spelling').evaluate(el => getComputedStyle(el).borderBottomWidth), '0px');
  await page.locator('[data-motion-review="c1"] .motion-options label').first().click();
  const spelling = page.getByRole('textbox', { name: '기회', exact: true });
  await spelling.fill('wrong');
  await page.screenshot({ path: path.join(artifacts, 'motion-review-mobile.png') });
  await page.evaluate(() => { window.failWrite = true; });
  await page.getByRole('button', { name: '답안 제출', exact: true }).click();
  await page.getByRole('button', { name: '다시 제출', exact: true }).waitFor();
  assert.equal(await spelling.inputValue(), 'wrong');
  await page.getByRole('button', { name: '다시 제출', exact: true }).click();
  await page.waitForSelector('#weeklyReviewRetry');
  assert.equal(await page.evaluate(() => AppData.getWeeklyReviewResult('motion-review').firstScore), 50);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#weeklyReviewRetry').click();
  await page.waitForSelector('#motionExamView:not(.hidden)');
  assert.equal(await page.locator('.motion-question').count(), 1);
  assert.equal(await page.evaluate(() => ExamMotionPaper.printing), false);
  await page.getByRole('textbox', { name: '기회', exact: true }).fill('opportunity');
  await page.getByRole('button', { name: '답안 제출', exact: true }).click();
  await page.waitForFunction(() => AppData.getWeeklyReviewResult('motion-review').completed);
  assert.equal(await page.evaluate(() => AppData.getWeeklyReviewResult('motion-review').firstScore), 50);
  assert.equal(await page.evaluate(() => document.querySelector('main').inert), false);
  // A queued close event from a cancelled chooser must not close a newly opened one.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const content = ExamMotionPaper.header('weekly', '정리 검증', ['시안 안내']);
    ExamMotionPaper.open({ kind: 'weekly', title: '첫 출력', content });
    ExamMotionPaper.close();
    ExamMotionPaper.open({ kind: 'weekly', title: '다음 출력', content });
    ExamMotionPaper.close();
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#motionExamView').evaluate(el => el.classList.contains('hidden')), true);
  assert.equal(await page.evaluate(() => document.querySelector('main').inert), false);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  await page.evaluate(() => {
    delete FirebaseStore.students[0].examMode;
    void ExamPresentation.ensureMode(501);
    ExamPresentation.cancelPending();
    void ExamPresentation.ensureMode(501);
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#examModeDialog').evaluate(el => el.open), true);
  await page.evaluate(() => ExamPresentation.cancelPending());
  assert.deepEqual(errors, []);
  console.log('PASS: first choice cancel/save failure; actual account persistence; paper printing/inert; 42 blanks; all ten questions; keyboard choices; answer retention/retry; 100-point score; profile change; weekly rounds and first-score preservation; reduced motion and mobile.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
