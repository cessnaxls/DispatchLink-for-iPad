const express=require('express'), path=require('path');
const app=express(); app.use(express.json({limit:'4mb'})); app.use(express.static(path.join(__dirname,'public')));
const clean=s=>String(s??'').trim();
const UA={'User-Agent':'DispatchLink-iPad/1.2','Accept':'application/json'};
const HOTSPOTS=[
 [40.64,-73.78,'New York'],[33.94,-118.40,'Los Angeles'],[41.98,-87.90,'Chicago'],[32.90,-97.04,'Dallas'],[33.64,-84.43,'Atlanta'],
 [51.47,-0.45,'London'],[50.04,8.57,'Frankfurt'],[48.35,11.79,'Munich'],[49.01,2.55,'Paris'],[52.31,4.76,'Amsterdam'],
 [25.25,55.36,'Dubai'],[25.27,51.61,'Doha'],[1.36,103.99,'Singapore'],[35.55,139.78,'Tokyo'],[22.31,113.91,'Hong Kong'],
 [-33.95,151.18,'Sydney'],[-37.67,144.84,'Melbourne'],[-23.43,-46.47,'Sao Paulo'],[19.44,-99.07,'Mexico City'],[43.68,-79.63,'Toronto']
];
const PROVIDERS=[
 {name:'ADSB.lol',url:(lat,lon)=>`https://api.adsb.lol/v2/point/${lat}/${lon}/250`},
 {name:'Airplanes.live',url:(lat,lon)=>`https://api.airplanes.live/v2/point/${lat}/${lon}/250`}
];
async function getJson(url,timeout=15000){let r;try{r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(timeout)})}catch(e){throw Error(e.name==='TimeoutError'?'upstream timed out':`network error: ${e.message}`)}if(!r.ok)throw Error(`HTTP ${r.status}`);try{return await r.json()}catch{throw Error('upstream returned invalid JSON')}}
async function liveRegion(h){let errors=[];for(const p of PROVIDERS){try{let j=await getJson(p.url(h[0],h[1]));let ac=Array.isArray(j.ac)?j.ac:[];if(ac.length)return {aircraft:ac,provider:p.name,region:h[2]};errors.push(`${p.name}: empty response`)}catch(e){errors.push(`${p.name}: ${e.message}`)}}throw Error(errors.join(' | '))}
async function hexInfo(h){if(!h)return {};try{return await getJson(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(h)}`,8000)}catch{return {}}}
function airborne(a){let alt=a.alt_baro??a.alt_geom;return a&&a.hex&&!a.ground&&(alt===undefined||alt===null||alt==='ground'||Number(alt)>100)}
function shuffle(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function basic(a){return {tail:clean(a.r),model:clean(a.t),icao24:clean(a.hex).replace(/^~/,''),callsign:clean(a.flight),altitude:a.alt_baro??a.alt_geom??'—',speed:a.gs??'—',track:a.track??'—',lat:a.lat??null,lon:a.lon??null}}
app.get('/api/health',(q,s)=>s.json({ok:true,name:'DispatchLink iPad',version:'1.2.0',liveProviders:PROVIDERS.map(x=>x.name)}));
app.get('/api/config',(q,s)=>s.json({generator:'Global Live only',liveProviders:PROVIDERS.map(x=>x.name),credentialsRequired:false}));
app.get('/api/global/random',async(q,s)=>{let pre=clean(q.query.prefix).toUpperCase(),mk=clean(q.query.make).toLowerCase(),md=clean(q.query.model).toLowerCase();let regions=shuffle([...HOTSPOTS]).slice(0,8),providerErrors=[],checked=0;try{for(const h of regions){let live;try{live=await liveRegion(h)}catch(e){providerErrors.push(`${h[2]}: ${e.message}`);continue}let candidates=shuffle(live.aircraft.filter(airborne));for(const raw of candidates.slice(0,120)){checked++;let b=basic(raw);if(pre&&!(b.tail||'').toUpperCase().startsWith(pre))continue;if(md&&!(b.model||'').toLowerCase().includes(md)){let maybeType=(b.model||'').toLowerCase();if(maybeType&&!maybeType.includes(md))continue}
 let info={};if(mk||!b.tail||!b.model)info=await hexInfo(b.icao24);let reg=(b.tail||clean(info.Registration)).toUpperCase(),make=clean(info.Manufacturer),model=b.model||clean(info.Type||info.ICAOTypeCode);if(pre&&!reg.startsWith(pre))continue;if(mk&&!make.toLowerCase().includes(mk))continue;if(md&&!model.toLowerCase().includes(md))continue;
 return s.json({...b,tail:reg||'—',make:make||'—',model:model||'—',serial:info.SerialNo||info.Serial||info.MSN||'—',year:info.YearBuilt||info.Year||'—',operator:info.RegisteredOwners||info.Operator||info.OperatorFlagCode||'—',source:`${live.provider} live · ${live.region}`});}}
 if(providerErrors.length===regions.length)return s.status(502).json({error:'Both live ADS-B providers were unreachable. Try again in a moment.',details:providerErrors.slice(0,3)});return s.status(404).json({error:`No airborne aircraft matched those filters after checking ${checked} live aircraft across ${regions.length} traffic regions. Try broader filters.`});}catch(e){return s.status(502).json({error:`Live aircraft lookup failed: ${e.message}`})}});
app.post('/api/parse-fr24',(req,res)=>{const t=String(req.body.text||''),lines=t.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),rows=[],rx=/(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4}).*?\b([A-Z0-9]{3,4})\b.*?\b([A-Z][A-Z0-9-]{2,9})\b.*?\b([A-Z0-9]{2,3}\d{1,5}[A-Z]?)\b.*?\b([A-Z]{3,4})\b.*?\b([A-Z]{3,4})\b.*?(\d{2}:?\d{2})\s*(?:Z)?.*?(\d{2}:?\d{2})/i;for(const l of lines){const m=l.match(rx);if(m)rows.push({dof:m[1],ac:m[2].toUpperCase(),reg:m[3].toUpperCase(),flight:m[4].toUpperCase(),dep:m[5].toUpperCase(),arr:m[6].toUpperCase(),std:m[7]+'Z',sta:m[8]+'Z'})}res.json({rows,parsed:rows.length})});
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('DispatchLink iPad 1.2 ready'));
