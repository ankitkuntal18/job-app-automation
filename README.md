# 🚀 JobBlaster — LinkedIn Job Application Automation

> Automatically collect LinkedIn hiring posts, generate AI-personalized emails, and send applications with your resume — all from your own machine.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![React](https://img.shields.io/badge/react-18-blue)
![Express](https://img.shields.io/badge/express-4.x-lightgrey)
![Chrome Extension](https://img.shields.io/badge/chrome-extension-yellow)

---

## 📌 Table of Contents

- [What Is This?](#-what-is-this)
- [How It Works — Full Flow](#-how-it-works--full-flow)
- [Architecture Overview](#-architecture-overview)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Setup Backend](#2-setup-backend)
  - [3. Setup Frontend](#3-setup-frontend)
  - [4. Load the Chrome Extension](#4-load-the-chrome-extension)
- [Configuration](#-configuration)
  - [Gmail App Password Setup](#gmail-app-password-setup)
  - [OpenAI API Key Setup](#openai-api-key-setup)
- [Running the App](#-running-the-app)
- [Using the App — Step by Step](#-using-the-app--step-by-step)
- [API Reference](#-api-reference)
- [Chrome Extension Details](#-chrome-extension-details)
- [Tech Stack](#-tech-stack)
- [Troubleshooting](#-troubleshooting)
- [Important Notes](#-important-notes)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🤔 What Is This?

**JobBlaster** is a personal job application automation tool made up of 3 parts:

| Part | What it does |
|------|-------------|
| 🔌 **Chrome Extension** | Scrolls your LinkedIn feed or search results, finds hiring posts that contain recruiter email addresses, and collects them |
| ⚙️ **Express Backend** | Receives collected posts, uses OpenAI to write a personalized email for each one, stores your resume, and sends emails via Gmail |
| ⚛️ **React Frontend** | Dashboard to view all queued jobs, track sent/pending status, upload resume, and manage your profile |

**The key insight:** Many recruiters post hiring opportunities on LinkedIn and include their email address directly in the post text (e.g. "Send your CV to hr@company.com"). This tool finds exactly those posts and applies to them automatically.

---

## 🔄 How It Works — Full Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FULL WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────┘

  STEP 1 — You open LinkedIn in Chrome
  ─────────────────────────────────────
  Go to LinkedIn feed OR search results page.
  Example search: "hiring react developer india"

         │
         ▼

  STEP 2 — Chrome Extension collects hiring posts
  ────────────────────────────────────────────────
  Click the extension icon → set how many posts to collect → click "Collect"

  The extension:
    ✦ Auto-scrolls the LinkedIn page to load more posts
    ✦ Reads every visible post
    ✦ Filters posts that contain hiring keywords (hiring, we're hiring, etc.)
    ✦ Extracts recruiter email addresses from post text
    ✦ Collects: author name, post text, email, post URL, timestamp
    ✦ Shows live progress (posts found / scroll rounds)

         │
         ▼

  STEP 3 — You click "Process" in the extension
  ───────────────────────────────────────────────
  Fill in:
    • Target Role    → e.g. "React Developer"
    • Location       → e.g. "India" (optional filter)
    • Experience     → e.g. "2-4 years" (optional filter)
    • Your email     → your Gmail address

  Click "🚀 Process" → extension sends the collected posts to your local backend

         │
         ▼

  STEP 4 — Backend processes and generates email drafts
  ──────────────────────────────────────────────────────
  For each post with a recruiter email, the backend:
    ✦ Skips duplicates (already in your job list)
    ✦ Applies location/experience filters
    ✦ Calls OpenAI to write a personalized email draft
      (reads the post text, your name, and your skills)
    ✦ Saves job as "pending" in jobs.json

         │
         ▼

  STEP 5 — You click "Send Pending Emails" in the extension
  ──────────────────────────────────────────────────────────
  Backend finds all "pending" jobs and:
    ✦ Sends Gmail to each recruiter
    ✦ Attaches your resume.pdf
    ✦ Marks each job as "sent"

         │
         ▼

  STEP 6 — React Dashboard shows everything
  ──────────────────────────────────────────
  Open http://localhost:5173 to:
    ✦ See all jobs with status (pending / sent / skipped)
    ✦ Filter by status
    ✦ View stats (total / pending / sent)
    ✦ Edit and resend individual emails
    ✦ Upload/update your resume
    ✦ Manage your profile
```

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        YOUR MACHINE                                 │
│                                                                     │
│  ┌──────────────────────┐         ┌──────────────────────────────┐  │
│  │   Chrome Extension   │         │   React Frontend             │  │
│  │   (Manifest V3)      │         │   Vite + React 18            │  │
│  │                      │         │   Port: 5173                 │  │
│  │  • content.js        │         │                              │  │
│  │    Scrolls LinkedIn  │         │  Pages:                      │  │
│  │    Extracts emails   │         │  • Dashboard (jobs + email)  │  │
│  │                      │         │  • Upload Jobs               │  │
│  │  • popup.js          │         │  • Settings (resume/profile) │  │
│  │    UI + controls     │         │                              │  │
│  │    Calls backend     │         └─────────────┬────────────────┘  │
│  │                      │                       │ Axios API calls   │
│  │  • background.js     │                       │                   │
│  │    Chrome storage    │         ┌─────────────▼────────────────┐  │
│  └──────────┬───────────┘         │   Express Backend            │  │
│             │                     │   Node.js + Express          │  │
│             │ POST /api/          │   Port: 5000                 │  │
│             │ process-jobs        │                              │  │
│             │ send-emails         │  Routes:                     │  │
│             └────────────────────▶│  • /api/jobs     (CRUD)      │  │
│                                   │  • /api/email    (resume)    │  │
│                                   │  • /api/process-jobs         │  │
│                                   │  • /api/send-emails          │  │
│                                   │                              │  │
│                                   │  Services:                   │  │
│                                   │  • OpenAI (email drafts)     │  │
│                                   │  • Nodemailer (Gmail send)   │  │
│                                   │  • Multer (file uploads)     │  │
│                                   │                              │  │
│                                   │  Storage:                    │  │
│                                   │  • data/jobs.json            │  │
│                                   │  • uploads/resume.pdf        │  │
│                                   └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
job-app-automation/
│
├── 📁 extension/                   ← Chrome Extension (Manifest V3)
│   ├── manifest.json               ← Extension config & permissions
│   ├── content.js                  ← Runs on LinkedIn, scrapes posts
│   ├── popup.html                  ← Extension popup UI (HTML + CSS)
│   ├── popup.js                    ← Extension popup logic
│   └── background.js               ← Service worker, Chrome storage
│
├── 📁 backend/                     ← Node.js + Express API Server
│   ├── index.js                    ← Server entry point
│   ├── .env.example                ← Environment variable template
│   ├── package.json
│   ├── 📁 data/
│   │   └── jobs.json               ← Jobs "database" (auto-created)
│   ├── 📁 uploads/
│   │   ├── resume.pdf              ← Your resume (uploaded via Settings)
│   │   └── tmp/                    ← Temp files (auto-cleaned)
│   └── 📁 routes/
│       ├── jobs.js                 ← GET/POST/PUT/DELETE jobs
│       ├── email.js                ← Resume upload, AI draft, send email
│       └── process.js              ← Extension endpoints (process + send)
│
└── 📁 frontend/                    ← React App (Vite)
    ├── index.html
    ├── package.json
    └── 📁 src/
        ├── main.jsx                ← React entry point
        ├── App.jsx                 ← Navigation + routing
        ├── index.css               ← Global styles
        ├── api.js                  ← All Axios API calls
        └── 📁 pages/
            ├── Dashboard.jsx       ← Jobs list + email composer
            ├── UploadJobs.jsx      ← Upload JSON files from extension
            └── Settings.jsx        ← Profile info + resume upload
```

---

## ✅ Prerequisites

Make sure you have the following installed before starting:

| Tool | Version | Check |
|------|---------|-------|
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Google Chrome | Latest | — |
| Gmail Account | Any | — |
| OpenAI Account | Optional | platform.openai.com |

---

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/job-app-automation.git
cd job-app-automation
```

---

### 2. Setup Backend

```bash
cd backend
npm install
```

Copy the environment file and fill it in:

```bash
# Windows
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Open `.env` in your editor and fill in your values (see [Configuration](#-configuration) section below).

---

### 3. Setup Frontend

```bash
cd frontend
npm install
```

> No extra configuration needed for the frontend — it connects to `localhost:5000` by default.

---

### 4. Load the Chrome Extension

1. Open **Google Chrome**
2. Go to `chrome://extensions` in the address bar
3. Toggle **Developer Mode** ON (top-right corner)
4. Click **"Load unpacked"**
5. Select the `extension/` folder from this project
6. Click the 🧩 puzzle piece icon in Chrome toolbar → **pin the extension**

---

## ⚙️ Configuration

All configuration lives in `backend/.env`. Here is what each variable does:

```env
# Server port
PORT=5000

# ── Your Profile ──────────────────────────────────────────────────
# Used by AI when writing personalized email drafts
YOUR_NAME=John Doe
YOUR_SKILLS=React, Node.js, TypeScript, 3 years experience

# ── Gmail Settings ────────────────────────────────────────────────
EMAIL_USER=youremail@gmail.com
EMAIL_PASS=your_16_char_app_password

# ── OpenAI API Key (optional) ─────────────────────────────────────
# If not set, a clean template email is used instead
OPENAI_API_KEY=sk-proj-your-key-here

# ── Frontend URL ──────────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173
```

---

### Gmail App Password Setup

> ⚠️ You **cannot** use your regular Gmail password. Gmail requires an **App Password** for third-party apps.

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required before App Passwords appear)
3. Search **"App Passwords"** in the search bar at the top
4. Choose app: **Mail** → Generate
5. Copy the **16-character code** (no spaces)
6. Paste it as `EMAIL_PASS` in your `.env` file

```env
EMAIL_PASS=abcd efgh ijkl mnop
# Remove spaces → 
EMAIL_PASS=abcdefghijklmnop
```

---

### OpenAI API Key Setup

> This is **optional** — without it, the app uses a clean email template instead of AI-generated content.

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up / Log in
3. Click **"API Keys"** in the left sidebar → **"Create new secret key"**
4. Copy the key and paste it as `OPENAI_API_KEY` in `.env`
5. Make sure you have billing credit added (a few dollars is enough for hundreds of emails)

---

## ▶️ Running the App

You need **two terminals open at the same time**.

### Terminal 1 — Start Backend

```bash
cd backend
node index.js
```

Expected output:
```
========================================
🚀  Backend running at http://localhost:5000
👤  Name   : John Doe
📧  Email  : youremail@gmail.com
🔑  Gmail  : ✅ App password set
🤖  OpenAI : ✅ Connected
========================================
```

### Terminal 2 — Start Frontend

```bash
cd frontend
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in your browser.

---

## 📖 Using the App — Step by Step

### First Time Setup (do this once)

1. Open the app at **http://localhost:5173/settings**
2. Enter your **Full Name** and **Skills** → click **Save Profile**
3. Select your **resume PDF** → click **Upload Resume**

---

### Collecting and Applying to Jobs

#### Step 1 — Go to LinkedIn

Open Chrome and go to:
- **LinkedIn Feed** — `linkedin.com/feed` (posts from your connections)
- **LinkedIn Search** — search for something like `"hiring react developer india"` in the posts search

> ⚠️ Only works on LinkedIn feed and search result pages, NOT on job listing pages.

#### Step 2 — Collect Hiring Posts

1. Click the **JobBlaster** extension icon in your Chrome toolbar
2. Set **target count** (how many posts to collect, e.g. 10)
3. Optionally add **custom keywords** (e.g. "Python", "remote")
4. Click **"🚀 Collect Hiring Posts"**
5. Watch the extension auto-scroll and count posts in real time
6. Wait for it to finish — you'll see `✅ Collected X hiring posts`

> The extension only collects posts that **contain a recruiter email address** in the text. Posts without emails are skipped.

#### Step 3 — Process Jobs

In the extension popup, scroll down to the **"📤 Process Jobs"** section:

1. Set **Target Role** → e.g. `React Developer`
2. Set **Location Filter** (optional) → e.g. `India`
3. Set **Experience Level** (optional) → e.g. `0-2 years`
4. Enter your **Gmail address**
5. Click **"🚀 Process"**

The backend will:
- Filter posts by location/experience if set
- Generate a personalized email for each using AI
- Queue them all as "pending" in the dashboard

#### Step 4 — Send Emails

Click **"📧 Send Pending Emails"** in the extension.

The backend will:
- Find all pending jobs
- Send a Gmail to each recruiter with your resume attached
- Mark each job as "sent"

#### Step 5 — Track in Dashboard

Open **http://localhost:5173** to see:
- Stats: total / pending / sent
- All jobs with status badges
- Ability to re-compose and send individual emails
- Filter by status (all / pending / sent)

---

## 📡 API Reference

All endpoints are served at `http://localhost:5000`

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs` | Get all saved jobs (newest first) |
| `POST` | `/api/jobs/upload-json` | Upload a job JSON file (multipart: `jobFile`) |
| `PUT` | `/api/jobs/:id` | Update a job field (e.g. `recruiterEmail`, `status`) |
| `DELETE` | `/api/jobs/:id` | Delete a job |

### Email

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/email/upload-resume` | Upload resume PDF (multipart: `resume`) |
| `POST` | `/api/email/generate-draft` | Generate AI email draft (body: `jobTitle`, `company`, `description`, `yourName`, `yourSkills`) |
| `POST` | `/api/email/send` | Send single email with resume attached (body: `to`, `subject`, `body`, `jobId`, `yourName`) |

### Extension Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/process-jobs` | Receive posts from extension, generate drafts, queue as pending (multipart: `json_file`, `email`, `roleAppliedFor`, `locationFilter`, `experienceFilter`) |
| `POST` | `/api/send-emails` | Send all pending jobs via Gmail, mark as sent (body: `email`) |

---

## 🔌 Chrome Extension Details

### Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config — declares permissions, popup, content scripts |
| `content.js` | Injected into LinkedIn pages — handles scrolling and post extraction |
| `popup.html` | The popup UI when you click the extension icon |
| `popup.js` | All popup logic — collection, processing, sending |
| `background.js` | Service worker — saves data to Chrome local storage |

### Permissions Used

| Permission | Why |
|------------|-----|
| `activeTab` | Read the current LinkedIn tab |
| `scripting` | Inject `content.js` into the LinkedIn page |
| `storage` | Save collected posts between popup opens |
| `tabs` | Query the active tab URL |
| `host: linkedin.com` | Access LinkedIn pages |
| `host: localhost:5000` | Send data to your local backend |

### How Post Extraction Works

The extension looks for LinkedIn posts that:
1. Contain hiring keywords (`hiring`, `we're hiring`, `job opening`, `apply now`, `#hiring`, etc.)
2. Contain an email address (detected using a regex that also catches obfuscated formats like `name [at] company [dot] com`)

It uses multiple selectors for different LinkedIn page layouts (feed, search, etc.) and handles LinkedIn's dynamic loading by auto-scrolling and waiting for new content.

---

## 🛠 Tech Stack

### Backend
| Package | Version | Use |
|---------|---------|-----|
| express | ^4.18 | Web framework |
| nodemailer | ^6.9 | Send Gmail |
| multer | ^1.4 | Handle file uploads |
| openai | ^4.20 | AI email generation |
| uuid | ^9.0 | Unique job IDs |
| cors | ^2.8 | Allow frontend requests |
| dotenv | ^16.0 | Load .env file |

### Frontend
| Package | Version | Use |
|---------|---------|-----|
| react | ^18.2 | UI framework |
| react-router-dom | ^6.20 | Client-side routing |
| axios | ^1.6 | API requests |
| vite | ^5.0 | Build tool |

### Chrome Extension
| API | Use |
|-----|-----|
| Chrome Scripting API | Inject scripts into tabs |
| Chrome Storage API | Persist collected data |
| Chrome Tabs API | Query active tab |
| Chrome Runtime API | Message passing |

---

## 🔧 Troubleshooting

### Backend Issues

| Problem | Fix |
|---------|-----|
| `Error: Cannot find module './routes/process'` | Make sure you created `backend/routes/process.js` |
| `Error: connect ECONNREFUSED` | Backend is not running — run `node index.js` |
| `Error: Invalid login` (nodemailer) | Gmail App Password is wrong — regenerate it |
| `OpenAI API error` | Check your API key and billing at platform.openai.com |
| `Resume not found` | Upload your PDF at `/settings` in the React app first |

### Frontend Issues

| Problem | Fix |
|---------|-----|
| `CORS error` in browser console | Make sure backend is running and `FRONTEND_URL` in `.env` matches your Vite port |
| Page shows blank | Check browser console for errors — likely a failed API call |
| Vite running on wrong port | Update `FRONTEND_URL` in `backend/.env` to match (default is `5173`) |

### Extension Issues

| Problem | Fix |
|---------|-----|
| "Cannot connect to backend" | Start backend with `node index.js` |
| "No post containers found" | Scroll down manually first to load posts, then collect |
| "No hiring posts found" | Posts are found but none have email addresses in them — try different searches |
| Extension not responding | Click the 🔄 refresh icon at `chrome://extensions` |
| Error after updating files | Always reload extension at `chrome://extensions` after changing any file |

---

## ⚠️ Important Notes

### About LinkedIn
- This tool reads **publicly visible** post content in your browser, the same way you would read it manually
- Only use this for your **own personal job search**
- LinkedIn's layout occasionally updates, which may require CSS selector updates in `content.js`

### About Email Sending
- Gmail allows approximately **500 emails per day** on free accounts — more than enough for job applications
- A **500ms delay** is added between emails to avoid triggering Gmail's spam filters
- All emails come from **your own Gmail** — recruiters reply directly to you

### About Recruiter Emails
- The extension only collects posts where **recruiters have written their email in the post text**
- This is a common practice, especially in markets like India where recruiters post "send CV to hr@company.com"
- For markets where emails are less common in posts, you may need to enter emails manually via the Dashboard

### About Data Privacy
- All data stays **on your own machine** — no third-party server is involved
- `jobs.json` and `resume.pdf` are stored in your `backend/` folder
- Nothing is sent anywhere except your own Gmail to recruiters

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-new-feature`
3. Make your changes
4. Commit: `git commit -am 'Add some feature'`
5. Push: `git push origin feature/my-new-feature`
6. Submit a Pull Request

### Ideas for Contributions
- [ ] Support for other email providers (Outlook, Yahoo)
- [ ] CSV export of all applications
- [ ] Email open/read tracking
- [ ] More LinkedIn page type support (company pages)
- [ ] Scheduled auto-collection
- [ ] Application follow-up reminder system

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [Nodemailer](https://nodemailer.com/) — email sending
- [OpenAI](https://openai.com/) — AI email generation
- [Vite](https://vitejs.dev/) — blazing fast frontend tooling
- [Express](https://expressjs.com/) — minimal Node.js framework

---

<div align="center">

Made with ❤️ for job seekers everywhere

**⭐ Star this repo if it helped you land a job!**

</div>
