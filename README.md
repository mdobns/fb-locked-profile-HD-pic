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
   cd "D:\Fb-private profile picture"
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

## 🛡️ Scope & Privacy Warning

> ⚠️ **Important:** This tool will work for **publicly available profiles and publicly available locked profiles only**. Completely private, deleted, or deactivated accounts without public headers cannot be extracted.

- **Public Profiles & Publicly Available Locked Profiles**: Avatars are extracted and automatically upgraded from the mobile preview crop (`ctp=p/s***`) to maximum available HD resolution (`cstp=mx***`).
- **Profile Picture Guard & Locked Profiles**: Facebook restricts full-size downloads in its native UI, but serves a public preview crop for mobile SSR. Our engine extracts this crop and upgrades it to full resolution.
- **Completely Private Accounts**: Profiles with full privacy restrictions that block public crawlers cannot be accessed.

---

## 📁 Project Structure

```
├── server.js          # Express server, API endpoints, scraper & proxy
├── package.json       # Node.js project manifest & scripts
├── .env.example       # Environment variables template
├── README.md          # Project documentation
└── public/
    ├── index.html     # Semantic, accessible HTML5 layout
    ├── style.css      # Dark mode glassmorphism UI styling
    └── app.js         # Frontend interactive logic & API caller
```
