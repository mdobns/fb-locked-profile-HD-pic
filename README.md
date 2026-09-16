# Facebook Profile Picture Downloader & HD Viewer

A modern, responsive web application to view and download Facebook profile pictures in high definition using Facebook Profile IDs, Usernames, or full Profile URLs.

---

## ✨ Features

- **Cloud-reliable input formats**:
  - Direct Numeric User ID (e.g. `4`, `100001234567890`)
  - Numeric Profile URL (e.g. `https://www.facebook.com/profile.php?id=...`, `https://facebook.com/people/.../1000...`)
  - Vanity usernames and share links are accepted as best-effort inputs only.
- **Multi-Strategy Resolution Engine**:
  - **Numeric-ID fallback**: Direct picture lookup when Facebook exposes or receives a numeric ID.
  - **Open Graph Metadata**: Automated Open Graph (`og:image`, `og:title`) extraction via web crawler agents.
  - **Mobile Web Parser**: Fallback scraper for mobile endpoints.
  - **Direct Graph Link**: Ultimate CDN redirect fallback.
- **One-Click HD Download**:
  - Built-in server proxy (`/api/download`) that bypasses CORS restrictions and pipes image headers directly with `Content-Disposition: attachment; filename="facebook_profile_<id>.jpg"`.
- **Quality Options**: Choose between HD / Large, Normal (320px), Small (160px), and Square crop.
- **Modern Glassmorphism UI**: High-contrast dark theme, fluid animations, responsive layout for mobile and desktop devices.
- **Quick Test Chips & Clipboard Paste**: Easy testing with sample IDs and 1-click clipboard paste.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)

### Run locally (recommended — all features work)

```bash
npm install     # once
npm run local   # starts the server and opens http://localhost:3000
```

Running on your own machine is the **fully-featured mode**. Because a home
connection is not treated as a datacenter, every input type works:

| Input | Example | Local | Hosted (Render) |
|-------|---------|:-----:|:---------------:|
| Numeric ID | `4` | ✅ | ✅ |
| Numeric profile URL | `facebook.com/profile.php?id=4`, `facebook.com/people/.../1000...` | ✅ | ✅ |
| Username | `zuck` | ✅ | ⚠️ best-effort |
| Share link | `facebook.com/share/...` | ✅ | ⚠️ best-effort |

Useful launcher options:

```bash
npm run local -- --port 4000   # custom port
npm run local -- --no-open     # don't open a browser
npm run local -- --help        # all options
```

Stop the server with `Ctrl+C`.

### Alternative: plain start

```bash
npm start          # same server without the launcher/browser
```

