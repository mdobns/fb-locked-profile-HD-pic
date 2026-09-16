const express = require('express');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

// Load environment variables natively if .env exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...val] = trimmed.split('=');
        if (key && val.length) {
          process.env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    });
}

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');

// Security headers (CSP allows self + Google Fonts; images may come from the FB CDN)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; " +
      "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});

// Simple in-memory sliding-window rate limiter (per client IP).
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const recent = (rateBuckets.get(key) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000));
    return res.status(429).json({ success: false, error: 'Too many requests. Please slow down and try again shortly.' });
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  next();
}

// Periodically evict idle buckets so the map cannot grow without bound.
const rateLimitSweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateBuckets) {
    const recent = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, recent);
  }
}, RATE_LIMIT_WINDOW_MS);
rateLimitSweeper.unref?.();

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Validates and parses user input:
 * Checks for valid Facebook domains, profile URL patterns, numeric IDs, and usernames.
 */
function parseFacebookInput(input) {
  if (!input || typeof input !== 'string') {
    return { error: 'Please enter a Facebook Profile ID, Username, or Link.' };
  }
  const cleanInput = input.trim();
  if (!cleanInput) {
    return { error: 'Input cannot be empty.' };
  }

  // 1. Check if input is a pure numeric ID
  if (/^\d+$/.test(cleanInput)) {
    if (cleanInput.length > 25) {
      return { error: 'Numeric ID is too long to be a valid Facebook ID.' };
    }
    return { type: 'numeric_id', value: cleanInput };
  }

  // 2. Check if input looks like a URL. Only protocol-prefixed, www-prefixed,
  // or slash-containing inputs are treated as URLs so that dotted usernames
  // (e.g. "john.me", "foo.net") are not misclassified as domains.
  if (/^https?:\/\//i.test(cleanInput) || /^www\./i.test(cleanInput) || cleanInput.includes('/')) {
    try {
      let urlString = cleanInput;
      if (!/^https?:\/\//i.test(urlString)) {
        urlString = 'https://' + urlString;
      }
      const parsedUrl = new URL(urlString);
      const host = parsedUrl.hostname.toLowerCase();

      // Check if host is an allowed Facebook domain
      const fbDomains = ['facebook.com', 'fb.com', 'fb.me', 'fbcdn.net'];
      const isFbDomain = fbDomains.some(d => host === d || host.endsWith('.' + d));

      if (!isFbDomain) {
        return { 
          error: `"${host}" is not a recognized Facebook domain. Please enter a valid Facebook link (e.g. facebook.com/username).` 
        };
      }

      // Direct CDN image URL
      if (host.includes('fbcdn.net') || parsedUrl.pathname.includes('/v/t39.') || parsedUrl.pathname.includes('/v/t1.')) {
        return { type: 'cdn_url', value: cleanInput };
      }

      // Mobile share redirect link (e.g. facebook.com/share/1EMhdXTEaV/)
      if (parsedUrl.pathname.startsWith('/share/')) {
        return { type: 'share_url', value: urlString };
      }

      // Check for non-profile URLs on Facebook (groups, watch, marketplace, gaming, events)
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      const nonProfileKeywords = ['groups', 'events', 'gaming', 'watch', 'marketplace', 'login', 'recover', 'help', 'policies', 'ads', 'messages'];
      if (segments.length > 0 && nonProfileKeywords.includes(segments[0].toLowerCase())) {
        return {
          error: `The URL points to a Facebook "${segments[0]}" page, not an individual user profile. Please provide a direct Profile link or ID.`
        };
      }

      // Case A: profile.php?id=123456
      const idParam = parsedUrl.searchParams.get('id');
      if (idParam && /^\d+$/.test(idParam)) {
        return { type: 'numeric_id', value: idParam };
      }

      // Case B: /people/username-or-name/123456789
      const peopleMatch = parsedUrl.pathname.match(/\/people\/[^\/]+\/(\d+)/i);
      if (peopleMatch && peopleMatch[1]) {
        return { type: 'numeric_id', value: peopleMatch[1] };
      }

      // Case C: Path username like /zuck or /john.doe
      if (segments.length > 0) {
        const usernameCandidate = segments[0].replace(/[@\/]/g, '').trim();
        if (/^[a-zA-Z0-9.]{1,60}$/.test(usernameCandidate)) {
          return { type: 'username', value: usernameCandidate };
        }
      }

      return { error: 'Unable to detect a valid profile identifier from this Facebook link.' };
    } catch (err) {
      return { error: 'Malformed URL provided. Please verify the link format.' };
    }
  }

  // 3. Raw Username Validation
  const usernameCandidate = cleanInput.replace(/[@\/]/g, '').trim();
  if (!usernameCandidate) {
    return { error: 'Please enter a valid Facebook Profile ID or Username.' };
  }

  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(usernameCandidate)) {
    return { 
      error: 'Invalid format. Facebook usernames and IDs only contain letters, numbers, dots, hyphens, or underscores.' 
    };
  }

  return { type: 'username', value: usernameCandidate };
}

