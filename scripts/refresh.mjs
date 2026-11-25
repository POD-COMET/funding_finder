// Refreshes site/live.json with currently open tenders and calls from portals that
// can't be read by a simple fetch (ESA-STAR is a JavaScript app). Runs in GitHub Actions.
// Each source is independent: if one fails, the others still update and the last good
// items for the failed source are kept, so a portal change never blanks the site.
import { chromium } from "playwright";
import fs from "node:fs/promises";

const OUT = new URL("../site/live.json", import.meta.url);
const prev = await fs.readFile(OUT, "utf8").then(JSON.parse).catch(() => ({ sources: {} }));
const now = new Date().toISOString();
const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();
const dateISO = s => { // accepts 2026-12-18, 18/12/2026, 18.12.2026
  if (!s) return null; s = String(s);
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

// ── ESA-STAR: load the open tender list in a real browser and read the rendered rows.
// We also capture the JSON the page itself downloads, which is more stable than the HTML.
async function esa(browser) {
  const page = await browser.newPage();
  const captured = [], jsonUrls = [], sample = [];
  page.on("response", async r => {
    const ct = r.headers()["content-type"] || "";
    if (r.url().includes("esastar") && ct.includes("json")) { jsonUrls.push(r.url()); try { captured.push(await r.json()); } catch {} }
  });
  const items = new Map();
  for (const path of ["ESATenderActions/filter/open", "ESATenderActions/filter/intended", "ESATenderActions"]) {
    await page.goto(`https://esastar-publication-ext.sso.esa.int/${path}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(4000);
    for (let i = 0; i < 15; i++) { // follow "next page" / "load more" if present
      const rows = await page.$$eval("a[href*='/ESATenderActions/details/']", as => {
        const seen = new Set(), out = [];
        for (const a of as) { if (seen.has(a.href)) continue; seen.add(a.href);
          // climb to the card that holds this tender (stop before a box that contains another tender)
          let box = a.parentElement;
          for (let i = 0; i < 8 && box && box.parentElement; i++) {
            const up = box.parentElement, links = new Set([...up.querySelectorAll("a[href*='/ESATenderActions/details/']")].map(x => x.href));
            if (links.size > 1) break; box = up;
          }
          out.push({ href: a.href, text: box ? box.innerText : a.innerText });
        }
        return out;
      });
      if (sample.length < 2) sample.push(...rows.slice(0, 2 - sample.length).map(r => ({ ...r, text: r.text.slice(-600) })));
      for (const r of rows) {
        const id = (r.href.match(/details\/(\d+)/) || [])[1] || r.href;
        const lines = r.text.split("\n").map(clean).filter(Boolean);
        const ref = lines.find(l => /^\d-\d{4,6}$/.test(l)) || null;
        const status = lines.find(l => /^(Intended|Open|Issued|Closed|Cancelled)$/i.test(l)) || (path.includes("intended") ? "Intended" : "Open");
        const title = lines.find(l => l.length > 12 && /[A-Z]{3}/.test(l) && !/^(Announcement|Open|Closing) Date/i.test(l) && l === l.toUpperCase()) || lines.find(l => l.length > 12) || "";
        const summary = (lines.filter(l => l.length > 80 && l !== title)[0] || "").slice(0, 500);
        const close = (r.text.match(/Closing Date:?\s*([\d./-]+)/i) || [])[1];
        const open = (r.text.match(/Open Date:?\s*([\d./-]+)/i) || [])[1];
        if (title.length > 5) items.set(id, { source: "ESA", id: `esa-${id}`, ref, title, summary, url: r.href, opens: dateISO(open), deadline: dateISO(close), kind: /intended/i.test(status) ? "Intended tender" : "Open tender" });
      }
      const next = await page.$("button[aria-label*='next' i]:not([disabled]), a[aria-label*='next' i], button:has-text('Load more')");
      if (!next) break; await next.click(); await page.waitForTimeout(2500);
    }
  }
  // Fallback: walk captured JSON for objects that look like tenders.
  if (!items.size) {
    const walk = o => { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== "object") return;
      const title = o.title || o.name || o.tenderTitle; const id = o.id || o.reference || o.tenderId;
      if (title && id && (o.closingDate || o.closeDate || o.deadline)) items.set(String(id), { source: "ESA", id: `esa-${id}`, ref: o.reference || null, title: clean(title), url: `https://esastar-publication-ext.sso.esa.int/ESATenderActions/details/${o.id ?? id}`, opens: dateISO(o.openDate), deadline: dateISO(o.closingDate || o.closeDate || o.deadline), kind: "Open tender" });
      Object.values(o).forEach(walk); };
    captured.forEach(walk);
  }
  await page.close();
  // Closing dates are only on each tender's own page: visit those without one (4 at a time).
  const todo = [...items.values()].filter(x => !x.deadline).slice(0, 250);
  const worker = async () => { const p = await browser.newPage();
    while (todo.length) { const it = todo.shift();
      try { await p.goto(it.url, { waitUntil: "networkidle", timeout: 45000 }); await p.waitForTimeout(800);
        const txt = await p.evaluate(() => document.body.innerText);
        const g = re => (txt.match(re) || [])[1];
        it.deadline = dateISO(g(/Closing Date\s*:?\s*\n?\s*([\d./-]{8,10})/i)) || it.deadline;
        it.opens = dateISO(g(/Open Date\s*:?\s*\n?\s*([\d./-]{8,10})/i)) || it.opens;
        it.price = clean(g(/Price Range\s*:?\s*\n?\s*([^\n]{2,40})/i) || "") || undefined;
        if (!it.ref) it.ref = g(/\b(\d-\d{4,6})\b/) || null;
      } catch (e) { /* keep the item without a date */ } }
    await p.close(); };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log("ESA with closing dates:", [...items.values()].filter(x => x.deadline).length);
  return [...items.values()];
}

// ── EU Funding & Tenders portal: open and forthcoming calls for proposals and tenders,
// read from the same search service the portal itself uses.
async function euft() {
  const items = [];
  const types = [["1", "EU call for proposals"], ["2", "EU call for proposals"], ["8", "EU call for proposals"], ["0", "EU tender"]];
  for (let pageNumber = 1; pageNumber <= 20; pageNumber++) {
    const form = new FormData();
    form.append("query", new Blob([JSON.stringify({ bool: { must: [
      { terms: { type: types.map(t => t[0]) } },
      { terms: { status: ["31094501", "31094502"] } } ] } })], { type: "application/json" }));
    form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));
    form.append("sort", new Blob([JSON.stringify({ field: "sortStatus", order: "ASC" })], { type: "application/json" }));
    const r = await fetch(`https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=${pageNumber}`, { method: "POST", body: form });
    if (!r.ok) throw new Error(`EU F&T HTTP ${r.status}`);
    const j = await r.json(); const res = j.results || [];
    for (const x of res) {
      const m = x.metadata || {}; const g = k => (m[k] || [])[0];
      const id = g("identifier") || g("callIdentifier") || x.reference;
      const title = clean(g("title") || x.summary || x.content);
      if (!id || !title) continue;
      const isTender = (m.type || [])[0] === "0";
      items.push({ source: "EU", id: `eu-${id}`, ref: id, title,
        url: isTender ? `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/tender-details/${id}`
                      : `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${id}`,
        opens: dateISO(g("startDate")), deadline: dateISO(g("deadlineDate")), kind: isTender ? "EU tender" : "EU call for proposals",
        programme: clean(g("frameworkProgramme") || g("programmePeriod") || "") });
    }
    if (res.length < 100) break;
  }
  const today = new Date().toISOString().slice(0, 10);
  return items.filter(x => !x.deadline || x.deadline >= today);
}


