const MAX_BYTES = 5_242_880;
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const PDF_MAGIC = [37, 80, 68, 70, 45];
const methods = ['HEAD', 'GET', 'PUT', 'DELETE', 'OPTIONS'];

export function createAuthorizer({ project, verify, read }) {
  return async (token, id) => {
    if (!token) return { status: 401 };
    let claims;
    try {
      claims = await verify(token, { audience: project, issuer: `https://securetoken.google.com/${project}` });
    } catch {
      return { status: 401 };
    }
    const uid = claims?.sub;
    if (typeof uid !== 'string' || !VALID_ID.test(uid)) return { status: 401 };
    const member = (await read(`members/${uid}`, token))?.fields;
    const studentId = member?.studentId?.integerValue;
    if (typeof studentId !== 'string' || !/^\d{1,16}$/.test(studentId)) return { status: 403 };
    const [student, assessments] = await Promise.all([
      read(`students/${studentId}`, token), read(`academicRecords/academicAssessments_${studentId}`, token)
    ]);
    if (student?.fields?.accountUid?.stringValue !== uid || student.fields.linking?.booleanValue === true
      || assessments?.fields?.kind?.stringValue !== 'academicAssessments'
      || assessments?.fields?.studentId?.integerValue !== studentId
      || !assessments.fields.items?.arrayValue?.values?.some(item => item.mapValue?.fields?.id?.stringValue === id)) {
      return { status: 403 };
    }
    return { key: `${uid}/${studentId}/${id}.pdf` };
  };
}

async function readPdf(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return { status: 413 };
  if (request.headers.get('Content-Type') !== 'application/pdf' || !request.body) return { status: 415 };
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        void reader.cancel().catch(() => {});
        return { status: 413 };
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const blob = new Blob(parts, { type: 'application/pdf' });
  const prefix = new Uint8Array(await blob.slice(0, PDF_MAGIC.length).arrayBuffer());
  return PDF_MAGIC.every((byte, index) => byte === prefix[index]) ? { blob } : { status: 415 };
}

export function buildHandler({ authorize, storage, origins }) {
  return async request => {
    const origin = request.headers.get('Origin');
    const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' });
    const respond = (status, body = null) => new Response(body, { status, headers });
    if (origin) {
      if (!origins.includes(origin)) return respond(403);
      headers.set('Access-Control-Allow-Origin', origin);
    }
    if (!methods.includes(request.method)) return respond(405);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', methods.join(', '));
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return respond(204);
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !VALID_ID.test(id)) return respond(400);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([\w.-]+)$/i)?.[1];
    try {
      const access = await authorize(token, id);
      if (!access.key) return respond(access.status);
      const { key } = access;
      if (request.method === 'HEAD') return respond(await storage.exists(key) ? 204 : 404);
      if (request.method === 'GET') {
        const blob = await storage.get(key);
        if (!blob) return respond(404);
        headers.set('Content-Type', 'application/pdf');
        return respond(200, blob);
      }
      if (request.method === 'PUT') {
        const file = await readPdf(request);
        if (!file.blob) return respond(file.status);
        await storage.put(key, file.blob);
      } else await storage.remove(key);
      return respond(204);
    } catch {
      return respond(503);
    }
  };
}
