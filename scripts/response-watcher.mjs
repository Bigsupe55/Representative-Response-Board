// Response watcher: checks the submission inbox for replies from congressional
// offices and flips the matching representative to "responded" on the board.
// Runs on a schedule in GitHub Actions (see .github/workflows/response-watcher.yml).
// Every run also touches the database, which doubles as the Supabase free-tier keep-alive.
//
// Env (all required unless noted):
//   SUPABASE_URL, SUPABASE_ANON_KEY   - from index.html (public by design)
//   ADMIN_EMAIL, ADMIN_PASSWORD       - board admin login; writes go through the
//                                       same row-level-security rules as the site
//   GMAIL_ADDRESS, GMAIL_APP_PASSWORD - inbox that receives the offices' replies
//   GITHUB_TOKEN, GITHUB_REPOSITORY   - provided by Actions; used to open issues
//   DRY_RUN        (optional) "true" = log decisions, change nothing
//   SENDER_DOMAIN  (optional) override reply-sender domain filter (default house.gov)

import { pathToFileURL } from "node:url";

const SENDER_DOMAIN = (process.env.SENDER_DOMAIN || "house.gov").toLowerCase();
const DRY_RUN = process.env.DRY_RUN === "true";

// ---------- Supabase ----------

function sb(path) {
  return process.env.SUPABASE_URL.replace(/\/$/, "") + path;
}