// "1 Dec 2026", "December 1, 2026", "1st December 2026" → ISO
const MONTHS = "january february march april may june july august september october november december".split(" ");
function wordDate(t) {
  const m = String(t).match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})/i)
        || String(t).match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (!m) return dateISO(t);
  const [day, mon, yr] = /^\d/.test(m[1]) ? [m[1], m[2], m[3]] : [m[2], m[1], m[3]];
  const mi = MONTHS.findIndex(x => x.startsWith(mon.toLowerCase().slice(0, 3)));
  return mi < 0 ? null : `${yr}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Research Ireland: every programme card on the funding page, with its Open/Closed status and deadline.
async function researchIreland(browser) {
  // The listing page is built by scripts, so collect each programme's link and read the programme page itself.
  const page = await browser.newPage();
  await page.goto("https://www.researchireland.ie/funding/", { waitUntil: "networkidle", timeout: 60000 }); await page.waitForTimeout(2500);
  for (let i = 0; i < 6; i++) { const more = await page.$("button:has-text('Load more'), a:has-text('Load more'), a.next, a:has-text('Next')"); if (!more) break; await more.click().catch(() => {}); await page.waitForTimeout(2000); }
  const slugs = [...new Set(await page.$$eval("a[href*='/funding/']", as => as.map(a => a.getAttribute("href")).filter(h => /\/funding\/[a-z0-9-]+\/?$/i.test(h))))]
    .map(h => new URL(h, "https://www.researchireland.ie").href.replace(/\/?$/, "/")).filter(u => !/\/funding\/(page|category)\//.test(u));
  await page.close();
  const items = [];
  for (const url of slugs.slice(0, 80)) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 FundingFinder (daily check)" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) continue;
      const html = await r.text();
      const ent = t => t.replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/&#8217;|&rsquo;/g, "’").replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'");
      const title = ent(clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/<[^>]+>/g, "").replace(/\s*\|.*$/, "") || ""));
      const txt = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
      // programme pages carry a status line like "Open / 20 Jan 2026 / 20 Jan 2026  Deadline Rolling  Duration …"
      const di = txt.search(/\bDeadline\s/); const before = di > 0 ? txt.slice(Math.max(0, di - 260), di) : "";
      const sm = [...before.matchAll(/\b(Open|Closed|Forthcoming|Coming soon|Upcoming)\b/g)].pop();
      const status = sm ? sm[1] : null;
      const dl = (txt.match(/\bDeadline\s+(.{3,40}?)\s+(?:Duration|Award amount|Contact|NOI|LOI|Important|Full proposal)/) || [])[1] || null;
      const desc = clean((html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || [])[1] || "");
      if (title.length > 4) items.push({ source: "RI", id: "ri-" + url.replace(/.*\/funding\//, "").replace(/\/$/, ""), title, url,
        status: status ? status.toLowerCase().replace("coming soon", "forthcoming").replace("upcoming", "forthcoming") : null,
        deadline: dl && /\d{4}/.test(dl) ? wordDate(dl) : null, deadlineText: dl ? clean(dl) : null, summary: desc.slice(0, 400), kind: "Research Ireland programme" });
    } catch (e) { /* skip this programme today */ }
  }
  console.log("RI programmes found:", slugs.length, "read:", items.length, "sample:", JSON.stringify(items.slice(0, 3)).slice(0, 600));
  return items;
}

// ── Irish eTenders: latest published contract notices (public table, rendered by the site).
async function etenders(browser) {
  const page = await browser.newPage(); const items = [];
  for (let p = 0; p < 30; p++) {
    await page.goto(`https://www.etenders.gov.ie/epps/quickSearchAction.do?d-3680175-p=${p + 1}&searchType=cftFTS&latest=true`, { waitUntil: "networkidle", timeout: 90000 });
    const rows = await page.$$eval("table tr", trs => trs.map(tr => ({ cells: [...tr.querySelectorAll("td")].map(td => td.innerText.trim()), href: (tr.querySelector("a[href*='cft']") || tr.querySelector("a")) ? (tr.querySelector("a[href*='cft']") || tr.querySelector("a")).href : null })).filter(r => r.cells.length >= 4));
    for (const r of rows) {
      const c = r.cells; const title = c[1];
      const jd = x => { const m = String(x).match(/^\w{3} (\w{3}) (\d{1,2}) [\d:]+ \w+ (\d{4})$/); return m ? wordDate(`${m[2]} ${m[1]} ${m[3]}`) : dateISO(x); };
      const value = parseFloat(c[11]);
      if (title && r.href) items.push({ source: "eTenders", id: "et-" + (r.href.match(/resourceId=(\d+)/) || [, items.length])[1], title: clean(title), buyer: clean(c[3]), url: r.href,
        published: jd(c[5]), deadline: jd(c[6]), status: clean(c[7]).toLowerCase(), price: value ? `€${Math.round(value).toLocaleString("en-IE")} (estimated)` : undefined, kind: "Irish public tender" });
    }
    if (!rows.length) break;
  }
  await page.close();
  const seen = new Set(); return items.filter(x => !seen.has(x.id) && seen.add(x.id));
}

