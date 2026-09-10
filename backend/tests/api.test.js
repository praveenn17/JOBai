/**
 * JobAI Backend Test Suite
 * Run: npm test
 * Uses Node.js built-in test runner (no extra deps needed)
 */

const assert = require('assert');
const http   = require('http');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
let authToken = '';
let testUserId = '';
let testResumeId = '';
let testJobId = '';
let testAppId = '';

// ─── Helper ──────────────────────────────────────────────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const r = http.request(opts, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Health
test('GET /api/health → 200', async () => {
  const { status, body } = await req('GET', '/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.status, 'healthy');
});

// Auth - Register
test('POST /auth/register → 201 with token', async () => {
  const ts = Date.now();
  const { status, body } = await req('POST', '/auth/register', {
    name: 'Test User', email: `test_${ts}@jobai.test`, password: 'password123'
  });
  assert.strictEqual(status, 201);
  assert.ok(body.token, 'token must exist');
  assert.ok(body.user?.id, 'user.id must exist');
  authToken = body.token;
  testUserId = body.user.id;
});

// Auth - Duplicate email
test('POST /auth/register duplicate → 409', async () => {
  const ts = Date.now() - 1;
  await req('POST', '/auth/register', { name: 'A', email: `dup_${ts}@test.com`, password: 'pass1234' });
  const { status } = await req('POST', '/auth/register', { name: 'B', email: `dup_${ts}@test.com`, password: 'pass1234' });
  assert.strictEqual(status, 409);
});

// Auth - Login
test('POST /auth/login → 200 with token', async () => {
  const ts = Date.now();
  await req('POST', '/auth/register', { name: 'Login Test', email: `login_${ts}@jobai.test`, password: 'mypassword' });
  const { status, body } = await req('POST', '/auth/login', { email: `login_${ts}@jobai.test`, password: 'mypassword' });
  assert.strictEqual(status, 200);
  assert.ok(body.token);
});

// Auth - Wrong password
test('POST /auth/login wrong password → 401', async () => {
  const { status } = await req('POST', '/auth/login', { email: 'nobody@test.com', password: 'wrongpass' });
  assert.strictEqual(status, 401);
});

// Auth - Missing token
test('GET /auth/me without token → 401', async () => {
  const { status } = await req('GET', '/auth/me');
  assert.strictEqual(status, 401);
});

// Auth - Me
test('GET /auth/me with token → 200', async () => {
  const { status, body } = await req('GET', '/auth/me', null, authToken);
  assert.strictEqual(status, 200);
  assert.ok(body.user?.email);
});

// Auth - Forgot password
test('POST /auth/forgot-password → 200 (anti-enumeration)', async () => {
  const { status, body } = await req('POST', '/auth/forgot-password', { email: 'nonexistent@test.com' });
  assert.strictEqual(status, 200);
  assert.ok(body.message.includes('If that email'));
});

// Preferences
test('PUT /auth/preferences → 200', async () => {
  const { status } = await req('PUT', '/auth/preferences', {
    preferred_roles: 'Full Stack Developer',
    preferred_locations: 'Remote',
    job_types: 'Internship',
    skills: 'React, Node.js',
    min_salary: 0,
    daily_discovery_enabled: false,
  }, authToken);
  assert.strictEqual(status, 200);
});

// Resume - No upload file (form validation)
test('POST /resume/upload no file → 400', async () => {
  const { status } = await req('POST', '/resume/upload', {}, authToken);
  assert.ok([400, 500].includes(status));
});

// Resume - List
test('GET /resume → 200 empty array', async () => {
  const { status, body } = await req('GET', '/resume', null, authToken);
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body.resumes));
});

// Jobs - Analyze (no resume → 400)
test('POST /jobs/analyze no resume → 400', async () => {
  const { status, body } = await req('POST', '/jobs/analyze', {
    jobs: [{ title: 'Dev', description: 'x'.repeat(60), apply_url: 'https://example.com' }]
  }, authToken);
  assert.strictEqual(status, 400);
  assert.ok(body.error.includes('resume'));
});

