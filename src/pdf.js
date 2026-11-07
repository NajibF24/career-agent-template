// Markdown (headings, bullets, bold, tables, paragraphs) -> HTML -> PDF via Playwright Chromium.
// CLI: node src/pdf.js <draft_dir> [out_dir]   -> writes <Name>_CV.pdf and <Name>_Cover_Letter.pdf
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { readYaml } from "./lib.js";

const inline = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");

export function mdToHtml(md) {
  const out = [];
  const ls = md.split("\n");
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (!l.trim()) continue;
    if (l.startsWith("|")) {
      const rows = [];
      while (i < ls.length && ls[i].startsWith("|")) rows.push(ls[i++].trim()); i--;
      const cells = rows.filter((r) => !/^\|\s*-+/.test(r)).map((r) => r.slice(1, -1).split("|").map((c) => inline(c.trim())));
      out.push(`<table>${cells.map((r, ri) => `<tr>${r.map((c) => (ri ? `<td>${c}</td>` : `<th>${c}</th>`)).join("")}</tr>`).join("")}</table>`);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)/.exec(l);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^[-*]\s+/.test(l)) {
      const items = [];
      while (i < ls.length && /^[-*]\s+/.test(ls[i])) items.push(ls[i++].replace(/^[-*]\s+/, "")); i--;
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
      continue;
    }
    const para = [];
    while (i < ls.length && ls[i].trim() && !/^(#|[-*]\s|\|)/.test(ls[i])) para.push(ls[i++].replace(/\s{2,}$/, "")); i--;
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

const CSS = `body{font:10.5pt/1.45 Calibri,Carlito,Arial,sans-serif;color:#111;margin:0}h1{font-size:20pt;margin:0 0 2pt;color:#1f3864}h2{font-size:12.5pt;margin:12pt 0 4pt;color:#1f3864;border-bottom:1px solid #1f3864;padding-bottom:2pt}h3{font-size:11pt;margin:9pt 0 2pt}p{margin:0 0 5pt}ul{margin:0 0 5pt 16pt;padding:0}li{margin:0 0 2pt}table{border-collapse:collapse;width:100%;font-size:9.5pt;margin:4pt 0 8pt}th,td{border:1px solid #ccc;padding:3pt 5pt;text-align:left;vertical-align:top}th{background:#eee}code{font-family:Consolas,monospace;font-size:9.5pt}`;
export const toHtml = (md) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${mdToHtml(md)}</body></html>`;

export async function renderDraftPdfs(draftDir, outDir = draftDir) {
  const name = (readYaml("profile/preferences.yaml").candidate_name || "Candidate").replace(/\s+/g, "_");
  fs.mkdirSync(outDir, { recursive: true });
  const files = { cv: path.join(outDir, `${name}_CV.pdf`), cover: path.join(outDir, `${name}_Cover_Letter.pdf`) };
  const browser = await chromium.launch();
  for (const [key, src] of [["cv", "cv.md"], ["cover", "cover-letter.md"]]) {
    const page = await browser.newPage();
    await page.setContent(toHtml(fs.readFileSync(path.join(draftDir, src), "utf8")));
    await page.pdf({ path: files[key], format: "A4", margin: { top: "16mm", bottom: "16mm", left: "17mm", right: "17mm" }, printBackground: true });
    await page.close();
  }
  await browser.close();
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const [, , draftDir, outDir] = process.argv;
  if (!draftDir) { console.error("usage: node src/pdf.js <draft_dir> [out_dir]"); process.exit(1); }
  console.log(await renderDraftPdfs(draftDir, outDir));
}
