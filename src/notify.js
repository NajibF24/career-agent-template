import { loadJobs, saveJobs, log } from "./lib.js";

// Telegram summary of jobs scored since the last notification. Remote/WFH first, then by fit.
export async function notify() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  const jobs = loadJobs();
  const fresh = [...jobs.values()]
    .filter((j) => (j.status === "scored" || j.status === "drafted") && !j.notified_at)
    .sort((a, b) => b.priority - a.priority || new Date(b.posted_at || 0) - new Date(a.posted_at || 0));
  if (!fresh.length) { log("nothing to notify"); return; }

  const repo = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}/tree/main/` : "";
  const lines = fresh.slice(0, 20).map((j) => {
    const e = j.eval;
    const mode = e.work_mode === "onsite" || e.work_mode === "unknown" ? "" : ` · ${e.work_mode.toUpperCase()}`;
    const draft = j.draft_dir ? `\n   ✍️ draft: ${repo}${j.draft_dir}` : "";
    const age = j.posted_at ? ` · ${Math.max(0, Math.round((Date.now() - new Date(j.posted_at)) / 86_400_000))}d` : "";
    return `${badge(e.fit)} <b>${esc(j.title)}</b> — ${esc(j.company)}\n   ${esc(j.location || e.country)}${mode}${age}${e.salary ? ` · ${esc(e.salary)}` : ""}\n   fit ${e.fit}/5 · ${esc(e.reasons[0] || "")}\n   ${j.url}${draft}`;
  });
  const text = `<b>Job scan ${new Date().toISOString().slice(0, 10)}</b> — ${fresh.length} new in scope\n\n${lines.join("\n\n")}`;

  if (!token || !chat) { log("TELEGRAM_* not set; printing instead\n" + text); }
  else {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`telegram ${res.status}: ${await res.text()}`);
    log(`telegram sent (${fresh.length} jobs)`);
  }
  const now = new Date().toISOString();
  for (const j of fresh) j.notified_at = now;
  saveJobs(jobs);
}

const badge = (fit) => (fit >= 4.5 ? "🟢" : fit >= 4 ? "🟡" : "⚪");
const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
