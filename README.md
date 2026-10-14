# Messenger Bot (cookie-based login)

Automates a personal Facebook account via Messenger using a saved browser
session (`appState`) instead of a username/password or the official API.

⚠️ **Read this first:** Facebook's Terms of Service prohibit automating a
personal account outside their official Messenger Platform API. Using this
kind of bot can get the account flagged, rate-limited, or banned — this is
more likely if you send lots of messages fast, or contact people who haven't
messaged the bot first. Use at your own risk, ideally on a low-stakes/burner
account, not your main one.

## 1. Get your cookies

1. Log into Facebook normally in your browser.
2. Install a cookie-export extension (e.g. "EditThisCookie" or "Cookie-Editor").
3. Export cookies for `facebook.com` as JSON.
4. Save that JSON — this is your `appState` / `FB_COOKIES` value.

Cookies expire. If the bot suddenly can't log in anymore, redo this step.

## 2. Run locally

```bash
npm install
FB_COOKIES="$(cat cookies.json)" ADMIN_IDS="your_fb_id" node index.js
```

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

`cookies.json` is git-ignored — never commit real session cookies to a repo,
public or private.

## 4. Deploy on Render

1. New → Web Service → connect your GitHub repo.
2. Build command: `npm install`
3. Start command: `npm start`
4. Environment variables (Render dashboard → Environment):
   - `FB_COOKIES` → paste the full cookie JSON as one line
   - `ADMIN_IDS` → comma-separated Facebook user IDs allowed to use admin commands
   - `STARTUP_THREAD_ID` → (optional) thread ID to message on boot
5. Deploy. Render's free tier spins down when idle — the bot's Messenger
   listener drops with it. For an always-on bot, use a paid instance type or
   a scheduled ping to keep it awake.

## Commands built in

- `!ping` → replies "pong"
- `!help` → lists commands
- `!broadcast <text>` → admin-only, sends `<text>` back to the thread

## Trigger-word banter

`triggers.js` defines 5 groups of preset one-liners (bot jokes, trash talk,
casual comebacks, short one-liners, deflections). Each group cycles through
its own list in order — every time its trigger fires, it sends the next line
and wraps back to the start after the last one. The cycle position resets
whenever the bot restarts (e.g. every Render redeploy).

Single-word triggers (like `sige`, `ano`, `o`, `k`) only match whole words,
not substrings — but they're still common words, so expect them to fire
often in normal conversation. Edit the `triggers` arrays in `triggers.js` to
narrow or change them.

Add your own logic inside `handleMessage()` in `index.js`.


## YouTube playback

YouTube may block downloads from cloud-hosted server IPs with a bot check. If `!play` reports `Sign in to confirm you’re not a bot` or `Failed to extract any player response`, export a fresh **Netscape-format** cookie file for `youtube.com` and add its contents as the `YOUTUBE_COOKIES` environment variable.

Do not commit YouTube cookies to GitHub. The bot writes this secret to a temporary file only while downloading and deletes it afterward. After adding the variable in Render, redeploy the service.


## Eclipse RPG

The bot now includes a persistent RPG foundation under the !rpg command. Character profiles, domains, buildings, armies, and marches are stored in Neon. RPG purchases use the existing wallet and banking system; use !withdraw <amount> to move banked coins into the wallet before spending.

- !rpg help — show RPG commands
- !rpg profile — view character and balances
- !rpg class knight — choose a class
- !rpg property buy cottage — start a domain
- !rpg build farm — develop a building
- !rpg train infantry 10 — train troops
- !rpg march ironspine — travel by map distance

Marches persist across restarts and are not limited by a global two-minute cap.

## Raid Shield

Raid Shield adds risk scoring and a persisted incident history to the existing AutoMod message/event pipeline. It can flag message bursts, repeated messages, mention floods, coordinated duplicate messages, confirmed group-join bursts when the Messenger event includes participant IDs, and repeated non-admin group photo/name changes. Unrecognized or incomplete join payloads are ignored rather than guessed.

- Risk state and incidents use the app's shared PostgreSQL connection; incidents are retained for 7 days by default and stale non-lockdown state is pruned.
- Risk-triggered member removals are placed in a dashboard approval queue. Only an authenticated dashboard request can review an action, and the action is marked completed only when the shared Messenger removal helper reports success.
- The dashboard's five-minute lockdown/release buttons update Raid Shield's temporary risk state only; they do **not** change Messenger group permissions or enable a platform-level slow mode.
- The controller persists its per-group setting, automation ownership, restore deadline, errors, and audit trail in PostgreSQL. If it detects an external approval-mode change while it owns the temporary setting, it will not override that manual change. Test in a low-risk group first.
- Existing AutoMod policies remain separate and authoritative. In particular, the pre-existing repeated-profile-change rule may still remove a member after its configured threshold; Raid Shield records the signal but does not replace that policy.
- Verify the dashboard API URL and dashboard key before using live controls. Test in a low-risk group first; do not treat risk signals as proof of malicious intent.

The bot's CI runs JavaScript syntax checks, repository architecture checks, and the Node.js test suite (npm test).

## Gemini AI configuration

Lucien uses the official Groq API. Set these environment variables in Render (never commit them):

- GROQ_API_KEY — required Groq API key
- AI_MODEL — optional Groq model name; defaults to openai/gpt-oss-20b
- ALAIZA_MESSENGER_ID — the authorized Devoura/Alaiza Messenger user ID

The AI handler checks authorization before calling Gemini. Unauthorized users do not trigger an AI request.


## Raid Shield operations checklist

Use this checklist before enabling Raid Shield broadly. CI validates code structure and unit behavior; it does not validate the live Messenger event schema or a production database.

1. Confirm the deployed commit matches the intended `main` SHA in Render.
2. Confirm PostgreSQL can create the Raid Shield state, incident, and approval tables/indexes. Review startup logs for migration errors.
3. In a test group, verify a normal conversation stays at normal risk and repeated messages create a persisted incident.
4. Verify a real `log:subscribe` payload includes participant IDs before expecting join-burst detection. Unknown shapes must remain ignored.
5. Verify profile-change events distinguish authorized admin changes from confirmed unauthorized changes.
6. Create a pending action, reject it, then create a separate action and approve it. Verify the final status reflects the Messenger helper result.
7. Simulate an unavailable removal API and a database error. Confirm the dashboard shows a failure and the action does not remain indefinitely pending/approved.
8. Enable a short lockdown, confirm its expiry timestamp, restart the service, and confirm expired state is no longer reported as active.
9. Verify a non-admin cannot access dashboard endpoints and that a group ID from outside the bot's known group list is rejected.
10. Check logs and database records after each test; never use a real member as the first removal test.

Rollback: disable the Raid Shield dashboard controls/feature route or redeploy the last known-good commit if startup migrations or the message pipeline fail. Do not manually delete incident/action tables as a rollback strategy; preserve the audit trail.
