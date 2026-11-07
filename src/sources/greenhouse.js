import { fetchJson, stripHtml } from "../lib.js";

// https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true
export async function greenhouse({ slug, company }) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  return (data.jobs || []).map((j) => ({
    source: "greenhouse",
    company: company || slug,
    title: j.title,
    location: j.location?.name || "",
    url: j.absolute_url,
    posted_at: j.updated_at || j.first_published || null,
    description: stripHtml(j.content || ""),
  }));
}
