# JobTrackr — Job Application CRM + AI Email Assistant

**Live app: https://j-tracker-tool.vercel.app/**

A full job-search pipeline manager built on the MERN stack: track companies, HR
contacts, applications, follow-ups, calls and interviews from one dashboard — and
let AI write truthful, personalized job application emails that are sent from your
**own Gmail account**.

The AI is deliberately sandboxed: it may only claim the skills, experience and
projects that exist in your **Candidate Profile**. It will never invent a skill or
a job title for you.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Step-by-step local setup](#step-by-step-local-setup)
- [Environment variables](#environment-variables)
- [Deploy to Vercel](#deploy-to-vercel)
- [Setting the auto follow-up cron](#setting-the-auto-follow-up-cron)
- [Admin access](#admin-access)
- [API reference](#api-reference)
- [Security notes](#security-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Application pipeline
- **22-state status pipeline** (`NEW` → `EMAIL_SENT` → `RECRUITER_REPLIED` → `INTERVIEW_1` → `OFFER` …)
- Job details, priority, tags, notes, activity timeline and offer tracking
- Job-match scoring by keyword overlap between the job's required skills and your profile

### Quick Fill from LinkedIn
Paste a LinkedIn job post or recruiter message and hit **Extract with AI** — the
job title, company, JD, location, work mode, salary, experience and HR
name/email/phone are filled in for you.

### Auto mode (one click)
Tick **Auto: Generate, Save & Send** next to the Extract button and a single click:

1. Extracts the job details
2. Generates the email with AI
3. Picks the best-matching resume for the role
4. Saves the application and auto-creates the company + HR contact
5. Sends the email from your Gmail

If no resume matches the role, a picker appears so you can choose from your
uploaded resumes — or upload a new PDF on the spot.

### Smart resume management
- Upload multiple resumes (stored on Cloudinary)
- Tag each resume with the roles it fits, e.g. *"React Developer, Frontend, Fullstack"*
- Auto-selection matches role keywords against **both** the filename and your role note
- Java is the highest-priority role group so a "Java Developer" role never picks a frontend resume

### AI email assistant
- Generates application emails and follow-ups with tone/length controls
- **Make shorter / More professional / More personalized** refinement chips
- Strict anti-hallucination guardrails — only your profile facts are used
- Automatically strips stray `[]` brackets that models sometimes emit
- Greeting rule: uses the recruiter's name, or falls back to *"Dear Hiring Team,"* / *"Dear Hiring Manager,"*

### Master prompt
Your own instructions (Settings → Master Prompt, also editable on Candidate Profile)
that every AI email and follow-up follows — for example *"always sign off as
Thanks, Manish"* or *"never mention salary expectations"*. Stored in your profile,
not hardcoded in the backend.

### Scheduled auto follow-ups
Every follow-up can carry an HR request (e.g. *CTC, notice period, experience*) and an
optional auto-send day/time. When auto-send is on, the app answers only the details HR
asked for and always attaches the resume plus portfolio, LinkedIn and GitHub links.
Follow-ups without a scheduled auto-send stay pending and are highlighted on the
Follow-ups page for manual **send all** or one-by-one sending.

### Follow-ups
Today / Overdue / Upcoming / All tabs, per-row **Send** checkbox (disabled once a
follow-up has already been sent), an "Auto send to everyone not sent yet" checkbox,
and "Select all pending".

### Email tracking
Every send attempt is logged with status, tracking pixel and click tracking — opens
and clicks are counted and shown per email. The attached resume's name and size are
recorded and displayed in Email History.

### Everything else
- Gmail App Password setup popup — step-by-step guide plus an admin-configurable
  YouTube video, shown whenever you try to send without Gmail connected
- Admin per-user feature switches (send email, AI email, auto follow-ups, resume
  upload, quick fill) with a "contact support" popup when a feature is blocked
- Email templates with `{{variables}}` — plus **5 sample templates** in one click
- Companies, Contacts (with duplicate detection), Calls, Interviews and rounds
- Dashboard counters, recent activity and upcoming events
- ICS calendar export for Follow-ups and Interviews
- Dark mode, mobile-responsive layout, dark-mode-safe login screen

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, Tailwind CSS 4, Axios, react-hot-toast |
| Backend | Node.js, Express 4, Mongoose (MongoDB) |
| AI | Multi-provider LLM client (OpenRouter, OpenAI, Anthropic, Gemini, Groq, DeepSeek, Together) |
| Email | Nodemailer over Gmail SMTP (your own App Password) |
| PDF parsing | `pdf-parse` |
| File storage | Cloudinary |
| Auth | JWT (jsonwebtoken) + bcryptjs, AES-256-GCM at rest for secrets |
| Hosting | Vercel (API serverless functions + static build) + Vercel Cron |

---

## How it works

```
LinkedIn paste ──► Extract with AI ──► form filled
                                            │
                          ┌─────────────────┘
                          ▼
              Generate email ──► pick resume (by role note)
                          │
                          ▼
              Save application + auto-create company & contact
                          │
                          ▼
              Send via your Gmail ──► EmailLog + tracking + status update
                          │
                          ▼
              3 days later ──► auto follow-up email (once)
```

The candidate profile is the single source of truth. The system prompt appends a
`CANDIDATE FACTS` block with strict rules, and your own master prompt is appended
after it, so the model is constrained twice over.

---

## Project structure

```
JobTracker_Tool/
├── api/
│   └── index.js                Vercel serverless entry (same Express app)
├── vercel.json                 Routes + Vercel Cron definition
├── package.json                Backend deps (Vercel installs these)
└── backend/
    ├── server.js               Local Express entry
    ├── config/db.js            Mongoose connection (reused across invocations)
    ├── middleware/auth.js      JWT + disabled-account guard
    │              featureGuard.js  per-feature 403 guard (admin switches)
    ├── models/                 User, UserLog, AppSetting, CandidateProfile,
    │                           Application, Company, Contact, EmailLog,
    │                           EmailTemplate, FollowUp, Call, Interview,
    │                           WhatsAppMessage
    ├── routes/                 auth, applications, mail, profile, ai,
    │                           resumes, followups, admin, cron, tracking, …
    └── utils/                  llmClient, llmProviders, resumeParser,
                                followUpSender, mailer, cloudinary, tracking,
                                activity, userLog, crypto
└── client/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx / App.jsx
        ├── context/           AuthContext, ThemeContext, GmailContext
        ├── layouts/           DashboardLayout
        ├── components/        ApplicationFormModal, AIEmailGenerator,
        │                      HowItWorks, DisabledBanner, Sidebar, …
        ├── pages/             Dashboard, Applications, ApplicationDetail,
        │                      Companies, Contacts, EmailHistory,
        │                      EmailTemplates, FollowUps, Interviews,
        │                      CandidateProfilePage, AiSettings, Admin, …
        └── api/               one Axios module per resource
└── extension/
    ├── manifest.json           Manifest V3 config
    ├── background.js           Login, save + auto-send orchestration
    ├── content.js / content.css  Save/Hide buttons on LinkedIn feed posts
    └── popup.html / popup.js / popup.css  Login, Gmail status, auto-send toggle
```

---

## Step-by-step local setup

### Prerequisites
- Node.js 18 or newer
- A MongoDB connection string (Atlas or local)
- A Gmail address with 2-Step Verification enabled (for an App Password)
- A Cloudinary account (free tier is fine)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 2. Install dependencies

Run npm install in each of the three locations:

```bash
npm install          # root — Vercel/serverless deps
cd backend && npm install
cd ../client && npm install
```

### 3. Configure the backend environment

```bash
cd backend
cp .env.example .env
```

Fill in `.env` (see [Environment variables](#environment-variables)):

```env
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/jobtrackr
JWT_SECRET=some-long-random-string
GEMINI_API_KEY=AIza...
CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud_name>
CLIENT_URL=http://localhost:5173
```

### 4. Start the backend

```bash
npm run dev
```

Runs on http://localhost:5000. Nodemon restarts on changes.

### 5. Configure the frontend environment

```bash
cd client
cp .env.example .env
```

```env
VITE_API_URL=http://localhost:5000/api
```

### 6. Start the frontend

```bash
npm run dev
```

Runs on http://localhost:5173 — open it in your browser.

### 7. Create your account and connect Gmail

1. Sign up at http://localhost:5173/signup
2. Go to **Settings** in the sidebar
3. Connect your Gmail address with a **Gmail App Password**
   (Google Account → Security → 2-Step Verification → App passwords)
4. Add an AI provider key (e.g. Gemini, OpenRouter) in **Settings → AI Providers**
5. Go to **Candidate Profile** and fill in your real skills, experience and projects
6. Upload your resumes on the same page and tag each with the roles it fits

### 8. Add your first application

Paste a LinkedIn job post into **Quick Fill from LinkedIn**, tick
**Auto: Generate, Save & Send**, and click **Extract with AI**. Everything else
happens automatically.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign JWTs |
| `GEMINI_API_KEY` | No | Server-side fallback key if the user has configured none |
| `CLOUDINARY_URL` | Yes (uploads) | `cloudinary://<api_key>:<api_secret>@<cloud_name>` |
| `CLOUDINARY_CLOUD_NAME` | Alt | Split-form credentials, if not using `CLOUDINARY_URL` |
| `CLOUDINARY_API_KEY` | Alt | '' |
| `CLOUDINARY_API_SECRET` | Alt | '' |
| `CLIENT_URL` | Yes | Allowed CORS origin (comma-separate for multiple) |
| `CRON_SECRET` | Recommended | Bearer token the Vercel Cron sends to `/api/cron/auto-followup` |
| `TRACKING_BASE_URL` | No | Public base URL for open/click tracking in emails |
| `PORT` | No | Local dev port, defaults to `5000` |

> **Note:** Storage of anything in `.env` files is only for local development.
> Never commit `.env` — it is already in `.gitignore`.

### Frontend (`client/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes (prod) | Full URL of the API, e.g. `https://<your-app>.vercel.app/api`. Omit locally to use the `:5173` dev proxy. |
| `VITE_CHROME_STORE_URL` | No | Chrome Web Store listing URL of the LinkedIn extension. When set, the in-app "Chrome Extension" popup shows an **Add to Chrome** button (otherwise it offers the ZIP download). |

### Adding an AI provider

Keys are **per-user** and encrypted at rest (AES-256-GCM). Add them in
**Settings → AI Providers** in the UI — no env var or redeploy required. The first
user key added becomes the active provider; the server's `GEMINI_API_KEY` is only
used as a fallback when no key is set.

---

## Deploy to Vercel

The repo uses one serverless API (`api/index.js`) and a static client build
(`client/`), both defined in `vercel.json`.

### 1. Push to GitHub

```bash
git add .
git commit -m "JobTrackr ready to deploy"
git push
```

### 2. Import the project into Vercel

1. Go to https://vercel.com/new
2. Import the GitHub repository
3. Vercel should auto-detect the two builds from `vercel.json`:
   - `api/index.js` → `@vercel/node`
   - `client/package.json` → `@vercel/static-build`
4. Leave the build and output settings alone — the root `package.json` is what
   provides the backend dependencies to the serverless function

### 3. Set the environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

```
MONGO_URI=...
JWT_SECRET=...
CLIENT_URL=https://<your-app>.vercel.app
CLOUDINARY_URL=...
GEMINI_API_KEY=...          (optional fallback)
CRON_SECRET=...             (see next section)
```

### 4. Deploy

Click **Deploy**. Once it finishes, your app is live at
`https://<your-app>.vercel.app`.

---

## Setting the auto follow-up cron

`vercel.json` already declares the cron:

```json
"crons": [
  {
    "path": "/api/cron/auto-followup",
    "schedule": "0 9 * * *"
  }
]
```

That runs daily at 09:00 UTC and:

1. Finds follow-ups with `autoSend: true` whose scheduled date/time has passed
2. Skips any that already have an `EmailLog` for that specific follow-up
3. Generates the AI email using only the follow-up's HR request details
4. Attaches the default resume and includes portfolio/LinkedIn/GitHub links
5. Marks the follow-up completed and the app `FOLLOW_UP_SENT`

The same due auto-sends are also processed when the Follow-ups page is opened, so
they go out as soon as the user is in the app. Disable auto-send on any follow-up to
keep it in the manual list instead.

**Vercel cron notes:**
- Vercel Cron sends an `Authorization: Bearer <CRON_SECRET>` header if a secret is
  configured. The route accepts the request unauthenticated when `CRON_SECRET` is
  **not** set — so set it in production to keep the endpoint private.
- On the Hobby plan, cron jobs are limited to once per day and may be delayed.

You can also run it manually from **Follow-ups → Auto send to everyone not sent
yet**, which calls the same logic synchronously.

---

## Chrome extension (LinkedIn)

The `extension/` folder contains a Manifest V3 Chrome extension that turns your
LinkedIn feed into a one-click pipeline:

- **Save** — every feed post gets a *Save to JobTrackr* button. It sends the post
  text to `POST /ai/parse-linkedin` (AI extraction), creates the application
  (`SAVED`, source `LinkedIn`, auto company + contact) and de-duplicates by post URL
- **Hide** — the *Hide* button removes non-relevant posts from your feed and
  remembers them (stored in the extension, capped at 1000 URLs)
- **Auto-send email** — toggle it in the extension popup and every saved post that
  contains a recruiter email gets an AI-generated application email
  (`POST /ai/generate-email` → `POST /mail/send`) using your connected Gmail
- Logs in with your normal JobTrackr account (same email/password), so all feature
  switches, disabled-account rules and user logs apply automatically

### Install (unpacked, for development)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select the `extension/` folder
4. Pin the extension, open it, and log in with your JobTrackr account
5. Set the **Server API URL** if you are not running on `http://localhost:5000/api`
   (for production use `https://<your-app>.vercel.app/api`)

Then open `https://www.linkedin.com/feed/` — each post now shows the Save/Hide bar.

**Notes**
- All API calls are made from the extension's service worker, so the backend CORS
  config additionally allows `chrome-extension://` origins.
- If AI parsing fails the post is still saved (description kept verbatim) with a
  "review the details" note, so you never lose a job while scrolling.
- The Gmail connection itself is set up in the web app (Settings → Gmail
  Connection) — the extension only reports the status.

### Distributing the extension

The extension is plain files — it does not deploy with Vercel. Three options:

1. **From the app (no store needed)** — `client/public/jobtrackr-extension.zip` is
   served at `https://<your-app>.vercel.app/jobtrackr-extension.zip`. Users click
   **Chrome Extension → Download extension ZIP** in the top bar, unzip, and load it
   unpacked (Developer mode). Re-zip after changing the extension:

   ```powershell
   Compress-Archive -Path "extension\*" -DestinationPath "client\public\jobtrackr-extension.zip" -Force
   ```

2. **Chrome Web Store (public or unlisted)** — requires a one-time **$5 developer
   registration fee** (https://chrome.google.com/webstore/devconsole); review usually
   takes hours to a few days. What you need to submit:
   - A ZIP of the extension folder (icons are already included: `extension/icons/`)
   - Store listing: description, category, and at least one screenshot (1280×800 or 640×400)
   - Privacy practices: single-purpose description, justifications for the `storage`
     permission and the LinkedIn/Vercel host permissions, data-use disclosure (post
     text is sent to your own JobTrackr API for AI parsing), and a privacy-policy URL
   - After approval, upload each new version as a new release — Chrome auto-updates
     installed copies. Set `VITE_CHROME_STORE_URL` in Vercel to the listing URL and
     the in-app popup shows an **Add to Chrome** button

3. **Share the ZIP directly** — recipients still have to enable Developer mode, so
   the Web Store is better for non-technical users.

> The extension talks to whichever API URL each user enters in its popup (default
> `http://localhost:5000/api`), so the same build works against your Vercel
> deployment once users set `https://<your-app>.vercel.app/api`.

---

## Admin access

A single hardcoded account, `manish12099@gmail.com`, automatically receives
`isAdmin` on login and unlocks:

- **Admin** link in the sidebar and top bar
- **Admin Access** page listing every user with their application and resume counts
- **Per-user feature switches** — tick or untick *Send Email*, *AI Email*,
  *Auto Follow-up*, *Resume Upload* and *Quick Fill* per user, or flip them all
  off/on with one click. A blocked feature returns 403 `featureDisabled` and the
  user instantly sees a "contact support" popup
- **Gmail setup video** — paste a YouTube link and it is embedded in the
  "Connect Gmail" popup (and in Settings → Gmail Connection) so users can watch
  how to create an App Password
- **User logs** — every login, logout and key activity (applications created,
  emails/replies/follow-ups sent, resumes uploaded, Gmail connected…) is recorded
  with time, IP and user-agent and browsable from the **User Logs** tab
- **Disable** an account — that user instantly loses the ability to send email or
  use AI, and sees a support popup with contact details
- **Enable** a previously disabled account
- **Delete** a user along with all their data (applications, contacts, emails,
  resumes, follow-ups, templates, interviews, calls)

The admin account itself can never be disabled or deleted accidentally, and its
feature switches cannot be changed.

If a user's account is disabled, `middleware/auth.js` blocks every route except
`/auth/me` (so the client can still detect the state and show the popup), and
`DisabledBanner.jsx` renders the contact card.

---

## API reference

All routes are prefixed with `/api` and require a `Authorization: Bearer <token>`
header unless noted.

| Method | Route | Description |
|---|---|---|
| POST | `/auth/signup` | Create account (auto-promotes the admin email) |
| POST | `/auth/login` | Login, returns `{ token, user }` |
| POST | `/auth/logout` | Record logout time in the user log |
| GET | `/auth/me` | Current user (allowed even when disabled) |
| POST | `/auth/connect-gmail` | Store Gmail address + App Password (encrypted) |
| GET | `/applications` | List with search, status, company, work-mode, priority, pagination |
| POST | `/applications` | Create — auto-creates company + contact from HR data |
| GET | `/applications/:id` | Single application, populated |
| PATCH | `/applications/:id/status` | Change status, records a timeline entry |
| POST | `/applications/:id/notes` | Add a note |
| POST | `/applications/:id/match-score` | Keyword-overlap match score |
| POST | `/applications/bulk/status` | Bulk status update |
| POST | `/applications/bulk/followup` | Bulk follow-up scheduling |
| POST | `/applications/bulk/send-followups` | Bulk send AI follow-up emails |
| POST | `/applications/bulk/delete` | Bulk delete |
| POST | `/mail/send` | Send an email (duplicate guard unless `allowResend`) |
| POST | `/mail/reply` | Threaded reply |
| POST | `/ai/generate-email` | Generate an application email |
| POST | `/ai/generate-followup` | Generate a follow-up email |
| POST | `/ai/refine` | Refine an existing email |
| POST | `/ai/analyze-job` | Analyze a JD against the profile |
| POST | `/ai/parse-linkedin` | Extract structured data from pasted LinkedIn text |
| GET | `/ext/check?url=` | Chrome extension: check if a LinkedIn post URL is already saved |
| GET | `/profile` | Candidate profile |
| PUT | `/profile` | Update profile (including `masterPrompt`) |
| POST | `/profile/parse-resume` | Upload + parse a PDF resume |
| POST | `/profile/parse-cloudinary-resume` | Parse an already-uploaded resume |
| GET | `/resumes` | List resumes |
| POST | `/resumes/upload` | Upload a resume to Cloudinary |
| PATCH | `/resumes/:id` | Update resume metadata (role notes) |
| PATCH | `/resumes/:id/default` | Set default resume |
| DELETE | `/resumes/:id` | Delete resume |
| GET | `/followups` | List follow-ups (includes `emailSent` flag) |
| POST | `/followups` | Schedule a follow-up (with `hrRequest` + `autoSend`) |
| POST | `/followups/process-auto` | Send due auto-send follow-ups for the current user |
| PATCH | `/followups/:id/auto-send` | Enable/disable auto-send, change date or HR request |
| POST | `/followups/:id/send` | Generate + send the follow-up email now |
| PATCH | `/followups/:id/complete` | Mark complete |
| PATCH | `/followups/:id/cancel` | Cancel |
| GET | `/emails` | Email history with filters |
| GET | `/templates` | Email templates |
| POST | `/templates` | Create template |
| GET | `/admin/users` | List all users — **admin only** |
| PATCH | `/admin/users/:id/disable` | Disable a user — **admin only** |
| PATCH | `/admin/users/:id/enable` | Enable a user — **admin only** |
| PATCH | `/admin/users/:id/features` | Toggle one feature on/off — **admin only** |
| PATCH | `/admin/users/:id/disable-all-features` | Turn every feature off at once — **admin only** |
| PATCH | `/admin/users/:id/enable-all-features` | Turn every feature back on — **admin only** |
| GET | `/admin/app-video` | Gmail setup YouTube URL (any authenticated user) |
| PUT | `/admin/app-video` | Set the Gmail setup YouTube URL — **admin only** |
| GET | `/admin/logs` | User session/activity logs, filterable & paginated — **admin only** |
| DELETE | `/admin/users/:id` | Delete user + data — **admin only** |
| GET | `/cron/auto-followup` | Vercel Cron target (honors `CRON_SECRET`) |

Every collection is scoped by `owner` on every query — one user can never read
another's data.

---

## Security notes

- **Secrets are encrypted at rest.** Gmail App Passwords and AI provider keys are
  stored with AES-256-GCM (`utils/crypto.js`) and never returned to the frontend.
  `/auth/me` excludes `password`, `gmailAppPasswordEnc` and `aiProviders`.
- **AI is read-only about you.** The `CANDIDATE FACTS` block plus explicit
  "never invent" rules constrain every generation. Output is requested as strict
  JSON and sanitized (stray `[]` stripped) before it reaches the UI.
- **Duplicate send guard.** `POST /api/mail/send` blocks a second send for the same
  application unless `allowResend: true` is passed, to avoid double-emailing a
  recruiter.
- **Disabled accounts are hard-blocked.** The auth middleware returns 403 on every
  route except `/auth/me`, so a disabled user cannot send email or use AI at all.
- **Feature switches are enforced server-side.** `middleware/featureGuard.js`
  returns 403 `featureDisabled` on every guarded route when the admin switched
  that feature off — regardless of what the UI shows. Admins always bypass.
- **Gmail's own sending limits still apply** (~500/day on a regular account). This
  is a personal outreach tool, not a bulk marketing sender.

---

## Contributing

1. Fork the repo and create a branch
2. Keep changes scoped by `owner` on every new query
3. Never log or commit secrets — store them encrypted like the existing utils
4. Run `npm run build` in `client/` before pushing
5. Open a pull request

---

## License

Add your license of choice here (MIT, ISC, proprietary…).
