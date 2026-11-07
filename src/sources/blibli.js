import { fetchJson } from "../lib.js";

// No description or date in this feed; the scorer works from title/location only.
export async function blibli() {
  const data = await fetchJson("https://careers.blibli.com/ext/api/fetch-jobs");
  return (data.responseObject || [])
    .filter((j) => j.active && j.postingStatus)
    .map((j) => ({
      source: "blibli",
      company: j.companyName || "Blibli",
      title: j.jobName,
      location: Array.isArray(j.locations) ? j.locations.join(", ") : String(j.locations || ""),
      url: `https://careers.blibli.com/job/${j.jobCode}`,
      posted_at: null,
      description: [j.department, j.employmentType].filter(Boolean).join(" · "),
    }));
}
