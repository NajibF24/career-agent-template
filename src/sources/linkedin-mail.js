import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { stripHtml, log } from "../lib.js";

// Reads LinkedIn "Job Alert" emails from a Gmail inbox (IMAP + App Password).
// Jobs are deduplicated by canonical URL downstream, so re-reading old mails is harmless.
// Never follows the raw /comm/ links: their otpToken/midToken sign in as the mailbox owner.
const SENDER = "jobalerts-noreply@linkedin.com";
const ID_RE = /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/g;

export async function linkedinMail({ days = 14, fetch_description = true } = {}) {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) { log("linkedin-mail: GMAIL_USER/GMAIL_APP_PASSWORD not set, skipping"); return []; }

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  const jobs = new Map();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const uids = await client.search({ from: SENDER, since }, { uid: true });
    if (!uids) return [];
    for await (const msg of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
      const mail = await simpleParser(msg.source);
      for (const j of parseAlert(mail.text || stripHtml(mail.html || ""))) if (!jobs.has(j.url)) jobs.set(j.url, j);
    }
  } finally {
    lock.release();
    await client.logout();
  }

  const out = [...jobs.values()];
  if (fetch_description) for (const j of out) j.description = (await guestDescription(j.id)) || j.description;
  return out;
}

// Plain-text layout: title / company / location / [badge] / "View job: <url>" per job.
function parseAlert(text) {
  const lines = text.split("\n").map((l) => l.trim());
  const out = [];
  lines.forEach((line, i) => {
    const m = /jobs\/view\/(\d+)/.exec(line);
    if (!m || !/view job/i.test(line)) return;
    const prev = lines.slice(Math.max(0, i - 5), i).filter((l) => l && !/^(actively hiring|promoted|easy apply|\d+ (applicants|connections))/i.test(l));
    const [title = "", company = "", location = ""] = prev.slice(-3);
    out.push({ source: "linkedin", id: m[1], title, company, location, url: `https://www.linkedin.com/jobs/view/${m[1]}/`, posted_at: null, description: `${title}\n${company}\n${location}` });
  });
  return out;
}

// Best-effort guest fetch of the posting text; falls back to the email snippet on block/429.
async function guestDescription(id) {
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36", "accept-language": "en-US,en;q=0.9,id;q=0.8" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 200) return "";
    const html = await res.text();
    const m = /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    return m ? stripHtml(m[1]) : "";
  } catch {
    return "";
  }
}
