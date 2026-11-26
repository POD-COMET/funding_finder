// After each publish: open the live site in a real browser, check it loads, that meaning search
// starts, and print what a few ideas return (visible in the Actions log).
import { chromium } from "playwright";
const URL0 = process.env.SITE_URL;
const b = await chromium.launch(); const pg = await b.newPage(); const errs = [];
pg.on("pageerror", e => errs.push(e.message));
await pg.goto(URL0, { waitUntil: "networkidle" });
// confirm the live page is the version just published
{ const fs = await import("node:fs"); const crypto = await import("node:crypto");
  const h = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
  for (const f of ["index.html", "data.js", "match.js"]) {
    const live = await (await fetch(new URL(f, URL0.endsWith("/") ? URL0 : URL0 + "/"), { cache: "no-store" })).text();
    const mine = fs.readFileSync(new URL("../site/" + f, import.meta.url), "utf8");
    console.log(`${f}: live ${h(live)} · repo ${h(mine)} ${h(live) === h(mine) ? "✓ same" : "✗ DIFFERENT"}`);
  }
  console.log("Header:", await pg.$$eval(".links a.ico .lbl", a => a.map(x => x.innerText).join(" | ")));
}
const probes = ["fouling on ship hulls", "deployable radiator", "bone implant surface treatment", "drone airframe made of composites"];
for (const q of probes) {
  await pg.fill("#idea", q); await pg.waitForTimeout(1500);
  await pg.waitForFunction(() => document.documentElement.dataset.sem, null, { timeout: 90000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  const sem = await pg.evaluate(() => document.documentElement.dataset.sem || "not started");
  const arms = await pg.$$eval(".iarm", a => a.map(x => x.querySelector(".ir").innerText.replace(/\n/g, " ") + ": " + x.querySelector(".in").innerText));
  const live = await pg.$$eval(".livebox .lrow a", a => a.slice(0, 3).map(x => x.innerText));
  console.log(`\n"${q}" [meaning search: ${sem}]\n  ${arms.join("\n  ")}\n  live: ${live.join(" | ")}`);
}
console.log("\nPage errors:", errs.length ? errs : "none");
await b.close();
if (errs.length) process.exit(1);
