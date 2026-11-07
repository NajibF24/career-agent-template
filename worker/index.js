// Cloudflare Worker: Telegram webhook bot + web dashboard. No server to keep alive.
// Secrets (wrangler secret put): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, OPENAI_API_KEY, GITHUB_TOKEN, WEBHOOK_SECRET, DASH_KEY
// Vars (wrangler.toml): GITHUB_REPO (owner/name), REPO_URL
import { handle, dashboardRows, esc } from "../src/query.js";
import html from "../web/index.html";

let cache = { at: 0, jobs: [] };

async function loadJobs(env) {
  if (Date.now() - cache.at < 10 * 60_000) return cache.jobs;
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/jobs.jsonl?ref=main`, {
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github.raw+json", "user-agent": "career-agent-worker" },
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const map = new Map();
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    const j = JSON.parse(line);
    map.set(j.id, { ...(map.get(j.id) || {}), ...j });
  }
  cache = { at: Date.now(), jobs: [...map.values()] };
  return cache.jobs;
}

async function sendTelegram(env, chat_id, text) {
  for (let i = 0; i < text.length; i += 3900) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id, text: text.slice(i, i + 3900), parse_mode: "HTML", disable_web_page_preview: true }),
    });
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const opts = {
      repoUrl: env.REPO_URL || "", openaiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || "gpt-4.1-mini",
      // Sending runs in GitHub Actions (send.yml): needs GITHUB_TOKEN with Actions: write.
      dispatch: async (job, to, workflow = "send.yml") => {
        const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
          method: "POST",
          headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "career-agent-worker" },
          body: JSON.stringify({ ref: "main", inputs: to ? { job_id: job.id, to } : { job_id: job.id } }),
        });
        if (r.status !== 204) throw new Error(`workflow dispatch ${r.status}: ${(await r.text()).slice(0, 120)} — GITHUB_TOKEN butuh izin Actions: write`);
      },
    };

    // Telegram webhook
    if (url.pathname === "/telegram" && req.method === "POST") {
      if (req.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
      const update = await req.json();
      const m = update.message;
      if (m?.text) {
        const chat = m.chat.id;
        const work = (async () => {
          if (String(chat) !== String(env.TELEGRAM_CHAT_ID)) return sendTelegram(env, chat, "Bot pribadi.");
          try { await sendTelegram(env, chat, await handle(m.text, await loadJobs(env), opts)); }
          catch (e) { await sendTelegram(env, chat, `Error: ${esc(e.message)}`); }
        })();
        ctx.waitUntil(work);
      }
      return new Response("ok");
    }

    // Dashboard (key in query string, kept by the page for its API call)
    if (url.searchParams.get("k") !== env.DASH_KEY) return new Response("not found", { status: 404 });
    if (url.pathname === "/api/jobs") {
      return Response.json(dashboardRows(await loadJobs(env), opts.repoUrl), { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  },
};
