# Hosting setup

One-time setup for production. Takes about 30 minutes plus DNS wait time. Accounts and secrets never go in this repo.

| Piece | Where | Value |
| --- | --- | --- |
| App | Vercel Hobby, project `roundtable-tools` | `https://rpc.pack662nyc.com` |
| Database | Neon Free, added from the Vercel project | Production + Development only |
| Sign-in email | Resend Free | sends from `mail.pack662nyc.com` |
| DNS | Namecheap, `pack662nyc.com` | records below |

`mail.` is verified in Resend instead of `rpc.` because Resend's free plan allows one sending domain. A future pack app at `app.pack662nyc.com` can send from the same verified domain.

## 1. Create the Vercel project

1. Go to vercel.com/new while signed in to the personal account.
2. Import `ajmarroquin/scouting-america-roundtable-tools`. If it isn't listed, choose **Adjust GitHub App Permissions** and grant access to this repo.
3. Name it `roundtable-tools`. Framework is detected as Next.js. Leave build settings at their defaults.
4. Deploy. The first build may fail until the steps below are done. That's expected.
5. Settings → Deployment Protection: confirm Vercel Authentication covers everything except custom domains. Preview URLs stay private to you; volunteers only use the custom domain.

## 2. Add the database

1. Project → **Storage** → **Create Database** → **Neon** → Free plan, region **US East (Washington, D.C.)** to sit next to the app.
2. Connect it to **Production** and **Development** only. Leave **Preview** unchecked, and leave per-preview branching off. A Neon branch copies its parent's data, and previews must never see production data. A separate dev branch with fake data comes later.

## 3. Point the subdomain at Vercel

1. Project → Settings → **Domains** → add `rpc.pack662nyc.com`. Vercel shows a CNAME target.
2. Namecheap → Domain List → `pack662nyc.com` → **Manage** → **Advanced DNS** → **Add New Record**:
   - Type `CNAME Record`, Host `rpc`, Value: the target Vercel showed, TTL Automatic.
3. Wait for Vercel to show the domain as valid. It issues the HTTPS certificate on its own.

## 4. Set up Resend

1. Sign up at resend.com with the maintainer's scouting email.
2. **Domains** → **Add Domain** → `mail.pack662nyc.com`, region `us-east-1`.
3. Add the records Resend shows in Namecheap's Advanced DNS. Namecheap's Host field wants the part before `.pack662nyc.com`. They will look like:

   | Type | Host | Value |
   | --- | --- | --- |
   | TXT | `resend._domainkey.mail` | the DKIM key Resend shows |
   | MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `_dmarc.mail` | `v=DMARC1; p=none;` (optional, recommended) |

   Copy the exact values from Resend, not from this table.

   **Check before adding the MX record:** Namecheap only allows custom MX records when **Mail Settings** (on the same Advanced DNS page) is set to **Custom MX**. If `pack662nyc.com` uses Namecheap Email Forwarding or Private Email today, switching modes can break the pack's existing email. Stop and sort that out first.

4. Wait for Resend to show **Verified**. Usually minutes, sometimes a few hours.
5. **API Keys** → **Create API Key** → name `roundtable-tools`, permission **Sending access**, domain `mail.pack662nyc.com`. Copy it; Resend shows it once.

## 5. Environment variables

Project → Settings → **Environment Variables**, environment **Production**. Mark the secrets as **Sensitive**.

| Name | Value | Sensitive |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | a random string, at least 32 characters (`openssl rand -base64 32`, or a password manager) | yes |
| `BETTER_AUTH_URL` | `https://rpc.pack662nyc.com` | no |
| `RESEND_API_KEY` | the key from step 4 | yes |
| `EMAIL_FROM` | `Roundtable Tools <no-reply@mail.pack662nyc.com>` | no |
| `BOOTSTRAP_ADMIN_EMAILS` | the email the first admin signs in with | no |
| `RUN_MIGRATIONS` | `true` | no |

`DATABASE_URL` and the other `PG*`/`POSTGRES_*` variables are added by the Neon integration.

## 6. First sign-in

1. Merge the setup pull request into `main`. The production build applies the database migrations.
2. Open `https://rpc.pack662nyc.com`, enter the bootstrap email, and enter the code from your inbox. That account becomes the first admin.
3. Add the rest of the team under **Users**.
4. `BOOTSTRAP_ADMIN_EMAILS` does nothing once an admin exists. Remove it whenever you like.

## 7. Repo security

GitHub → repo **Settings** → **Code security**: turn on **Secret Protection** and **Push protection**. Both are free for public repos and block commits that contain keys.

## If something breaks

- **No code arrives:** check Resend → Logs. If nothing is there, check the Vercel function logs for `RESEND_API_KEY` or `EMAIL_FROM` errors. Codes only go to people listed under Users.
- **"Too many requests":** three code requests per minute per network. Wait a minute.
- **Locked out with no admin:** set `BOOTSTRAP_ADMIN_EMAILS` and make sure no user has the admin role (in Neon's SQL editor), then sign in again.
