// Builds site/vectors.json: a "meaning" fingerprint for every funding route, tracked tender and
// live tender/call, so the site can find relevant routes even when the words differ
// (e.g. "hull fouling" ↔ "antifouling coatings for ships"). Uses a small free model that also
// runs in the browser, so the visitor's idea is compared on their own device. No paid service.
import { pipeline } from "@huggingface/transformers";
import fs from "node:fs/promises";
import vm from "node:vm";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const site = f => new URL(`../site/${f}`, import.meta.url);
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ["data.js", "tenders.js"]) vm.runInContext(await fs.readFile(site(f), "utf8"), ctx);
const W = ctx.window, IND = W.INDUSTRIES || {};
const live = await fs.readFile(site("live.json"), "utf8").then(JSON.parse).catch(() => ({ sources: {} }));

const docs = [];
for (const s of W.SCHEMES) docs.push([s.id, [s.name, s.type, s.summary, s.tip, (s.ind || []).map(i => IND[i]).join(", ")].filter(Boolean).join(". ")]);
for (const t of W.TENDERS) docs.push([t.id, [t.title, t.programme, t.summary, (t.kw || []).join(", ")].filter(Boolean).join(". ")]);
const today = new Date().toISOString().slice(0, 10);
for (const [k, src] of Object.entries(live.sources || {})) {
  if (k === "EU") continue; // ~1,000 EU calls: matched by keywords only, to keep the download small
  for (const it of src.items || []) if (!it.deadline || it.deadline >= today) docs.push([it.id, [it.title, it.summary].filter(Boolean).join(". ").slice(0, 600)]);
}

const ext = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
const dims = 384, q = new Int8Array(docs.length * dims);
for (let i = 0; i < docs.length; i += 32) {
  const batch = docs.slice(i, i + 32);
  const out = await ext(batch.map(d => d[1]), { pooling: "mean", normalize: true });
  const v = out.data;
  for (let j = 0; j < batch.length; j++) for (let k = 0; k < dims; k++) q[(i + j) * dims + k] = Math.max(-127, Math.min(127, Math.round(v[j * dims + k] * 127)));
}
await fs.writeFile(site("vectors.json"), JSON.stringify({ model: MODEL, dims, built: new Date().toISOString(), ids: docs.map(d => d[0]), q: Buffer.from(q.buffer).toString("base64") }));
// quick self-check: a few ideas and their closest routes, visible in the Actions log
const probe = ["antifouling paint for ship hulls", "bone implant surface treatment", "drone airframe made of composites", "deployable radiator for satellites"];
for (const p of probe) {
  const e = (await ext(p, { pooling: "mean", normalize: true })).data; const sc = [];
  for (let i = 0; i < docs.length; i++) { let s = 0; for (let k = 0; k < dims; k++) s += e[k] * q[i * dims + k] / 127; sc.push([s, docs[i][0]]); }
  console.log(`"${p}" →`, sc.sort((a, b) => b[0] - a[0]).slice(0, 5).map(([s, id]) => `${id} ${s.toFixed(2)}`).join(", "));
}
console.log(`Embedded ${docs.length} items`);
