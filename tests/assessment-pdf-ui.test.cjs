const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup({ desktop = true, configured = true, saved = false } = {}) {
  class Control extends EventTarget {
    hidden = true; disabled = false; textContent = ''; value = '';
    click() { this.dispatchEvent(new Event('click')); }
  }
  const ids = ['academicAssessmentDetailModal', 'assessmentPdfArea', 'assessmentPdfStatus', 'assessmentPdfInput', 'assessmentPdfChoose', 'assessmentPdfDrop', 'assessmentPdfOpen', 'assessmentPdfDelete'];
  const elements = Object.fromEntries(ids.map(id => [id, new Control()]));
  elements.assessmentPdfChoose.hidden = false;
  const user = { uid: 'a', getIdToken: async () => 'firebase-id-token' };
  const pace = { auth: { currentUser: user }, generation: 1, member: { studentId: 12 } };
  const requests = [];
  let finishNavigation;
  const navigated = new Promise(resolve => { finishNavigation = resolve; });
  const tab = { document: { body: { textContent: '' } }, location: { set href(url) { finishNavigation(url); } }, close() { this.closed = true; finishNavigation(null); } };
  const state = { saved, failPut: false, confirm: true, delay: null };
  const window = {
    PACE_PDF_ENDPOINT: configured ? 'https://pdf.example/function' : '', PaceAuth: pace,
    matchMedia: () => ({ matches: desktop }), confirm: () => state.confirm, open: () => tab,
    fetch: async (url, opts) => {
      requests.push([opts.method, url.searchParams.get('id'), opts.headers.Authorization]);
      if (state.delay) await state.delay;
      if (opts.method === 'HEAD') return new Response(null, { status: state.saved ? 204 : 404 });
      if (opts.method === 'GET') return new Response(new Blob(['%PDF-fixture'], { type: 'application/pdf' }));
      if (opts.method === 'PUT' && state.failPut) return new Response(null, { status: 503 });
      state.saved = opts.method === 'PUT';
      return new Response(null, { status: 204 });
    }
  };
  vm.runInNewContext(readFileSync('assessment-pdf.js', 'utf8'), {
    window, document: { getElementById: id => elements[id] }, URL, AbortController, setTimeout: () => 0
  });
  const item = { assessmentId: 'assess_123', studentId: 12, isAdmin: false };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const file = (name = 'a.pdf', size = 100, type = 'application/pdf') => ({ name, size, type });
  function drop(files) {
    const event = new Event('drop', { cancelable: true });
    event.dataTransfer = { files, types: ['Files'] };
    elements.assessmentPdfDrop.dispatchEvent(event);
    return event.defaultPrevented;
  }
  function select(file) {
    elements.assessmentPdfInput.files = [file];
    elements.assessmentPdfInput.dispatchEvent(new Event('change'));
  }
  return { ...elements, mount: (overrides) => window.AssessmentPdf.mount({ ...item, ...overrides }), tick, drop, select, file, requests, state, pace, navigated };
}

test('desktop PDF drop prevents navigation and opens/deletes with the existing account', { timeout: 1000 }, async () => {
  const ui = setup();
  await ui.mount();
  assert.equal(ui.assessmentPdfDrop.hidden, false);
  assert.equal(ui.drop([ui.file()]), true);
  await ui.tick();
  assert.equal(ui.assessmentPdfOpen.hidden, false);
  ui.assessmentPdfOpen.click();
  assert.match(await ui.navigated, /^blob:/);
  await ui.tick();
  ui.assessmentPdfDelete.click();
  await ui.tick();
  assert.equal(ui.assessmentPdfOpen.hidden, true);
  assert.deepEqual(ui.requests, ['HEAD', 'PUT', 'GET', 'DELETE'].map(method => [method, 'assess_123', 'Bearer firebase-id-token']));
});

test('invalid drops and declined replacements do not upload', async () => {
  const ui = setup({ saved: true });
  await ui.mount();
  assert.equal(ui.drop([ui.file(), ui.file()]), true);
  assert.match(ui.assessmentPdfStatus.textContent, /1개/);
  ui.drop([ui.file('virus.exe', 10, 'application/octet-stream')]);
  assert.match(ui.assessmentPdfStatus.textContent, /PDF/);
  ui.drop([ui.file('big.pdf', 5_242_881)]);
  assert.match(ui.assessmentPdfStatus.textContent, /5MB/);
  ui.state.confirm = false;
  ui.drop([ui.file()]);
  await ui.tick();
  assert.deepEqual(ui.requests.map(r => r[0]), ['HEAD']);
});

test('missing the drop zone does not navigate away from the assessment', async () => {
  const ui = setup();
  await ui.mount();
  for (const kind of ['dragover', 'drop']) {
    const event = new Event(kind, { cancelable: true });
    event.dataTransfer = { files: [ui.file()], types: ['Files'] };
    ui.academicAssessmentDetailModal.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  assert.deepEqual(ui.requests.map(r => r[0]), ['HEAD']);
});

test('mobile uses the picker and an unavailable replacement keeps the original controls', async () => {
  const ui = setup({ desktop: false, saved: true });
  await ui.mount();
  assert.equal(ui.assessmentPdfDrop.hidden, true);
  assert.equal(ui.assessmentPdfChoose.hidden, false);
  ui.state.failPut = true;
  ui.select(ui.file());
  await ui.tick();
  assert.equal(ui.assessmentPdfOpen.hidden, false);
  assert.match(ui.assessmentPdfStatus.textContent, /다시 시도/);
  ui.state.failPut = false;
  ui.select(ui.file());
  await ui.tick();
  assert.match(ui.assessmentPdfStatus.textContent, /첨부했/);
});

test('unconfigured, admin, and other-owner views do not query the backend', async () => {
  const off = setup({ configured: false });
  await off.mount();
  assert.equal(off.assessmentPdfArea.hidden, true);
  assert.deepEqual(off.requests, []);
  const ui = setup();
  await ui.mount({ isAdmin: true });
  await ui.mount({ studentId: 13 });
  await ui.mount({ calendarOnly: true });
  assert.equal(ui.assessmentPdfArea.hidden, true);
  assert.deepEqual(ui.requests, []);
});

test('a delayed response from a previous login cannot expose controls', async () => {
  const ui = setup({ saved: true });
  let finish;
  ui.state.delay = new Promise(resolve => { finish = resolve; });
  const pending = ui.mount();
  await ui.tick();
  ui.pace.generation++;
  ui.pace.auth.currentUser = { uid: 'b' };
  finish();
  await pending;
  assert.equal(ui.assessmentPdfOpen.hidden, true);
});
