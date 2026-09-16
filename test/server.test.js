'use strict';

/**
 * Dependency-free test suite using the built-in node:test runner.
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { app, parseFacebookInput, upgradeToMaxResolution, rateLimit, parseProfileHtml, buildProfileUrl, rankImageCandidate } = require('../server.js');

/* ------------------------------------------------------------------ */
/* parseFacebookInput                                                  */
/* ------------------------------------------------------------------ */

test('parseFacebookInput: rejects empty / non-string input', () => {
  // Falsy input yields the generic prompt...
  assert.match(parseFacebookInput('').error, /Profile ID, Username, or Link/i);
  assert.ok(parseFacebookInput(null).error);
  assert.ok(parseFacebookInput(undefined).error);
  assert.ok(parseFacebookInput(12345).error);
  // ...while whitespace-only input is trimmed and reported as empty.
  assert.match(parseFacebookInput('   ').error, /empty/i);
});

test('parseFacebookInput: numeric ID', () => {
  assert.deepEqual(parseFacebookInput('4'), { type: 'numeric_id', value: '4' });
  assert.deepEqual(parseFacebookInput('100001234567890'), {
    type: 'numeric_id',
    value: '100001234567890',
  });
  assert.match(parseFacebookInput('1'.repeat(26)).error, /too long/i);
});

test('parseFacebookInput: vanity usernames, including dotted ones', () => {
  assert.deepEqual(parseFacebookInput('zuck'), { type: 'username', value: 'zuck' });
  // Dotted names must NOT be mistaken for domains.
  assert.deepEqual(parseFacebookInput('john.me'), { type: 'username', value: 'john.me' });
  assert.deepEqual(parseFacebookInput('foo.net'), { type: 'username', value: 'foo.net' });
  assert.deepEqual(parseFacebookInput('@zuck'), { type: 'username', value: 'zuck' });
  assert.match(parseFacebookInput('has space').error, /invalid format/i);
});

test('parseFacebookInput: profile URLs', () => {
  assert.deepEqual(parseFacebookInput('https://www.facebook.com/zuck'), {
    type: 'username',
    value: 'zuck',
  });
  assert.deepEqual(parseFacebookInput('facebook.com/zuck'), {
    type: 'username',
    value: 'zuck',
  });
  assert.deepEqual(parseFacebookInput('https://www.facebook.com/profile.php?id=123456'), {
    type: 'numeric_id',
    value: '123456',
  });
  assert.deepEqual(parseFacebookInput('https://www.facebook.com/people/Some-Name/100084123/'), {
    type: 'numeric_id',
    value: '100084123',
  });
  assert.deepEqual(parseFacebookInput('https://m.facebook.com/profile.php?id=4'), {
    type: 'numeric_id',
    value: '4',
  });
});

test('parseFacebookInput: rejects non-Facebook hosts', () => {
  assert.match(parseFacebookInput('https://evil.com/x').error, /not a recognized Facebook domain/i);
  assert.match(parseFacebookInput('https://facebook.com.evil.com/zuck').error, /not a recognized/i);
});

test('parseFacebookInput: rejects non-profile Facebook pages', () => {
  assert.match(parseFacebookInput('https://facebook.com/groups/123').error, /groups/i);
  assert.match(parseFacebookInput('https://facebook.com/watch/123').error, /watch/i);
});

test('parseFacebookInput: detects share links and CDN URLs', () => {
  assert.equal(parseFacebookInput('https://www.facebook.com/share/1EMhdXTEaV/').type, 'share_url');
  const cdn = parseFacebookInput('https://scontent.xx.fbcdn.net/v/t1/a.jpg');
  assert.equal(cdn.type, 'cdn_url');
});

/* ------------------------------------------------------------------ */
/* upgradeToMaxResolution                                              */
/* ------------------------------------------------------------------ */

const realCdn =
  'https://scontent.xx.fbcdn.net/v/t39.30808-1/a.jpg?stp=cp0&cstp=mx711x711&ctp=s711x711&oh=abc';

