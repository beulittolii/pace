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
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } else if (['/style.css', '/pace.css'].includes(pathname)) {
    res.setHeader('Content-Type', 'text/css');
    res.end(fs.readFileSync(path.join(root, pathname.slice(1))));
  } else if (pathname === '/관계대명사_개념학습.pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.end(fs.readFileSync(path.join(root, pathname.slice(1))));
  } else { res.statusCode = 404; res.end(); }
});

async function loadApp(page) {
  for (const file of ['weekly_review_logic.js', 'grammar_data.js', 'grammar_paper.js', 'data.js', 'grammar_store.js', 'weekly_review_store.js', 'app.js', 'grammar.js', 'weekly_review.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
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
    FirebaseStore.students = [{ id: 501, name: '문법 테스트 학생', target: '가정법 이해' }];
    FirebaseStore.tests = [...testDocuments.values()];
    App.state.isAdminLoggedIn = true;
    App.state.isStudentLoggedIn = false;
    App.state.adminSelectedStudentId = 501;
    App.state.selectedStudentId = 501;
    App.bindEvents();
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  page.on('pageerror', error => errors.push(error.message));
  // Firebase and every external script except the styling CDN are blocked.
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('firebase') || url.includes('firestore') || url.includes('googleapis.com/google.firestore')) return route.abort();
    if (!url.startsWith('http://127.0.0.1:')) {
      try { return await route.fulfill({ response: await route.fetch({ timeout: 8000 }) }); } catch (_) { return route.abort(); }
    }
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '.hidden { display:none!important }' });
  if (process.env.TAILWIND_SCRIPT_PATH) await page.addScriptTag({ content: fs.readFileSync(process.env.TAILWIND_SCRIPT_PATH, 'utf8') });
  else await page.addScriptTag({ url: 'https://cdn.tailwindcss.com' });
  await page.evaluate(() => document.body.classList.add('tailwind-test-ready'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('header')).position === 'sticky');
  await loadApp(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const comparison = await page.evaluate(() => {
      const base = { id: 'layout_fixture', date: App.getTodayDateString(), time: '00:00', endTime: '23:59', status: 'SCHEDULED', retestStatus: 'NONE' };
      const host = document.createElement('div');
      host.className = 'calendar-day-cell';
      host.style.cssText = 'width:180px;position:fixed;left:0;top:0;z-index:9999';
      host.innerHTML = App.renderCalendarLearningTest({ ...base, type: 'GRAMMAR', grammarParts: ['concept', 'practice'], grammarResults: {} }, '문법 테스트', 'fa-book', 'openGrammarTestModal') + App.renderCalendarLearningTest({ ...base, type: 'VOCAB' }, '단어 테스트', 'fa-spell-check', 'openVocabTestScheduleModal');
      document.body.appendChild(host);
      const metrics = [...host.children].map(el => {
        const rect = el.getBoundingClientRect(), icon = el.querySelector('i').getBoundingClientRect(), text = el.querySelector('span.truncate').getBoundingClientRect(), style = getComputedStyle(el);
        return { width: rect.width, height: rect.height, iconWidth: icon.width, iconHeight: icon.height, iconX: icon.x - rect.x, iconY: icon.y - rect.y, textX: text.x - rect.x, color: style.color, background: style.backgroundColor, border: style.borderColor, font: style.fontSize };
      });
      host.remove();
      return metrics;
    });
    assert.deepEqual(comparison[0], comparison[1], `grammar and vocabulary badges must match at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.evaluate(() => App.showAdminDashboard());
  await page.evaluate(() => App.openAddTestModal());
  await page.locator('[name="formTestType"][value="GRAMMAR"]').check();
  assert.equal(await page.locator('[name="formGrammarPart"]:checked').count(), 2);
  assert.equal(await page.locator('[name="formGrammarPart"]:disabled').count(), 2);
  await page.locator('#adminTestFormModal button[type="submit"]').click();
  await page.waitForFunction(() => FirebaseStore.tests.length === 1);
  const rootId = await page.evaluate(() => FirebaseStore.tests[0].id);
  await page.waitForFunction(() => document.getElementById('adminTestFormModal').classList.contains('hidden'));
  await page.evaluate(async id => {
    App.state.isAdminLoggedIn = false; App.state.isStudentLoggedIn = true;
    await App.selectStudent(501); App.openTestDetailModal(id);
  }, rootId);
  assert.equal(await page.locator('#testDetailModal').evaluate(el => el.classList.contains('grammar-detail-modal')), true);
  assert.equal(await page.locator('#detailModalBody [data-grammar-summary]').count(), 1);
  assert.equal(await page.locator('#detailModalBody > .grid.grid-cols-2').count(), 1);
  await page.screenshot({ path: '/tmp/yem-grammar-detail-desktop.png', fullPage: true });
  await page.evaluate(() => { window.failNextTransaction = true; });
  await page.getByRole('button', { name: '테스트 응시', exact: true }).click();
  await page.waitForFunction(() => !App._grammarStarting);
  assert.equal(await page.evaluate(() => App.isGrammarExamActive()), false, 'a failed start must release navigation');
  assert.equal(await page.locator('.grammar-blank').count(), 0);
  await page.evaluate(() => { window.holdNextTransaction = true; });
  await page.getByRole('button', { name: '테스트 응시', exact: true }).click();
  await page.waitForFunction(() => typeof window.releaseTestTransaction === 'function');
  assert.equal(await page.evaluate(() => App.isGrammarExamActive()), true, 'the exam must lock immediately, even while starting');
  await page.evaluate(() => App.logoutStudent());
  assert.equal(await page.evaluate(() => App.state.isStudentLoggedIn), true);
  await page.evaluate(() => window.releaseTestTransaction());
  await page.waitForSelector('.grammar-blank');
  assert.equal(await page.getByRole('button', { name: '학습공간으로 돌아가기', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '저장 재시도', exact: true }).count(), 0);
  assert.equal(await page.locator('#headerNavActions button').count(), 0);
  const afterStartTransactions = await page.evaluate(() => window.transactionCount);
  const totalBlanks = await page.locator('.grammar-blank').count();
  await page.locator('.grammar-blank').nth(0).fill('실제 사실');
  await page.locator('.grammar-blank').nth(1).fill('검토할 답안');
  await page.waitForTimeout(850);
  assert.equal(await page.evaluate(() => window.transactionCount), afterStartTransactions, 'typing must not autosave');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('yem_grammar_draft_')).length), 0);
  await page.locator('header [onclick="App.handleLogoClick()"]', { hasText: 'PACE' }).click();
  await page.evaluate(async () => { await App.selectStudent(999); await App.showLanding(); await App.logoutStudent(); await App.exitGrammarTest(); App.showPracticeTestView(); });
  assert.equal(await page.evaluate(() => App.state.view), 'grammarTest');
  assert.equal(await page.evaluate(() => App.state.selectedStudentId), 501);
  assert.equal(await page.evaluate(() => App.state.isStudentLoggedIn), true);
  await page.evaluate(() => { window.backWasBlocked = false; window.addEventListener('popstate', () => { window.backWasBlocked = true; }, { once: true }); history.back(); });
  await page.waitForFunction(() => window.backWasBlocked);
  assert.equal(await page.evaluate(() => history.state.grammarExamGuard === App._grammarHistoryGuard), true);
  assert.equal(await page.locator('.grammar-blank').nth(0).inputValue(), '실제 사실');
  let unloadWarning = false;
  page.once('dialog', async dialog => { unloadWarning = dialog.type() === 'beforeunload'; await dialog.dismiss(); });
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  assert.equal(unloadWarning, true);
  assert.equal(await page.locator('.grammar-blank').nth(0).inputValue(), '실제 사실');
  let message = '';
  page.once('dialog', async dialog => { message = dialog.message(); await dialog.dismiss(); });
  await page.getByRole('button', { name: '실전으로 넘어가기', exact: true }).click();
  assert.ok(message.includes(`${totalBlanks - 2}개`));
  assert.equal(await page.locator('.grammar-blank').count(), totalBlanks);
  assert.equal(await page.locator('.grammar-blank').nth(0).inputValue(), '실제 사실');
  await page.evaluate(() => { window.failNextTransaction = true; });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '실전으로 넘어가기', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('grammarSubmissionStatus').textContent.includes('제출 실패'));
  assert.equal(await page.locator('.grammar-blank').nth(0).inputValue(), '실제 사실');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '실전으로 넘어가기', exact: true }).click();
  await page.waitForFunction(() => App.state.grammarTest.test.grammarStage === 'practice');
  assert.equal(await page.locator('.grammar-blank').count(), 0);
  assert.equal(await page.getByRole('button', { name: '제출', exact: true }).count(), 0);
  assert.ok(await page.locator('#grammarPracticeTopInfo').innerText().then(s => s.includes('실전')));
  assert.equal(await page.evaluate(() => App.isGrammarExamActive()), true);
  await page.evaluate(() => App.exitGrammarTest());
  assert.equal(await page.evaluate(() => App.state.grammarTest.test.grammarStage), 'practice');
  assert.equal(await page.evaluate(id => Boolean(App.grammarTestById(id).grammarDraft), rootId), false);
  const answers = await page.evaluate(() => App.state.grammarTest.test.grammarContent.questions.map(q => q.answer));
  for (let i = 0; i < 10; i++) {
    await page.evaluate(index => App.renderGrammarPractice(index), i);
    if (i < 9) await page.locator(`#grammarTestContent button[onclick="App.selectPracticeChoice(${i < 8 ? answers[i] : answers[i] % 5 + 1})"]`).click();
    if (i === 8) assert.equal(await page.getByRole('button', { name: /답안 최종 제출하기/ }).count(), 0);
  }
  assert.equal(await page.getByRole('button', { name: /답안 최종 제출하기/ }).count(), 1);
  await page.evaluate(() => document.getElementById('toastContainer').replaceChildren());
  await page.screenshot({ path: '/tmp/yem-grammar-practice-desktop.png', fullPage: true });
  let missingMessage = '';
  page.once('dialog', async d => { missingMessage = d.message(); await d.dismiss(); });
  await page.getByRole('button', { name: /답안 최종 제출하기/ }).click();
  assert.ok(missingMessage.includes('1문제'));
  assert.equal(await page.locator('#grammarProgress [role=progressbar]').count(), 2);
  assert.equal(await page.locator('#grammarProgress [role=progressbar]').nth(0).getAttribute('aria-valuenow'), '100');
  assert.equal(await page.locator('#grammarProgress [role=progressbar]').nth(1).getAttribute('aria-valuenow'), '90');
  await page.evaluate(() => { window.failNextTransaction = true; });
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: /답안 최종 제출하기/ }).click();
  await page.waitForFunction(() => document.getElementById('grammarSubmissionStatus').textContent.includes('제출 실패'));
  assert.equal(await page.evaluate(() => App.isGrammarExamActive()), true, 'a failed final submission must retain the lock');
  assert.equal(await page.evaluate(() => App.state.grammarTest.test.grammarStage), 'practice');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: /답안 최종 제출하기/ }).click();
  await page.waitForSelector('#grammarCompletionView:not(.hidden)');
  assert.equal(await page.locator('#grammarResultModal').isVisible(), false);
  await page.screenshot({ path: '/tmp/yem-grammar-completion-desktop.png', fullPage: true });
  assert.match(await page.locator('.grammar-completion-concept').innerText(), /채점 대기 중/);
  const clockCentered = await page.locator('.grammar-result-symbol').evaluate(el => {
    const parent = el.getBoundingClientRect(), icon = el.querySelector('svg').getBoundingClientRect();
    return Math.abs(parent.x + parent.width / 2 - icon.x - icon.width / 2) < 1 && Math.abs(parent.y + parent.height / 2 - icon.y - icon.height / 2) < 1;
  });
  assert.equal(clockCentered, true);

  assert.equal(await page.locator('.grammar-completion-verdict').innerText(), 'PASS');
  assert.equal((await page.locator('.grammar-completion-score').innerText()).replace(/\s/g, ''), '80점');
  assert.equal(await page.evaluate(() => App.isGrammarExamActive()), false);
  assert.ok(await page.locator('#headerNavActions button').count() > 0);
  assert.equal(await page.evaluate(id => App.grammarTestById(id).grammarResults.concept.waitingGrading, rootId), true);
  await page.evaluate(id => { App.closeAllModals(); App.openGrammarResult(id, 'concept'); }, rootId);
  assert.equal(await page.locator('#grammarResultBody .grammar-paper').count(), 1);
  assert.equal(await page.locator('#grammarResultBody .grammar-review-blank').count(), totalBlanks);
  assert.equal(await page.locator('#grammarResultBody .grammar-table').count(), 1);
  await page.evaluate(id => {
    App.closeAllModals(); App.state.isAdminLoggedIn = true; App.state.isStudentLoggedIn = false;
    App.openGrammarGrading(id);
  }, rootId);
  assert.equal(await page.locator('#grammarGradingSave').isDisabled(), true);
  await page.locator('#grammarGradingItems input[type="radio"]').first().check();
  assert.equal(await page.locator('#grammarGradingSave').isDisabled(), false);
  await page.locator('#grammarGradingSave').click();
  await page.waitForFunction(id => App.grammarTestById(id).grammarResults.concept.waitingGrading === false, rootId);
  await page.evaluate(() => App.openGrammarAssignmentModal());
  assert.equal(await page.locator('[name="grammarPart"][value="concept"]').isEnabled(), true);
  assert.equal(await page.locator('[name="grammarPart"][value="practice"]').isEnabled(), false);
  await page.locator('#grammarAssignmentSave').click();
  await page.waitForFunction(() => FirebaseStore.tests.length === 2);
  const retestId = await page.evaluate(() => FirebaseStore.tests.find(t => t.grammarSequence === 1).id);
  await page.evaluate(async id => {
    App.closeAllModals(); App.state.isAdminLoggedIn = false; App.state.isStudentLoggedIn = true;
    await App.startGrammarTest(id);
  }, retestId);
  assert.equal(await page.getByRole('button', { name: '실전으로 넘어가기', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '제출', exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.getElementById('toastContainer').replaceChildren());
  await page.screenshot({ path: '/tmp/yem-grammar-concept-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'mobile page must not overflow horizontally');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.waitForFunction(id => App.grammarTestById(id).grammarStage === 'done', retestId);
  assert.equal(await page.evaluate(id => App.grammarTestById(id).grammarResults.concept.waitingGrading, retestId), true);
  assert.equal(await page.evaluate(id => Boolean(App.grammarTestById(id).grammarResults.practice), retestId), false);
  const legacy = await page.evaluate(() => {
    const getResult = AppData.getVocabTestResult;
    AppData.getVocabTestResult = () => ({ passed: true, score: 90, cutoffScore: 80 });
    const vocabHtml = App.renderVocabTestButton({ id: 'fixture_vocab', words: [] }, 501, 2, '객관식', '');
    AppData.getVocabTestResult = getResult;
    return { completedLabels: (vocabHtml.match(/통과 완료/g) || []).length, scoreKept: vocabHtml.includes('90점'), practice: App.getTestBadgeStyle({ type: 'PRACTICE', practiceResult: { score: 70 } }).tag };
  });
  assert.equal(legacy.completedLabels, 1, 'only the large vocabulary completion label must remain');
  assert.equal(legacy.scoreKept, true);
  assert.equal(legacy.practice, '응시 완료', 'existing practice completion behavior must stay unchanged');
  await page.evaluate(async () => { App.closeAllModals(); App.state.isAdminLoggedIn = true; App.state.isStudentLoggedIn = false; await App.showAdminDashboard(); });
  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(id => App.deleteGrammarTest(id), rootId);
  assert.equal(await page.evaluate(() => FirebaseStore.tests.length), 0);
  assert.equal(await page.evaluate(() => testDocuments.size), 0);
  for (const scenario of [{ direction: 2, correct: 8, verdict: 'PASS' }, { direction: 3, correct: 6, verdict: 'FAIL' }, { direction: 4, correct: 8, verdict: 'REVIEW' }, { direction: 4, correct: 10, verdict: 'REVIEW' }, { direction: 5, correct: 10, verdict: 'PASS' }]) {
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.evaluate(async scenario => {
      App.closeAllModals();
      App.state.isAdminLoggedIn = false; App.state.isStudentLoggedIn = true;
      AppData.saveVocabTestResult = async result => { window.lastVocabResult = result; };
      const words = Array.from({ length: 10 }, (_, i) => ({ en: `word${i}`, ko: `뜻 ${i}`, defEn: `Definition ${i}` }));
      App.state.vocabTest = { studentId: 501, setId: 'vocab_result_fixture', setTitle: '워드마스터 · Day 01', direction: scenario.direction, score: scenario.correct, cutoffScore: 80, currentRound: 1, allWords: words, questions: words.map((word, i) => ({ word, answered: i < scenario.correct ? word.en : 'wrong', spellingInput: i < scenario.correct ? word.en : 'wrong', spellingCorrect: i < scenario.correct, meaningInput: word.ko, isCorrect: i < scenario.correct })), isCompleted: false };
      App.showVocabTestView();
      await App.renderVocabResult();
      document.getElementById('toastContainer').replaceChildren();
    }, scenario);
    assert.equal(await page.locator('#vocabTestContent .vocab-single-result').count(), 1);
    assert.equal(await page.locator('#vocabTestContent .grammar-result-panels').count(), 0);
    assert.equal(await page.locator('#vocabTestContent .grammar-completion-verdict').innerText(), scenario.verdict);
    assert.equal((await page.locator('#vocabTestContent .vocab-score-value').innerText()).replace(/\s/g, ''), `${scenario.correct * 10}점`);
    assert.equal(await page.locator('#vocabTestView > div:first-child').isVisible(), false);
    assert.equal(await page.evaluate(() => lastVocabResult.waitingGrading), scenario.verdict === 'REVIEW');
    assert.equal(await page.evaluate(() => lastVocabResult.passed), scenario.verdict === 'PASS');
    if (scenario.verdict === 'FAIL') assert.ok((await page.locator('#vocabTestContent').innerText()).includes('10분 후 재응시 가능'));
    if (scenario.verdict === 'REVIEW' && scenario.correct === 10) assert.ok((await page.locator('#vocabTestContent').innerText()).includes('최종 성적에 반영'));
    if (scenario.direction === 2) await page.screenshot({ path: '/tmp/yem-vocab-result-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (scenario.direction === 2) await page.screenshot({ path: '/tmp/yem-vocab-result-mobile.png', fullPage: true });
    await page.locator('#vocabTestContent').getByRole('button', { name: /학습공간으로 돌아가기/ }).click();
    assert.equal(await page.evaluate(() => App.state.view), 'student');
  }
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.evaluate(async () => {
    App.state.isAdminLoggedIn = true;
    const test = await AppData.assignGrammarTest({ studentId: 501, date: App.getTodayDateString(), time: '00:00', endTime: '23:59', parts: ['concept', 'practice'] });
    window.lateGradingTestId = test.id;
    await AppData.updateGrammarTest(test.id, current => {
      current.grammarStage = 'practice';
      current.grammarResults.concept = { answers: {}, waitingGrading: true, score: null };
    });
    App.state.isAdminLoggedIn = false; App.state.isStudentLoggedIn = true;
    await App.startGrammarTest(test.id);
    // 별도의 관리자 채점이 실전 응시 도중 서버에 도착한 상황.
    await AppData.updateGrammarTest(test.id, current => {
      const answers = Object.fromEntries(GrammarLogic.blanks(current.grammarContent).map(b => [b.id, b.answer]));
      current.grammarResults.concept = GrammarLogic.gradeConcept(current.grammarContent, answers, {});
    });
    window.assertPendingSession = App.state.grammarTest.test.grammarResults.concept.waitingGrading;
    App.state.grammarTest.answers.practice = Object.fromEntries(test.grammarContent.questions.map((q, i) => [i, q.answer]));
    await App.submitGrammarPractice();
  });
  assert.equal(await page.evaluate(() => assertPendingSession), false);
  assert.equal(await page.locator('[data-grammar-score-part="concept"] .grammar-completion-verdict').innerText(), 'PASS');
  assert.equal((await page.locator('[data-grammar-score-part="concept"] .grammar-completion-score').innerText()).replace(/\s/g, ''), '100점');
  assert.equal(await page.locator('[data-grammar-score-part="concept"]').evaluate(el => el.classList.contains('is-pass')), true);
  await page.screenshot({ path: '/tmp/yem-grammar-graded-completion.png', fullPage: true });
  await page.evaluate(async () => {
    await AppData.updateGrammarTest(lateGradingTestId, current => {
      current.grammarResults.concept = GrammarLogic.gradeConcept(current.grammarContent, {}, {});
    });
    // 수동으로 결과 화면을 다시 열지 않아도 갱신되어야 한다.
  });
  assert.equal(await page.locator('[data-grammar-score-part="concept"] .grammar-completion-verdict').innerText(), 'FAIL');
  assert.equal((await page.locator('[data-grammar-score-part="concept"] .grammar-completion-score').innerText()).replace(/\s/g, ''), '0점');
  assert.equal(await page.locator('[data-grammar-score-part="concept"]').evaluate(el => el.classList.contains('is-fail')), true);
  // Relation-pronoun unit: real controls and in-memory persistence, no production writes.
  const artifacts = path.join(root, '.superpowers', 'sdd', '2026-11-13-relative-pronouns');
  fs.mkdirSync(artifacts, { recursive: true });
  await page.evaluate(async () => {
    App.state.isAdminLoggedIn = true; App.state.isStudentLoggedIn = false;
    await App.showAdminDashboard(); App.openAddTestModal();
  });
  await page.locator('[name="formTestType"][value="GRAMMAR"]').check();
  assert.deepEqual(await page.locator('#formGrammarUnit option').allTextContents(), ['가정법', '관계대명사']);
  await page.locator('#formGrammarUnit').selectOption('relative-pronouns');
  assert.equal(await page.locator('[name="formGrammarPart"]:checked:disabled').count(), 2);
  await page.screenshot({ path: path.join(artifacts, 'relative-assignment.png'), fullPage: true });
  await page.locator('#adminTestFormModal button[type="submit"]').click();
  await page.waitForFunction(() => FirebaseStore.tests.some(t => t.grammarUnitId === 'relative-pronouns'));
  const relativeId = await page.evaluate(() => FirebaseStore.tests.find(t => t.grammarUnitId === 'relative-pronouns').id);
  await page.evaluate(async id => {
    App.state.isAdminLoggedIn = false; App.state.isStudentLoggedIn = true;
    await App.selectStudent(501); App.openGrammarTestModal(id);
  }, relativeId);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#detailModalBody a[download]').click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), '관계대명사_개념학습.pdf');
  assert.equal(await download.failure(), null);
  await page.getByRole('button', { name: '테스트 응시', exact: true }).click();
  await page.waitForSelector('#grammarTestContent .grammar-blank');
  const relativeBlanks = await page.evaluate(() => GrammarLogic.blanks(GRAMMAR_UNITS['relative-pronouns']).length);
  assert.equal(await page.locator('#grammarTestContent .grammar-blank').count(), relativeBlanks);
  assert.equal(await page.locator('#grammarTestContent h1').innerText(), '관계대명사');
  assert.equal(await page.locator('#grammarTestContent').innerText().then(text => text.includes('가정법')), false);
  await page.screenshot({ path: path.join(artifacts, 'relative-concept-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(artifacts, 'relative-concept-mobile.png'), fullPage: true });
  await page.evaluate(() => {
    const answers = Object.fromEntries(GrammarLogic.blanks(App.state.grammarTest.test.grammarContent).map(b => [b.id, b.answer]));
    for (const input of document.querySelectorAll('[data-grammar-blank]')) {
      input.value = answers[input.dataset.grammarBlank]; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.getByRole('button', { name: '실전으로 넘어가기', exact: true }).click();
  await page.waitForFunction(() => App.state.grammarTest.test.grammarStage === 'practice');
  for (let index = 0; index < 10; index++) {
    await page.evaluate(i => App.renderGrammarPractice(i), index);
    const answer = await page.evaluate(i => App.state.grammarTest.test.grammarContent.questions[i].answer, index);
    await page.locator(`#grammarTestContent button[onclick="App.selectPracticeChoice(${answer})"]`).click();
  }
  await page.screenshot({ path: path.join(artifacts, 'relative-practice-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /답안 최종 제출하기/ }).click();
  await page.waitForSelector('#grammarCompletionView:not(.hidden)');
  assert.match(await page.locator('[data-grammar-score-part="practice"]').innerText(), /100/);
  await page.evaluate(id => {
    App.state.isAdminLoggedIn = true; App.state.isStudentLoggedIn = false;
    App.openGrammarGrading(id);
  }, relativeId);
  assert.equal(await page.locator('#grammarGradingSave').isDisabled(), false);
  await page.locator('#grammarGradingSave').click();
  await page.waitForFunction(id => App.grammarTestById(id).grammarResults.concept.score === 100, relativeId);
  await page.evaluate(async id => {
    await AppData.updateGrammarTest(id, t => { t.grammarResults.concept.passed = false; t.grammarResults.concept.score = 60; });
    App.openGrammarTestModal(id);
  }, relativeId);
  await page.getByRole('button', { name: '문법 재시험 배정', exact: true }).click();
  assert.equal(await page.locator('#grammarAssignmentUnit').inputValue(), 'relative-pronouns');
  assert.equal(await page.locator('[name="grammarPart"][value="concept"]').isEnabled(), true);
  assert.equal(await page.locator('[name="grammarPart"][value="practice"]').isEnabled(), false);
  assert.deepEqual(errors, []);
  console.log(`Browser checks passed: ${totalBlanks} subjunctive / ${relativeBlanks} relative-pronoun blanks, unit selection, PDF download, ten practice questions, 100-point results, manual grading, isolated retests, mobile layout, and existing navigation/submission regressions.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
