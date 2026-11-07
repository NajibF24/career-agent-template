import { fetchJson, stripHtml } from "../lib.js";

// Manatal careers-page: https://www.careers-page.com/api/v1.0/c/<slug>/jobs (paginated via next)
export async function manatal({ slug, company }) {
  const out = [];
  let url = `https://www.careers-page.com/api/v1.0/c/${slug}/jobs`;
  for (let i = 0; url && i < 10; i++) {
    const data = await fetchJson(url);
    for (const j of data.results || []) {
      out.push({
        source: "manatal",
        company: company || slug,
        title: j.position_name,
        location: [j.city, j.state, j.country].filter(Boolean).join(", "),
        url: `https://www.careers-page.com/${slug}/job/${j.hash}`,
        posted_at: null,
        description: stripHtml(j.description || ""),
      });
    }
    url = data.next || null;
  }
  return out;
}
