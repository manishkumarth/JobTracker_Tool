# Privacy Policy — JobTrackr for LinkedIn

**Last updated:** 2026-10-19

This privacy policy applies to the **JobTrackr for LinkedIn** Chrome extension (the "Extension"). It describes what data the Extension collects, how it is used, stored, and shared, and the choices available to you.

The Extension is operated by an individual developer. Contact:

- **Name:** Manish Kumar
- **Email:** manish12099@gmail.com

(These contact details are taken from the project's verified support configuration.)

---

## 1. Summary

The Extension helps you save job posts you choose from your LinkedIn feed into your JobTrackr account, hide posts you are not interested in, and — only if you enable the option — draft and send an AI-generated application email from your connected Gmail account.

**Nothing is collected automatically in the background.** The Extension only reads the text of a LinkedIn post when you explicitly click "Save to JobTrackr" (or the floating "Save visible post" button) on that post. It does not track your browsing, read your LinkedIn messages, scrape your connections, or monitor your activity on other websites.

---

## 2. Data the Extension Collects and Processes

All data below is processed only in connection with actions you initiate (saving a post, logging in, toggling a setting).

### 2.1 Data read from LinkedIn (only when you click "Save")

When you click **"Save to JobTrackr"** on a feed post, or the floating **"Save visible post to JobTrackr"** button, the Extension reads:

| Data | Purpose |
|---|---|
| The visible text of the post you clicked (capped at 8,000 characters) | Sent to the JobTrackr API so AI can extract structured job details (title, company, location, salary, skills, recruiter contact) |
| The post's URL (LinkedIn activity link) | Used to prevent saving the same post twice and stored with your saved application |

The Extension does **not** read posts you have not interacted with, and does not collect data from any website other than `https://www.linkedin.com/*`.

### 2.2 Account data (entered by you)

| Data | Purpose |
|---|---|
| Email address and password | Used only to log in to your JobTrackr account via the Extension popup. Your password is sent to the JobTrackr API over the connection and is **not stored** by the Extension. |
| JobTrackr authentication token (JWT) | Stored locally so you stay logged in. Cleared when you log out or when the token expires. |
| Account details returned after login (name, email, Gmail-connected status, feature flags) | Displayed in the Extension popup so you can see your account state. |

### 2.3 Settings and preferences (stored locally)

The Extension stores the following in your browser's local extension storage (`chrome.storage.local`). This data never leaves your browser except where noted:

| Storage key | Data | Leaves your browser? |
|---|---|---|
| `jt_token` | Authentication token | Yes — sent to the JobTrackr API with each request you trigger |
| `jt_user` | Minimal account info (name, email, Gmail status, feature flags) | Yes — refreshed from the API when you open the popup |
| `jt_api_base` | The JobTrackr API URL (you can change this in the popup) | No — used as the destination for API calls |
| `jt_auto_send` | Whether auto-send of AI emails is enabled (on/off) | No — read locally; the setting itself is not transmitted |
| `jt_rejected` | URLs of LinkedIn posts you hid with the "Hide" button (up to 1,000) | No — used only locally to keep those posts hidden while you browse |

### 2.4 Data sent to the JobTrackr API when you save a post

After AI parsing, the Extension sends your saved job to the JobTrackr API, which stores it in your account. This includes: job title, company name, job description (the post text), location, salary, experience, required skills, recruiter name/email/phone (if present in the post), post URL, and source ("LinkedIn").

### 2.5 Data used when auto-send is enabled

If you turn on **"Auto-send AI email on save"** in the popup, the Extension additionally, for each post you save that contains a recruiter email address:

1. Fetches your resume list and profile from the JobTrackr API to pick the best-matching resume (matched locally against your resume notes and filenames using role keywords).
2. Asks the JobTrackr API to generate a draft email (the AI receives your candidate profile details and the job details — see Section 4).
3. Sends the email via the JobTrackr API to the recruiter email found in the post, using the Gmail account you connected in JobTrackr, with your selected resume attached.

No email is sent unless you have enabled the auto-save toggle **and** the post contains a valid recruiter email address. You can turn the toggle off at any time in the popup.

---

## 3. Third-Party Services

The Extension communicates **only** with the JobTrackr API server. By default the Extension is configured to use a local development server (`http://localhost:5000/api`); you can set it to the hosted JobTrackr deployment (`https://j-tracker-tool.vercel.app/api`) or any compatible server you trust, in the Extension popup's "Server API URL" field.

The JobTrackr API (operated for this project) uses the following services to provide the features described above. The Extension does not contact these services directly; they are listed for full disclosure of what happens to your data after it reaches the API:

| Service | Data received | Purpose |
|---|---|---|
| MongoDB (database) | Your account, saved applications, resumes metadata, email logs | Persistent storage of your JobTrackr data |
| Cloudinary | Resume PDF files you upload (via the JobTrackr web app) | Resume file storage; resume IDs are referenced when sending application emails |
| AI/LLM provider of your choice (e.g., OpenRouter, OpenAI, Google Gemini, Anthropic, Groq, DeepSeek, Together AI — configured by you in JobTrackr AI Settings) | (a) The LinkedIn post text you saved, for parsing; (b) your candidate profile details (name, title, experience, current/expected CTC, notice period, skills, education, links, contact details) and the job details, for email generation | AI parsing of job posts and AI drafting of application emails |
| Gmail SMTP (via your own Gmail account and app password, connected by you in JobTrackr) | The generated email (recipient, subject, body) and your resume | Sending the application email from your Gmail account |
| Vercel (hosting) | API traffic as described above | Hosting the JobTrackr API and website |

**The Extension itself does not include any analytics, tracking, or advertising SDKs.** No data is collected or shared for advertising purposes. No data is sold.

---

## 4. AI Processing

When you save a post, the **post text** is sent to the AI provider you configured in JobTrackr (via the JobTrackr API) so it can extract structured job details.

When auto-send generates an email, your **candidate profile facts** (name, professional title, experience, current company, current/expected CTC, notice period, contact details, skills, technologies, previous companies, projects, education, portfolio/GitHub/LinkedIn links, additional info, and any master prompt you saved in your profile) plus the **job details** are sent to the same AI provider so it can draft a truthful email.

Your AI provider API keys are stored encrypted on the JobTrackr server and are never accessible to the Extension.

---

## 5. Storage, Retention, and Security

- **On your device:** authentication token, account snapshot, API URL, auto-send preference, and hidden-post URLs are stored in `chrome.storage.local`, which is scoped to your browser profile and inaccessible to websites or other extensions. Clearing the Extension's data (or uninstalling the Extension) removes all of it.
- **On the JobTrackr server:** your account, saved applications, and email logs are retained until you delete them or delete your account. You can delete individual applications from the JobTrackr web app or mobile app.
- **Security:** the hosted JobTrackr API is served over HTTPS. Your password is used only for authentication and is stored server-side only as a bcrypt hash. Gmail app passwords and AI provider keys are stored encrypted at rest. Authentication tokens expire after 7 days.

---

## 6. Your Choices and Control

- **Login is required to save posts.** The Extension does nothing until you log in with your JobTrackr account in the popup.
- **Saves are always manual.** Every save requires your click on a specific post.
- **Auto-send is opt-in and reversible.** It is off by default; toggle it off in the popup at any time.
- **Hide list is local.** Hidden-post URLs stay on your device; you can clear them by clearing the Extension's storage.
- **Custom server.** You may point the Extension at any compatible JobTrackr API by changing the "Server API URL" in the popup. If you use a third-party server, that server's privacy practices apply to the data you send it.
- **Uninstalling** the Extension removes all locally stored data. Data already saved to your JobTrackr account remains until you delete it in the JobTrackr app.

---

## 7. Data Deletion Requests

To delete your JobTrackr account and all associated data (saved applications, contacts, emails, resumes, logs), email **manish12099@gmail.com** from the address registered to your account, with the subject "Data deletion request". Deletion will be completed within a reasonable time after verification.

---

## 8. Children's Privacy

The Extension is not directed at children under 13, and the Service does not knowingly collect personal information from children.

---

## 9. Changes to This Policy

The policy may be updated to reflect changes in the Extension or applicable requirements. The "Last updated" date at the top will be revised when changes are made. Continued use of the Extension after changes constitutes acceptance of the updated policy. Material changes will be noted in the Extension's store listing release notes where required.

---

## 10. Chrome Web Store Permissions (Just-in-Time Disclosure)

The Extension requests the following permissions, as shown on the Chrome Web Store listing:

| Permission | Why it is needed |
|---|---|
| **storage** | To keep you logged in (auth token), remember your settings (API URL, auto-send toggle), and remember which posts you hid. |
| **Access to `https://www.linkedin.com/*`** (host permission + content script) | To add the "Save to JobTrackr" / "Hide" buttons on feed posts and to read the text of a post only when you click Save. |
| **Access to the JobTrackr API hosts** (`https://j-tracker-tool.vercel.app/*`, `http://localhost:5000/*`, `https://*.vercel.app/*`) | To log you in and send the post text for AI parsing, save applications to your account, and (if you enable it) generate and send the application email. The localhost and wildcard Vercel permissions exist so you can point the Extension at a development server or any deployment of the JobTrackr API. |

The Extension does not request permissions for browsing history, tabs, downloads, cookies, web request interception, or native messaging.

---

## 11. Single-Purpose Statement (Chrome Web Store)

The single purpose of this Extension is: **to allow the user to save selected LinkedIn feed job posts into their JobTrackr account and optionally send an AI-drafted application email for those saved posts.** All permissions are used only in service of this purpose.

---

## 12. Contact

Questions about this privacy policy or your data:

- **Email:** manish12099@gmail.com
- **Developer:** Manish Kumar
