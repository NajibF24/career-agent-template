// Long-running Telegram bot + web dashboard for a VM. Run: npm run bot  (needs TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, OPENAI_API_KEY)
// Reads data/jobs.jsonl (refreshed by `git pull` every 30 min when PULL_INTERVAL_MIN > 0).
// Query logic lives in src/query.js and is shared with the Cloudflare Worker in worker/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { ROOT, loadJobs, log } from "./lib.js";
import { handle, dashboardRows, esc } from "./query.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER = String(process.env.TELEGRAM_CHAT_ID || "");
const PORT = Number(process.env.PORT || 8080);
const PULL_MIN = Number(process.env.PULL_INTERVAL_MIN ?? 30);
const OPTS = { repoUrl: process.env.REPO_URL || "", openaiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-4.1-mini" };
const API = `https://api.telegram.org/bot${TOKEN}`;
if (!TOKEN || !OWNER) { console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required"); process.exit(1); }

const jobs = () => [...loadJobs().values()];

// ---------- telegram long polling ----------
async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}
async function send(chat_id, text) {
  for (let i = 0; i < text.length; i += 3900) await tg("sendMessage", { chat_id, text: text.slice(i, i + 3900), parse_mode: "HTML", disable_web_page_preview: true });
}
async function poll() {
  let offset = 0;
  try {
    await tg("setMyCommands", { commands: [["top", "paling cocok"], ["baru", "2 hari terakhir"], ["remote", "remote / WFH"], ["cari", "cari kata"], ["help", "bantuan"]].map(([command, description]) => ({ command, description })) });
  } catch (e) { log("setMyCommands failed:", e.message); }
  log("bot polling");
  for (;;) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m?.text) continue;
        if (String(m.chat.id) !== OWNER) { await send(m.chat.id, "Bot pribadi."); continue; }
        try { await send(m.chat.id, await handle(m.text, jobs(), OPTS)); }
        catch (e) { log("handle error", e.message); await send(m.chat.id, `Error: ${esc(e.message)}`); }
      }
    } catch (e) {
      log("poll error", e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ---------- web dashboard ----------
const INDEX = path.join(ROOT, "web", "index.html");
http.createServer((req, res) => {
  if (req.url?.startsWith("/api/jobs")) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(dashboardRows(jobs(), OPTS.repoUrl)));
  }
  if (req.url?.split("?")[0] === "/" || req.url?.startsWith("/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return fs.createReadStream(INDEX).pipe(res);
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => log(`dashboard on http://localhost:${PORT}`));

// ---------- keep data fresh from the repo ----------
if (PULL_MIN > 0 && fs.existsSync(path.join(ROOT, ".git"))) {
  setInterval(() => execFile("git", ["-C", ROOT, "pull", "-q", "--ff-only"], (err) => err && log("git pull failed:", err.message)), PULL_MIN * 60_000);
}

poll();
