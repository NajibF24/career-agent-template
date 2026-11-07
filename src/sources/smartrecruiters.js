import { fetchJson, stripHtml } from "../lib.js";

// https://api.smartrecruiters.com/v1/companies/<slug>/postings?country=id
// Note: an unknown slug still returns 200 with totalFound 0.
export async function smartrecruiters({ slug, company, country = "id", with_description = true }) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const data = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?country=${country}&limit=100&offset=${offset}`);
    for (const j of data.content || []) {
      out.push({
        source: "smartrecruiters",
        company: company || slug,
        title: j.name,
        location: [j.location?.city, j.location?.country?.toUpperCase(), j.location?.remote ? "Remote" : null].filter(Boolean).join(", "),
        url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
        posted_at: j.releasedDate || null,
        ref: j.ref,
        description: "",
      });
    }
    if (offset + 100 >= (data.totalFound || 0)) break;
  }
  if (with_description) {
    for (const j of out) {
      try {
        const d = await fetchJson(j.ref);
        const s = d.jobAd?.sections || {};
        j.description = stripHtml([s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join("\n\n"));
      } catch { /* keep empty */ }
      delete j.ref;
    }
  }
  return out;
}