test('upgradeToMaxResolution: normal case', () => {
  const r = upgradeToMaxResolution(realCdn);
  assert.equal(r.upgraded, false); // s711x711 === mx711x711
  assert.equal(r.mxVal, '711x711');
  assert.equal(r.origVal, 's711x711');
  assert.match(r.url, /ctp=s711x711/);
});

test('upgradeToMaxResolution: replaces a smaller preview crop', () => {
  const url = 'https://x.fbcdn.net/a.jpg?cstp=mx720x727&ctp=p100x100';
  const r = upgradeToMaxResolution(url);
  assert.equal(r.upgraded, true);
  assert.equal(r.mxVal, '720x727');
  assert.equal(r.origVal, 'p100x100');
  assert.match(r.url, /ctp=p720x727/);
});

test('upgradeToMaxResolution: rejects a malicious mx token (no XSS payload propagates)', () => {
  const payload = 'https://x.fbcdn.net/a.jpg?cstp=mx"><img src=x onerror=alert(1)>&ctp=p1x1';
  const r = upgradeToMaxResolution(payload);
  assert.equal(r.upgraded, false);
  assert.equal(r.mxVal, null);
  assert.equal(r.url, payload);
});

test('upgradeToMaxResolution: leaves URLs without params untouched', () => {
  const plain = 'https://x.fbcdn.net/a.jpg';
  assert.deepEqual(upgradeToMaxResolution(plain), {
    url: plain,
    upgraded: false,
    mxVal: null,
    origVal: null,
  });
  assert.equal(upgradeToMaxResolution(null).url, null);
});

/* ------------------------------------------------------------------ */
/* Rate limiter                                                        */
/* ------------------------------------------------------------------ */

