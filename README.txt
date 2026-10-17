VIRAL BHARAT — SECURE HOSTED WEBSITE STARTER

Includes:
- Dark navy/red/blue glass-style viewer, photo above title, Watch button
- Viewer password checked by server (not stored in HTML)
- Separate Admin login
- Pages can be added without a fixed 5-page limit, renamed, deleted
- Videos can be added, edited, deleted with optional title/photo URL/rating/badge
- Same-site Previous/Next navigation
- Cloudflare Worker + D1 database

IMPORTANT LIMITS / SECURITY NOTES
- This is a starter package, not live until configured and deployed.
- Use strong, unique passwords. Set them as Cloudflare Worker secrets, never in HTML/GitHub.
- Viewer/admin session cookie is HttpOnly, Secure, SameSite=Lax and has no Max-Age (browser-session cookie); server-side session records expire after 12 hours.
- Photo field accepts a publicly accessible image URL, not direct file upload yet.
- Do not publish sensitive/private content until you have tested the setup.

SETUP OVERVIEW
1. Upload all files/folders from this package to the GitHub repository root, preserving paths: public/, src/, package.json, wrangler.toml, schema.sql, README.txt.
2. In Cloudflare Workers & Pages, connect this repository. Build command can be left blank. Deploy command: npx wrangler deploy.
3. Create a Cloudflare D1 database named viral-bharat-db. Run schema.sql in the D1 Console.
4. Copy the database ID into wrangler.toml, replacing REPLACE_WITH_D1_DATABASE_ID.
5. In Worker Settings > Variables and Secrets, add secrets:
   VIEWER_PASSWORD = your viewer password
   ADMIN_USERNAME = your admin username
   ADMIN_PASSWORD = your admin password
6. Redeploy after updating the D1 ID and secrets.
7. Open the site root for viewer. Open /admin.html for admin login.

API uses D1. If D1 is not configured, login/data endpoints return a setup error. Do not click Deploy before repository files and D1 binding are configured.
