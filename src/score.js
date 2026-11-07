import OpenAI from "openai";
import { readText, readYaml, loadJobs, saveJobs, log } from "./lib.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["in_scope", "country", "work_mode", "seniority", "fit", "reasons", "missing", "salary"],
  properties: {
    in_scope: { type: "boolean", description: "true only if located in Indonesia, or remote and open to Indonesia-based candidates" },
    country: { type: "string" },
    work_mode: { type: "string", enum: ["remote", "wfh", "hybrid", "onsite", "unknown"] },
    seniority: { type: "string", enum: ["junior", "mid", "senior", "lead", "unknown"] },
    fit: { type: "number", description: "1.0-5.0 how well the CV matches the requirements" },
    reasons: { type: "array", items: { type: "string" }, description: "3 short bullets why it fits" },
    missing: { type: "array", items: { type: "string" }, description: "requirements the CV does not show" },
    salary: { type: "string", description: "salary text if stated, else empty" },
  },
};

export async function score() {
  const client = new OpenAI();
  const cv = readText("profile/cv.md").split("\n---\n")[0];
  const prefs = readYaml("profile/preferences.yaml");
  const jobs = loadJobs();
  const todo = [...jobs.values()].filter((j) => j.status === "new");
  log(`scoring ${todo.length} jobs with ${MODEL}`);

  for (const j of todo) {
    try {
      const res = await client.responses.create({
        model: MODEL,
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `PREFERENCES (YAML):\n${JSON.stringify(prefs, null, 1)}\n\nCV:\n${cv}\n\nJOB:\nTitle: ${j.title}\nCompany: ${j.company}\nLocation: ${j.location}\nURL: ${j.url}\n\n${j.description || "(no description available)"}` },
        ],
        text: { format: { type: "json_schema", name: "job_score", strict: true, schema: SCHEMA } },
      });
      const out = JSON.parse(res.output_text);
      Object.assign(j, { eval: out, priority: priority(out, prefs, j.posted_at), status: out.in_scope ? "scored" : "out_of_scope", scored_at: new Date().toISOString() });
      log(`${out.in_scope ? out.fit.toFixed(1) : "--- "} ${j.company} — ${j.title} [${out.work_mode}]`);
    } catch (e) {
      log(`score failed for ${j.url}: ${e.message}`);
    }
    saveJobs(jobs);
  }
}

// Sort key: remote/WFH first (user priority), then fit, then recency (newest first).
function priority(e, prefs, posted_at) {
  const order = prefs.priority_order || [];
  const mode = e.work_mode === "wfh" ? "wfh" : e.work_mode === "remote" ? "remote" : e.work_mode === "hybrid" ? "hybrid" : "jakarta_onsite";
  const idx = order.indexOf(mode);
  const modeBoost = idx < 0 ? 0 : (order.length - idx) * 0.15; // remote +0.75, wfh +0.6, hybrid +0.45, onsite +0.3
  const ageDays = posted_at ? Math.min(30, Math.max(0, (Date.now() - new Date(posted_at)) / 86_400_000)) : 15;
  const agePenalty = (ageDays / 30) * 0.3; // up to -0.3 for a 30-day-old posting
  return +(e.fit + modeBoost - agePenalty).toFixed(2);
}

const SYSTEM = `You are a strict recruiter screening one job posting for one candidate.
Rules:
- in_scope = true only if the job is located in Indonesia, OR it is remote/WFH and explicitly or plausibly open to candidates living in Indonesia (regions: Indonesia, Southeast Asia, APAC, Asia, worldwide). A job in Singapore/US/EU that requires being there, or "remote (US only)", is NOT in scope.
- Jobs in Indonesian often say "WFH", "remote", "hybrid", "kerja dari rumah". Map them to work_mode.
- fit: 5 = candidate meets every requirement AND the role is a clear step up or equal (senior/mid platform, DevSecOps, SRE, cloud security at a company with real engineering scale); 4 = meets nearly all, small gaps; 3 = meets core but notable gaps, OR the role is clearly below the candidate's level (generic junior "DevOps Engineer" at a small outsourcing/staffing firm, contract-only, or a vague posting with no tech stack); 2 = weak; 1 = unrelated. Be stingy: 5 should be rare (at most 1 in 10). Senior roles asking for things the CV lacks (e.g. CIS benchmarks, MDM, GCP) lose points for each gap. Staffing/outsourcing agencies and postings that hide the employer cap at 3.5.
- Match title/level against preferences.target_titles and seniority. Internship/unpaid = fit 1.
- Keep reasons and missing concrete (cite tools/requirements), max 3 items each, in English.`;
