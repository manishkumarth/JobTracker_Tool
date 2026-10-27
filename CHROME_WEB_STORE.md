# Chrome Web Store — GitHub Actions setup

The workflow in `.github/workflows/publish-extension.yml` publishes the
`extension/` folder to the Chrome Web Store automatically whenever you push to
`main` (only when files under `extension/` change), or manually via the
**Actions → Publish Chrome Extension → Run workflow** button.

It needs five repository secrets, which you create once.

## 1. Create a Google Cloud project + OAuth client

1. Go to https://console.cloud.google.com/ and create a new project (e.g. `jobtrackr-extension`).
2. Enable the **Chrome Web Store API**:
   - APIs & Services → Library → search "Chrome Web Store API" → Enable.
3. Create OAuth consent screen:
   - APIs & Services → OAuth consent screen → External → fill App name ("JobTrackr Extension Publisher") → add your email as a test user.
4. Create credentials:
   - APIs & Services → Credentials → **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: add `https://developers.google.com/oauthplayground`
   - Save the **Client ID** and **Client Secret**.

## 2. Get a refresh token

1. Open https://developers.google.com/oauthplayground
2. Click the gear icon (⚙) → "Use your own OAuth credentials" → paste your Client ID and Client Secret.
3. In "Step 1", paste this scope and click **Authorize APIs**:
   ```
   https://www.googleapis.com/auth/chromewebstore
   ```
4. Sign in with the Google account that owns the extension in the Chrome Web Store.
5. In "Step 2", click **Exchange authorization code for tokens**.
6. Copy the **Refresh token** (it starts with `1//...`).

## 3. Add GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret name | Value |
|---|---|
| `CHROME_EXTENSION_ID` | The extension ID from the Chrome Web Store developer dashboard (32-char string) |
| `CHROME_CLIENT_ID` | From step 1.4 |
| `CHROME_CLIENT_SECRET` | From step 1.4 |
| `CHROME_REFRESH_TOKEN` | From step 2.6 |
| `CHROME_PUBLISHER_ID` | Your Chrome Web Store publisher ID (from the developer dashboard URL) |

## 4. How it triggers

- **Auto:** push any change under `extension/` to `main` → workflow runs, uploads, submits for review.
- **Manual:** GitHub → **Actions** tab → "Publish Chrome Extension" → **Run workflow** (useful for re-publishing without a code change).

## Versioning (required on every publish)

The Chrome Web Store rejects any package whose `version` in `extension/manifest.json`
is **not strictly greater** than the version already stored (published *or* uploaded
for review). This is the cause of the generic error:

```
❌ The uploaded package was invalid. Check the additional details for more information.
```

Before pushing a change under `extension/`, bump `version`:

```jsonc
// extension/manifest.json
"version": "1.3.3"
```

Use up to four dot-separated integers (`1.3.3`, `1.3.4`, ...). Never re-upload the
same version just because the code changed.

If an upload fails while the item is already **in review**, wait for the review to
finish (or cancel it in the dashboard) before uploading the next version.

## Notes

- The extension ID is assigned by the Chrome Web Store after your first manual upload. Do the **first** publish by hand (see the README's "Deploy to Chrome Web Store" section); only then can you automate updates.
- Each push that changes `extension/` must include a manifest version bump; the workflow submits that new version for review. Review usually takes < 24 hours for updates.
- If a review fails, the workflow run stays green (the upload succeeded) but you'll get an email from Google. Fix the issue and push again.
- `icons/generate-icons.mjs` is excluded from the zip (it's a build helper, not needed at runtime).
- The workflow runs on `ubuntu-latest` and uses `zip` (pre-installed) — no extra build step needed since the extension is plain JS/HTML/CSS.
