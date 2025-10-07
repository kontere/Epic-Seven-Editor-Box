import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const BASE = "https://epic7db.com";
const JINA = (u) => `https://r.jina.ai/http://` + u.replace(/^https?:\/\//,'').replace(/^\/\//,'');

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchSitemap(url) {
  // try direct, then fallback proxy
  try {
    return await fetchText(url);
  } catch {
    return await fetchText(JINA(url));
  }
}

function slugFromUrl(url, kind) {
  const rx = kind === "heroes" ? /\/heroes\/([a-z0-9-]+)$/ : /\/artifacts\/([a-z0-9-]+)$/;
  const m = url.match(rx);
  return m ? m[1] : null;
}

async function scrapeFromSitemap() {
  const xml = await fetchSitemap(`${BASE}/sitemap.xml`);
  const sm = await parseStringPromise(xml);

  // The sitemap can be either a urlset or a sitemapindex → normalize
  const urls = [];

  const collectFromUrlset = (urlset) => {
    const entries = urlset.url || [];
    for (const u of entries) {
      if (!u.loc || !u.loc[0]) continue;
      urls.push(u.loc[0]);
    }
  };

  if (sm.urlset) {
    collectFromUrlset(sm.urlset);
  } else if (sm.sitemapindex && sm.sitemapindex.sitemap) {
    // if it references nested sitemaps, fetch them too
    const nested = sm.sitemapindex.sitemap.map(s => s.loc && s.loc[0]).filter(Boolean);
    for (const loc of nested) {
      const xml2 = await fetchSitemap(loc);
      const sm2 = await parseStringPromise(xml2);
      if (sm2.urlset) collectFromUrlset(sm2.urlset);
    }
  }

  const heroUrls = urls.filter(u => /\/heroes\/[a-z0-9-]+$/i.test(u));
  const artUrls  = urls.filter(u => /\/artifacts\/[a-z0-9-]+$/i.test(u));

  const heroes = [];
  const artifacts = [];

  const seenH = new Set();
  for (const u of heroUrls) {
    const slug = slugFromUrl(u, "heroes");
    if (!slug || seenH.has(slug)) continue;
    seenH.add(slug);
    heroes.push({
      name: slug.split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" "), // best-effort name from slug
      slug,
      link: `${BASE}/heroes/${slug}`,
      img:  `${BASE}/images/heroes/${slug}.webp`
    });
  }

  const seenA = new Set();
  for (const u of artUrls) {
    const slug = slugFromUrl(u, "artifacts");
    if (!slug || seenA.has(slug)) continue;
    seenA.add(slug);
    artifacts.push({
      name: slug.split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" "),
      slug,
      link: `${BASE}/artifacts/${slug}`,
      img:  `${BASE}/images/artifacts/${slug}.webp`
    });
  }

  return { heroes, artifacts };
}

async function main() {
  const { heroes, artifacts } = await scrapeFromSitemap();

  console.log(`Heroes via sitemap: ${heroes.length}`);
  console.log(`Artifacts via sitemap: ${artifacts.length}`);

  // Sanity fallback: if one list is suspiciously small, warn (we can add other fallbacks later)
  if (heroes.length < 200) console.warn("Low hero count from sitemap (<?200).");
  if (artifacts.length < 150) console.warn("Low artifact count from sitemap (<?150).");

  const dataDir = path.join(process.cwd(), "data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "heroes.json"), JSON.stringify({ heroes }, null, 2));
  await fs.writeFile(path.join(dataDir, "artifacts.json"), JSON.stringify({ artifacts }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
