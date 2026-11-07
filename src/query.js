// Runtime-neutral query logic shared by src/bot.js (Node server) and worker/index.js (Cloudflare Worker).
// Input is always the parsed jobs array; OpenAI is called with plain fetch.

export const inScope = (jobs) => jobs.filter((j) => j.eval && j.status !== "out_of_scope");
export const byPriority = (a, b) => b.priority - a.priority || new Date(b.posted_at || 0) - new Date(a.posted_at || 0);
export const byNewest = (a, b) => new Date(b.posted_at || b.found_at) - new Date(a.posted_at || a.found_at);
export const ageDays = (j) => (j.posted_at ? Math.max(0, Math.round((Date.now() - new Date(j.posted_at)) / 86_400_000)) : null);
export const isRemote = (j) => ["remote", "wfh", "hybrid"].includes(j.eval.work_mode);
export const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const badge = (fit) => (fit >= 4.5 ? "🟢" : fit >= 4 ? "🟡" : "⚪");

export function fmt(j, i, repoUrl = "") {
  const e = j.eval;
  const age = ageDays(j);
  const mode = e.work_mode === "onsite" || e.work_mode === "unknown" ? "" : ` · ${e.work_mode.toUpperCase()}`;
  const draft = j.draft_dir ? `\n   ✍️ ${repoUrl ? `${repoUrl}/tree/main/` : ""}${j.draft_dir}` : "";
  const sent = j.status === "applied" ? " · ✅ sent" : "";
  return `${i + 1}. ${badge(e.fit)} <b>${esc(j.title)}</b> — ${esc(j.company)}\n   ${esc(j.location || e.country)}${mode}${age === null ? "" : ` · ${age}d`} · fit ${e.fit}${sent} · <code>${j.id}</code>\n   ${j.url}${draft}`;
}
const list = (title, jobs, repoUrl) => (jobs.length ? `<b>${title}</b>\n\n${jobs.map((j, i) => fmt(j, i, repoUrl)).join("\n\n")}` : `${title}: tidak ada.`);

