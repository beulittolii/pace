const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { chromium, devices } = require('playwright');

async function main() {
  const { buildHandler, createAuthorizer } = await import('../supabase/functions/assessment-pdf/handler.mjs');
  const panel = readFileSync('index.html', 'utf8').match(/<section id="assessmentPdfArea"[\s\S]+?<\/section>/)[0];
  const client = readFileSync('assessment-pdf.js');
  const pdf = readFileSync('관계대명사_개념학습.pdf');
  const files = new Map();
  let online = true;
  const doc = fields => ({ fields });
  const str = stringValue => ({ stringValue });
  const docs = {
    'members/one': doc({ studentId: { integerValue: '1' } }),
    'members/two': doc({ studentId: { integerValue: '2' } }),
    'students/1': doc({ accountUid: str('one') }),
    'students/2': doc({ accountUid: str('two') }),
    'academicRecords/academicAssessments_1': doc({ kind: str('academicAssessments'), studentId: { integerValue: '1' }, items: { arrayValue: { values: [{ mapValue: { fields: { id: str('assess_123') } } }] } } })
  };
  const authorize = createAuthorizer({ project: 'fixture', verify: async token => ({ sub: token }), read: async path => docs[path] });
  const run = buildHandler({ authorize, origins: [], storage: {
    exists: async key => { if (!online) throw Error('offline'); return files.has(key); },
    get: async key => files.get(key), put: async (key, blob) => files.set(key, blob), remove: async key => files.delete(key)
  }});
  const server = createServer(async (req, res) => {
    if (req.url.startsWith('/api?')) {
      const body = [];
      for await (const chunk of req) body.push(chunk);
      const headers = { ...req.headers };
      delete headers.origin;
      const response = await run(new Request(`http://localhost${req.url}`, { method: req.method, headers, body: body.length ? Buffer.concat(body) : undefined }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (req.url === '/client.js') return res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(client);
    const two = req.url === '/other';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<meta name="viewport" content="width=device-width"><button id="existing">수행평가 상세</button>${panel}<script src="/client.js"></script><script>
      window.PACE_PDF_ENDPOINT = location.origin + '/api';
      window.PaceAuth = { generation: 1, member: { studentId: ${two ? 2 : 1} }, auth: { currentUser: { uid: '${two ? 'two' : 'one'}', getIdToken: async () => '${two ? 'two' : 'one'}' } } };
      window.AssessmentPdf.mount({ assessmentId: 'assess_123', studentId: ${two ? 2 : 1}, isAdmin: false });
    </script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const site = `http://127.0.0.1:${server.address().port}`;
    const desktop = await browser.newPage();
    await desktop.goto(site);
    await desktop.getByText('PDF 1개 · 최대 5MB').waitFor();
    const payload = await desktop.evaluateHandle(base64 => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), byte => byte.charCodeAt(0))], 'fixture.pdf', { type: 'application/pdf' }));
      return data;
    }, pdf.toString('base64'));
    await desktop.locator('#assessmentPdfDrop').dispatchEvent('drop', { dataTransfer: payload });
    await desktop.getByText('PDF를 첨부했어요.').waitFor();
    const phone = await browser.newPage({ ...devices['Pixel 7'] });
    await phone.goto(site);
    await phone.getByRole('button', { name: '파일 열기' }).waitFor();
    assert.equal(await phone.locator('#assessmentPdfDrop').isVisible(), false);
    const popupPromise = phone.waitForEvent('popup');
    const fetchPromise = phone.waitForResponse(res => res.request().method() === 'GET' && res.url().includes('/api?id='));
    await phone.getByRole('button', { name: '파일 열기' }).click();
    const popup = await popupPromise;
    assert.deepEqual(await (await fetchPromise).body(), pdf);
    // Chromium's native PDF viewer does not reliably emit the page load event.
    await popup.waitForURL(/^blob:/, { waitUntil: 'commit' });
    await popup.close();
    const other = await browser.newPage();
    await other.goto(`${site}/other`);
    await other.getByText(/잠시 후 다시 시도/).waitFor();
    assert.equal(await other.getByRole('button', { name: '파일 열기' }).isVisible(), false);
    phone.on('dialog', dialog => dialog.accept());
    const picker = phone.waitForEvent('filechooser');
    await phone.getByRole('button', { name: '교체' }).click();
    await (await picker).setFiles({ name: 'fixture.pdf', mimeType: 'application/pdf', buffer: pdf });
    await phone.getByText('PDF를 첨부했어요.').waitFor();
    await phone.getByRole('button', { name: '삭제' }).click();
    await phone.getByText('PDF를 삭제했어요.').waitFor();
    await desktop.reload();
    await desktop.getByText('PDF 1개 · 최대 5MB').waitFor();
    online = false;
    await desktop.reload();
    await desktop.getByText(/잠시 후 다시 시도/).waitFor();
    assert.equal(await desktop.getByRole('button', { name: '수행평가 상세' }).isEnabled(), true);
    console.log('Desktop drop, separate mobile open, mobile picker, owner isolation, deletion, and outage checks passed.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
