import { fetchJson, stripHtml } from "../lib.js";

export async function ruangguru() {
  const data = await fetchJson("https://career.ruangguru.com/api/v3/career/vacancy");
  return (data.data || []).map((j) => ({
    source: "ruangguru",
    company: "Ruangguru",
    title: j.title,
    location: j.location || "",
    url: `https://career.ruangguru.com/vacancies/${j.serial}`,
    posted_at: j.created_at || null,
    description: stripHtml([j.description, j.qualifications].filter(Boolean).join("\n\n")),
  }));
}
