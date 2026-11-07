# Development workflow

1. Create changes on a feature branch, never directly on `main`.
2. Run `npm run check` before committing.
3. Push the branch and review its Cloudflare Pages Preview URL.
4. Verify navigation, assets, forms, article pages, project pages and `/api/telegram` behavior.
5. Merge to `main` only after review; Cloudflare Pages then performs the production deployment.

## Local prerequisites
- Node.js 18 or newer.
- For Pages Functions local testing, install Wrangler and configure local secrets in `.dev.vars` (never commit that file).

## Required Cloudflare secrets
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Set these in Cloudflare Pages > Settings > Variables and Secrets. The repository contains no real values.
