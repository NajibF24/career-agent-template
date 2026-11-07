import { readYaml, loadJobs, saveJobs, jobId, slugify, log } from "./lib.js";
import { greenhouse } from "./sources/greenhouse.js";
import { lever } from "./sources/lever.js";
import { ashby } from "./sources/ashby.js";
import { jobstreet } from "./sources/jobstreet.js";
import { kalibrr } from "./sources/kalibrr.js";
import { smartrecruiters } from "./sources/smartrecruiters.js";
import { workable } from "./sources/workable.js";
import { manatal } from "./sources/manatal.js";
import { workday } from "./sources/workday.js";
import { vidio } from "./sources/vidio.js";
import { ruangguru } from "./sources/ruangguru.js";
import { blibli } from "./sources/blibli.js";
import { linkedinMail } from "./sources/linkedin-mail.js";

const PROVIDERS = { greenhouse, lever, ashby, jobstreet, kalibrr, smartrecruiters, workable, manatal, workday, vidio, ruangguru, blibli, "linkedin-mail": linkedinMail };

// Cheap pre-filter so the LLM only sees plausible roles.
const TITLE_RE = /devops|devsecops|sre|site reliability|platform|cloud|infrastructure|infra\b|kubernetes|security engineer|database reliability|dba/i;
const MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS || 30);

export async function scan() {
  const { sources } = readYaml("sources.yaml");
  const jobs = loadJobs();
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const dupKey = (j) => slugify(`${j.company} ${j.title}`);
  const seenKeys = new Set([...jobs.values()].map(dupKey));
  let added = 0;
  for (const src of sources) {
    if (src.enabled === false) continue;
    const fn = PROVIDERS[src.provider];
    if (!fn) { log(`skip ${src.name}: unknown provider ${src.provider}`); continue; }
    try {
      const found = await fn(src);
      let kept = 0;
      for (const j of found) {
        if (!j.url || !j.title) continue;
        if (!TITLE_RE.test(j.title)) continue;
        if (j.posted_at && new Date(j.posted_at).getTime() < cutoff) continue; // older than 30 days; undated jobs are kept
        const id = jobId(j.url);
        if (jobs.has(id)) continue;
        const key = dupKey(j);
        if (seenKeys.has(key)) continue; // same company + title already seen via another source
        seenKeys.add(key);
        jobs.set(id, { id, ...j, description: (j.description || "").slice(0, 12_000), found_at: new Date().toISOString(), status: "new" });
        kept++; added++;
      }
      log(`${src.name}: ${found.length} fetched, ${kept} new`);
    } catch (e) {
      log(`${src.name}: FAILED ${e.message}`);
    }
  }
  saveJobs(jobs);
  log(`scan done: ${added} new jobs, ${jobs.size} total`);
  return added;
}