/**
 * Core Dimension Upgrade Engine:
 * Facebook CDN links generated by mobile SSR contain:
 * ...&cstp=mx<MAX_SIZE>&ctp=p<PREVIEW_SIZE>... or ...&ctp=s<PREVIEW_SIZE>...
 * Whatever comes after ctp=p*** or ctp=s*** is replaced with what comes after mx***.
 */
function upgradeToMaxResolution(cdnUrl) {
  if (!cdnUrl || typeof cdnUrl !== 'string') {
    return { url: cdnUrl, upgraded: false, mxVal: null, origVal: null };
  }

  const mxMatch = cdnUrl.match(/[?&]cstp=mx([^&]+)/i);
  const ctpMatch = cdnUrl.match(/[?&]ctp=([a-z]?)([^&]+)/i);

  // Only accept a dimension-like mx token (e.g. "720x727") to avoid copying
  // arbitrary/attacker-controlled characters into URLs returned to the client.
  if (mxMatch && mxMatch[1] && /^[0-9a-z]+$/i.test(mxMatch[1]) && ctpMatch) {
    const mxVal = mxMatch[1]; // e.g. "720x727"
    const prefix = ctpMatch[1] || 'p'; // "p" or "s"
    const origVal = ctpMatch[2]; // e.g. "240x240"

    const upgradedUrl = cdnUrl.replace(/([?&]ctp=[a-z]?)[^&]+/i, `$1${mxVal}`);
    const upgraded = origVal !== mxVal;

    return {
      url: upgradedUrl,
      upgraded,
      mxVal,
      origVal: `${prefix}${origVal}`,
    };
  }

  return { url: cdnUrl, upgraded: false, mxVal: null, origVal: null };
}

/**
 * User agents tried in order when fetching a profile page. The mobile Safari
 * UA yields the richest markup (direct scontent CDN URL with the `cstp=mx` HD
 * hint) but is the most likely to hit a login wall on cloud hosts such as
 * Render. Link-preview crawlers still receive Open Graph tags from datacenter
 * IPs, so they act as a fallback (their `og:image` is often a lookaside URL
 * that must be validated before use).
 */
