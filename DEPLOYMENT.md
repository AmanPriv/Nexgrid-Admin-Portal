# NexGrid Admin Portal — Deployment Guide

NexGrid is a **full-stack application** consisting of:
1. **React 19 Frontend**: Built with Vite and Tailwind CSS.
2. **Node.js Express Backend**: Provides Argon2id/Scrypt password hashing, session revocation, rate-limiting, audit logs, and automated SMS Ethiopia notifications.

---

## Why GitHub Pages Shows "Blank Page" or "Error"
GitHub Pages is a **static file host**. It only serves raw HTML, CSS, and browser JavaScript. Because GitHub Pages does not run Node.js servers:
- API calls (`/api/auth/setup-status`, `/api/auth/login`, etc.) return **HTTP 404** on GitHub Pages.
- A full-stack Node.js server is required for authentication and database management.

---

## Recommended Deployment Options (100% Free & Easy)

### Option 1: Render.com (Easiest — Recommended Free Cloud Host)
1. Push this repository to your GitHub account.
2. Sign in to [Render.com](https://render.com) (free account).
3. Click **New +** → **Web Service**.
4. Connect your GitHub repository.
5. Configure the following:
   - **Environment**: `Node`
   - **Build Command**: `npm install --legacy-peer-deps && npm run build`
   - **Start Command**: `npm start`
6. Click **Deploy Web Service**.
7. Render will provide a free live URL (e.g. `https://nexgrid-admin.onrender.com`) where both frontend and backend run seamlessly!

---

### Option 2: Railway.app or Fly.io
1. Push this repository to your GitHub account.
2. In Railway, click **New Project** → **Deploy from GitHub repo**.
3. Railway automatically detects the included `Dockerfile` and deploys the full-stack container.

---

### Option 3: Separate Frontend on GitHub Pages + Backend on Render
If you want your frontend on `https://yourname.github.io/nexgrid-admin`:
1. Deploy the backend to Render (Option 1).
2. Open your GitHub Pages site.
3. In the setup/login screen, click **Connect Backend API URL**.
4. Paste your Render backend URL (e.g., `https://your-app.onrender.com`) and click **Save & Test**.
5. The frontend will instantly connect to your live backend!

---

### Option 4: Run Locally on Your Computer or VPS
```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
npm run build
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
