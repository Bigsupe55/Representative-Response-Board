-- Representative Response Board: database setup (corrected)
-- Fixes vs SETUP.md: adds the `quotes` jsonb column the page reads/writes,
-- exposes it in public_board, and seeds the current live board data
-- (including Cloud's and Meuser's existing public statements).
-- Run the whole file once in Supabase SQL Editor, or via the management API.

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
revoke all on reps from anon;  -- belt and braces: Supabase default grants + RLS already block rows

-- Signed-in owner: full read/write on the base table
create policy "owner read"   on reps for select to authenticated using (true);
create policy "owner write"  on reps for update to authenticated using (true);
create policy "owner insert" on reps for insert to authenticated with check (true);

-- Anonymous visitors: read the public view only
grant select on public_board to anon;

-- Seed: exact current live board state (all not_contacted, quotes carried over)
insert into reps (id, name, state, role, site, form, phone, photo, quotes) values
('comer',   'Rep. James Comer',            'R-KY', 'Oversight Chair',  'https://comer.house.gov/',   'https://comer.house.gov/contact',   '(202) 225-3115', 'https://theunitedstates.io/images/congress/225x275/C001108.jpg', null),
('cloud',   'Rep. Michael Cloud',          'R-TX', 'Oversight · DOGE', 'https://cloud.house.gov/',   'https://cloud.house.gov/contact',   '(202) 225-7742', 'https://theunitedstates.io/images/congress/225x275/C001115.jpg', $q$[
  {"text":"Americans deserve full transparency on where their tax dollars are going. Tomorrow's @DOGECommittee hearing will begin to tackle 'The War on Waste'. This is only the beginning, but it starts with exposing fraud and improper payments.","date":"Feb 2025","url":""},
  {"text":"The War on Waste is long overdue... Thank you to @DOGECommittee... pushing forward the efforts championed by President Trump and @elonmusk.","date":"2025","url":""},
  {"text":"Empty buildings without workers in them is not a public service to the people who pay taxes. Streamlining our bloated real estate will help eliminate waste, save taxpayer dollars...","date":"","url":""}
]$q$::jsonb),
('fallon',  'Rep. Pat Fallon',             'R-TX', 'Oversight',        'https://fallon.house.gov/',  'https://fallon.house.gov/contact',  '(202) 225-6673', 'https://theunitedstates.io/images/congress/225x275/F000246.jpg', null),
('burchett','Rep. Tim Burchett',           'R-TN', 'Oversight',        'https://burchett.house.gov/','https://burchett.house.gov/contact','',               'https://theunitedstates.io/images/congress/225x275/B001309.jpg', null),
('meuser',  'Rep. Dan Meuser',             'R-PA', 'House Member',     'https://meuser.house.gov/',  'https://meuser.house.gov/contact',  '',               'https://theunitedstates.io/images/congress/225x275/M001204.jpg', $q$[
  {"text":"We reviewed Treasury's actions to combat fraud in Minnesota and other areas... to eliminate waste, fraud, and abuse. We also discussed @POTUS's Anti-Fraud Task Force...","date":"Mar 2026","url":""}
]$q$::jsonb),
('donalds', 'Rep. Byron Donalds',          'R-FL', 'House Member',     'https://donalds.house.gov/', 'https://donalds.house.gov/contact', '',               'https://theunitedstates.io/images/congress/225x275/D000032.jpg', null),
('higgins', 'Rep. Clay Higgins',           'R-LA', 'House Member',     'https://higgins.house.gov/', 'https://higgins.house.gov/contact', '',               'https://theunitedstates.io/images/congress/225x275/H001077.jpg', null),
('biggs',   'Rep. Andy Biggs',             'R-AZ', 'House Member',     'https://biggs.house.gov/',   'https://biggs.house.gov/contact',   '',               'https://theunitedstates.io/images/congress/225x275/B001302.jpg', null),
('greene',  'Rep. Marjorie Taylor Greene', 'R-GA', 'House Member',     'https://greene.house.gov/',  'https://greene.house.gov/contact',  '',               'https://theunitedstates.io/images/congress/225x275/G000596.jpg', null);

-- Verification: expect 9 rows; has_quotes true only for cloud and meuser
select id, status, quotes is not null as has_quotes from public_board order by id;