Then open <http://localhost:3000> manually. Change the port with a `.env` file
(see [Configuration](#️-configuration-optional)).

### How to use the UI

1. Paste a numeric ID, a profile URL, a username, or a share link.
2. Press **Get Profile Picture**.
3. Click **Download Image** to save the full-resolution photo, or **Copy Image URL** / **Open in Tab**.

---

## ⚙️ Configuration (Optional)

You can customize the port by creating a `.env` file:
```bash
cp .env.example .env
```

Contents of `.env`:
```env
PORT=3000
```

---

## 🧪 Testing

A dependency-free test suite (Node's built-in `node:test` runner) covers input
parsing, profile HTML parsing, the CDN resolution-upgrade logic, the rate limiter,
SSRF protection, and error handling:

```bash
npm test
```

---

## ☁️ Deploying to Render (or any cloud host)

Facebook frequently serves a **login wall** to crawlers running from datacenter
IP ranges, while link-preview crawler user-agents (used by Slack/WhatsApp) may
still receive Open Graph metadata. The server handles this by:

1. Trying the mobile Safari user-agent first (richest markup, direct CDN URL with
the `cstp=mx` HD hint).
2. Falling back to `facebookexternalhit` and `Googlebot` user-agents, which are
   whitelisted for Open Graph tags from datacenter IPs.
3. **Validating** every candidate image URL before use — `lookaside.fbsbx.com`
   links sometimes return an HTML `"this content isn't available"` page rather
   than an image, and those are rejected instead of returned as broken images.
4. Reporting a clear **`503 login_wall`** (not a misleading "account deleted")
   when Facebook blocks the request.

### What works reliably without credentials

Use a numeric profile ID or a link containing `profile.php?id=NUMBER`. Facebook
can serve a login page or incomplete HTML to cloud/datacenter IPs, so a vanity
username such as `zuck` cannot be reliably converted to a numeric ID by a
Render deployment. Usernames and share links are attempted, but should be
treated as best-effort only.

### 🔑 Username → numeric ID (run this on your own computer)

If you only have a username or a `facebook.com/share/...` link, run the included
resolver **on your local machine**. Your home connection is not blocked the way a
cloud host is, so it can usually read the profile page and reveal the numeric ID.
That numeric ID then works reliably in the hosted app.

```bash
# 1. On your computer, inside the project folder:
npm install          # once
npm run resolve-id zuck

# Example output:
#   Name       : Mark Zuckerberg
#   Numeric ID : 4
#
#   Use this in the hosted app:
#     4
#     https://www.facebook.com/profile.php?id=4

# 2. Paste that numeric ID (or the profile.php?id=... link) into the hosted app.
```

Accepts usernames, profile URLs, share links, or numeric IDs, and multiple
values at once:

```bash
npm run resolve-id zuck https://www.facebook.com/esrat.jahan.379623
npm run resolve-id -- --json https://www.facebook.com/share/1EMhdXTEaV/
```

> Use a plain home/office connection. VPNs, proxies, and cloud servers are the
> exact situations Facebook blocks. If you see "received a login wall", try a
> different network.

---

## 🔒 Security Notes

- `/api/download` is restricted to exact Facebook CDN hosts and their subdomains (SSRF guard).
- API routes are rate limited (30 requests / minute / IP) and security headers (CSP, `X-Frame-Options`, `nosniff`) are set.
- Malformed requests return JSON errors without leaking stack traces or filesystem paths.

---

## 🛡️ Scope & Privacy Warning

> ⚠️ **Important:** This tool only works for **publicly available profile pictures**. It does not bypass privacy controls.

- **Public Profiles**: Avatars are extracted from the public Open Graph metadata served for the profile and, when the CDN exposes a larger `cstp=mx***` variant, the URL is upgraded to that maximum available resolution.
- **Profile Picture Guard / locked profiles**: Facebook only serves a blurred or preview crop publicly. This tool returns whatever Facebook publicly serves; it **cannot** retrieve a full-size image that Facebook does not expose, and it cannot unlock guarded pictures.
- **Completely private, deleted, or deactivated accounts**: Not accessible — the API returns a clear error.

> Please respect Facebook's Terms of Service and only download images you have the right to use.

---

## 📁 Project Structure

```
├── server.js          # Express server, API endpoints, scraper & proxy
├── resolve-id.js      # Local CLI: username/share-link -> numeric profile ID
├── scripts/
│   └── start-local.js # Local launcher: runs the full app and opens the browser
├── package.json       # Node.js project manifest & scripts
├── .env.example       # Environment variables template
├── LICENSE            # MIT License
├── README.md          # Project documentation
├── test/
│   └── server.test.js # Dependency-free test suite (node:test)
└── public/
    ├── index.html     # Semantic, accessible HTML5 layout
    ├── style.css      # Dark mode glassmorphism UI styling
    └── app.js         # Frontend interactive logic & API caller
```

---

## 📄 License

Released under the [MIT License](LICENSE) © 2026 Md Oshama Bin Nur.

> This project is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.
> "Facebook" is a trademark of Meta Platforms, Inc. Use responsibly and in accordance with
> Facebook's Terms of Service.
