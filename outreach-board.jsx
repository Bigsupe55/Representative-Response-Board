import { useState, useEffect } from "react";

// ---------- Seed data: House Oversight targets ----------
// Headshots: official congressional portraits (public domain) served by theunitedstates.io,
// keyed by each member's Bioguide ID. Swap any URL if a photo looks outdated or fails to load.
const PHOTO = (bioguide) => `https://theunitedstates.io/images/congress/225x275/${bioguide}.jpg`;

const SEED_REPS = [
  { id: "comer", name: "Rep. James Comer", state: "R-KY", role: "Oversight Chair", site: "https://comer.house.gov/", form: "https://comer.house.gov/contact", phone: "(202) 225-3115", photo: PHOTO("C001108") },
  { id: "cloud", name: "Rep. Michael Cloud", state: "R-TX", role: "Oversight · DOGE", site: "https://cloud.house.gov/", form: "https://cloud.house.gov/contact", phone: "(202) 225-7742", photo: PHOTO("C001115") },
  { id: "fallon", name: "Rep. Pat Fallon", state: "R-TX", role: "Oversight", site: "https://fallon.house.gov/", form: "https://fallon.house.gov/contact", phone: "(202) 225-6673", photo: PHOTO("F000246") },
  { id: "burchett", name: "Rep. Tim Burchett", state: "R-TN", role: "Oversight", site: "https://burchett.house.gov/", form: "https://burchett.house.gov/contact", phone: "", photo: PHOTO("B001309") },
  { id: "meuser", name: "Rep. Dan Meuser", state: "R-PA", role: "House Member", site: "https://meuser.house.gov/", form: "https://meuser.house.gov/contact", phone: "", photo: PHOTO("M001204") },
  { id: "donalds", name: "Rep. Byron Donalds", state: "R-FL", role: "House Member", site: "https://donalds.house.gov/", form: "https://donalds.house.gov/contact", phone: "", photo: PHOTO("D000032") },
  { id: "higgins", name: "Rep. Clay Higgins", state: "R-LA", role: "House Member", site: "https://higgins.house.gov/", form: "https://higgins.house.gov/contact", phone: "", photo: PHOTO("H001077") },
  { id: "biggs", name: "Rep. Andy Biggs", state: "R-AZ", role: "House Member", site: "https://biggs.house.gov/", form: "https://biggs.house.gov/contact", phone: "", photo: PHOTO("B001302") },
  { id: "greene", name: "Rep. Marjorie Taylor Greene", state: "R-GA", role: "House Member", site: "https://greene.house.gov/", form: "https://greene.house.gov/contact", phone: "", photo: PHOTO("G000596") },
];

const DATA_KEY = "outreach-board-data-v1";   // shared: everyone viewing sees the same board
const AUTH_KEY = "outreach-board-auth-v1";   // shared: stores hash of the admin passphrase
const FOLLOWUP_DAYS = 21;

const freshRecord = () => ({ status: "not_contacted", sentAt: null, followupAt: null, respondedAt: null, notes: "" });

