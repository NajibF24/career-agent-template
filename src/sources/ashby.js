import { fetchJson, stripHtml } from "../lib.js";

// https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true
export async function ashby({ slug, company }) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  return (data.jobs || []).map((j) => ({
    source: "ashby",
    company: company || slug,
    title: j.title,
    location: [j.location, j.isRemote ? "Remote" : null].filter(Boolean).join(" · "),
    url: j.jobUrl,
    posted_at: j.publishedAt || null,
    description: stripHtml(j.descriptionHtml || j.descriptionPlain || ""),
  }));
}
