import { fetchJson, stripHtml } from "../lib.js";

// Workday CXS: POST https://<tenant>.<wd>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs
export async function workday({ tenant, wd = "wd3", site, company, keywords = ["devops", "cloud", "infrastructure", "security"], with_description = true }) {
  const base = `https://${tenant}.${wd}.myworkdayjobs.com`;
  const seen = new Map();
  for (const kw of keywords) {
    const data = await fetchJson(`${base}/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: kw }),
    });
    for (const j of data.jobPostings || []) {
      if (seen.has(j.externalPath)) continue;
      seen.set(j.externalPath, {
        source: "workday",
        company: company || tenant,
        title: j.title,
        location: j.locationsText || "",
        url: `${base}/en-US/${site}${j.externalPath}`,
        posted_at: null,
        description: j.postedOn || "",
      });
    }
  }
  if (with_description) {
    for (const [path, j] of seen) {
      try {
        const d = await fetchJson(`${base}/wday/cxs/${tenant}/${site}${path}`);
        j.description = stripHtml(d.jobPostingInfo?.jobDescription || "") || j.description;
      } catch { /* keep */ }
    }
  }
  return [...seen.values()];
}
