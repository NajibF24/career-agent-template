import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { ROOT, readText, readYaml, loadJobs, saveJobs, slugify, log } from "./lib.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";
const MIN_FIT = Number(process.env.MIN_FIT || 4);
const DRAFT_LIMIT = Number(process.env.DRAFT_LIMIT || 8); // per run, highest priority first — keeps OpenAI cost bounded

const SECTIONS = ["cv.md", "cover-letter.md", "email.md"];

export async function draft() {
  const client = new OpenAI();
  const cv = readText("profile/cv.md").split("\n---\n")[0];
  const prefs = readYaml("profile/preferences.yaml");
  const jobs = loadJobs();
  const todo = [...jobs.values()]
    .filter((j) => j.status === "scored" && j.eval?.fit >= MIN_FIT && !j.draft_dir)
    .sort((a, b) => b.priority - a.priority || new Date(b.posted_at || 0) - new Date(a.posted_at || 0))
    .slice(0, DRAFT_LIMIT);
  log(`drafting ${todo.length} applications (fit >= ${MIN_FIT}, limit ${DRAFT_LIMIT})`);

  for (const j of todo) {
    const dir = path.join("applications", `${slugify(j.company)}--${slugify(j.title)}--${j.id}`);
    try {
      const res = await client.responses.create({
        model: MODEL,
        input: [
          { role: "system", content: SYSTEM(prefs) },
          { role: "user", content: `CANDIDATE CV (source of truth — never add facts not in it):\n${cv}\n\nJOB:\nTitle: ${j.title}\nCompany: ${j.company}\nLocation: ${j.location}\nURL: ${j.url}\nKnown gaps (do NOT claim these): ${JSON.stringify(j.eval.missing)}\n\n${j.description}` },
        ],
      });
      const parts = split(res.output_text);
      fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
      for (const name of SECTIONS) fs.writeFileSync(path.join(ROOT, dir, name), parts[name] || "");
      fs.writeFileSync(path.join(ROOT, dir, "job.md"), `# ${j.title} — ${j.company}\n\n${j.url}\n\nLocation: ${j.location}\nFit: ${j.eval.fit} (${j.eval.work_mode})\n\n## Why it fits\n${j.eval.reasons.map((r) => `- ${r}`).join("\n")}\n\n## Gaps\n${j.eval.missing.map((r) => `- ${r}`).join("\n")}\n\n## Posting\n\n${j.description}\n`);
      Object.assign(j, { draft_dir: dir, status: "drafted", drafted_at: new Date().toISOString() });
      log(`drafted ${dir}`);
    } catch (e) {
      log(`draft failed for ${j.url}: ${e.message}`);
    }
    saveJobs(jobs);
  }
}

// Output is three fenced sections: ===== cv.md ===== ... ===== cover-letter.md ===== ... ===== email.md =====
function split(text) {
  const out = {};
  const re = /^=====\s*(cv\.md|cover-letter\.md|email\.md)\s*=====\s*$/gm;
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    out[m[1]] = text.slice(start, end).trim() + "\n";
  });
  return out;
}

const SYSTEM = (prefs) => `You write job-application material for the candidate. Output language: ${prefs.output_language || "English"}.
Hard rules:
- Use ONLY facts, numbers and tools present in the candidate CV. Never invent metrics, employers, certifications or years. If the job asks for something the CV lacks (e.g. CIS benchmarks, CSPM, MDM, GCP, Kyverno/OPA), do not claim it — name it honestly as not yet done; at most mention willingness to learn in the cover letter.
- Tailor: reorder and reword the CV so the most relevant experience for THIS job comes first; keep it one to two pages in Markdown with the same sections (Summary, Experience, Skills, Projects, Certifications, Education). Keep the candidate's contact line.
- Cover letter: max 250 words, specific to the company and role, no clichés, plain confident tone.
- email.md: a short application email (subject line + body, under 120 words) the candidate can paste; attachments assumed to be the CV PDF.
Output EXACTLY three sections separated by lines:
===== cv.md =====
<markdown>
===== cover-letter.md =====
<markdown>
===== email.md =====
<markdown>`;
