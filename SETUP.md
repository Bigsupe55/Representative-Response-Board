# Setup Guide: Response Board on Netlify

Total time: ~15 minutes. Total cost: $0.

## Step 1: Create the free database (Supabase)

1. Go to supabase.com → create an account → **New project** (free tier). Pick any name/password/region.
2. When the project finishes creating, open **SQL Editor** (left sidebar) → **New query** → paste ALL of the SQL below → **Run**.

```sql
-- Base table (admin-only access; includes private notes)
create table reps (
  id text primary key,
  name text not null,
  state text,
  role text,
  site text,
  form text,
  phone text,
  photo text,
  status text not null default 'not_contacted',
  sent_at timestamptz,
  followup_at timestamptz,
  responded_at timestamptz,
  quotes jsonb,
  notes text
);

-- Public view: everything EXCEPT private notes
create view public_board as
  select id, name, state, role, site, form, phone, photo,
         status, sent_at, followup_at, responded_at, quotes
  from reps;

-- Lock the table down
alter table reps enable row level security;

-- Signed-in owner: full read/write on the base table
create policy "owner read"  on reps for select to authenticated using (true);
create policy "owner write" on reps for update to authenticated using (true);
create policy "owner insert" on reps for insert to authenticated with check (true);

-- Anonymous visitors: read the public view only
grant select on public_board to anon;

-- Seed the nine representatives (official public-domain portraits via theunitedstates.io)
insert into reps (id, name, state, role, site, form, phone, photo) values
('comer',   'Rep. James Comer',            'R-KY', 'Oversight Chair',  'https://comer.house.gov/',   'https://comer.house.gov/contact',   '(202) 225-3115', 'https://theunitedstates.io/images/congress/225x275/C001108.jpg'),
('cloud',   'Rep. Michael Cloud',          'R-TX', 'Oversight · DOGE', 'https://cloud.house.gov/',   'https://cloud.house.gov/contact',   '(202) 225-7742', 'https://theunitedstates.io/images/congress/225x275/C001115.jpg'),
('fallon',  'Rep. Pat Fallon',             'R-TX', 'Oversight',        'https://fallon.house.gov/',  'https://fallon.house.gov/contact',  '(202) 225-6673', 'https://theunitedstates.io/images/congress/225x275/F000246.jpg'),
('burchett','Rep. Tim Burchett',           'R-TN', 'Oversight',        'https://burchett.house.gov/','https://burchett.house.gov/contact','',               'https://theunitedstates.io/images/congress/225x275/B001309.jpg'),
('meuser',  'Rep. Dan Meuser',             'R-PA', 'House Member',     'https://meuser.house.gov/',  'https://meuser.house.gov/contact',  '',               'https://theunitedstates.io/images/congress/225x275/M001204.jpg'),
('donalds', 'Rep. Byron Donalds',          'R-FL', 'House Member',     'https://donalds.house.gov/', 'https://donalds.house.gov/contact', '',               'https://theunitedstates.io/images/congress/225x275/D000032.jpg'),
('higgins', 'Rep. Clay Higgins',           'R-LA', 'House Member',     'https://higgins.house.gov/', 'https://higgins.house.gov/contact', '',               'https://theunitedstates.io/images/congress/225x275/H001077.jpg'),
('biggs',   'Rep. Andy Biggs',             'R-AZ', 'House Member',     'https://biggs.house.gov/',   'https://biggs.house.gov/contact',   '',               'https://theunitedstates.io/images/congress/225x275/B001302.jpg'),
('greene',  'Rep. Marjorie Taylor Greene', 'R-GA', 'House Member',     'https://greene.house.gov/',  'https://greene.house.gov/contact',  '',               'https://theunitedstates.io/images/congress/225x275/G000596.jpg');
```

> Note: the site also stores each rep's public statements in the `quotes` column (that's why it's in the table and the view above). This seed starts everyone with no quotes; `supabase-setup.sql` in this repo is the same schema but seeds the quotes that were already on the live board.

## Step 2: Create your admin login

1. In Supabase: **Authentication** (left sidebar) → **Users** → **Add user** → **Create new user**.
2. Enter YOUR email and a strong password. Check "Auto confirm user."
3. This is the account you'll use with the site's **Admin** button. Nobody else gets one.

Also, under **Authentication → Sign In / Providers**, make sure new **sign-ups are disabled** (turn off "Allow new users to sign up") so strangers can't create accounts.

## Step 3: Put your keys in the site

1. In Supabase: **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public key** (long string)
2. Open `index.html` in any text editor (Notepad works). Near the top, find:
   ```
   const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
   const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
   ```
   Paste your two values between the quotes. Save.

> The anon key is designed to be public: it's in every visitor's browser by nature. The database rules from Step 1 are what keep writes admin-only.

## Step 4: Deploy to Netlify

1. Go to app.netlify.com → **Add new site → Deploy manually**.
2. Drag the whole `netlify-board` folder onto the drop zone.
3. Done: you get a live URL like `https://something.netlify.app`. Rename it under Site settings, or attach a custom domain later.

To update the site file itself later, just re-drag the folder. (Data updates don't need this: they go through the Admin button.)

## Step 5: Use it

- Visitors see the read-only board with live ticking counters. It auto-refreshes data every 60 seconds.
- You: click **Admin** (top-right) → sign in with the Step 2 email/password → buttons appear: Log submission, Mark responded, Log follow-up call, undo, plus the private notes box (notes are never shown to visitors: they're excluded from the public view at the database level).
- To add more reps later: Supabase → **Table Editor** → `reps` → **Insert row** (id can be any short unique word, e.g. the last name).

## Troubleshooting

- **"load failed" on the page** → the SQL in Step 1 didn't run fully, or the URL/key in Step 3 is wrong.
- **Sign-in fails** → check the user exists under Authentication → Users and was auto-confirmed.
- **A photo is wrong/missing** → edit that row's `photo` URL in Table Editor. Any member's official portrait is at `https://theunitedstates.io/images/congress/225x275/BIOGUIDE_ID.jpg`: find the Bioguide ID on their congress.gov page.
