import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DATA = path.join(ROOT, "data");
export const JOBS_FILE = path.join(DATA, "jobs.jsonl");
export const TRACKER_FILE = path.join(DATA, "tracker.tsv");

export function readYaml(rel) {
  return YAML.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

export function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// jobs.jsonl: one job per line, keyed by id. Later lines override earlier ones.
export function loadJobs() {
  if (!fs.existsSync(JOBS_FILE)) return new Map();
  const map = new Map();
  for (const line of fs.readFileSync(JOBS_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const j = JSON.parse(line);
    map.set(j.id, { ...(map.get(j.id) || {}), ...j });
  }
  return map;
}

export function saveJobs(map) {
  fs.mkdirSync(DATA, { recursive: true });
  const lines = [...map.values()].map((j) => JSON.stringify(j));
  fs.writeFileSync(JOBS_FILE, lines.join("\n") + (lines.length ? "\n" : ""));
}

export function jobId(url) {
  return crypto.createHash("sha1").update(url.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function stripHtml(html = "") {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": "career-agent/0.1 (+personal job search)", accept: "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

export function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}
