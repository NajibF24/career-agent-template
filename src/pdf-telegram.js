// Renders a draft's CV + cover letter to PDF and sends both to the owner's Telegram chat. Run by pdf.yml after /pdf <id>.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadJobs } from "./lib.js";
import { renderDraftPdfs } from "./pdf.js";

const [, , jobId] = process.argv;
const job = loadJobs().get(jobId);
if (!job?.draft_dir) throw new Error(`job ${jobId} not found or has no draft`);

const files = await renderDraftPdfs(path.join(ROOT, job.draft_dir));
const api = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

await fetch(`${api}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `📄 ${job.title} — ${job.company}\n${job.url}`, disable_web_page_preview: true }) });
for (const file of Object.values(files)) {
  const form = new FormData();
  form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  form.append("document", new Blob([fs.readFileSync(file)], { type: "application/pdf" }), path.basename(file));
  const r = await fetch(`${api}/sendDocument`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`sendDocument ${r.status}: ${await r.text()}`);
}
console.log("sent", Object.values(files).map((f) => path.basename(f)).join(", "));
