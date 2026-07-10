# Representative Response Board

A public accountability page that tracks outreach to members of the House Oversight Committee about a fraud-elimination proposal, and shows a live, ticking timer for how long each office has gone without responding. Each representative's own public statements on waste and fraud sit alongside their response timer.

It runs as a single static page backed by a free Supabase database, so status updates publish instantly from the site's Admin button. No build step, no redeploys for data changes.

## What's in this folder

- `index.html` : the entire site (markup, styling, and logic in one file)
- `SETUP.md` : deployment steps for running your own copy
- `supabase-setup.sql` : full database setup script (schema, security policies, seed data)
- `README.md` : this file


https://rot-watch-board.netlify.app/
