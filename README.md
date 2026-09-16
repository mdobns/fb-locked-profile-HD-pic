# Facebook Profile Picture Downloader & HD Viewer

A modern, responsive web application to view and download Facebook profile pictures in high definition using Facebook Profile IDs, Usernames, or full Profile URLs.

---

## ✨ Features

- **Multi-Format Input Support**:
  - Direct Numeric User ID (e.g. `4`, `100001234567890`)
  - Vanity Username (e.g. `zuck`, `mark.zuckerberg`)
  - Full Facebook Profile URL (e.g. `https://www.facebook.com/zuck`, `https://m.facebook.com/profile.php?id=...`, `https://facebook.com/people/.../1000...`)
- **Multi-Strategy Resolution Engine**:
  - **Meta Graph API**: Direct picture endpoint queries with optional Access Token support.
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

### Installation

1. Clone or navigate to the directory:
   ```bash
   cd "fb-locked-profile-HD-pic"
   ```

2. Install dependencies (already installed if using this repo):
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser:
   ```
   http://localhost:3000
   ```

---

## ⚙️ Configuration (Optional)

You can customize port and Facebook API credentials by creating a `.env` file:
```bash
cp .env.example .env
```

Contents of `.env`:
```env
PORT=3000
# Optional: App Access Token or User Access Token from https://developers.facebook.com/
FB_ACCESS_TOKEN=your_token_here
```

---

## 🧪 Testing

A dependency-free test suite (Node's built-in `node:test` runner) covers input
parsing, the CDN resolution-upgrade logic, the rate limiter, SSRF protection, and
error handling:

```bash
npm test
```

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
