import { stripHtml } from "../lib.js";

// careers.vidio.com is server-rendered HTML: <a class="b-job" data-name=".." href="/careers/<id>-<slug>"> ... <div class="b-job__location">..</div>
export async function vidio() {
  const html = await (await fetch("https://careers.vidio.com/careers", { signal: AbortSignal.timeout(30_000) })).text();
  const out = [];
  const re = /<a[^>]*class="[^"]*\bb-job\b[^"]*"[^>]*href="(\/careers\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[0];
    const title = /data-name="([^"]+)"/.exec(block)?.[1] || stripHtml(m[2]).split("\n")[0];
    const location = /b-job__location[^>]*>([\s\S]*?)<\/div>/.exec(block)?.[1];
    const url = `https://careers.vidio.com${m[1]}`;
    out.push({ source: "vidio", company: "Vidio", title: stripHtml(title), location: stripHtml(location || ""), url, posted_at: null, description: "" });
  }
  for (const j of out) {
    if (!/devops|sre|platform|cloud|infra|security|kubernetes/i.test(j.title)) continue;
    try {
      const page = await (await fetch(j.url, { signal: AbortSignal.timeout(30_000) })).text();
      const body = /<main[\s\S]*?<\/main>/i.exec(page)?.[0] || page;
      j.description = stripHtml(body).slice(0, 12_000);
    } catch { /* keep */ }
  }
  return out;
}
