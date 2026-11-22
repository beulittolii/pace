const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../supabase/functions/assessment-pdf/handler.mjs');
const pdf = Buffer.from('%PDF-1.7\nfixture');
const origin = 'https://pace.example';
const id = 'assess_123';
const url = `https://storage.example/?id=${id}`;

async function fixture({ claims = { sub: 'studentA' }, owner = 'studentA', linked = true, exists = true, failWrite = false } = {}) {
  const { buildHandler, createAuthorizer } = await load();
  const doc = (values) => ({ fields: values });
  const str = stringValue => ({ stringValue });
  const docs = {
    'members/studentA': doc({ studentId: { integerValue: '12' } }),
    'students/12': doc({ accountUid: str(owner), linking: { booleanValue: !linked } }),
    'academicRecords/academicAssessments_12': doc({ kind: str('academicAssessments'), studentId: { integerValue: '12' }, items: { arrayValue: { values: exists ? [{ mapValue: { fields: { id: str(id) } } }] : [] } } })
  };
  const objects = new Map();
  const authorize = createAuthorizer({ project: 'pace-test', verify: async (token, constraints) => {
    if (token !== 'good' || constraints.audience !== 'pace-test' || constraints.issuer !== 'https://securetoken.google.com/pace-test') throw Error('invalid');
    return claims;
  }, read: async (path, token) => token === 'good' ? docs[path] : null });
  const handler = buildHandler({ authorize, origins: [origin], storage: {
    exists: async key => objects.has(key), get: async key => objects.get(key),
    put: async (key, content) => { if (failWrite) throw Error('offline'); objects.set(key, content); },
    remove: async key => { objects.delete(key); }
  }});
  const send = (method, body, headers = {}, override = {}) => handler(new Request(url, {
    method, body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
    headers: { Authorization: 'Bearer good', Origin: origin, ...(body ? { 'Content-Type': 'application/pdf' } : {}), ...headers }, ...override
  }));
  return { send, objects };
}

test('owner uploads, opens, replaces, and deletes exactly one PDF', async () => {
  const { send, objects } = await fixture();
  assert.equal((await send('HEAD')).status, 404);
  assert.equal((await send('PUT', pdf)).status, 204);
  assert.equal((await send('HEAD')).status, 204);
  const response = await send('GET');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.equal((await send('PUT', Buffer.from('%PDF-new'))).status, 204);
  assert.equal(objects.size, 1);
  assert.deepEqual([...objects.keys()], ['studentA/12/assess_123.pdf']);
  assert.equal(await (await send('GET')).text(), '%PDF-new');
  assert.equal((await send('DELETE')).status, 204);
  assert.equal((await send('GET')).status, 404);
});

test('wrong project, wrong owner, unlinked, and removed assessments cannot write', async () => {
  for (const options of [{ owner: 'studentB' }, { linked: false }, { exists: false }, { claims: { sub: 'studentB' } }]) {
    const { send, objects } = await fixture(options);
    assert.equal((await send('PUT', pdf)).status, 403);
    assert.equal(objects.size, 0);
  }
  const { send } = await fixture();
  assert.equal((await send('PUT', pdf, { Authorization: 'Bearer other-project' })).status, 401);
});

test('5 MiB is accepted; invalid and oversized streaming bodies do not replace it', async () => {
  const { send } = await fixture();
  const size = 5_242_880;
  const limit = Buffer.alloc(size); pdf.copy(limit);
  assert.equal((await send('PUT', limit)).status, 204);
  assert.equal((await send('PUT', Buffer.from('not a pdf'))).status, 415);
  const stream = new ReadableStream({ start(c) { c.enqueue(limit); c.enqueue(new Uint8Array(1)); c.close(); } });
  assert.equal((await send('PUT', stream)).status, 413);
  assert.equal((await (await send('GET')).arrayBuffer()).byteLength, size);
});

test('CORS preflight is restricted and storage failures are isolated', async () => {
  const { send } = await fixture({ failWrite: true });
  assert.equal((await send('OPTIONS')).headers.get('access-control-allow-origin'), origin);
  assert.equal((await send('OPTIONS', undefined, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await send('PUT', pdf)).status, 503);
});