// ── Official-page watch: every curated scheme's source page, checked daily. Records whether it
// loads, when its text last changed, and any open/closed wording or dates, so the site can show
// "checked today · page changed 3 days ago" and flag schemes that need a look.
import vm from "node:vm";
import crypto from "node:crypto";
async function watchPages(browser) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(await fs.readFile(new URL("../site/data.js", import.meta.url), "utf8"), ctx);
  const S = ctx.window.SCHEMES; const old = prev.watch || {}; const out = {};
  const page = await browser.newPage();
  for (const s of S) {
    const o = { checked: now, ok: false };
    try {
      let txt = "";
      const r = await fetch(s.src, { headers: { "user-agent": "Mozilla/5.0 FundingFinder (daily page check)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
      o.http = r.status;
      if (r.ok) txt = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
      if (!r.ok || clean(txt).length < 400) { // JavaScript site or blocked: use the real browser
        const pr = await page.goto(s.src, { waitUntil: "domcontentloaded", timeout: 45000 }); await page.waitForTimeout(2500);
        o.http = pr ? pr.status() : o.http; txt = await page.evaluate(() => document.body ? document.body.innerText : "");
      }
      txt = clean(txt); o.ok = txt.length > 200 && (o.http || 200) < 400;
      if (o.ok) {
        const core = txt.replace(/\b\d{1,2}:\d{2}\b/g, "").slice(0, 20000);
        o.hash = crypto.createHash("sha1").update(core).digest("hex").slice(0, 12);
        const p = old[s.id]; o.changed = p && p.hash && p.hash !== o.hash ? now.slice(0, 10) : (p && p.changed) || null;
        o.since = p && p.since ? p.since : now.slice(0, 10);
        const low = txt.toLowerCase();
        o.words = /\b(now open|is now open|call is open|applications are open|open for applications)\b/.test(low) ? "open"
                : /\b(call (is )?closed|now closed|applications are closed|currently closed)\b/.test(low) ? "closed" : null;
        o.dates = [...new Set((txt.match(/(?:deadline|closing date|closes|close on|submission)[^.]{0,60}?\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?\s+\d{4}/gi) || []).map(x => wordDate(x)).filter(Boolean))].slice(0, 4);
      }
    } catch (e) { o.error = e.message.slice(0, 120); }
    out[s.id] = o;
  }
  await page.close();
  console.log(`Page watch: ${Object.values(out).filter(x => x.ok).length}/${S.length} pages read, ${Object.values(out).filter(x => x.changed === now.slice(0, 10)).length} changed today`);
  return out;
}

const sources = { ...prev.sources };
const browser = await chromium.launch();
for (const [key, fn] of [["ESA", () => esa(browser)], ["EU", euft], ["RI", () => researchIreland(browser)], ["eTenders", () => etenders(browser)]]) {
  try {
    const items = await fn();
    if (!items.length) throw new Error("returned no items (page layout may have changed)");
    sources[key] = { ok: true, checked: now, updated: now, count: items.length, items };
    console.log(`${key}: ${items.length} items`);
  } catch (e) {
    console.error(`${key} failed: ${e.message}`);
    sources[key] = { ...(prev.sources?.[key] || { items: [] }), ok: false, checked: now, error: e.message };
  }
}
let watch = prev.watch || {};
try { watch = await watchPages(browser); } catch (e) { console.error("Page watch failed: " + e.message); }
await browser.close();
await fs.writeFile(OUT, JSON.stringify({ generated: now, sources, watch }, null, 1));
if (!Object.values(sources).some(s => s.ok)) { console.error("All sources failed"); process.exit(1); }