export const HELP = "Perintah:\n/top [n] — paling cocok (remote dulu, lalu skor, lalu terbaru)\n/baru — ditemukan 2 hari terakhir\n/remote — remote / WFH / hybrid saja\n/cari kata — cari judul/perusahaan\n/pdf id — kirim CV + cover letter (PDF) ke chat ini untuk diunggah manual\n/kirim id email@hrd.com — kirim lamaran (CV PDF + surat) ke alamat itu; bot minta konfirmasi dulu\nAtau tanya bebas, mis. \"loker remote paling cocok minggu ini?\"";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns HTML-formatted Telegram text. opts.dispatch(job, to) actually sends (worker: GitHub workflow_dispatch).
export async function handle(text, allJobs, { repoUrl = "", openaiKey, model = "gpt-4.1-mini", dispatch } = {}) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ");
  const jobs = inScope(allJobs);
  switch (cmd.toLowerCase().replace(/@\w+$/, "")) {
    case "/start":
    case "/help":
      return HELP;
    case "/pdf": {
      const j = allJobs.find((x) => x.id === rest[0]);
      if (!j) return `Job <code>${esc(rest[0] || "?")}</code> tidak ditemukan. Format: /pdf &lt;id&gt;`;
      if (!j.draft_dir) return `Belum ada draf untuk ${esc(j.company)} — ${esc(j.title)} (fit ${j.eval.fit}).`;
      if (!dispatch) return "Pembuatan PDF belum dikonfigurasi di runtime ini.";
      await dispatch(j, null, "pdf.yml");
      return `Membuat PDF untuk ${esc(j.company)} — ${esc(j.title)}; CV dan cover letter dikirim ke sini dalam ±2 menit.`;
    }
    case "/kirim":
    case "/ya": {
      const [id, to] = rest;
      const j = allJobs.find((x) => x.id === id);
      if (!j) return `Job <code>${esc(id || "?")}</code> tidak ditemukan. Format: /kirim &lt;id&gt; &lt;email&gt; — id ada di tiap baris hasil /top.`;
      if (!to || !EMAIL_RE.test(to)) return "Alamat email tujuan tidak valid. Format: /kirim &lt;id&gt; &lt;email&gt;";
      if (!j.draft_dir) return `Belum ada draf untuk ${esc(j.company)} — ${esc(j.title)} (fit ${j.eval.fit}). Draf dibuat otomatis untuk fit ≥ 4.`;
      if (cmd.toLowerCase() === "/kirim") {
        return `Akan mengirim lamaran:\n• Ke: <code>${esc(to)}</code>\n• Posisi: <b>${esc(j.title)}</b> — ${esc(j.company)}\n• Lampiran: CV (PDF) + cover letter (PDF) dari ${repoUrl}/tree/main/${j.draft_dir}\n• Isi email: email.md di folder itu\n\nCek dulu drafnya, lalu balas:\n<code>/ya ${j.id} ${to}</code>`;
      }
      if (!dispatch) return "Pengiriman belum dikonfigurasi di runtime ini.";
      await dispatch(j, to);
      return `Dikirim ke antrean. Email ke ${esc(to)} untuk ${esc(j.company)} dikirim dalam ±2 menit; bot akan konfirmasi setelah terkirim.`;
    }
    case "/top": {
      const n = Math.min(Number(arg) || 10, 25);
      return list(`Top ${n}`, jobs.sort(byPriority).slice(0, n), repoUrl);
    }
    case "/baru": {
      const since = Date.now() - 2 * 86_400_000;
      return list("Baru (2 hari)", jobs.filter((j) => new Date(j.found_at) >= since).sort(byPriority).slice(0, 25), repoUrl);
    }
    case "/remote":
      return list("Remote / WFH / hybrid", jobs.filter(isRemote).sort(byPriority).slice(0, 25), repoUrl);
    case "/cari": {
      const q = arg.toLowerCase();
      return list(`Cari "${arg}"`, jobs.filter((j) => `${j.title} ${j.company}`.toLowerCase().includes(q)).sort(byNewest).slice(0, 25), repoUrl);
    }
    default:
      return ask(text, jobs, openaiKey, model);
  }
}

async function ask(question, jobs, openaiKey, model) {
  if (!openaiKey) return "OPENAI_API_KEY belum diset; pakai /top, /baru, /remote, /cari.";
  const top = jobs.sort(byPriority).slice(0, 60).map((j, i) => ({
    n: i + 1, title: j.title, company: j.company, location: j.location, mode: j.eval.work_mode, fit: j.eval.fit,
    age_days: ageDays(j), salary: j.eval.salary || undefined, why: j.eval.reasons.slice(0, 2), gaps: j.eval.missing.slice(0, 2), url: j.url, draft: !!j.draft_dir,
  }));
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: "You are the user's job-search assistant. Answer in Bahasa Indonesia, concise, using ONLY the job list given (JSON). When recommending jobs, list at most 8, each on its own line as: '<n>. <title> — <company> (<mode>, fit <fit>, <age_days>d) <url>'. Prefer remote/WFH, then higher fit, then newer. If nothing matches, say so. No HTML or markdown." },
        { role: "user", content: `Jobs (sorted by priority):\n${JSON.stringify(top)}\n\nQuestion: ${question}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.output || []).flatMap((o) => o.content || []).map((c) => c.text || "").join("");
  return esc(text || "(kosong)");
}

// Rows for the dashboard (/api/jobs).
export const dashboardRows = (allJobs, repoUrl = "") =>
  inScope(allJobs).sort(byPriority).map((j) => ({
    id: j.id, title: j.title, company: j.company, location: j.location, url: j.url, source: j.source, posted_at: j.posted_at, found_at: j.found_at,
    fit: j.eval.fit, mode: j.eval.work_mode, country: j.eval.country, seniority: j.eval.seniority, salary: j.eval.salary, reasons: j.eval.reasons, missing: j.eval.missing, priority: j.priority,
    draft: j.draft_dir ? `${repoUrl}/tree/main/${j.draft_dir}` : null,
  }));