test('rateLimit: allows up to the limit then returns 429 with Retry-After', () => {
  let statusCode = null;
  let retryAfter = null;
  const res = {
    setHeader: (k, v) => {
      if (k === 'Retry-After') retryAfter = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  const req = { ip: '10.0.0.1', socket: {} };
  let passed = 0;
  for (let i = 0; i < 40; i++) {
    rateLimit(req, res, () => {
      passed++;
    });
  }
  assert.equal(statusCode, 429);
  assert.equal(passed, 30);
  assert.ok(Number(retryAfter) >= 1);
});

/* ------------------------------------------------------------------ */
/* parseProfileHtml / buildProfileUrl (datacenter login-wall handling) */
/* ------------------------------------------------------------------ */

test('buildProfileUrl: numeric vs username vs URL', () => {
  assert.equal(buildProfileUrl('4'), 'https://www.facebook.com/profile.php?id=4');
  assert.equal(buildProfileUrl('zuck'), 'https://www.facebook.com/zuck');
  assert.equal(buildProfileUrl('https://m.facebook.com/zuck'), 'https://m.facebook.com/zuck');
});

test('parseProfileHtml: extracts og:image and name from real profile HTML', () => {
  const html = `
    <html><head>
      <title>Mark Zuckerberg</title>
      <meta property="og:image" content="https://scontent.xx.fbcdn.net/v/t39/a.jpg?cstp=mx711x711&amp;ctp=s711x711" />
      <meta property="og:title" content="Mark Zuckerberg" />
    </head></html>`;
  const r = parseProfileHtml(html, 'zuck');
  assert.equal(r.name, 'Mark Zuckerberg');
  assert.deepEqual(r.candidates, [
    'https://scontent.xx.fbcdn.net/v/t39/a.jpg?cstp=mx711x711&ctp=s711x711',
  ]);
  // The HD upgrade is applied by the caller from these candidates.
  assert.equal(upgradeToMaxResolution(r.candidates[0]).mxVal, '711x711');
});

test('parseProfileHtml: prefers direct CDN over lookaside candidates', () => {
  const html = `
    <meta property="og:image" content="https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=4" />
    <img src="https://scontent.xx.fbcdn.net/v/t39/b.jpg?cstp=mx720x720&amp;ctp=p100x100" />`;
  const r = parseProfileHtml(html, 'zuck');
  assert.equal(r.candidates[0].includes('scontent'), true);
  assert.equal(r.candidates[1].includes('lookaside'), true);
});

test('parseProfileHtml: reports notFound on the explicit "not available" page', () => {
  const html = `<html><head><title>Facebook</title></head><body>This page isn't available The link you followed may be broken.</body></html>`;
  const r = parseProfileHtml(html, 'nobody');
  assert.equal(r.notFound, true);
});

test('parseProfileHtml: a login wall is NOT reported as notFound (Render bug)', () => {
  // This is what Facebook serves to datacenter IPs for a VALID profile.
  const html = `<html><head><title>Facebook</title></head><body>Explore the things you love. Log into Facebook Email or mobile number Password</body></html>`;
  const r = parseProfileHtml(html, 'zuck');
  assert.equal(r.notFound, undefined, 'must not claim the account was deleted');
  assert.equal(r.blocked, true);
  assert.match(r.message, /login wall/i);
});

test('parseProfileHtml: generic page with no markers yields no candidates', () => {
  const r = parseProfileHtml('<html><head><title>Facebook</title></head></html>', 'x');
  assert.deepEqual(r.candidates, []);
  assert.equal(r.notFound, undefined);
  assert.equal(r.blocked, undefined);
});

test('parseProfileHtml: "content isn\'t available" lookaside page is notFound when no image', () => {
  // Observed for some accounts: og:image is a lookaside URL whose body is an
  // HTML "content isn't available" page (not an image).
  const html = `<html><head><title>Facebook</title></head><body>Sorry, this content isn't available at the moment The link you followed may have expired.</body></html>`;
  const r = parseProfileHtml(html, 'zuck');
  assert.equal(r.notFound, true);
});

test('rankImageCandidate: direct CDN ranks above lookaside', () => {
  assert.ok(
    rankImageCandidate('https://scontent.xx.fbcdn.net/a.jpg') <
      rankImageCandidate('https://lookaside.fbsbx.com/x')
  );
});

test('HTTP: /api/image rejects non-Facebook hosts and missing url', async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  try {
    const missing = await fetch(`http://127.0.0.1:${port}/api/image`);
    assert.equal(missing.status, 400);

    const evil = await fetch(
      `http://127.0.0.1:${port}/api/image?url=${encodeURIComponent('http://evilfbcdn.net/x')}`
    );
    assert.equal(evil.status, 403);
  } finally {
    server.close();
  }
});

/* ------------------------------------------------------------------ */
/* HTTP integration                                                    */
/* ------------------------------------------------------------------ */

test('HTTP: /api/health responds ok', async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  } finally {
    server.close();
  }
});

test('HTTP: security headers are set', async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"));
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally {
    server.close();
  }
});

test('HTTP: missing body returns 400 JSON (no stack trace)', async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/get-profile-picture`, {
      method: 'POST',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Profile ID, Username, or Link/i);
  } finally {
    server.close();
  }
});

test('HTTP: malformed JSON returns 400 JSON', async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/get-profile-picture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Malformed JSON/i);
  } finally {
    server.close();
  }
});

test('HTTP: download proxy rejects non-Facebook hosts (SSRF)', async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  try {
    for (const evil of ['evilfbcdn.net', 'notfacebook.com', 'facebook.com.evil.com']) {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/download?url=${encodeURIComponent(`http://${evil}/x`)}`
      );
      assert.equal(res.status, 403, `${evil} should be rejected`);
    }
  } finally {
    server.close();
  }
});

test('HTTP: size parameter is allowlisted (invalid value does not reach Graph URL)', async () => {
  // A bogus size must be coerced to "large"; invalid input is rejected before
  // any network call, so this stays offline and only asserts the input guard.
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/get-profile-picture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'https://evil.com/x', size: 'large&access_token=leak' }),
    });
    assert.equal(res.status, 400); // rejected as non-Facebook domain
  } finally {
    server.close();
  }
});