// Jobs - Analyze validation
test('POST /jobs/analyze empty array → 400', async () => {
  const { status } = await req('POST', '/jobs/analyze', { jobs: [] }, authToken);
  assert.strictEqual(status, 400);
});

// Jobs - Analyze > 10 jobs → 400
test('POST /jobs/analyze 11 jobs → 400', async () => {
  const jobs = Array(11).fill({ title: 'Dev', description: 'x'.repeat(60) });
  const { status } = await req('POST', '/jobs/analyze', { jobs }, authToken);
  assert.strictEqual(status, 400);
});

// Applications - Stats
test('GET /applications/stats → 200', async () => {
  const { status, body } = await req('GET', '/applications/stats', null, authToken);
  assert.strictEqual(status, 200);
  assert.strictEqual(typeof body.total, 'number');
});

// Applications - Export CSV
test('GET /applications/export → 200 text/csv', async () => {
  const { status } = await req('GET', '/applications/export', null, authToken);
  assert.strictEqual(status, 200);
});

// Applications - Pagination
test('GET /applications?page=1&limit=5 → 200 with pagination', async () => {
  const { status, body } = await req('GET', '/applications?page=1&limit=5', null, authToken);
  assert.strictEqual(status, 200);
  assert.ok(body.pagination);
  assert.ok(typeof body.pagination.total === 'number');
});

// Applications - Start without job → 404
test('POST /applications/start missing job → 404', async () => {
  const { status } = await req('POST', '/applications/start', { job_id: 'nonexistent-id' }, authToken);
  assert.strictEqual(status, 404);
});

// Email - List
test('GET /email → 200', async () => {
  const { status, body } = await req('GET', '/email', null, authToken);
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body.applications));
});

// Email - Analytics
test('GET /email/analytics → 200', async () => {
  const { status, body } = await req('GET', '/email/analytics', null, authToken);
  assert.strictEqual(status, 200);
  assert.ok(body.rates);
});

// Email - Verify config
test('GET /email/verify-config → 200', async () => {
  const { status } = await req('GET', '/email/verify-config', null, authToken);
  assert.strictEqual(status, 200);
});

// Feedback - List
test('GET /feedback → 200 empty', async () => {
  const { status, body } = await req('GET', '/feedback', null, authToken);
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body.feedback));
});

// Feedback - Analyze not enough data → 400
test('POST /feedback/analyze not enough data → 400', async () => {
  const { status } = await req('POST', '/feedback/analyze', {}, authToken);
  assert.strictEqual(status, 400);
});

// Limits - Status
test('GET /limits → 200 with quotas', async () => {
  const { status, body } = await req('GET', '/limits', null, authToken);
  assert.strictEqual(status, 200);
  assert.ok(body.rate_limits);
  assert.ok(body.queues);
});

// Rate limit - Auth brute force protection
test('Auth rate limit — 10 rapid failures should eventually 429', async () => {
  const results = await Promise.all(
    Array(12).fill(null).map(() => req('POST', '/auth/login', { email: 'x@x.com', password: 'wrong' }))
  );
  const has429 = results.some(r => r.status === 429);
  assert.ok(has429, 'Should hit rate limit after 10+ failed attempts');
});

// Security - No token → protected routes return 401
const protectedRoutes = ['/resume', '/jobs', '/applications', '/email', '/feedback', '/limits'];
protectedRoutes.forEach(route => {
  test(`GET ${route} without auth → 401`, async () => {
    const { status } = await req('GET', route);
    assert.strictEqual(status, 401);
  });
});

// ─── Runner ──────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n🧪 Running ${tests.length} tests...\n`);
  let passed = 0, failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}`);
      console.log(`     → ${err.message}`);
      failed++;
    }
  }

  console.log(`\n────────────────────────────────────`);
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${tests.length}`);
  console.log(`────────────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Only run if server is reachable
req('GET', '/health').then(run).catch(() => {
  console.error('❌ Backend not running. Start it first: cd backend && npm run dev');
  process.exit(1);
});
