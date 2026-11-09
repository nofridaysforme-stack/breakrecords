import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

// Where prepared files live. Never public: the app reads them back only after checking, in the
// database, that the signed-in person's label owns the document.
//
//  * Supabase Storage (staging, production): its S3-compatible endpoint with S3 access keys made
//    for storage only, so the app still never holds the database owner's password.
//      DOCUMENTS_S3_ENDPOINT   https://<ref>.storage.supabase.co/storage/v1/s3
//      DOCUMENTS_S3_REGION     the project's region, e.g. us-east-1
//      DOCUMENTS_S3_BUCKET     a private bucket, e.g. documents
//      DOCUMENTS_S3_ACCESS_KEY_ID / DOCUMENTS_S3_SECRET_ACCESS_KEY
//  * A folder (local development, tests): DOCUMENTS_DIR, default .data/documents.
//  * Memory (sample-data mode on a server with neither): kept until the server restarts.

export interface DocumentStore {
  readonly kind: 's3' | 'folder' | 'memory';
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

/** Storage answered with an error. The message says which setting to check; no secrets in it. */
export class StorageRefused extends Error {}

const S3_HINT: Record<string, string> = {
  NoSuchBucket: 'the bucket in DOCUMENTS_S3_BUCKET doesn’t exist',
  InvalidAccessKeyId: 'the access key ID isn’t recognized',
  SignatureDoesNotMatch: 'the secret access key or the region doesn’t match',
  AccessDenied: 'the keys aren’t allowed to write to that bucket',
  AuthorizationHeaderMalformed: 'the region in DOCUMENTS_S3_REGION doesn’t match the project',
};
async function refused(res: Response, what: string): Promise<StorageRefused> {
  const body = await res.text().catch(() => '');
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? /"(?:code|error)"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? '';
  console.error(`Document storage refused the ${what}: HTTP ${res.status} ${code}`);
  return new StorageRefused(`Document storage refused the ${what} (${code || `HTTP ${res.status}`}${S3_HINT[code] ? `: ${S3_HINT[code]}` : ''}). Check the DOCUMENTS_S3_ settings in Vercel.`);
}

export class StorageNotConfigured extends Error {
  constructor() { super('Document storage isn’t set up yet. Add the DOCUMENTS_S3_* settings (docs/STAGING.md).'); }
}

function s3(): DocumentStore | null {
  const { DOCUMENTS_S3_ENDPOINT: endpoint, DOCUMENTS_S3_REGION: region, DOCUMENTS_S3_BUCKET: bucket, DOCUMENTS_S3_ACCESS_KEY_ID: id, DOCUMENTS_S3_SECRET_ACCESS_KEY: secret } = process.env;
  if (!endpoint || !bucket || !id || !secret) return null;
  const aws = new AwsClient({ accessKeyId: id, secretAccessKey: secret, region: region || 'us-east-1', service: 's3' });
  const url = (key: string) => `${endpoint.replace(/\/$/, '')}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  return {
    kind: 's3',
    async put(key, body, contentType) {
      let res: Response;
      try { res = await aws.fetch(url(key), { method: 'PUT', body: body as BodyInit, headers: { 'content-type': contentType } }); }
      catch (e) { console.error('Document storage unreachable', (e as Error).message); throw new StorageRefused('Couldn’t reach document storage. Check DOCUMENTS_S3_ENDPOINT in Vercel.'); }
      if (!res.ok) throw await refused(res, 'file');
    },
    async get(key) {
      const res = await aws.fetch(url(key));
      if (res.status === 404) return null;
      if (!res.ok) throw await refused(res, 'read');
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

function folder(dir: string): DocumentStore {
  const file = (key: string) => {
    const p = path.resolve(dir, key);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error('Bad document key.');
    return p;
  };
  return {
    kind: 'folder',
    async put(key, body) { await mkdir(path.dirname(file(key)), { recursive: true }); await writeFile(file(key), body); },
    async get(key) { try { return new Uint8Array(await readFile(file(key))); } catch { return null; } },
  };
}

const g = globalThis as unknown as { __brDocFiles?: Map<string, Uint8Array> };
function memory(): DocumentStore {
  const files = (g.__brDocFiles ??= new Map());
  return { kind: 'memory', async put(key, body) { files.set(key, body); }, async get(key) { return files.get(key) ?? null; } };
}

/**
 * The store for this server. Live data needs real storage: S3 when configured, else a folder
 * (local only). On Vercel without S3 settings, live mode refuses rather than lose files.
 */
export function documentStore(live: boolean): DocumentStore {
  const remote = s3();
  if (remote) return remote;
  if (process.env.DOCUMENTS_DIR || !process.env.VERCEL) return folder(process.env.DOCUMENTS_DIR || path.join(process.cwd(), '.data', 'documents'));
  if (live) throw new StorageNotConfigured();
  return memory();
}
