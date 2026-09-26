const express=require('express'), path=require('path'), https=require('https');
const app=express(); app.use(express.json({limit:'4mb'})); app.use(express.static(path.join(__dirname,'public')));
const OPEN_SKY_ROOT='https://opensky-network.org/api';
const OPEN_SKY_TOKEN_URL='https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const HEXDB_ROOT='https://hexdb.io';
const UA={'User-Agent':'MSFS-Assignment/1.0 (+global)','Accept':'application/json'};
const clean=s=>String(s??'').trim();
let token=null, tokenExpiry=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function errDetail(e){
  const c=e&&e.cause||{};
  const bits=[e&&e.message,c.code,c.message,c.address&&`address=${c.address}`,c.port&&`port=${c.port}`].filter(Boolean);
  return [...new Set(bits)].join(' | ')||String(e);
}

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function httpsIPv4(url,opts={},timeout=25000,label='HTTP'){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const req=https.request({protocol:u.protocol,hostname:u.hostname,port:u.port||443,path:u.pathname+u.search,method:opts.method||'GET',headers:opts.headers||{},family:4,timeout},r=>{
      const chunks=[]; r.on('data',c=>chunks.push(c)); r.on('end',()=>{
        const body=Buffer.concat(chunks);
        resolve({status:r.statusCode||0,ok:(r.statusCode||0)>=200&&(r.statusCode||0)<300,headers:r.headers,
          text:async()=>body.toString('utf8'),json:async()=>JSON.parse(body.toString('utf8'))});
      });
    });
    req.on('timeout',()=>req.destroy(Object.assign(new Error(`${label} IPv4 socket timeout after ${timeout} ms`),{code:'ETIMEDOUT'})));
    req.on('error',reject);
    if(opts.body){const b=typeof opts.body==='string'||Buffer.isBuffer(opts.body)?opts.body:opts.body.toString();req.write(b)}
    req.end();
  });
}
async function fetchTimeout(url,opts={},timeout=25000,label='HTTP',forceIPv4=false){
  let last;
  for(let n=0;n<4;n++){
    const attempt=n+1;
    try{
      console.log(`[${label}] attempt ${attempt}/4 ${url}${forceIPv4?' [IPv4]':''}`);
      const r=forceIPv4?await httpsIPv4(url,opts,timeout,label):await fetch(url,{...opts,signal:AbortSignal.timeout(timeout)});
      console.log(`[${label}] attempt ${attempt}/4 -> HTTP ${r.status}`);
      if(![429,500,502,503,504].includes(r.status)||attempt===4)return r;
      last=Error(`HTTP ${r.status}`);
    }catch(e){
      last=e;
      console.error(`[${label}] attempt ${attempt}/4 failed: ${errDetail(e)}`);
      if(attempt===4)throw Error(`${label} network failure after 4 attempts: ${errDetail(e)}`);
    }
    await sleep(1000*Math.pow(2,n));
  }
  throw Error(`${label} failed: ${errDetail(last)}`);
}
async function fetchToken(){const id=clean(process.env.OPENSKY_CLIENT_ID), secret=clean(process.env.OPENSKY_CLIENT_SECRET);if(!id||!secret)return false;try{const body=new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret});const r=await fetchTimeout(OPEN_SKY_TOKEN_URL,{method:'POST',headers:{...UA,'Content-Type':'application/x-www-form-urlencoded'},body},20000,'OpenSky OAuth',true);if(!r.ok)throw Error(`OpenSky OAuth HTTP ${r.status}: ${(await r.text()).slice(0,180)}`);const j=await r.json();token=j.access_token||null;tokenExpiry=Date.now()+Number(j.expires_in||1800)*1000;return !!token}catch(e){console.error('[OpenSky OAuth] '+errDetail(e));return false}}
async function authHeaders(){if(clean(process.env.OPENSKY_CLIENT_ID)&&clean(process.env.OPENSKY_CLIENT_SECRET)){if(!token||Date.now()>=tokenExpiry-60000)await fetchToken();if(token)return {...UA,Authorization:`Bearer ${token}`}}return UA}
async function openskyGet(url,timeout=25000){let headers=await authHeaders();let opts={headers};const user=clean(process.env.OPENSKY_USERNAME), pass=clean(process.env.OPENSKY_PASSWORD);if(!headers.Authorization&&user&&pass)opts.headers={...UA,Authorization:'Basic '+Buffer.from(`${user}:${pass}`).toString('base64')};let r=await fetchTimeout(url,opts,timeout,'OpenSky',true);if(r.status===401&&clean(process.env.OPENSKY_CLIENT_ID)&&clean(process.env.OPENSKY_CLIENT_SECRET)){token=null;if(await fetchToken())r=await fetchTimeout(url,{headers:await authHeaders()},timeout,'OpenSky',true)}return r}
async function states(){const r=await openskyGet(`${OPEN_SKY_ROOT}/states/all`,25000);if(r.status===429)throw Error('OpenSky rate limit hit.');if(r.status===401||r.status===403)throw Error('OpenSky unauthorized (check OAuth2 client or legacy basic).');if(!r.ok)throw Error(`OpenSky HTTP ${r.status}`);const j=await r.json();return j.states||[]}
async function hexInfo(hex){try{const r=await fetchTimeout(`${HEXDB_ROOT}/api/v1/aircraft/${hex.toLowerCase()}`,{headers:UA},20000,'HexDB');if(r.status===404)return {};if(!r.ok)return {};return await r.json()}catch{return {}}}
async function lastArrival(hex){const now=Math.floor(Date.now()/1000),begin=now-48*3600;try{const r=await openskyGet(`${OPEN_SKY_ROOT}/flights/aircraft?icao24=${encodeURIComponent(hex)}&begin=${begin}&end=${now}`,30000);if([401,403,404,429].includes(r.status))return null;if(!r.ok)return null;const flights=await r.json();flights.sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0));for(const f of flights){if(f.estArrivalAirport)return f.estArrivalAirport}}catch{}return null}
app.get('/api/health',(q,s)=>s.json({ok:true,name:'DispatchLink iPad',version:'1.4.0',generator:'OpenSky+HexDB',browserOpenSky:true}));
app.get('/api/opensky/probe',async(q,res)=>{const started=Date.now();try{const r=await openskyGet(`${OPEN_SKY_ROOT}/states/all?lamin=39&lomin=-87&lamax=41&lomax=-85`,15000);const body=await r.text();return res.status(r.ok?200:502).json({ok:r.ok,http:r.status,elapsedMs:Date.now()-started,auth:(await authHeaders()).Authorization?'oauth':(clean(process.env.OPENSKY_USERNAME)&&clean(process.env.OPENSKY_PASSWORD)?'basic':'anonymous'),bodyPreview:body.slice(0,160)})}catch(e){return res.status(502).json({ok:false,elapsedMs:Date.now()-started,error:errDetail(e)})}});
app.get('/api/config',(q,s)=>s.json({generator:'OpenSky+HexDB',oauthConfigured:!!(clean(process.env.OPENSKY_CLIENT_ID)&&clean(process.env.OPENSKY_CLIENT_SECRET)),basicConfigured:!!(clean(process.env.OPENSKY_USERNAME)&&clean(process.env.OPENSKY_PASSWORD)),anonymousFallback:true,maxChecks:600}));
async function chooseFromStates(live,regPrefix,makeContains,modelContains){
  if(!Array.isArray(live)||!live.length)throw Error('OpenSky has no live states.');
  const hexes=shuffle(live.filter(r=>r&&r[0]).map(r=>String(r[0]).toLowerCase()));
  const maxChecks=Math.min(hexes.length,600);
  for(const hx of hexes.slice(0,maxChecks)){
    const info=await hexInfo(hx); if(!info||!Object.keys(info).length)continue;
    const reg=clean(info.Registration),mk=clean(info.Manufacturer),md=clean(info.Type||info.ICAOTypeCode);
    if(regPrefix&&!reg.toUpperCase().startsWith(regPrefix.toUpperCase()))continue;
    if(makeContains&&!mk.toLowerCase().includes(makeContains.toLowerCase()))continue;
    if(modelContains&&!md.toLowerCase().includes(modelContains.toLowerCase()))continue;
    let last='—'; try{last=await lastArrival(hx)||'—'}catch{}
    return {tail:reg,make:mk,model:md,serial:info.SerialNo||info.Serial||info.MSN||'—',year:info.YearBuilt||info.Year||'—',icao24:hx,operator:info.RegisteredOwners||info.Operator||info.OperatorFlagCode||'—',last_position:last,source:'OpenSky+HexDB',checked:maxChecks};
  }
  throw Object.assign(Error('No live aircraft matched those Global filters.'),{status:404});
}
app.post('/api/global/from-states',async(req,res)=>{
  const regPrefix=clean(req.body.prefix),makeContains=clean(req.body.make),modelContains=clean(req.body.model),live=req.body.states;
  try{return res.json(await chooseFromStates(live,regPrefix,makeContains,modelContains))}catch(e){return res.status(e.status||502).json({error:e.message||'Global lookup failed.'})}
});
app.get('/api/global/random',async(req,res)=>{const regPrefix=clean(req.query.prefix), makeContains=clean(req.query.make), modelContains=clean(req.query.model);try{const live=await states();if(!live.length)throw Error('OpenSky has no live states.');const hexes=shuffle(live.filter(r=>r&&r[0]).map(r=>String(r[0]).toLowerCase()));const maxChecks=Math.min(hexes.length,600);for(const hx of hexes.slice(0,maxChecks)){const info=await hexInfo(hx);if(!info||!Object.keys(info).length)continue;const reg=clean(info.Registration), mk=clean(info.Manufacturer), md=clean(info.Type||info.ICAOTypeCode);if(regPrefix&&!reg.toUpperCase().startsWith(regPrefix.toUpperCase()))continue;if(makeContains&&!mk.toLowerCase().includes(makeContains.toLowerCase()))continue;if(modelContains&&!md.toLowerCase().includes(modelContains.toLowerCase()))continue;const last=await lastArrival(hx)||'—';return res.json({tail:reg,make:mk,model:md,serial:info.SerialNo||info.Serial||info.MSN||'—',year:info.YearBuilt||info.Year||'—',icao24:hx,operator:info.RegisteredOwners||info.Operator||info.OperatorFlagCode||'—',last_position:last,source:'OpenSky+HexDB',checked:maxChecks})}return res.status(404).json({error:'No live aircraft matched those Global filters.'})}catch(e){return res.status(502).json({error:e.message||'Global lookup failed.',detail:errDetail(e)})}});
app.post('/api/parse-fr24',(req,res)=>{const t=String(req.body.text||''),lines=t.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),rows=[],rx=/(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4}).*?\b([A-Z0-9]{3,4})\b.*?\b([A-Z][A-Z0-9-]{2,9})\b.*?\b([A-Z0-9]{2,3}\d{1,5}[A-Z]?)\b.*?\b([A-Z]{3,4})\b.*?\b([A-Z]{3,4})\b.*?(\d{2}:?\d{2})\s*(?:Z)?.*?(\d{2}:?\d{2})/i;for(const l of lines){const m=l.match(rx);if(m)rows.push({dof:m[1],ac:m[2].toUpperCase(),reg:m[3].toUpperCase(),flight:m[4].toUpperCase(),dep:m[5].toUpperCase(),arr:m[6].toUpperCase(),std:m[7]+'Z',sta:m[8]+'Z'})}res.json({rows,parsed:rows.length})});
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('DispatchLink iPad 1.4.0 ready — browser-first OpenSky + HexDB'));
