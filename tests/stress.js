// Stress test for Funding Finder · Ireland. Run: node stress.js
global.window = global;
require('/home/claude/funding-explorer/data.js');
require('/home/claude/funding-explorer/tenders.js');
require('/home/claude/funding-explorer/match.js');
const M = window.Matcher, S = window.SCHEMES, T = window.TENDERS, today = new Date("2026-11-23T00:00:00");
let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; fails.push(name + "  →  " + JSON.stringify(detail)); } };
const section = n => console.log("\n== " + n);

// ───────── A. DATA INTEGRITY ─────────
section("A. Data integrity");
const ids = S.map(s => s.id);
ok("scheme ids unique", new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i));
const REQ = ["id","name","group","who","stage","type","amount","rate","duration","status","summary","req","apply","ind","mil","src","purpose"];
const iso = x => x == null || /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(new Date(x));
for (const s of S) {
  ok(`${s.id}: required fields`, REQ.every(k => s[k] !== undefined && s[k] !== ""), REQ.filter(k => s[k] === undefined || s[k] === ""));
  ok(`${s.id}: valid group`, !!window.GROUPS[s.group], s.group);
  ok(`${s.id}: valid who`, ["uni","co","both"].includes(s.who), s.who);
  ok(`${s.id}: valid stage`, !!window.STAGES[s.stage], s.stage);
  ok(`${s.id}: valid status`, ["open","rolling","upcoming","closed","check"].includes(s.status), s.status);
  ok(`${s.id}: valid mil`, ["civil","dual","defence"].includes(s.mil), s.mil);
  ok(`${s.id}: industries valid`, s.ind.length && s.ind.every(i => window.INDUSTRIES[i]), s.ind);
  ok(`${s.id}: purposes valid`, s.purpose.length && s.purpose.every(p => window.PURPOSES[p]), s.purpose);
  ok(`${s.id}: https source`, /^https:\/\/[^ ]+\.[a-z]{2,}/.test(s.src), s.src);
  ok(`${s.id}: dates ISO`, iso(s.deadline) && iso(s.opens), [s.opens, s.deadline]);
  ok(`${s.id}: opens before deadline`, !(s.opens && s.deadline) || s.opens <= s.deadline, [s.opens, s.deadline]);
  ok(`${s.id}: leads resolve`, (s.leads || []).every(l => ids.includes(l)), s.leads);
  ok(`${s.id}: requirements listed`, Array.isArray(s.req) && s.req.length > 0, s.req);
  ok(`${s.id}: 'open' has a date`, s.status !== "open" || s.deadline || s.opens, s.id);
  ok(`${s.id}: 'closed' deadline not in future`, !(s.status === "closed" && s.deadline && new Date(s.deadline) > today), s.deadline);
  ok(`${s.id}: summary readable length`, s.summary.length > 40 && s.summary.length < 600, s.summary.length);
}
const tids = T.map(t => t.id);
ok("tender ids unique", new Set(tids).size === tids.length, tids);
for (const t of T) {
  ok(`${t.id}: fields`, ["title","kind","programme","summary","kw","strong","ind","irl","url"].every(k => t[k]), t.id);
  ok(`${t.id}: strong ⊂ kw-like`, t.strong.length > 0, t.strong);
  ok(`${t.id}: url https`, /^https:\/\//.test(t.url), t.url);
  ok(`${t.id}: dates ISO`, iso(t.deadline) && iso(t.opens), [t.opens, t.deadline]);
}
console.log(`schemes: ${S.length}, tenders: ${T.length}`);

// ───────── B. SEARCH SUITE ─────────
section("B. Search suite");
const run = (text, mode = "uni", extra = {}) => M.rank(S, Object.assign({ text, mode, mil: false, today }, extra));
const field = (r, n = 5) => M.fieldPicks(r, n).map(x => x.s.id);
const gen = (r, n = 5) => r.results.filter(x => !x.specialist).slice(0, n).map(x => x.s.id);
const any = (r, n = 8) => r.results.slice(0, n).map(x => x.s.id);
const C = [ // [query, mode, where, expected ids (any of), extra]
 ["AI software package for material science","uni","field",["arc-ict"]],
 ["Additive manufacturing of composite aircraft parts with European partners","uni","field",["cl5-aero"]],
 ["Composite hydrogen storage tank liner","uni","field",["cleanh2"]],
 ["Automated coating line, advanced manufacturing project with a German company","co","any",["eureka-smart","eureka-net"]],
 ["Build a European research network on adhesion and coatings","uni","any",["cost"]],
 ["Recycling carbon fibre and critical raw materials","uni","any",["eit-rm","ramp","mera"]],
 ["Critical space equipment for EU non-dependence","uni","field",["cl4-space"]],
 ["Consortium with partners abroad to scale up a coating","co","any",["eureka-net","eureka-smart","eurostars","i3"]],
 ["AI software package for material science","uni","field",["eurohpc"]],
 ["Machine learning model to predict corrosion of coated steel","uni","field",["arc-ict","eurohpc"]],
 ["Sandwich panel bonded with a new adhesive for satellite structures","uni","field",["philab"]],
 ["Sandwich panel bonded with a new adhesive for satellite structures","uni","field",["gstp"]],
 ["Thermal control coating for spacecraft radiators","uni","field",["gstp","philab","tde"]],
 ["White thermo-optical coating sprayed onto satellite surfaces","uni","field",["gstp","philab","tde"]],
 ["Lightweight composite structures for CubeSats","uni","field",["gstp","philab","tde"]],
 ["Space-grade adhesive outgassing study","uni","field",["gstp","philab","tde"]],
 ["Start-up selling coatings to satellite makers","co","any",["esa-bic","spark","philab"]],
 ["Antimicrobial coating for orthopaedic implants","uni","field",["arc-health","arc-ther"]],
 ["Stent coating to reduce thrombosis and restenosis","uni","field",["arc-health","arc-ther"]],
 ["Biocompatible nitinol surface treatment","uni","field",["arc-health","arc-ther"]],
 ["Wound dressing with drug release","uni","field",["arc-ther","arc-health"]],
 ["Composite hydrogen storage tank for offshore wind","uni","field",["seai-rdd"]],
 ["Erosion-resistant coating for wind turbine blades","uni","field",["seai-rdd","cetp"]],
 ["Better insulation materials for retrofitting homes","uni","field",["seai-rdd","cetp"]],
 ["Solid-state battery electrolyte","uni","field",["seai-rdd","cetp"]],
 ["Recyclable thermoplastic composite for car parts","uni","field",["cl4"]],
 ["Lightweight carbon fibre chassis for motorsport","co","field",["cl4","techcentres"]],
 ["Carbon fibre drone frame","co","field",["techcentres","cl4"]],
 ["Mould release coating for composite manufacturing","co","gen",["agile","ipp","voucher","rdi","explore"]],
 ["Automated inspection of bonded joints using computer vision","co","field",["ceadar","eurohpc"]],
 ["AI quality inspection for composite manufacturing","co","field",["ceadar"]],
 ["Digital twin of a curing autoclave","uni","field",["arc-ict","eurohpc"]],
 ["Molecular dynamics simulation of polymer interfaces","uni","field",["eurohpc"]],
 ["Grit blasting dopant primer to improve adhesion on bolts","co","gen",["agile","ipp","voucher","rdi","explore"]],
 ["Grit blasting dopant primer to improve adhesion on bolts","uni","gen",["cf-feas","cf-poc","cf-award","ipp"]],
 ["I want to fund a PhD student on recyclable composites with an industry partner","uni","gen",["msca-dn","ri-eps-pg","ri-ent-fellow"]],
 ["Hire a postdoc from abroad","uni","gen",["msca-pf"]],
 ["Secondments with a European company","uni","gen",["msca-se"]],
 ["We want to spin out a company around our coating technology","uni","gen",["cf-feas","cf-poc","cf-award","embark","ri-spinout"]],
 ["Early stage start-up looking for seed investment for a coatings product","co","gen",["pssf","hpsu","seedcorn"]],
 ["Raise equity to scale our composites company","co","gen",["hpsu","eic-acc","pssf"]],
 ["Need new equipment for materials characterisation","uni","any",["ri-inspire","gateways","techcentres"]],
 ["Claim back some of our R&D spend through tax","co","gen",["rdtc"]],
 ["Large European consortium project on advanced materials","uni","any",["cl4","mera","eic-path"]],
 ["Small company first project with a university lab","co","gen",["voucher","ipp"]],
 ["Lightweight ballistic armour","co","any",["edf-sme","edf","eic-acc"],{mil:true}],
 ["Protective coatings for naval vessels","co","field",["ei-dsr","def-eq","eic-acc","edf-sme","edf"],{mil:true}],
];
for (const [q, mode, where, exp, extra] of C) {
  const r = run(q, mode, extra || {});
  const got = where === "field" ? field(r) : where === "gen" ? gen(r) : any(r);
  ok(`[${mode}] "${q}" → ${where} has ${exp.join("|")}`, exp.some(e => got.includes(e)), { got, inds: r.inds, needs: r.needs });
}

// industry detection / false positives
const det = t => M.detectInds(t, window.KEYWORDS);
const D = [["We maintain the supply chain",[],["ict"]],["said the team",[],["ict"]],["domain expertise",[],["ict"]],["certain chairs",[],["ict"]],
 ["Carbon capture membrane",["energy","mat"],[]],["scar tissue",[],["aero"]],["oscar award",[],["aero"]],["the cars of tomorrow",["aero"],[]],
 ["F1 front wing",["aero"],[]],["implantable sensor",["health","ict"],[]],["software",["ict"],[]],["AI",["ict"],[]],["A.I. tools",["ict"],[]],
 ["Composites",["mat"],[]],["COATINGS FOR SPACE",["mat","space"],[]],["matériaux composites",["mat"],[]],["spacer fabric",[],["space"]],["aerospace",["aero"],[]]];
for (const [t, must, mustNot] of D) { const d = det(t); ok(`detect "${t}" must ${must} not ${mustNot}`, must.every(x => d.includes(x)) && mustNot.every(x => !d.includes(x)), d); }

// mode & defence rules
for (const q of ["coating", "spin out", "seed investment", "PhD"]) {
  const ru = run(q, "uni"), rc = run(q, "co");
  ok(`uni mode never shows company-only ("${q}")`, ru.results.every(x => x.s.who !== "co"), ru.results.filter(x => x.s.who === "co").map(x => x.s.id));
  ok(`co mode never shows university-only ("${q}")`, rc.results.every(x => x.s.who !== "uni"), rc.results.filter(x => x.s.who === "uni").map(x => x.s.id));
  ok(`defence-only hidden by default ("${q}")`, ru.results.concat(rc.results).every(x => x.s.mil !== "defence"), "");
}
ok("dual-use visible with defence off", run("armour", "co").results.some(x => x.s.mil === "dual"), "");

// related tier: weaker specific overlaps are surfaced, never silently dropped
{ const r=M.matchTenders(T,"deployable radiator",{today,related:true});
  ok("'deployable radiator' surfaces the deployable reflector tender as possibly related", r.some(x=>x.related&&x.t.id==="t-13660"), r.map(x=>x.t.id));
  ok("related items never appear without related option", !M.matchTenders(T,"deployable radiator",{today}).some(x=>x.related), "");
  const g=M.matchTenders(T,"composite coating",{today,related:true}).filter(x=>x.related);
  ok("generic words alone don't create 'related' noise", g.length<=3, g.map(x=>x.t.id)); }

// partner filter
for (const q of ["composite coating", "AI software", "spin out", "hydrogen tank"]) for (const mode of ["uni","co"]) {
  const solo = run(q, mode, { partner: "solo" }), team = run(q, mode, { partner: "team" });
  ok(`partner=solo hides required-partner schemes ("${q}", ${mode})`, solo.results.every(x => !(x.s.partner && x.s.partner.need === "required")), solo.results.filter(x => x.s.partner && x.s.partner.need === "required").map(x => x.s.id));
  ok(`partner=team shows only partnership schemes ("${q}", ${mode})`, team.results.length > 0 && team.results.every(x => x.s.partner && x.s.partner.need !== "optional"), team.results.map(x => x.s.id));
}
for (const s of S.filter(s => s.partner)) {
  ok(`${s.id}: partner fields valid`, ["required","usually","optional"].includes(s.partner.need) && ["intl","irish","industry","cross"].includes(s.partner.kind) && s.partner.who.length > 10, s.partner);
  if (s.partner.need !== "optional") ok(`${s.id}: partnership scheme reachable via need`, s.purpose.includes(s.partner.kind === "intl" ? "intl" : "industry"), s.purpose);
}
ok("'Join a consortium' need lists ≥ 20 schemes", S.filter(s => s.purpose.includes("intl")).length >= 20, S.filter(s => s.purpose.includes("intl")).length);

// every scheme reachable by its own name
const unreach = S.filter(s => !run(s.name.replace(/\(.*?\)/g, ""), s.who === "co" ? "co" : "uni", { mil: true }).results.slice(0, 10).some(x => x.s.id === s.id)).map(s => s.id);
ok("every scheme in top 10 when searched by name", !unreach.length, unreach);


// ───────── idea stress-test regressions (24 Nov) ─────────
{ const top=(q,m,n=10)=>run(q,m).results.slice(0,n).map(x=>x.s.id);
  const st=top("Antithrombogenic coating for nitinol stents to reduce restenosis","uni");
  ok("stent idea finds health funders", st.includes("cl1-health")||st.includes("hrb"), st);
  const off=top("Leading edge erosion coating for offshore wind turbine blades","uni");
  ok("offshore erosion finds Marine Institute", off.includes("marine-inst"), off);
  const mr=run("Mould release coating for carbon fibre composite manufacturing","co");
  const fp=M.fieldPicks?M.fieldPicks(mr,8).map(x=>x.s.id):mr.results.slice(0,8).map(x=>x.s.id);
  ok("mould release doesn't pull in space-only schemes", !fp.some(i=>["gstp","philab","cl4-space"].includes(i)), fp);
  const ad=run("small company making adhesives, want to test a new product with a university","co");
  ok("'with a university' detected as industry tie-up", ad.needs.includes("industry"), ad.needs);
  ok("'ship' no longer read as aerospace", !run("antifouling coating for ship hulls","co").inds.includes("aero"), "");
}


// ───────── partner suggestions ─────────
section("Partner suggestions");
{ require('../site/partners.js'); const P=window.PARTNERS, by=Object.fromEntries(S.map(s=>[s.id,s]));
  const pp=(id,q,m)=>M.pickPartners(P,by[id],{text:q,mode:m,inds:M.detectInds(q,window.KEYWORDS)});
  ok("every partner has https url, fields and description", P.every(p=>/^https:\/\//.test(p.url)&&p.ind.length&&p.what.length>20&&p.name), P.filter(p=>!/^https:/.test(p.url)).map(p=>p.id));
  ok("partner ids unique", new Set(P.map(p=>p.id)).size===P.length, "");
  for (const s of S.filter(s=>s.partner)) for (const m of ["uni","co"]) { const r=M.pickPartners(P,s,{text:"",mode:m,inds:[]});
    ok(`${s.id} (${m}): suggests partners with no idea typed`, r.main.length>0, r.kind); }
  const st=pp("cl1-health","coating for nitinol stents","uni"); ok("stent consortium includes a medtech partner", st.main.concat(st.local).some(x=>x.p.ind[0]==="health"), st.main.map(x=>x.p.id));
  const ed=pp("edf","composite armour panel","co"); ok("EDF never suggests UK partners", !ed.main.some(x=>x.p.uk), ed.main.map(x=>x.p.id));
  const fu=pp("fusion","bonded composite panel","co"); ok("InterTradeIreland Fusion suggests Northern Ireland partners", fu.main.length&&fu.main.every(x=>x.p.kind==="ni"), fu.main.map(x=>x.p.id));
  const ipu=pp("ipp","erosion coating for offshore wind blades","uni"); ok("IPP for a university suggests companies", ipu.main.every(x=>x.p.kind==="co"), ipu.main.map(x=>x.p.id));
  const ipc=pp("ipp","specialist adhesives","co"); ok("IPP for a company suggests research groups", ipc.main.every(x=>x.p.kind==="rc"), ipc.main.map(x=>x.p.id));
  const er=pp("cl4","leading edge erosion coating for wind turbine blades","uni"); ok("erosion idea finds blade-erosion specialists", er.main.some(x=>["ore","dtu-wind","iwes"].includes(x.p.id)), er.main.map(x=>x.p.id));
  ok("off-topic partners filtered out when an idea is typed", !ipu.main.some(x=>["bsci","medtronic","ubotica"].includes(x.p.id)), ipu.main.map(x=>x.p.id));
}


// UK partner handling
{ const q="Our research group is speaking with a UAV drone manufacturer in the UK about a research project";
  const r=M.rank(S,{text:q,mode:"uni",today});
  ok("UK partner detected", r.ukP===true, r.ukP);
  ok("no Irish-only or UK-excluded scheme in the top 6 when a UK partner is named", !r.results.slice(0,6).some(x=>x.uk==="no"), r.results.slice(0,6).map(x=>x.s.id+":"+x.uk));
  ok("EPSRC–Research Ireland route reachable for a UK collaboration", r.results.slice(0,10).some(x=>x.s.id==="epsrc-ri"), r.results.slice(0,10).map(x=>x.s.id));
  ok("Northern Ireland is not treated as a GB partner", M.rank(S,{text:"partner in Northern Ireland on composites",mode:"uni",today}).ukP===false,""); }

// ───────── C. ESA TENDER MATCHING ─────────
section("C. ESA tender matching");
const tm = q => M.matchTenders(T, q, { today }).map(x => x.t.id);
const TP = [
 ["Hybrid additive and subtractive manufacturing with brazed joints for space hardware","t-13630"],
 ["Additive manufacturing combined with machining and adhesive bonding","t-13630"],
 ["Deployable reflector antenna for small satellites made from composite","t-13660"],
 ["Machine learning for cyber resilience of ground segment systems","t-13621"],
 ["Recycling metal scrap into powder feedstock for additive manufacturing","t-13689"],
 ["LLM assistant for SysML v2 model-based systems engineering","t-13761"],
 ["Outgassing and thermal cycling tests of a new space adhesive","t-gstp-derisk"],
 ["Satellite data app for monitoring crop health","t-bass-poc"],
 ["Debris shielding material for spacecraft","t-osip-safety"],
 ["Self-healing composite for spacecraft","t-osip-disc"],
 ["AI/ML service on top of a climate data lake","t-eum-destine"],
 ["Corrosion-resistant coating for steel road bridges","t-tii"],
 ["New lining for leaking water pipes","t-uisce"],
 ["Hydrogen-ready coating for gas pipelines","t-gni"],
 ["Anti-icing coating for high voltage grid insulators","t-eirgrid"],
 ["Lightweight composite bogie for rail rolling stock","t-erju"],
 ["Tungsten coating for fusion reactor plasma-facing parts","t-f4e"],
 ["Superconducting magnet support structures for a particle accelerator","t-cern"],
 ["LiDAR validation for atmospheric measurements","t-eum-lidar"],
 ["Sensor for councils to detect illegal dumping","t-sbir"],
 ["Cyber security intrusion detection for critical infrastructure","t-ri-cyber"],
 ["Low-power ice protection coating for aircraft wings","t-cleanav"],
];
for (const [q, id] of TP) { const got = tm(q); ok(`tender flag "${q}" → ${id}`, got.includes(id), got); }
const TN = ["Antimicrobial coating for orthopaedic implants","PhD on wind turbine blade erosion","Mould release for LEGO moulds","Seed investment for a coatings start-up","AI software package for material science","composite","space","",
 "asdkjh qwe zzz","We maintain the supply chain"];
for (const q of TN) { const got = tm(q); ok(`no tender flag for "${q}"`, got.length === 0, got); }
ok("defence-only challenge hidden when defence toggle off", !tm("Lightweight ballistic armour for military vehicles").includes("t-eudis-hubs"), tm("Lightweight ballistic armour for military vehicles"));
ok("defence-only challenge shown when toggle on", M.matchTenders(T,"Lightweight ballistic armour for military vehicles",{today,mil:true}).some(x=>x.t.id==="t-eudis-hubs"), "");
for (const x of T) ok(`${x.id}: has org & mil`, !!x.org && ["civil","defence","dual",undefined].includes(x.mil), [x.org,x.mil]);
ok("closed tenders never flagged after deadline", M.matchTenders(T, "deployable reflector antenna composite", { today: new Date("2026-12-01") }).every(x => x.t.id !== "t-13660"), "");

// ───────── D. ROBUSTNESS & PERFORMANCE ─────────
section("D. Robustness & performance");
const weird = ["", "   ", "a", "!!!", "<img src=x onerror=alert(1)>", "c++ (a|b) [x] {y} * ? ^ $ \\", "🚀🛰️ composite 💡", "x".repeat(20000), "composite ".repeat(3000),
  "COMPOSITE COATING", "compsite cotaing (typos)", "null", "undefined", "0", "Infinity", "𝔠𝔬𝔪𝔭𝔬𝔰𝔦𝔱𝔢"];
for (const w of weird) {
  let err = null, r; try { r = run(w); M.matchTenders(T, w, { today }); } catch (e) { err = e.message; }
  ok(`no crash on ${JSON.stringify(w.slice(0, 30))}${w.length > 30 ? "…" : ""}`, !err && Array.isArray(r.results), err);
  if (r) ok(`why text has no HTML for ${JSON.stringify(w.slice(0, 20))}`, r.results.every(x => !/[<>]/.test(x.why)), r.results.find(x => /[<>]/.test(x.why))?.why);
}
ok("empty text still returns schemes (browse)", run("").results.length > 20, run("").results.length);
let t0 = Date.now(); for (let i = 0; i < 500; i++) { run("Lightweight composite panel bonded for satellites and wind turbines " + i); M.matchTenders(T, "additive manufacturing joining " + i, { today }); }
const ms = (Date.now() - t0) / 500; ok(`ranking is fast (<20ms per keystroke): ${ms.toFixed(2)}ms`, ms < 20, ms);
t0 = Date.now(); run("x".repeat(20000)); ok("20k-char input under 300ms", Date.now() - t0 < 300, Date.now() - t0);

// typo note (known limitation, informational)
console.log("Typo check (informational): 'compsite cotaing' detects", det("compsite cotaing"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log("\nFAILURES:\n- " + fails.join("\n- "));
