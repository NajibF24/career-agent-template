import { fetchJson, stripHtml } from "../lib.js";

// SEEK jobsearch v5 (Jobstreet Indonesia). Descriptions come from a second GraphQL call per job.
export async function jobstreet({ keywords = ["devops"], where = "", pages = 2, with_description = true }) {
  const seen = new Map();
  for (const kw of keywords) {
    for (let page = 1; page <= pages; page++) {
      const url = `https://id.jobstreet.com/api/jobsearch/v5/search?siteKey=ID-Main&sourcesystem=houston&keywords=${encodeURIComponent(kw)}&where=${encodeURIComponent(where)}&page=${page}&pageSize=30&locale=id-ID`;
      const data = await fetchJson(url);
      for (const j of data.data || []) {
        if (seen.has(j.id)) continue;
        seen.set(j.id, {
          source: "jobstreet",
          company: j.advertiser?.description || "",
          title: j.title,
          location: [j.locations?.[0]?.label, ...(j.workTypes || [])].filter(Boolean).join(" · "),
          url: `https://id.jobstreet.com/job/${j.id}`,
          posted_at: j.listingDate || null,
          description: [j.salaryLabel, j.teaser, ...(j.bulletPoints || [])].filter(Boolean).join("\n"),
        });
      }
      if ((data.data || []).length < 30) break;
    }
  }
  const out = [...seen.values()];
  if (with_description) for (const [id, j] of seen) j.description = (await details(id)) || j.description;
  return out;
}

async function details(id) {
  try {
    const data = await fetchJson("https://id.jobstreet.com/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "query jobDetails($jobId: ID!, $locale: Locale!) { jobDetails(id: $jobId) { job { content(platform: WEB) } } }",
        variables: { jobId: String(id), locale: "id-ID" },
      }),
    });
    return stripHtml(data?.data?.jobDetails?.job?.content || "");
  } catch {
    return "";
  }
}
