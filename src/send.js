// Sends one application email with CV + cover letter PDFs. Run by .github/workflows/send.yml after /ya in Telegram.
//   node src/send.js <job_id> <to>
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { renderDraftPdfs } from "./pdf.js";
import { ROOT, TRACKER_FILE, readYaml, loadJobs, saveJobs, log } from "./lib.js";

const [, , jobId, to] = process.argv;
if (!jobId || !to) { console.error("usage: node src/send.js <job_id> <to>"); process.exit(1); }

const jobs = loadJobs();
const job = jobs.get(jobId);
if (!job?.draft_dir) throw new Error(`job ${jobId} not found or has no draft`);
const dir = path.join(ROOT, job.draft_dir);
const prefs = readYaml("profile/preferences.yaml");
const name = prefs.candidate_name || "Candidate";

// email.md: "Subject: ..." line (or first line) + body
const emailMd = fs.readFileSync(path.join(dir, "email.md"), "utf8").trim();
const lines = emailMd.split("\n");
const subjIdx = lines.findIndex((l) => /^\**\s*(subject|subjek)\s*\**\s*[:\-]/i.test(l));
const subject = (subjIdx >= 0 ? lines[subjIdx].replace(/^\**\s*(subject|subjek)\s*\**\s*[:\-]\s*/i, "") : lines[0]).replace(/\*\*/g, "").trim();
const body = lines.filter((_, i) => i !== (subjIdx >= 0 ? subjIdx : 0)).join("\n").replace(/^\s*(body|isi)\s*:\s*/i, "").trim();

const { cv: cvPdf, cover: clPdf } = await renderDraftPdfs(dir);

const transport = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
const info = await transport.sendMail({
  from: `"${name}" <${process.env.GMAIL_USER}>`,
  to,
  subject,
  text: body,
  attachments: [{ filename: path.basename(cvPdf), path: cvPdf }, { filename: path.basename(clPdf), path: clPdf }],
});
log(`sent ${info.messageId} to ${to}`);

// record
Object.assign(job, { status: "applied", applied_at: new Date().toISOString(), applied_to: to });
saveJobs(jobs);
fs.appendFileSync(TRACKER_FILE, `${new Date().toISOString().slice(0, 10)}\t${job.company}\t${job.title}\t${job.url}\tapplied\tfollow up ${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}\tsent to ${to} via bot\n`);
fs.rmSync(cvPdf, { force: true }); fs.rmSync(clPdf, { force: true }); // PDFs are git-ignored anyway

if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `✅ Lamaran terkirim ke ${to}\n${job.title} — ${job.company}\nSubjek: ${subject}\nFollow-up: ${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}`, disable_web_page_preview: true }),
  });
}
