# FoxGuard QA automation deployment

The public repository contains the landing page and Vercel API. The private `tonygokul30-cpu/autonomous-qa-engine` repository owns browser execution, Gmail/Resend delivery, `clients.json`, and `leads.json`. Never copy either data file, reports, credentials or engine history into this public repository.

## One-time activation

1. Import `tonygokul30-cpu/foxguard-qa` into Vercel. Use the repository root, **Other** framework and Node.js 22. `vercel.json` builds only public assets into `dist`; Vercel deploys the two `api/*.js` functions separately. The production API must be publicly reachable without Vercel deployment protection.
2. Set the Vercel environment variables below and deploy. On Vercel, an empty frontend `API_BASE_URL` uses the site's own origin.
3. Set `window.FOXGUARD_CONFIG.API_BASE_URL` in **both** public `config.js` and private `docs/config.js` to the actual production origin, for example `https://YOUR-PROJECT.vercel.app`, and push those files. Do not use `/api` as part of this value. GitHub Pages cannot run serverless functions; it must call Vercel. No production URL is guessed or enabled in this commit.
4. Add the two Gmail secrets to the private repository. Use the mailbox's Google App Password, not its normal login password. Enable 2-Step Verification before generating the App Password. Gmail sends on implicit TLS port 465 and BCCs `tonygokul30@gmail.com`.
5. In Razorpay **Live mode**, create a webhook pointing to `https://YOUR-PROJECT.vercel.app/api/razorpay-webhook`. Set the same secret as `RAZORPAY_WEBHOOK_SECRET`. Enable `payment.captured`, `subscription.authenticated`, and `subscription.activated`. Use separate deployment/secrets when testing Razorpay Test mode.
6. Keep Actions enabled in the private repository. Its workflows request Contents write to update private data, and the recovery workflow requests Actions write to dispatch retries. Branch protection must permit these bot commits. Do not configure a rule that silently prevents client registration.
7. Run the acceptance checks below before advertising unattended service.

## GitHub Actions secrets — private engine repository

- `GMAIL_USER`: the Gmail or Google Workspace sending address, normally `tonygokul30@gmail.com`.
- `GMAIL_APP_PASSWORD`: that mailbox's App Password. Store it only as an Actions secret.
- `RESEND_API_KEY`: optional alternative, used only when both Gmail settings are not configured. Gmail is tried first. If Gmail fails, configured Resend is tried for the customer; a final owner backup is clearly marked and never treated as confirmed customer delivery.

Repository **variable** `RESEND_FROM_EMAIL` is required only if using Resend for external recipients: use a verified sender/domain. `onboarding@resend.dev` is a testing sender and must not be relied on to deliver to arbitrary visitors. If direct delivery fails, an owner backup is retained separately in delivery.json. The customer request remains failed/retryable until direct delivery is accepted.

The built-in `GITHUB_TOKEN` is supplied by Actions; no additional personal token is needed inside the engine. Scheduled monitoring now requests email delivery automatically, so `SEND_EMAIL=true` is no longer needed as a repository variable. `OPENAI_API_KEY`, `OPENAI_MODEL`, and `AI_ENABLED` remain optional for AI assistance; automated free audits use deterministic read-only browser checks.

## Vercel environment variables — production backend

- `GITHUB_TRIGGER_TOKEN`: a fine-grained GitHub PAT limited to the **private engine repository**, with **Actions: read/write** and **Contents: read/write**. It dispatches workflows and atomically updates private lead/queue data. It does not need access to the public repository. Renew before expiry.
- `RAZORPAY_WEBHOOK_SECRET`: the exact secret configured on the Razorpay webhook, not the Razorpay API secret.
- `RAZORPAY_KEY_ID`: the live Razorpay API key ID. Needed for invoice/subscription/customer lookups when an event omits the email.
- `RAZORPAY_KEY_SECRET`: the matching live API secret. Needed with the key ID.
- `ALLOWED_ORIGINS`: optional comma-separated exact HTTPS origins for custom domains, for example `https://qa.example.com`. The GitHub Pages origin `https://tonygokul30-cpu.github.io` and Vercel's automatically supplied `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` are already allowed. No wildcard origins or credentials are enabled.

Do not place any of these secrets in `config.js`. `API_BASE_URL` is a **public frontend configuration value**, not a GitHub or Vercel secret. Gmail credentials belong in GitHub, not Vercel.

## Request and checkout behavior

`POST /api/request-audit` accepts JSON `{url,email,selected_plan,permission}` (`plan` remains a compatible alias). `permission` must be the boolean `true`; supported plans are `free-audit`, `founding`, `starter`, `growth`. It validates public HTTP(S) destinations including all resolved A/AAAA addresses; local/reserved addresses, nonstandard ports, credentials, query strings and fragments are rejected. Browser requests use an `Idempotency-Key` that is retained for retries. The server also accepts `request_id` or creates an ID if omitted.

The API commits the authorized lead and durable job into private `leads.json`, then dispatches `run-audit.yml` with `target_url`, `client_email`, `selected_plan`, `authorized=true`, `send_email=true`, `profile=smoke`, `save_to_clients=false`, and an internal `request_id`. It returns success only after dispatch is accepted (or a previous idempotent dispatch is already confirmed).

