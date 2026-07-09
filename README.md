# Representative Response Board

A public accountability page that tracks outreach to members of the House Oversight Committee about a fraud-elimination proposal, and shows a live, ticking timer for how long each office has gone without responding. Each representative's own public statements on waste and fraud sit alongside their response timer.

It runs as a single static page. No server, no build step, no accounts beyond a free Netlify account.

## What's in this folder

- `index.html` : the entire site (markup, styling, and logic in one file)
- `SETUP.md` : deployment steps, plus an optional database upgrade if you ever outgrow the manual workflow
- `README.md` : this file

## Quick start

1. Sign in at [app.netlify.com](https://app.netlify.com) (free).
2. Choose **Add new site > Deploy manually**.
3. Drag this whole folder onto the drop zone.
4. You get a live URL like `https://your-site.netlify.app`. Rename it in Site settings, or attach a custom domain later.

That's it. The board loads immediately with all nine representatives marked "Not yet contacted."

## Daily workflow

You do the outreach by hand through each office's web form, then log it here.

1. Open your live site and click **Admin** (top right) to enter edit mode. No password: your edits only live in your own browser until you publish.
2. As you work, use each card's buttons: **Log submission** starts the timer, **Log follow-up call** records a phone follow-up, **Mark responded** stops the clock. A card flags red after 21 days without a reply.
3. When you want the public board to reflect your changes, click **Download updated file**. It hands you a fresh `index.html` with your data baked in.
4. Replace the old `index.html` in this folder with the downloaded one, and drag the folder onto Netlify again. Visitors now see the update.

Two things to keep in mind:

- The download button only works on the deployed site, not on the file opened directly from your disk. Deploy first, then manage everything from the live URL.
- Unpublished edits live in your browser. Publish at the end of each work session so nothing is lost if you clear your browsing data.

## Quotes

Four quotes are seeded from public posts: three from Rep. Cloud and one from Rep. Meuser. In edit mode, every card has a form to add more (text, date, and a link to the original post).

Before publishing any quote, paste in the link to the original post and check the wording against the source. A public page quoting members of Congress needs every quote to be accurate and verifiable, and this is the single most important thing to get right.

## Private notes

Each card has a private notes field (for confirmation numbers, screenshot filenames, or a summary of a reply). These stay in your browser only. They are never written into the downloaded file, so they never reach visitors.

## Presentation

The board is designed to state only verifiable facts: when each office was contacted, whether it responded, and how long that has taken. Keeping the framing factual is both more credible and safer than editorializing. The timers and the representatives' own words make the point on their own.

## Photos

Headshots are official congressional portraits, which are public-domain U.S. government works, served by the @unitedstates project and keyed to each member's Bioguide ID. If a photo is ever missing or wrong, you can replace the image URL for that representative; the pattern is `https://theunitedstates.io/images/congress/225x275/BIOGUIDE_ID.jpg`.

## Optional upgrade

If re-uploading after every change gets tedious once replies start coming in, `SETUP.md` includes an optional path to a free database (Supabase) that lets your edits publish instantly behind a real login, with no re-uploading. It is entirely optional; the site is fully functional without it.
