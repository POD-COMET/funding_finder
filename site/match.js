// Matching engine shared by the page and the test suite.
(function(root){
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // "word$" = whole word (plural allowed); words of 3 letters or fewer are always whole-word; others match by word start.
  const rx=w=>{const whole=w.endsWith('$');const b=whole?w.slice(0,-1):w;
    return new RegExp('(^|[^a-z0-9])'+esc(b)+((whole||b.replace(/[^a-z0-9]/g,'').length<=3)?'(?:s|es)?(?![a-z0-9])':''),'i');};
  const cache=new Map(); const R=w=>{if(!cache.has(w))cache.set(w,rx(w));return cache.get(w);};
  const hasAny=(text,words)=>words.some(w=>R(w).test(text));
  const STOP=new Set(['with','that','this','from','into','also','have','will','which','their','using','based','some','them','they','your','would','could','about','where','when','what','more','very','want','need','make','like','developing','develop','project','idea','package','working','looking','funding','fund','new','for','the','and']);

  function detectInds(text,KW){const t=text.toLowerCase();return Object.keys(KW).filter(k=>hasAny(t,KW[k]));}
  function detectNeeds(text,NW){const t=text.toLowerCase();return Object.keys(NW).filter(k=>hasAny(t,NW[k]));}
  function detectStage(text,SW){const t=text.toLowerCase();const hit=Object.keys(SW).filter(k=>hasAny(t,SW[k]));return hit.length?+hit[hit.length-1]:null;}

  function live(s,today){const d=x=>x?new Date(x+"T00:00:00"):null;const dl=d(s.deadline),op=d(s.opens);
    if(s.status==="open"&&dl&&dl<today)return"closed";
    if(s.status==="upcoming"&&op&&op<=today&&(!dl||dl>=today))return"open";return s.status;}
  const neutral=s=>s.ind.length>=5;
  const SIZE=x=>x==null?"v":x<=5e4?"s":x<=25e4?"m":x<=1e6?"l":"xl";

  function rank(S,o){
    const W=root, today=o.today||new Date(new Date().setHours(0,0,0,0));
    const text=(o.text||"").trim();
    const inds=o.inds??detectInds(text,W.KEYWORDS);
    const cx=o.ctx&&(o.ctx.expertise||o.ctx.base||o.ctx.consortia)?o.ctx:null;
    const cxText=cx?[cx.expertise,cx.facilities,cx.notes].filter(Boolean).join(" ").toLowerCase():"";
    const cxInds=cx?detectInds(cxText,W.KEYWORDS):[];
    const cxWords=cx?[...new Set(cxText.split(/[^a-z0-9-]+/).filter(w=>w.length>5))].slice(0,40):[];
    const ukP=/\b(uk|u\.k\.|united kingdom|britain|british|great britain|england|scotland|scottish|wales|welsh)\b/i.test(text)&&!/northern ireland/i.test(text);
    const UKP=W.UK_PARTNER||{};const ukOf=id=>ukP?(UKP.ok||[]).includes(id)?'ok':(UKP.own||[]).includes(id)?'own':(UKP.no||[]).includes(id)?'no':(UKP.check||[]).includes(id)?'check':null:null;
    const needs=detectNeeds(text,W.NEED_WORDS);
    const stageHint=o.stage?null:detectStage(text,W.STAGE_WORDS);
    const words=text.toLowerCase().split(/[^a-z0-9-]+/).filter(w=>w.length>3&&!STOP.has(w));
    const out=[];
    for(const s of S){
      if(!(s.who==="both"||s.who===o.mode))continue;
      if(!o.mil&&s.mil==="defence")continue;
      const pNeed=s.partner&&s.partner.need!=="optional";
      if(o.partner==="solo"&&s.partner&&s.partner.need==="required")continue;
      if(o.partner==="team"&&!pNeed)continue;
      let sc=0,why=[];
      const ov=s.ind.filter(i=>inds.includes(i));
      if(inds.length){
        if(!neutral(s)&&ov.length){sc+=4+1.5*(ov.length-1)+(inds.includes(s.ind[0])?1:(DOMAIN.has(s.ind[0])?-4:-1.5));why.push("Focused on "+ov.map(i=>W.INDUSTRIES[i].split(/[ ,&]/)[0]).join(", "));}
        else if(neutral(s))sc+=1.5; else continue;
      } else sc+= neutral(s)?1.5:0.5;
      if(s.focus){const tl=text.toLowerCase();if(!s.focus.some(f=>tl.includes(f)))sc-=3.5;}
      const pn=s.purpose.filter(p=>needs.includes(p));
      if(pn.length){sc+=2.5;why.push("fits: "+pn.map(p=>W.PURPOSES[p].label.toLowerCase()).join(", "));}
      else if(!needs.length){const soft=o.mode==="co"?["companyrd","industry"]:["research","commercialise","industry"];if(s.purpose.some(p=>soft.includes(p)))sc+=1.2;}
      if(o.stage){ if(s.stage===o.stage)sc+=3; else if(o.stage<=4&&s.stage===o.stage+1){sc+=1;why.push("next step");} else if(s.stage!==6)sc-=2; }
      else if(stageHint&&s.stage===stageHint)sc+=1;
      if(o.size){const z=SIZE(s.max);if(z===o.size)sc+=1.5;else if(z!=="v"){const k=["s","m","l","xl"];if(Math.abs(k.indexOf(z)-k.indexOf(o.size))>1)sc-=1.5;}}
      const nameHits=words.filter(w=>s.name.toLowerCase().includes(w)).length;
      if(nameHits)sc+=Math.min(3.6,nameHits*1.2);
      const hay=(s.name+" "+s.summary+" "+s.type+" "+s.req.join(" ")).toLowerCase();
      const hits=[...new Set(words.filter(w=>hay.includes(w)))];
      if(hits.length){sc+=Math.min(2.4,hits.length*.8);why.push("mentions "+hits.slice(0,2).map(h=>"“"+h+"”").join(", "));}
      const l=live(s,today);sc+={open:.6,rolling:.4,upcoming:.3,check:.1,closed:0}[l];
      if(o.sem&&o.sem[s.id]!=null){const v=o.sem[s.id];if(v>.3){sc+=Math.min(4.5,(v-.3)*15);if(v>.42)why.push("close in meaning to your idea");}}
      if(cx){ // organisation profile: a gentle nudge, never stronger than the idea itself
        if(cxInds.includes(s.ind[0])){sc+=.8;why.push("fits your organisation's expertise");}
        const cw=cxWords.filter(w=>(s.name+" "+s.summary).toLowerCase().includes(w)).length;sc+=Math.min(1.2,cw*.3);
        if(cx.base&&cx.base!=="ie"&&["EI","RI","ARC","SEAI","LEO","TAX"].includes(s.group)){sc-=cx.base==="ni"&&s.group==="RI"?1:4;why.push("normally needs a base in the Republic of Ireland");}
        if(cx.base==="ni"&&(s.id==="fusion"||s.group==="OTH"))sc+=1;
        const pn=s.partner&&s.partner.kind==="intl"?s.partner.need:null;if(cx.consortia==="no"&&pn==="required"){sc-=1.5;why.push("needs an international consortium");}else if(cx.consortia==="yes"&&(pn==="required"||pn==="usually"))sc+=.4;
      }
      const uk=ukOf(s.id);if(uk==='ok'){sc+=s.id==='epsrc-ri'?4:1.5;why.push("UK partner can join and be funded");}else if(uk==='no'){sc-=5;why.push("won't fund a UK-based partner");}else if(uk==='own'){sc-=1;why.push("UK partner funded by its own agency");}else if(uk==='check'){sc-=.8;why.push("UK participation depends on the call");}
      out.push({s,sc:Math.round(sc*100)/100,why:why.join(" · "),specialist:!neutral(s),uk});
    }
    out.sort((a,b)=>b.sc-a.sc);
    return {results:out,inds,needs,stageHint,ukP};
  }
  // Field-specific picks balanced across every detected industry (round-robin), so each angle of a cross-sector idea is represented.
  // Field picks: best by score, then make sure every detected field has at least one scheme centred on it (main field = ind[0]).
  function fieldPicks(res,n){const spec=res.results.filter(x=>x.specialist);const inds=res.inds;if(!inds.length)return spec.slice(0,n);
    const picked=spec.slice(0,n);
    for(const i of inds){
      if(picked.some(p=>p.s.ind[0]===i))continue;
      const cand=spec.find(y=>y.s.ind[0]===i&&!picked.includes(y));if(!cand)continue;
      if(picked.length<n){picked.push(cand);continue;}
      const cnt=f=>picked.filter(p=>p.s.ind[0]===f).length;
      let drop=-1;for(let k=picked.length-1;k>=0;k--){const f=picked[k].s.ind[0];if(!inds.includes(f)||cnt(f)>1){drop=k;break;}}
      if(drop>=0)picked[drop]=cand;}
    return picked.sort((a,b)=>b.sc-a.sc);}
  // ESA tender matching: flag only on specific evidence, not on generic words.
  function tenderLive(t,today){const d=x=>x?new Date(x+"T00:00:00"):null;const dl=d(t.deadline),op=d(t.opens);
    if(t.kind==="Intended ITT"||t.kind==="Upcoming call")return"intended";if(t.watch||t.check)return"watch";
    if(dl&&dl<today)return"closed";
    if(op&&op>today)return"upcoming";
    return"open";}
  const GENERIC=new Set(["composite","coating","material","materials","lightweight","structure","sensor","testing","data","ai","precision","instrument","water","public sector","infrastructure","maintenance","inspection","durability","steel","concrete","polymer","machining","detector","radiation","vacuum","cryogenic","magnet","optics","recycl","circular","climate","energy","electricity","network","seal","pipe","pump","station","track"]);
  const DOMAIN=new Set(["space","health","sec","aero"]);
  function matchTenders(T,text,o={}){
    const today=o.today||new Date(new Date().setHours(0,0,0,0));const t=(text||"").toLowerCase();if(t.trim().length<3)return[];
    const out=[];
    for(const x of T){const l=tenderLive(x,today);if(l==="closed")continue;if(!o.mil&&x.mil==="defence")continue;
      const hits=[...new Set(x.kw.filter(w=>R(w).test(t)))], strong=x.strong.filter(w=>R(w).test(t));
      const shown=[...new Set(hits.map(w=>{const mm=R(w).exec(t);if(!mm)return w;const st=mm.index+mm[1].length;const rest=t.slice(st).match(/^[a-z0-9][a-z0-9\- ]*?(?=[^a-z0-9\-]|$)/);const one=(t.slice(st).match(/^[a-z0-9\-]+/)||[w])[0];return w.includes(' ')?t.slice(st,st+w.length+ (one.length>w.length?0:0)).trim():one;}))];
      const ok=(strong.length>=1&&hits.length>=2)||hits.length>=3;
      if(!ok){ // weaker, specific overlap -> "possibly related" (never silently dropped)
        const spec=hits.filter(w=>!GENERIC.has(w));
        if(o.related&&(strong.length>=1||spec.length>=1))out.push({t:x,live:l,hits,shown,strong,related:true,score:spec.length+2*strong.length});
        else if(o.sem&&(o.sem[x.id]||0)>=.56)out.push({t:x,live:l,hits,shown,strong,related:true,score:o.sem[x.id]*4});
        continue;}
      const isITT=x.kind==="ITT"||x.kind==="Intended ITT";
      out.push({t:x,live:l,hits,shown,strong,score:hits.length+2*strong.length+(isITT?1.5:0)+(l==="open"&&isITT?1:0)});}
    return out.sort((a,b)=>b.score-a.score);}

  // Potential partners for a route. Pool depends on the kind of partner the route needs;
  // ranking uses idea keywords (x3), idea fields (x2) and the route's own fields (x1).
  const NO_UK=new Set(["edf","edf-sme","eudis-spinin","eudis-acc","interreg-nwe","interreg-aa","i3"]);
  const CHECK_UK=new Set(["cleanh2","ihi","cetp","mera","ramp"]);
  function pickPartners(P,s,o={}){
    if(!s.partner||!P)return null;
    const text=(o.text||"").toLowerCase(),mode=o.mode||"uni",inds=o.inds||[];
    let kind=s.partner.kind;if(s.id==="ri-usi")kind="cross";
    const pool=kind==="intl"?["eu","prime"]:kind==="cross"?["ni"]:kind==="irish"?["rc","co"]:(mode==="uni"?["co"]:["rc"]);
    const noUK=NO_UK.has(s.id);
    const score=p=>{const kw=p.kw.filter(k=>R(k).test(text)).length;
      const io=p.ind.filter(i=>inds.includes(i)&&i!=="mat").length+(inds.includes("mat")&&p.ind.includes("mat")?0.5:0);
      const so=p.ind.filter(i=>s.ind.includes(i)).length;if(text&&!kw&&!io)return 0;return kw*3+io*2+so*(text?0.5:1);};
    const rank=kinds=>P.filter(p=>kinds.includes(p.kind)&&!(noUK&&p.uk)).map(p=>({p,sc:score(p),kw:p.kw.filter(k=>R(k).test(text))})).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc);
    let main=rank(pool);
    if(kind==="intl"){const pr=main.filter(x=>x.p.kind==="prime");main=main.filter(x=>x.p.kind!=="prime").slice(0,4).concat(pr.slice(0,s.ind.includes("space")||inds.includes("space")?1:0)).sort((a,b)=>b.sc-a.sc);}
    else main=main.slice(0,5);
    const local=kind==="intl"?rank(mode==="uni"?["co","rc"]:["rc","co"]).slice(0,2):[];
    const uk=noUK?"no":CHECK_UK.has(s.id)?"check":(kind==="intl"?"yes":null);
    return {main,local,uk,kind};
  }
  root.Matcher={pickPartners,rank,matchTenders,tenderLive,fieldPicks,detectInds,detectNeeds,live,neutral};
})(typeof window!=="undefined"?window:globalThis);
