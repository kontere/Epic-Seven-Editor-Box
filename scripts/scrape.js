import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const BASE = "https://epic7db.com";
const JINA = (u) => `https://r.jina.ai/http://` + u.replace(/^https?:\/\//,'').replace(/^\/\//,'');

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function scrapeList(url, type) {
  let html;
  try {
    html = await fetchHtml(url);        // direct
  } catch {
    html = await fetchHtml(JINA(url));  // fallback proxy lecture seule
  }

  const $ = cheerio.load(html);
  const out = [];
  const selector = type === "heroes" ? 'a[href^="/heroes/"]' : 'a[href^="/artifacts/"]';

  $(selector).each((_, a) => {
    const href = $(a).attr("href") || "";
    const text = $(a).text().replace(/\s+/g, " ").trim();
    if (!text) return;

    const m = href.match(type === "heroes" ? /^\/heroes\/([a-z0-9-]+)/ : /^\/artifacts\/([a-z0-9-]+)/);
    if (m) {
      const slug = m[1];
      out.push({
        name: text,
        slug,
        link: `${BASE}/${type}/${slug}`,
        img: `${BASE}/images/${type}/${slug}.webp`
      });
    }
  });

  // remove duplicates by slug
  const seen = new Set();
  return out.filter(it => {
    const key = `${type}-${it.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const heroes = await scrapeList(`${BASE}/heroes`, "heroes");
  const artifacts = await scrapeList(`${BASE}/artifacts`, "artifacts");

  console.log(`Heroes scraped: ${heroes.length}`);
  console.log(`Artifacts scraped: ${artifacts.length}`);

  const dataDir = path.join(process.cwd(), "data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "heroes.json"), JSON.stringify({ heroes }, null, 2));
  await fs.writeFile(path.join(dataDir, "artifacts.json"), JSON.stringify({ artifacts }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
