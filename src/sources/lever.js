import { fetchJson, stripHtml } from "../lib.js";

// https://api.lever.co/v0/postings/<slug>?mode=json
export async function lever({ slug, company }) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return (data || []).map((j) => ({
    source: "lever",
    company: company || slug,
    title: j.text,
    location: [j.categories?.location, j.workplaceType].filter(Boolean).join(" · "),
    url: j.hostedUrl,
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    description: stripHtml(j.descriptionPlain || j.description || ""),
  }));
}
