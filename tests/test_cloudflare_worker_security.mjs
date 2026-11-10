import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import worker from '../worker/index.ts';

const originalFetch = globalThis.fetch;
const secret = 'worker-test-signing-key-that-is-at-least-32-characters';

class MemoryD1 {
  constructor() {
    this.files = new Map();
    this.conversations = new Map();
    this.messages = new Map();
  }

  prepare(query) {
    return {
      bind: (...values) => ({
        first: async () => {
          if (query.startsWith('SELECT file_path, content, sha256')) {
            const [userId, filePath] = values;
            return this.files.get(`${userId}\0${filePath}`) || null;
          }
          if (query.startsWith('SELECT id, user_id, title, project_id')) {
            const [id, userId] = values;
            const c = this.conversations.get(`${userId}\0${id}`);
            return c || null;
          }
          if (query.startsWith('SELECT COUNT(*)')) {
            const userId = values[0];
            const rows = [...this.files.values()].filter((row) => row.user_id === userId);
            return {
              file_count: rows.length,
              total_bytes: rows.reduce(
                (total, row) => total + new TextEncoder().encode(row.content).byteLength,
                0,
              ),
            };
          }
          throw new Error(`Unexpected D1 first query: ${query}`);
        },
        all: async () => {
          if (query.startsWith('SELECT file_path, LENGTH')) {
            const userId = values[0];
            return {
              results: [...this.files.values()]
                .filter((row) => row.user_id === userId)
                .map((row) => ({
                  file_path: row.file_path,
                  size_bytes: new TextEncoder().encode(row.content).byteLength,
                })),
            };
          }
          if (query.startsWith('SELECT id, user_id, title, project_id')) {
            const userId = values[0];
            return {
              results: [...this.conversations.values()].filter((row) => row.user_id === userId),
            };
          }
          if (query.startsWith('SELECT id, role, content, attachments')) {
            const [convId, userId] = values;
            return {
              results: [...this.messages.values()].filter((m) => m.conversation_id === convId && m.user_id === userId),
            };
          }
          throw new Error(`Unexpected D1 all query: ${query}`);
        },
        run: async () => {
          if (query.startsWith('INSERT INTO user_conversations')) {
            const [id, userId, title, projectId, createdAt, updatedAt] = values;
            const key = `${userId}\0${id}`;
            this.conversations.set(key, { id, user_id: userId, title, project_id: projectId, created_at: createdAt, updated_at: updatedAt });
            return { meta: { changes: 1 } };
          }
          if (query.startsWith('INSERT INTO user_messages')) {
            const [id, convId, userId, role, content, attachments, createdAt] = values;
            this.messages.set(id, { id, conversation_id: convId, user_id: userId, role, content, attachments, created_at: createdAt });
            return { meta: { changes: 1 } };
          }
          if (query.startsWith('DELETE FROM user_conversations')) {
            const [id, userId] = values;
            this.conversations.delete(`${userId}\0${id}`);
            return { meta: { changes: 1 } };
          }
          if (query.startsWith('DELETE FROM user_messages')) {
            const [convId, userId] = values;
            for (const [key, msg] of this.messages.entries()) {
              if (msg.conversation_id === convId && msg.user_id === userId) this.messages.delete(key);
            }
            return { meta: { changes: 1 } };
          }
          if (query.startsWith('INSERT')) {
            const [userId, filePath, content, sha256, updatedAt] = values;
            const key = `${userId}\0${filePath}`;
            if (this.files.has(key)) return { meta: { changes: 0 } };
            this.files.set(key, { user_id: userId, file_path: filePath, content, sha256, updated_at: updatedAt });
            return { meta: { changes: 1 } };
          }
          if (query.startsWith('UPDATE')) {
            const [content, sha256, updatedAt, userId, filePath, expectedHash] = values;
            const key = `${userId}\0${filePath}`;
            const current = this.files.get(key);
            if (!current || current.sha256 !== expectedHash) return { meta: { changes: 0 } };
            this.files.set(key, { ...current, content, sha256, updated_at: updatedAt });
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected D1 run query: ${query}`);
        },
      }),
    };
  }
}

function makeEnv(db = new MemoryD1()) {
  return {
    DB: db,
    GOOGLE_CLIENT_ID: 'worker-test-client.apps.googleusercontent.com',
    JWT_SECRET_KEY: secret,
    ASSETS: { fetch: async () => new Response('asset') },
  };
}

async function post(env, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    env,
  );
}

async function login(env, sub, overrides = {}) {
  const claims = {
    aud: env.GOOGLE_CLIENT_ID,
    iss: 'https://accounts.google.com',
    exp: String(Math.floor(Date.now() / 1000) + 3600),
    sub,
    email: `${sub}@example.com`,
    email_verified: 'true',
    name: sub,
    ...overrides,
  };
  globalThis.fetch = async (input) => {
    assert.match(String(input), /^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?/);
    return new Response(JSON.stringify(claims), { status: 200 });
  };
  const response = await post(env, '/api/auth/google', { credential: 'verified-id-token' });
  return { response, body: await response.json() };
}

after(() => {
  globalThis.fetch = originalFetch;
});

test('Google login rejects unverified profile-only input and invalid claims', async () => {
  const env = makeEnv();
  const profileOnly = await post(env, '/api/auth/google', {
    email: 'attacker@example.com',
    name: 'Attacker',
  });
  assert.equal(profileOnly.status, 400);

  const invalid = await login(env, 'unverified-user', { email_verified: 'false' });
  assert.equal(invalid.response.status, 401);

  const wrongAudience = await login(env, 'wrong-audience-user', {
    aud: 'attacker-client.apps.googleusercontent.com',
  });
  assert.equal(wrongAudience.response.status, 401);

  const unconfigured = await post(
    { ...env, JWT_SECRET_KEY: undefined },
    '/api/auth/google',
    { credential: 'verified-id-token' },
  );
  assert.equal(unconfigured.status, 503);
});

test('verified Google ID tokens create signed sessions required by /me', async () => {
  const env = makeEnv();
  const { response, body } = await login(env, 'verified-user');
  assert.equal(response.status, 200);
  assert.equal(body.user.email, 'verified-user@example.com');
  assert.match(body.access_token, /^[^.]+\.[^.]+\.[^.]+$/);

  const profile = await worker.fetch(
    new Request('https://worker.test/api/auth/me', {
      headers: { Authorization: `Bearer ${body.access_token}` },
    }),
    env,
  );
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).id, 'google_verified-user');

  const forged = await worker.fetch(
    new Request('https://worker.test/api/auth/me', {
      headers: { Authorization: 'Bearer forged.token.value' },
    }),
    env,
  );
  assert.equal(forged.status, 401);
});

test('coding workspace edits require auth, stay user-scoped, and reject stale previews', async () => {
  const env = makeEnv();
  const firstUser = await login(env, 'workspace-user-one');
  const secondUser = await login(env, 'workspace-user-two');
  const firstToken = firstUser.body.access_token;
  const secondToken = secondUser.body.access_token;

  const unauthenticated = await post(env, '/api/intelligence/coding/inspect', {});
  assert.equal(unauthenticated.status, 401);

  const preview = await post(
    env,
    '/api/intelligence/coding/preview',
    { file_path: 'src/main.py', new_content: "print('safe')\n" },
    firstToken,
  );
  const previewBody = await preview.json();
  assert.equal(preview.status, 200);
  assert.equal(previewBody.status, 'created');
  assert.match(previewBody.diff, /^\-\-\- a\/src\/main\.py/m);

  const created = await post(
    env,
    '/api/intelligence/coding/modify',
    {
      file_path: 'src/main.py',
      new_content: "print('safe')\n",
      expected_sha256: null,
    },
    firstToken,
  );
  assert.equal(created.status, 200);

  const stale = await post(
    env,
    '/api/intelligence/coding/modify',
    {
      file_path: 'src/main.py',
      new_content: "print('stale')\n",
      expected_sha256: null,
    },
    firstToken,
  );
  assert.equal(stale.status, 409);

  const editPreview = await post(
    env,
    '/api/intelligence/coding/preview',
    { file_path: 'src/main.py', new_content: "print('updated')\n" },
    firstToken,
  );
  const editPreviewBody = await editPreview.json();
  const updated = await post(
    env,
    '/api/intelligence/coding/modify',
    {
      file_path: 'src/main.py',
      new_content: "print('updated')\n",
      expected_sha256: editPreviewBody.original_sha256,
    },
    firstToken,
  );
  assert.equal(updated.status, 200);

  const ownRead = await post(
    env,
    '/api/intelligence/coding/read',
    { file_path: 'src/main.py' },
    firstToken,
  );
  assert.equal((await ownRead.json()).content, "print('updated')\n");

  const otherUserRead = await post(
    env,
    '/api/intelligence/coding/read',
    { file_path: 'src/main.py' },
    secondToken,
  );
  assert.equal(otherUserRead.status, 404);

  const unsafePath = await post(
    env,
    '/api/intelligence/coding/read',
    { file_path: '../private.txt' },
    firstToken,
  );
  assert.equal(unsafePath.status, 400);

  const inspect = await post(env, '/api/intelligence/coding/inspect', {}, firstToken);
  const inspectBody = await inspect.json();
  assert.equal(inspectBody.tests_enabled, false);
  assert.equal(inspectBody.total_count, 2);

  const testsDisabled = await post(env, '/api/intelligence/coding/test', {}, firstToken);
  assert.equal(testsDisabled.status, 503);
});

test('chat conversations are strictly isolated per user account', async () => {
  const env = makeEnv();
  const { body: loginA } = await login(env, 'user_A');
  const { body: loginB } = await login(env, 'user_B');
  const tokenA = loginA.access_token;
  const tokenB = loginB.access_token;

  // User A creates conversation
  const createA = await worker.fetch(
    new Request('https://worker.test/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ title: "User A's Secret Project" }),
    }),
    env,
  );
  assert.equal(createA.status, 200);
  const convA = await createA.json();
  assert.equal(convA.owner_id, 'google_user_A');

  // User B lists conversations -> should NOT see User A's conversation
  const listB = await worker.fetch(
    new Request('https://worker.test/api/conversations', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    }),
    env,
  );
  assert.equal(listB.status, 200);
  const listBBody = await listB.json();
  assert.equal(listBBody.items.some((c) => c.id === convA.id), false);

  // User A lists conversations -> sees their conversation
  const listA = await worker.fetch(
    new Request('https://worker.test/api/conversations', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    }),
    env,
  );
  assert.equal(listA.status, 200);
  const listABody = await listA.json();
  assert.equal(listABody.items.some((c) => c.id === convA.id), true);

  // Guest lists conversations -> cannot see User A's conversation
  const listGuest = await worker.fetch(
    new Request('https://worker.test/api/conversations', {
      method: 'GET',
    }),
    env,
  );
  assert.equal(listGuest.status, 200);
  const listGuestBody = await listGuest.json();
  assert.equal(listGuestBody.items.some((c) => c.id === convA.id), false);
});
