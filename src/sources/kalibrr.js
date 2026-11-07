import { fetchJson, stripHtml } from "../lib.js";

// Kalibrr: keyword search (kjs) or a company board (api/companies/<code>/jobs).
export async function kalibrr({ keywords = ["devops"], location = "Jakarta", company_code }) {
  const seen = new Map();
  const urls = company_code
    ? [`https://www.kalibrr.com/api/companies/${company_code}/jobs`]
    : keywords.map((k) => `https://www.kalibrr.com/kjs/job_board/search?limit=50&offset=0&text=${encodeURIComponent(k)}&location=${encodeURIComponent(location)}`);
  for (const url of urls) {
    const data = await fetchJson(url);
    for (const j of data.jobs || data.results || []) {
      if (seen.has(j.id)) continue;
      const a = j.google_location?.address_components || {};
      const mode = j.is_work_from_home ? "Work from home" : j.is_hybrid ? "Hybrid" : null;
      seen.set(j.id, {
        source: "kalibrr",
        company: j.company_name || j.company_info?.name || "",
        title: j.name,
        location: [a.city, a.region, a.country, mode].filter(Boolean).join(", "),
        url: `https://www.kalibrr.com/c/${j.company_info?.code || company_code}/jobs/${j.id}/${j.slug || ""}`,
        posted_at: j.activation_date || null,
        description: stripHtml([salary(j), j.description, j.qualifications].filter(Boolean).join("\n\n")),
      });
    }
  }
  return [...seen.values()];
}

const salary = (j) => (j.base_salary || j.maximum_salary ? `Salary: ${j.base_salary || "?"} - ${j.maximum_salary || "?"} ${j.salary_currency || "IDR"}` : "");
