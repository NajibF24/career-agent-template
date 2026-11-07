import { fetchJson, stripHtml } from "../lib.js";

// https://apply.workable.com/api/v1/widget/accounts/<slug> — list has no description; per-job v2 call fills it.
export async function workable({ slug, company, with_description = true }) {
  const data = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}`);
  const out = (data.jobs || []).map((j) => ({
    source: "workable",
    company: company || data.name || slug,
    title: j.title,
    location: [j.city, j.state, j.country, j.telecommuting ? "Remote" : null].filter(Boolean).join(", "),
    url: j.url || `https://apply.workable.com/${slug}/j/${j.shortcode}/`,
    posted_at: j.published_on || null,
    shortcode: j.shortcode,
    description: "",
  }));
  if (with_description) {
    for (const j of out) {
      if (!/devops|sre|platform|cloud|infra|security|kubernetes|dba|database/i.test(j.title)) { delete j.shortcode; continue; }
      try {
        const d = await fetchJson(`https://apply.workable.com/api/v2/accounts/${slug}/jobs/${j.shortcode}`);
        j.description = stripHtml([d.description, d.requirements, d.benefits].filter(Boolean).join("\n\n"));
      } catch { /* keep empty */ }
      delete j.shortcode;
    }
  }
  return out;
}
