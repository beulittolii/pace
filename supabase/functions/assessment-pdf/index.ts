import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.2';
import { createClient } from 'npm:@supabase/supabase-js@2.99.0';
import { buildHandler, createAuthorizer, storageObjectExists } from './handler.mjs';

const project = 'english-mastery-d4427';
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const authorize = createAuthorizer({
  project,
  verify: async (token: string, constraints: { issuer: string; audience: string }) => (await jwtVerify(token, jwks, {
    ...constraints, algorithms: ['RS256'], requiredClaims: ['sub', 'iat', 'exp', 'auth_time'], maxTokenAge: '1h'
  })).payload,
  read: async (path: string, token: string) => {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000)
    });
    if ([401, 403, 404].includes(response.status)) return null;
    if (!response.ok) throw Error('Firestore lookup unavailable');
    return response.json();
  }
});

const bucket = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
}).storage.from('assessment-pdfs');

function notFound(error: unknown) {
  const detail = error as { status?: number | string; statusCode?: number | string };
  return Number(detail.status ?? detail.statusCode) === 404;
}

Deno.serve(buildHandler({ authorize, origins: (Deno.env.get('PACE_PDF_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean), storage: {
  exists: (key: string) => storageObjectExists(bucket, key),
  get: async (key: string) => {
    const { data, error } = await bucket.download(key);
    if (error && !notFound(error)) throw error;
    return data;
  },
  put: async (key: string, blob: Blob) => {
    const { error } = await bucket.upload(key, blob, { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
    if (error) throw error;
  },
  remove: async (key: string) => {
    const { error } = await bucket.remove([key]);
    if (error && !notFound(error)) throw error;
  }
}}));