For checkout the browser sends `mode: "lead-capture"`. This saves the mapping without starting an audit or activating monitoring, then navigates to the configured Razorpay link. All pricing links first collect URL/email/permission; without JavaScript they lead to the form instead of bypassing capture. A failed capture prevents checkout navigation.

**Use the same email in the landing form and at Razorpay checkout.** Existing hosted Razorpay links cannot reliably attach arbitrary per-visitor metadata. If the billing email differs, an email lookup cannot identify the submitted domain. For integrations that create subscriptions programmatically, attach signed provider notes `website_url`, `client_email`, `foxguard_plan`, and `permission: "true"`; payment/customer email remains the delivery identity. The webhook never assumes a payment grants testing permission for an unrelated website.

Razorpay signatures are checked against the raw body with HMAC-SHA256 and constant-time comparison. A supported event resolves the email from payment/customer data or the authenticated Razorpay API. It prefers `notes.website_url` and otherwise uses the stored email mapping. It dispatches the same workflow with `save_to_clients=true`. The workflow commits `clients.json` through the Contents API using SHA conflict retries so simultaneous enrollments preserve other customers. Daily audits run at **06:00 Asia/Kolkata (00:30 UTC)** and deliver to each client's saved email. Capacity is 256 enabled clients per scheduled matrix, one audit at a time.

## Reliability and limits

- Limits are persisted with SHA compare-and-swap, not in a serverless process's memory: five submissions per connecting IP per hour, five per email per day, and 100 total per day, including checkout capture. IPs are HMACed; expired counters are removed. Missing proxy identity uses a shared conservative bucket. Add a managed rate-limit service/CAPTCHA before larger campaigns.
- The private `leads.json` schema is `{version,leads,jobs,limits}`. Leads are indexed by a hash of normalized email and contain `{email,url,plan,permission,updatedAt}`. Jobs retain the original authorized input snapshot. Paid activation records are retained to deduplicate later events for the same subscription.
- An hourly recovery workflow, also triggered after failed audit workflows, retries queued, interrupted or unclaimed dispatches. Claims prevent duplicate active audits, and provider delivery or registration failures are visible as failed Actions jobs. Five dispatch attempts are allowed; exhausted jobs are marked `failed` for investigation. Completed free-audit records expire after 30 days. This lightweight GitHub-backed store has a 900 KB safety cap and is intended for low-volume intake.
- GitHub scheduling, Actions availability, SMTP acceptance and inbox filtering are external dependencies. The requested ~45-second progress banner is an estimate after a runner starts, with an adjacent queue/delivery explanation. No code can guarantee 100% availability, exact execution times, or inbox placement. A crash after email acceptance but before completion bookkeeping can still cause an at-least-once retry email.
- Only the three requested activation events are handled. Cancellation, expiry, refunds and suspension do **not** automatically remove monitoring; those lifecycle policies need a separate agreed implementation. Advanced authenticated/custom flows and additional plan schedules still require configuration.
- The audit form never creates a mailto link or opens Outlook. A network/API failure stays on the page with a clean retry message. No FormSubmit delivery path remains in the automation flow.

## Acceptance checks

1. Locally run `npm ci && npm test && npm run build` in the public repository. In the engine run `npm ci`, `npm run validate`, `npm test`, then `node scripts/preview-site.js` and `node scripts/verify-site.js` in another terminal. Browser checks mock delivery and checkout; they never pay or send email.
2. After deploying and configuring `API_BASE_URL`, submit an authorized site and an inbox you control on the live landing page. Confirm the workflow receives that recipient, `delivery.json` says `provider: gmail`, the visitor receives the self-contained HTML attachment and summary, and the owner receives the BCC.
3. With Razorpay **Test mode and a separate backend**, capture a lead, generate each requested event, then replay it. Confirm one activation for the subscription, the expected URL/email in `clients.json`, and no duplicate audit from a replay. Verify a tampered signature is rejected.
4. Confirm a scheduled run includes the enrolled client and emails its saved recipient. Check Actions failure notifications and jobs marked `failed` in the private queue. Configure an independent uptime/alerting service for production operation.

References: [Vercel Node web-standard handlers](https://vercel.com/docs/functions/runtimes/node-js), [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [Razorpay signatures and retries](https://razorpay.com/docs/webhooks/validate-test/), [subscription payloads](https://razorpay.com/docs/webhooks/subscriptions/), [Nodemailer Gmail setup](https://nodemailer.com/usage/using-gmail/).

## Report activation links

All HTML and plain-text reports, email summaries, and attachments include the three live Razorpay activation links. The selected plan is validated, carried through workflow_dispatch and saved in the report for resending. Gmail acceptance is recorded for the exact client recipient, with the owner BCC. SMTP acceptance is not proof of inbox arrival; confirm the live test in the recipient mailbox. A free-audit customer who pays from a report link can activate the saved authorized website; no paid tier is guessed when hosted checkout omits plan metadata.