const C = {
  ink: "#182338", inkSoft: "#3D4B66", paper: "#EEF1F6", card: "#FFFFFF", line: "#C9D2E0",
  blue: "#2456A6", red: "#B3352C", redBg: "#FBEAE8", green: "#1F6E44", greenBg: "#E5F2EA",
  amber: "#8A5A00", amberBg: "#FBF1DC", grayBg: "#E6EAF1",
};

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const elapsedParts = (fromMs, nowMs) => {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
};
const daysBetween = (a, b) => Math.max(0, Math.round((b - a) / 86400000));
const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function OutreachBoard() {
  const [reps, setReps] = useState(SEED_REPS);
  const [records, setRecords] = useState(null);      // null = loading
  const [now, setNow] = useState(Date.now());
  const [saveState, setSaveState] = useState("idle");

  // auth state: 'unknown' | 'no_pass_set' | 'locked' | 'unlocked'
  const [auth, setAuth] = useState("unknown");
  const [authHash, setAuthHash] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passInput2, setPassInput2] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addFields, setAddFields] = useState({ name: "", state: "", form: "", phone: "", photo: "" });

  const editing = auth === "unlocked";

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---------- load board + auth config ----------
  useEffect(() => {
    (async () => {
      let loaded = {}; let loadedReps = SEED_REPS;
      try {
        const res = await window.storage.get(DATA_KEY, true);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          loaded = data.records || {};
          if (Array.isArray(data.customReps)) loadedReps = [...SEED_REPS, ...data.customReps];
        }
      } catch (e) { /* no board data yet */ }
      const full = {};
      loadedReps.forEach((r) => { full[r.id] = loaded[r.id] || freshRecord(); });
      setReps(loadedReps); setRecords(full);

      try {
        const a = await window.storage.get(AUTH_KEY, true);
        if (a && a.value) { setAuthHash(JSON.parse(a.value).hash); setAuth("locked"); }
        else setAuth("no_pass_set");
      } catch (e) { setAuth("no_pass_set"); }
    })();
  }, []);

  async function persist(nextRecords, nextReps) {
    setSaveState("saving");
    try {
      const customReps = (nextReps || reps).filter((r) => !SEED_REPS.some((s) => s.id === r.id));
      const ok = await window.storage.set(DATA_KEY, JSON.stringify({ records: nextRecords, customReps }), true);
      setSaveState(ok ? "idle" : "error");
    } catch (e) { setSaveState("error"); }
  }

  function update(id, patch) {
    const next = { ...records, [id]: { ...records[id], ...patch } };
    setRecords(next); persist(next);
  }

  // ---------- auth actions ----------
  async function handleSetPass() {
    if (passInput.length < 6) return setAuthMsg("Use at least 6 characters.");
    if (passInput !== passInput2) return setAuthMsg("Passphrases don't match.");
    try {
      const hash = await sha256(passInput);
      await window.storage.set(AUTH_KEY, JSON.stringify({ hash }), true);
      setAuthHash(hash); setAuth("unlocked"); setShowLogin(false); setPassInput(""); setPassInput2(""); setAuthMsg("");
    } catch (e) { setAuthMsg("Couldn't save passphrase: try again."); }
  }

  async function handleLogin() {
    const hash = await sha256(passInput);
    if (hash === authHash) { setAuth("unlocked"); setShowLogin(false); setPassInput(""); setAuthMsg(""); }
    else setAuthMsg("Incorrect passphrase.");
  }

  function addRep() {
    if (!addFields.name.trim()) return;
    const rep = { id: "custom-" + Date.now(), name: addFields.name.trim(), state: addFields.state.trim(), role: "Added manually", site: "", form: addFields.form.trim(), phone: addFields.phone.trim(), photo: addFields.photo.trim() };
    const nextReps = [...reps, rep];
    const nextRecords = { ...records, [rep.id]: freshRecord() };
    setReps(nextReps); setRecords(nextRecords); setShowAdd(false);
    setAddFields({ name: "", state: "", form: "", phone: "", photo: "" });
    persist(nextRecords, nextReps);
  }

  if (!records || auth === "unknown") {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace", color: C.inkSoft }}>
        <style>{FONT_CSS}</style>Loading board…
      </div>
    );
  }

  // ---------- derived ----------
  const list = reps.map((r) => ({ ...r, rec: records[r.id] || freshRecord() }));
  const contacted = list.filter((x) => x.rec.status !== "not_contacted");
  const responded = list.filter((x) => x.rec.status === "responded");
  const awaiting = contacted.filter((x) => x.rec.status !== "responded");
  const avgDays = responded.length ? Math.round(responded.reduce((a, x) => a + daysBetween(x.rec.sentAt, x.rec.respondedAt), 0) / responded.length) : null;
  const longest = awaiting.length ? Math.max(...awaiting.map((x) => daysBetween(x.rec.sentAt, now))) : null;

  const order = { awaiting: 0, followed_up: 0, not_contacted: 2, responded: 3 };
  const sorted = [...list].sort((a, b) => {
    const oa = order[a.rec.status], ob = order[b.rec.status];
    if (oa !== ob) return oa - ob;
    if (oa === 0) return (a.rec.sentAt || 0) - (b.rec.sentAt || 0);
    return 0;
  });

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{FONT_CSS}</style>

      {/* ---------- header ---------- */}
      <header style={{ background: C.ink, color: "#F2F5FA", padding: "26px 20px 22px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.22em", color: "#9FB0CC", textTransform: "uppercase" }}>
              Public response board · 119th Congress · House Oversight
            </div>
            <button
              onClick={() => (editing ? setAuth("locked") : setShowLogin(true))}
              style={{ background: "none", border: "1px solid #3D4B66", color: "#9FB0CC", borderRadius: 6, padding: "5px 11px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {editing ? "⏏ Log out" : "Admin"}
            </button>
          </div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "clamp(30px, 6vw, 44px)", lineHeight: 1.05, margin: "6px 0 0", textTransform: "uppercase" }}>
            Fraud-Elimination Proposal: Who Has Responded?
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginTop: 18 }}>
            <Stat label="Contacted" value={`${contacted.length} / ${list.length}`} />
            <Stat label="Awaiting reply" value={awaiting.length} tone={awaiting.length ? "#F0B4AE" : undefined} />
            <Stat label="Responded" value={responded.length} tone={responded.length ? "#A9D8BC" : undefined} />
            <Stat label="Avg response" value={avgDays == null ? "-" : `${avgDays}d`} />
            <Stat label="Longest silence" value={longest == null ? "-" : `${longest}d`} tone={longest > FOLLOWUP_DAYS ? "#F0B4AE" : undefined} />
          </div>
        </div>
      </header>

      {/* ---------- login / setup modal ---------- */}
      {showLogin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(24,35,56,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: C.card, borderRadius: 10, padding: 22, width: "100%", maxWidth: 380 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, textTransform: "uppercase" }}>
              {auth === "no_pass_set" ? "Set admin passphrase" : "Admin sign-in"}
            </div>
            <p style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.6, margin: "8px 0 14px" }}>
              {auth === "no_pass_set"
                ? "First-time setup: choose a passphrase. You'll need it to edit the board from now on."
                : "Enter the passphrase to unlock editing. Visitors without it see the board read-only."}
            </p>
            <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} placeholder="Passphrase" style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
              onKeyDown={(e) => e.key === "Enter" && (auth === "no_pass_set" ? handleSetPass() : handleLogin())} autoFocus />
            {auth === "no_pass_set" && (
              <input type="password" value={passInput2} onChange={(e) => setPassInput2(e.target.value)} placeholder="Repeat passphrase" style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
                onKeyDown={(e) => e.key === "Enter" && handleSetPass()} />
            )}
            {authMsg && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{authMsg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={auth === "no_pass_set" ? handleSetPass : handleLogin} style={primaryBtn(C.blue)}>
                {auth === "no_pass_set" ? "Set & unlock" : "Unlock"}
              </button>
              <button onClick={() => { setShowLogin(false); setAuthMsg(""); setPassInput(""); setPassInput2(""); }} style={{ ...primaryBtn("#8593AB") }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- body ---------- */}
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "18px 14px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 2px 10px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft }}>
          <span>
            {editing ? <b style={{ color: C.blue }}>EDIT MODE</b> : "Sorted: longest silence first"}
            {saveState === "saving" ? " · saving…" : saveState === "error" ? " · ⚠ save failed" : ""}
          </span>
          {editing && <button onClick={() => setShowAdd((v) => !v)} style={linkBtn}>+ add rep</button>}
        </div>

        {editing && showAdd && (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
              <input value={addFields.name} onChange={(e) => setAddFields({ ...addFields, name: e.target.value })} placeholder="Name (e.g. Rep. Jane Doe)" style={inputStyle} />
              <input value={addFields.state} onChange={(e) => setAddFields({ ...addFields, state: e.target.value })} placeholder="Party-State" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
              <input value={addFields.form} onChange={(e) => setAddFields({ ...addFields, form: e.target.value })} placeholder="Contact form URL" style={inputStyle} />
              <input value={addFields.phone} onChange={(e) => setAddFields({ ...addFields, phone: e.target.value })} placeholder="DC phone" style={inputStyle} />
            </div>
            <input value={addFields.photo} onChange={(e) => setAddFields({ ...addFields, photo: e.target.value })} placeholder="Headshot URL (optional: tip: https://theunitedstates.io/images/congress/225x275/BIOGUIDE_ID.jpg)" style={inputStyle} />
            <div><button onClick={addRep} style={primaryBtn(C.blue)}>Add representative</button></div>
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {sorted.map((x) => (
            <RepCard key={x.id} rep={x} rec={x.rec} now={now} editing={editing}
              open={expanded === x.id}
              onToggle={() => setExpanded(expanded === x.id ? null : x.id)}
              onUpdate={(patch) => update(x.id, patch)} />
          ))}
        </div>

        <div style={{ marginTop: 26, fontSize: 12, color: C.inkSoft, lineHeight: 1.7, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
          <b>Methodology:</b> Each representative was contacted through their official House website contact form regarding a
          proposal to reduce fraud and improper payments. Timers show elapsed time since submission. Automated
          acknowledgment emails do not count as responses: only a substantive reply from the office flips a
          representative to "Responded." Statuses are updated manually by the board owner as replies arrive.
        </div>
      </main>
    </div>
  );
}

// ---------- rep card ----------
function RepCard({ rep, rec, now, editing, open, onToggle, onUpdate }) {
  const [noteDraft, setNoteDraft] = useState(rec.notes);
  useEffect(() => setNoteDraft(rec.notes), [rec.notes]);

  const waitingDays = rec.sentAt ? daysBetween(rec.sentAt, rec.status === "responded" ? rec.respondedAt : now) : null;
  const overdue = rec.status !== "responded" && rec.status !== "not_contacted" && rec.sentAt && waitingDays >= FOLLOWUP_DAYS;

  const badge =
    rec.status === "responded" ? { text: `Responded · ${daysBetween(rec.sentAt, rec.respondedAt)}d`, bg: C.greenBg, fg: C.green }
    : rec.status === "followed_up" ? { text: "Followed up · awaiting", bg: C.amberBg, fg: C.amber }
    : rec.status === "awaiting" ? { text: "Awaiting reply", bg: C.redBg, fg: C.red }
    : { text: "Not yet contacted", bg: C.grayBg, fg: C.inkSoft };

  const clickable = editing || rep.site || rep.form;

  return (
    <div style={{ background: C.card, border: `1px solid ${overdue ? "#E3B7B2" : C.line}`, borderRadius: 8, overflow: "hidden" }}>
      <button onClick={onToggle} disabled={!clickable}
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: clickable ? "pointer" : "default", padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center", fontFamily: "inherit" }}>
        <Avatar rep={rep} dim={rec.status === "responded"} />
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: C.ink }}>{rep.name}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft, marginTop: 2 }}>
            {rep.state}{rep.role ? ` · ${rep.role}` : ""}{rec.sentAt ? ` · contacted ${fmtDate(rec.sentAt)}` : ""}
          </div>
        </div>
        {rec.status !== "not_contacted" && rec.status !== "responded" && <Ticker fromMs={rec.sentAt} nowMs={now} alarm={overdue} />}
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 99, background: badge.bg, color: badge.fg, whiteSpace: "nowrap" }}>
          {badge.text}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: "14px 16px", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {rep.form && <a href={rep.form} target="_blank" rel="noreferrer" style={ghostBtn}>Contact form ↗</a>}
            {rep.site && <a href={rep.site} target="_blank" rel="noreferrer" style={ghostBtn}>Website ↗</a>}
            {rep.phone && <span style={{ ...ghostBtn, cursor: "default" }}>DC {rep.phone}</span>}
          </div>

          {editing && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {rec.status === "not_contacted" && (
                  <button onClick={() => onUpdate({ status: "awaiting", sentAt: Date.now() })} style={primaryBtn(C.blue)}>Log submission (now)</button>
                )}
                {(rec.status === "awaiting" || rec.status === "followed_up") && (
                  <>
                    <button onClick={() => onUpdate({ status: "responded", respondedAt: Date.now() })} style={primaryBtn(C.green)}>Mark responded</button>
                    {rec.status === "awaiting" && (
                      <button onClick={() => onUpdate({ status: "followed_up", followupAt: Date.now() })} style={primaryBtn(C.amber)}>Log follow-up call</button>
                    )}
                  </>
                )}
                {rec.status !== "not_contacted" && (
                  <button onClick={() => onUpdate(freshRecord())} style={{ ...ghostBtn, border: `1px solid ${C.line}`, background: "none", cursor: "pointer" }}>Undo / clear entry</button>
                )}
              </div>

              {rec.sentAt && (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft, lineHeight: 1.8 }}>
                  Submitted: {fmtDate(rec.sentAt)}
                  {rec.followupAt && <> · Follow-up: {fmtDate(rec.followupAt)}</>}
                  {rec.respondedAt && <> · Responded: {fmtDate(rec.respondedAt)}</>}
                </div>
              )}

              <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={() => noteDraft !== rec.notes && onUpdate({ notes: noteDraft })}
                placeholder="Private admin notes: confirmation number, screenshot filename, reply summary…"
                rows={3} style={{ ...inputStyle, width: "100%", resize: "vertical", fontSize: 13 }} />
            </>
          )}

          {!editing && rec.followupAt && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft }}>
              Phone follow-up made: {fmtDate(rec.followupAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- headshot avatar (falls back to initials if photo missing/broken) ----------
function Avatar({ rep, dim }) {
  const [broken, setBroken] = useState(false);
  const initials = rep.name.replace(/^Rep\.\s*/i, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const frame = {
    width: 52, height: 62, borderRadius: 6, flexShrink: 0,
    border: `1px solid ${C.line}`, background: C.grayBg, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  if (!rep.photo || broken) {
    return (
      <div style={frame} aria-hidden="true">
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, color: C.inkSoft }}>{initials}</span>
      </div>
    );
  }
  return (
    <div style={frame}>
      <img src={rep.photo} alt={`Official portrait of ${rep.name}`} onError={() => setBroken(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", filter: dim ? "grayscale(35%)" : "none" }} />
    </div>
  );
}

// ---------- ticking counter ----------
function Ticker({ fromMs, nowMs, alarm }) {
  const { d, h, m, s } = elapsedParts(fromMs, nowMs);
  const seg = (v, unit) => (
    <span style={{ display: "inline-flex", alignItems: "baseline" }}>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{unit === "d" ? v : pad(v)}</span>
      <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 1 }}>{unit}</span>
    </span>
  );
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: alarm ? C.red : C.ink, background: alarm ? C.redBg : C.grayBg, border: `1px solid ${alarm ? "#E3B7B2" : C.line}`, borderRadius: 6, padding: "5px 10px", display: "inline-flex", gap: 7, whiteSpace: "nowrap" }}
      aria-label={`${d} days ${h} hours ${m} minutes waiting`}>
      {seg(d, "d")}{seg(h, "h")}{seg(m, "m")}{seg(s, "s")}
    </span>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: tone || "#F2F5FA", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8FA0BE", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ---------- shared styles ----------
const FONT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; }
  button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #2456A6; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

const inputStyle = { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 13, padding: "9px 11px", border: `1px solid ${C.line}`, borderRadius: 6, background: "#FBFCFE", color: C.ink };
const linkBtn = { background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.blue, textDecoration: "underline" };
const ghostBtn = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.blue, padding: "7px 12px", borderRadius: 6, background: C.grayBg, textDecoration: "none", display: "inline-flex", alignItems: "center" };
const primaryBtn = (bg) => ({ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: 600, fontSize: 13, color: "#fff", background: bg, border: "none", borderRadius: 6, padding: "9px 14px", cursor: "pointer" });