const UA_ATTEMPTS = [
  {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    method: 'Direct Curl + mx Upgrade',
  },
  {
    userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    method: 'Crawler UA + mx Upgrade',
  },
  {
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    method: 'Crawler UA + mx Upgrade',
  },
];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Builds the Facebook profile URL for an id/username/URL target. */
function buildProfileUrl(target) {
  if (/^https?:\/\//i.test(target)) return target;
  if (/^\d+$/.test(target)) return `https://www.facebook.com/profile.php?id=${target}`;
  return `https://www.facebook.com/${encodeURIComponent(target)}`;
}

/**
 * Orders candidate image URLs so that direct CDN links (which carry the
 * `cstp=mx` HD hint) are preferred over lookaside proxy links, which may
 * serve an HTML error page instead of an image.
 */
function rankImageCandidate(url) {
  if (url.includes('lookaside')) return 2;
  if (url.includes('fbcdn.net') || url.includes('fbsbx.com')) return 0;
  return 1;
}

/**
 * Parses the SSR HTML of a Facebook profile page.
 *
 * Returns:
 *   { notFound }            - Facebook explicitly said the page is unavailable
 *   { blocked }             - a login wall was served (NOT proof of deletion)
 *   { candidates, name }    - zero or more candidate image URLs, best first
 */
function parseProfileHtml(html, target) {
  const lowerHtml = html.toLowerCase();

  const hasNotFoundMessage =
    lowerHtml.includes("this page isn't available") ||
    lowerHtml.includes("this content isn't available") ||
    lowerHtml.includes('the link you followed may be broken') ||
    lowerHtml.includes('page not found') ||
    lowerHtml.includes('may have expired');

  // A login wall / cookie interstitial is NOT proof that the account is gone.
  const hasLoginWall =
    lowerHtml.includes('log into facebook') ||
    lowerHtml.includes('you must log in') ||
    lowerHtml.includes('email or mobile number') ||
    lowerHtml.includes('forgot password');

  // Collect candidate image URLs: og:image first, then any inline scontent link.
  const candidates = [];
  const ogMatch =
    html.match(/<meta[^>]*property=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:image|twitter:image)["']/i);
  if (ogMatch) candidates.push(ogMatch[1]);

  const scontentMatches = html.match(/https:\/\/[^"'\s<>\\]*scontent[^"'\s<>\\]*/gi) || [];
  for (const match of scontentMatches) candidates.push(match);

  let ogTitle = null;
  const titleMatch =
    html.match(/<meta[^>]*property=["'](?:og:title|og:image:alt)["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) ogTitle = titleMatch[1].replace(/\|\s*Facebook$/i, '').trim();

  const normalized = [...new Set(candidates.map(u => u.replace(/&amp;/g, '&')))].sort(
    (a, b) => rankImageCandidate(a) - rankImageCandidate(b)
  );

  // Explicit "not available" page with no candidate at all => truly gone.
  if (hasNotFoundMessage && normalized.length === 0) {
    return { notFound: true, message: 'This Facebook profile does not exist or has been deactivated/removed.' };
  }

  if (normalized.length > 0) {
    return { candidates: normalized, name: ogTitle || null };
  }

  if (hasLoginWall) {
    return {
      blocked: true,
      message:
        'Facebook returned a login wall instead of the public profile. This usually happens when the app is hosted on a cloud/datacenter IP.',
    };
  }

  return { candidates: [], name: ogTitle || null };
}

/**
 * Verifies that a URL actually serves an image. Lookaside links in particular
 * can return an HTML "content isn't available" page, which would otherwise be
 * handed to the browser as a broken image.
 */
async function validateImageUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    // Release the body without downloading it in full.
    if (res.body && typeof res.body.cancel === 'function') {
      await res.body.cancel().catch(() => {});
    }
    if (!res.ok) return false;
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}

/**
 * Strategy 1 (Primary):
 * Fetches the profile page (trying each user-agent) and returns the first
 * candidate image URL that is verified to serve real image bytes.
 */
async function curlAndExtractProfilePicture(target) {
  const profileUrl = buildProfileUrl(target);
  let sawBlocked = null;
  let sawNotFound = null;
  let fallbackName = null;

  for (const attempt of UA_ATTEMPTS) {
    try {
      const res = await fetch(profileUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': attempt.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (res.status === 404) {
        return { notFound: true, message: 'Facebook returned HTTP 404 (Profile Not Found).' };
      }
      if (!res.ok) continue;

      const html = await res.text();
      const parsed = parseProfileHtml(html, target);

      if (parsed.notFound) sawNotFound = parsed;
      if (parsed.blocked) sawBlocked = parsed;
      if (!fallbackName && parsed.name) fallbackName = parsed.name;
      if (!parsed.candidates || parsed.candidates.length === 0) continue;

      // Validate candidates in priority order and use the first real image.
      for (const candidate of parsed.candidates) {
        if (!(await validateImageUrl(candidate))) continue;
        const upgradeInfo = upgradeToMaxResolution(candidate);
        return {
          success: true,
          method: attempt.method,
          imageUrl: upgradeInfo.url,
          previewUrl: candidate,
          mxResolution: upgradeInfo.mxVal,
          originalResolution: upgradeInfo.origVal,
          isUpgraded: upgradeInfo.upgraded,
          name: parsed.name || fallbackName,
          isSilhouette: candidate.includes('silhouette') || candidate.includes('static.xx.fbcdn'),
        };
      }
    } catch (err) {
      console.warn(`Profile fetch failed (${attempt.userAgent.slice(0, 24)}...): ${err.message}`);
    }
  }

  // No usable image. Prefer a definitive "not found" over a login-wall report,
  // and never claim an account was deleted based only on a login wall.
  if (sawNotFound) return sawNotFound;
  if (sawBlocked) return sawBlocked;
  return null;
}

/**
 * Strategy 2: Graph API Fallback (with or without access token)
 */
async function fetchViaGraphApi(idOrUsername, type = 'large', accessToken = null) {
  const token = accessToken || process.env.FB_ACCESS_TOKEN || '';
  let apiUrl = `https://graph.facebook.com/${encodeURIComponent(idOrUsername)}/picture?type=${encodeURIComponent(type)}&redirect=false`;
  if (token) {
    apiUrl += `&access_token=${encodeURIComponent(token)}`;
  }

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      if (data.error && (data.error.code === 100 || data.error.code === 803 || data.error.message?.includes('does not exist'))) {
        return { notFound: true, error: data.error.message };
      }
      return null;
    }

    if (data && data.data && data.data.url) {
      const upgradeInfo = upgradeToMaxResolution(data.data.url);
      return {
        success: true,
        method: 'Graph API',
        imageUrl: upgradeInfo.url,
        previewUrl: data.data.url,
        mxResolution: upgradeInfo.mxVal,
        originalResolution: upgradeInfo.origVal,
        isUpgraded: upgradeInfo.upgraded,
        isSilhouette: data.data.is_silhouette || false,
      };
    }
  } catch (err) {
    console.warn(`Graph API JSON query failed: ${err.message}`);
  }

  // Follow redirect directly
  try {
    let redirectUrl = `https://graph.facebook.com/${encodeURIComponent(idOrUsername)}/picture?type=${encodeURIComponent(type)}`;
    if (token) {
      redirectUrl += `&access_token=${encodeURIComponent(token)}`;
    }
    const redirectRes = await fetch(redirectUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const location = redirectRes.headers.get('location');
    if (location && location.includes('fbcdn.net')) {
      const upgradeInfo = upgradeToMaxResolution(location);
      return {
        success: true,
        method: 'Graph API Redirect',
        imageUrl: upgradeInfo.url,
        previewUrl: location,
        mxResolution: upgradeInfo.mxVal,
        originalResolution: upgradeInfo.origVal,
        isUpgraded: upgradeInfo.upgraded,
        isSilhouette: location.includes('silhouette') || location.includes('generic'),
      };
    }
  } catch (err) {
    console.warn(`Graph API Redirect query failed: ${err.message}`);
  }

  return null;
}

/**
 * API Route: Get Profile Picture
 */
const ALLOWED_SIZES = ['large', 'normal', 'small', 'square'];

app.post('/api/get-profile-picture', rateLimit, async (req, res) => {
  const { input, size = 'large', customToken } = req.body || {};
  const safeSize = ALLOWED_SIZES.includes(size) ? size : 'large';

  const parsed = parseFacebookInput(input);
  if (parsed.error) {
    return res.status(400).json({ success: false, error: parsed.error });
  }

  const target = parsed.value;

  // Handle direct CDN URL input
  if (parsed.type === 'cdn_url') {
    const upgradeInfo = upgradeToMaxResolution(parsed.value);
    const proxyDownloadUrl = `/api/download?url=${encodeURIComponent(upgradeInfo.url)}&id=cdn_photo`;
    return res.json({
      success: true,
      target: 'Direct CDN Photo',
      targetType: 'cdn_url',
      imageUrl: upgradeInfo.url,
      previewUrl: parsed.value,
      mxResolution: upgradeInfo.mxVal,
      originalResolution: upgradeInfo.origVal,
      isUpgraded: upgradeInfo.upgraded,
      proxyDownloadUrl,
      name: 'Facebook Photo',
      method: 'Direct CDN + mx Upgrade',
      isSilhouette: false,
      info: upgradeInfo.upgraded
        ? `Replaced preview crop ${upgradeInfo.origVal} with max resolution ${upgradeInfo.mxVal}.`
        : 'Photo retrieved successfully.',
    });
  }

  let result = null;

  // 1. Primary Strategy: fetch the profile page (crawler UA first)
  const curlResult = await curlAndExtractProfilePicture(target);
  if (curlResult && curlResult.success) {
    result = curlResult;
  }

  // Share links are opaque redirect URLs and cannot be resolved by the Graph API
  // path; they are handled by the crawler above only.
  // The Graph API cannot resolve vanity usernames without a User token, so we
  // only consult it for numeric IDs or when the caller supplied a token.
  const hasToken = !!(customToken || process.env.FB_ACCESS_TOKEN);
  const canUseGraphApi =
    parsed.type !== 'share_url' && (parsed.type === 'numeric_id' || hasToken);

  // 2. Fallback to Graph API if the crawl didn't yield an image or returned silhouette
  if (canUseGraphApi && (!result || result.isSilhouette)) {
    const graphResult = await fetchViaGraphApi(target, safeSize, customToken);
    if (graphResult && graphResult.success && !graphResult.isSilhouette) {
      result = graphResult;
    } else if (!result && graphResult && graphResult.success) {
      result = graphResult;
    } else if (curlResult?.notFound && graphResult?.notFound) {
      // Both strategies independently confirmed the account is gone.
      return res.status(404).json({
        success: false,
        error: `Facebook account "@${target}" does not exist, has been deleted, or is deactivated.`,
      });
    }
  }

  // 2b. The crawler independently confirmed the account is gone (no need for Graph).
  if (!result && curlResult?.notFound) {
    return res.status(404).json({
      success: false,
      error: `Facebook account "@${target}" does not exist, has been deleted, or is deactivated.`,
    });
  }

  // 3. No image could be extracted.
  if (!result || !result.imageUrl) {
    // Distinguish "Facebook blocked us" from "this profile is not public /
    // does not exist", otherwise valid profiles are wrongly reported as deleted.
    const blocked = curlResult?.blocked;
    return res.status(blocked ? 503 : 404).json({
      success: false,
      error: blocked
        ? `Facebook served a login wall instead of "@${target}". This typically happens when the app runs on a cloud/datacenter IP (e.g. Render). ` +
          'Set FB_ACCESS_TOKEN in the environment, or try a numeric profile ID, and try again.'
        : `Could not find a Facebook profile or extract a profile picture for "${target}". ` +
          'Please check that the account exists and is publicly accessible.',
      reason: blocked ? 'login_wall' : 'not_found',
      hint: blocked
        ? 'Datacenter IPs are frequently blocked by Facebook. A Graph API access token is the reliable fix.'
        : undefined,
    });
  }

  // Prepare download proxy URL
  const proxyDownloadUrl = `/api/download?url=${encodeURIComponent(result.imageUrl)}&id=${encodeURIComponent(target)}`;

  return res.json({
    success: true,
    target,
    targetType: parsed.type,
    imageUrl: result.imageUrl,
    previewUrl: result.previewUrl || result.imageUrl,
    mxResolution: result.mxResolution || null,
    originalResolution: result.originalResolution || null,
    isUpgraded: !!result.isUpgraded,
    proxyDownloadUrl,
    name: result.name || null,
    method: result.method,
    isSilhouette: !!result.isSilhouette,
    info: result.isSilhouette
      ? 'A placeholder silhouette was returned by Facebook. The profile may have strict privacy controls, Profile Picture Guard, or require a Graph API Access Token.'
      : 'Profile picture retrieved successfully.',
  });
});

/**
 * API Route: Download Image Proxy (Bypasses CORS and forces file download)
 */
app.get('/api/download', rateLimit, async (req, res) => {
  const { url, id = 'fb-profile' } = req.query;

  if (!url) {
    return res.status(400).send('Missing image URL parameter.');
  }

  try {
    const parsedUrl = new URL(url);
    const allowedHosts = ['fbcdn.net', 'facebook.com', 'akamaihd.net', 'fbsbx.com'];
    const host = parsedUrl.hostname.toLowerCase();
    // Exact host or a true subdomain only (prevents "evilfbcdn.net" bypass).
    const isAllowed = allowedHosts.some(allowed => host === allowed || host.endsWith('.' + allowed));
    if (!isAllowed) {
      return res.status(403).send('Forbidden: URL must be from Facebook CDN.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let imageResponse;
    try {
      imageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).send('Failed to fetch image from source.');
    }

    const contentLength = parseInt(imageResponse.headers.get('content-length') || '0', 10);
    const MAX_BYTES = 25 * 1024 * 1024;
    if (contentLength > MAX_BYTES) {
      return res.status(413).send('Image is too large to download.');
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const filename = `facebook_profile_${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream the body instead of buffering it fully in memory.
    const bodyStream = Readable.fromWeb(imageResponse.body);
    bodyStream.on('error', (streamErr) => {
      console.error('Stream error while proxying image:', streamErr.message);
      if (!res.headersSent) {
        res.status(502).send('Error while streaming image from source.');
      } else {
        res.destroy(streamErr);
      }
    });
    bodyStream.pipe(res);
  } catch (err) {
    console.error('Download proxy error:', err);
    res.status(500).send('Internal error downloading the image.');
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Centralized error handler: keeps internal paths/stack traces out of responses.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Malformed JSON request body.' });
  }
  console.error('Unhandled error:', err && err.message ? err.message : err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

module.exports = {
  app,
  parseFacebookInput,
  upgradeToMaxResolution,
  rateLimit,
  parseProfileHtml,
  buildProfileUrl,
  rankImageCandidate,
  validateImageUrl,
};

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Facebook Profile Picture Downloader running at http://localhost:${PORT}`);
  });
}