async function sbFetch(path, opts = {}, token) {
  const r = await fetch(sb(path), {
    ...opts,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + (token || process.env.SUPABASE_ANON_KEY),
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${path}: HTTP ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

export async function loadBoard() {
  // Doubles as the keep-alive ping.
  return sbFetch("/rest/v1/public_board?select=id,name,status,sent_at&order=id");
}

export async function signIn() {
  const r = await fetch(sb("/auth/v1/token?grant_type=password"), {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`Sign-in failed: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

export async function flipResponded(token, repId, respondedAtIso) {
  return sbFetch(`/rest/v1/reps?id=eq.${repId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "responded", responded_at: respondedAtIso }),
  }, token);
}

// ---------- Classification ----------

const REP_NAMES = {
  comer: /\bcomer\b/i,
  cloud: /\bcloud\b/i,
  fallon: /\bfallon\b/i,
  burchett: /\bburchett\b/i,
  meuser: /\bmeuser\b/i,
  donalds: /\bdonalds\b/i,
  higgins: /\bhiggins\b/i,
  biggs: /\bbiggs\b/i,
  greene: /\bgreene\b/i,
};

// Which rep does this email belong to? Returns { repId } | { ambiguous: [...] } | { unmatched: true }
export function matchRep(email) {
  const haystack = [email.fromName, email.fromAddress, email.subject, (email.text || "").slice(0, 4000)]
    .join("\n");
  const hits = Object.entries(REP_NAMES).filter(([, rx]) => rx.test(haystack)).map(([id]) => id);
  if (hits.length === 1) return { repId: hits[0] };
  if (hits.length > 1) return { ambiguous: hits };
  return { unmatched: true };
}

// Is this a real reply from the office, or an auto-acknowledgment / bulk mail?
// Returns { verdict: "substantive" | "ack" | "bulk", reasons: [...] }
export function classifyEmail(email, sentAtIso) {
  const reasons = [];
  const from = (email.fromAddress || "").toLowerCase();
  const subject = email.subject || "";
  const text = (email.text || "").trim();

  if (email.isBulk) {
    reasons.push("bulk headers (List-Unsubscribe/Precedence)");
    return { verdict: "bulk", reasons };
  }
  if (/no-?reply|donotreply|do-not-reply|auto(mated)?[-_.]?(reply|response|mailer)/.test(from)) {
    reasons.push("no-reply style sender");
    return { verdict: "ack", reasons };
  }

  let ackScore = 0;
  if (/automatic reply|auto-?reply|autoresponder|out of office/i.test(subject)) { ackScore += 3; reasons.push("auto-reply subject"); }
  if (/\b(received your|has been received|thank you for (contacting|reaching out)|confirmation of your (message|submission))\b/i.test(subject + "\n" + text.slice(0, 600))) { ackScore += 1; reasons.push("acknowledgment phrasing"); }
  if (/\b(will (respond|reply|be in touch)|response (shortly|soon|as soon as)|do not reply to this)\b/i.test(text)) { ackScore += 1; reasons.push("we-will-respond phrasing"); }
  if (text.length < 900) { ackScore += 1; reasons.push(`short body (${text.length} chars)`); }
  if (sentAtIso && email.date) {
    const hours = (new Date(email.date) - new Date(sentAtIso)) / 36e5;
    if (hours >= 0 && hours <= 36) { ackScore += 2; reasons.push(`arrived ${hours.toFixed(1)}h after submission`); }
    else reasons.push(`arrived ${(hours / 24).toFixed(1)}d after submission`);
  }
  if (text.length > 1500) { ackScore -= 2; reasons.push("long body suggests substantive reply"); }

  return { verdict: ackScore >= 3 ? "ack" : "substantive", reasons };
}

// ---------- GitHub issues (notification + needs-review queue) ----------

async function gh(path, opts = {}) {
  const r = await fetch("https://api.github.com" + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + process.env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub ${path}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function openIssueOnce(title, body) {
  if (DRY_RUN) { console.log(`DRY RUN: would open issue: ${title}`); return; }
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    console.log(`(no GitHub token; skipping issue: ${title})`);
    return;
  }
  const existing = await gh(`/repos/${process.env.GITHUB_REPOSITORY}/issues?state=all&per_page=100`);
  if (existing.some((i) => i.title === title)) { console.log(`Issue already exists: ${title}`); return; }
  await gh(`/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  console.log(`Opened issue: ${title}`);
}

// ---------- Mail ----------

async function fetchCandidateEmails(sinceDate) {
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });
  await client.connect();
  const out = [];
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ since: sinceDate });
    console.log(`Inbox: ${uids.length} message(s) since ${sinceDate.toISOString().slice(0, 10)}`);
    for await (const msg of client.fetch(uids, { envelope: true, uid: true })) {
      const addr = (msg.envelope.from?.[0]?.address || "").toLowerCase();
      if (!addr.endsWith(SENDER_DOMAIN)) continue;
      const { content } = await client.download(msg.uid, undefined, { uid: true });
      const chunks = [];
      for await (const c of content) chunks.push(c);
      const parsed = await simpleParser(Buffer.concat(chunks));
      out.push({
        uid: msg.uid,
        fromAddress: addr,
        fromName: msg.envelope.from?.[0]?.name || "",
        subject: parsed.subject || msg.envelope.subject || "",
        date: (parsed.date || msg.envelope.date || new Date()).toISOString(),
        text: parsed.text || "",
        isBulk: parsed.headers.has("list-unsubscribe") || /bulk|list/i.test(String(parsed.headers.get("precedence") || "")),
        messageId: parsed.messageId || String(msg.uid),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return out;
}

// ---------- Main ----------

async function main() {
  console.log(`Response watcher starting${DRY_RUN ? " (DRY RUN)" : ""}; sender filter: *${SENDER_DOMAIN}`);
  const board = await loadBoard(); // keep-alive happens here regardless
  console.log("Board:", board.map((r) => `${r.id}:${r.status}`).join(" "));

  const candidates = board.filter((r) => r.status === "awaiting" || r.status === "followed_up");
  if (candidates.length === 0) {
    console.log("No reps awaiting a reply; keep-alive done, nothing to watch.");
    return;
  }

  const earliestSent = candidates.reduce(
    (min, r) => (r.sent_at && r.sent_at < min ? r.sent_at : min),
    candidates[0].sent_at || new Date().toISOString()
  );
  const since = new Date(new Date(earliestSent).getTime() - 24 * 36e5);
  const emails = await fetchCandidateEmails(since);
  console.log(`${emails.length} email(s) from *${SENDER_DOMAIN} in range`);

  let token = null;
  for (const email of emails) {
    const label = `"${email.subject}" from ${email.fromAddress} (${email.date})`;
    const match = matchRep(email);

    if (match.unmatched) {
      console.log(`NEEDS REVIEW (no rep matched): ${label}`);
      await openIssueOnce(
        `[watcher] Reply needs review: ${email.messageId}`,
        `A reply from *${SENDER_DOMAIN} couldn't be matched to a representative.\n\n**From:** ${email.fromName} <${email.fromAddress}>\n**Date:** ${email.date}\n**Subject:** ${email.subject}\n\n${email.text.slice(0, 800)}`
      );
      continue;
    }
    if (match.ambiguous) {
      console.log(`NEEDS REVIEW (matched ${match.ambiguous.join(", ")}): ${label}`);
      await openIssueOnce(
        `[watcher] Reply needs review: ${email.messageId}`,
        `A reply matched multiple representatives (${match.ambiguous.join(", ")}), so nothing was flipped.\n\n**From:** ${email.fromName} <${email.fromAddress}>\n**Date:** ${email.date}\n**Subject:** ${email.subject}\n\n${email.text.slice(0, 800)}`
      );
      continue;
    }

    const rep = board.find((r) => r.id === match.repId);
    if (!rep || (rep.status !== "awaiting" && rep.status !== "followed_up")) {
      console.log(`Skip (rep ${match.repId} is "${rep?.status}"): ${label}`);
      continue;
    }

    const cls = classifyEmail(email, rep.sent_at);
    console.log(`${match.repId}: ${cls.verdict} [${cls.reasons.join("; ")}] :: ${label}`);
    if (cls.verdict !== "substantive") continue;

    if (DRY_RUN) { console.log(`DRY RUN: would flip ${match.repId} to responded at ${email.date}`); continue; }
    token = token || (await signIn());
    await flipResponded(token, match.repId, email.date);
    console.log(`FLIPPED ${match.repId} to responded (${email.date})`);
    await openIssueOnce(
      `[watcher] ${rep.name} marked Responded`,
      `The watcher flipped **${rep.name}** to Responded based on this reply.\n\n**From:** ${email.fromName} <${email.fromAddress}>\n**Date:** ${email.date}\n**Subject:** ${email.subject}\n**Classifier:** ${cls.reasons.join("; ")}\n\n${email.text.slice(0, 800)}\n\n---\nWrong? Open the board, sign in as Admin, and use "Undo / clear entry", then re-log the submission.`
    );
  }
  console.log("Watcher run complete.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error("WATCHER FAILED:", e.message); process.exit(1); });
}
