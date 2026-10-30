/* AC tools for the office and technicians: BTU calculator, unit converter, refrigerant
   pressure–temperature lookup with superheat, troubleshooting and maintenance guides.
   Customers get the BTU calculator while booking ("Not sure of the size?"). */
import * as K from './core.js';
const { UI, esc, render, toast } = K;

/* ---------- BTU calculator ----------
   Rule of thumb for hot, humid climates like the Maldives: about 600 BTU/h per m² of floor
   with a 2.7 m ceiling, adjusted for sun, people, a kitchen and a roof above. */
export const SIZES = [9000, 12000, 18000, 24000, 30000, 36000, 48000];
export function btu(v){
  const l=+v.l||0, w=+v.w||0, area=l*w; if(area<=0) return null;
  const h=Math.max(+v.h||2.7, 2.4);
  let b = area*600*Math.max(1, h/2.7);
  b *= {shade:0.9, normal:1, sunny:1.1, west:1.15}[v.sun||'normal'];
  if(v.roof) b *= 1.1;
  b += Math.max(0, (+v.people||2) - 2) * 600;
  if(v.kitchen) b += 4000;
  b = Math.round(b/100)*100;
  const size = SIZES.find(s=>s>=b);
  return {area, btu:b, size, kw:b/3412, split: size? 1 : Math.ceil(b/24000)};
}
const fmt = n => Math.round(n).toLocaleString('en-US');
const BTU0 = {l:'4', w:'3.5', h:'2.7', sun:'normal', people:'2', kitchen:false, roof:false};
function btuState(){ return UI.btu || (UI.btu={...BTU0}); }
/** Matching choice in the customer's booking list ("12,000 BTU", "30,000+ BTU"). */
export const bookingSize = r => !r ? 'Not sure' : !r.size || r.size>24000 ? '30,000+ BTU' : fmt(r.size)+' BTU';

function btuResult(){
  const r=btu(btuState());
  if(!r) return `<p class="muted">Enter the room's length and width.</p>`;
  return `<div class="calc-out"><span class="label">Recommended size</span>
    <b>${r.size? fmt(r.size)+' BTU' : `${r.split} × 24,000 BTU`}</b>
    <small>${r.size? `${(r.size/12000).toFixed(r.size%12000?1:0)} ton · ${(r.size/3412).toFixed(1)} kW` : 'Too big for one unit: split it between units'}</small>
    <small>Room ${r.area.toFixed(1)} m² needs about ${fmt(r.btu)} BTU/h</small></div>`;
}
export function btuCalculator(forBooking){
  const v=btuState(), opt=(k,list)=>list.map(([val,l])=>`<option value="${val}" ${String(v[k])===String(val)?'selected':''}>${l}</option>`).join('');
  return `<div class="calc" data-calc="btu">
    <div class="grid3"><label class="field"><span>Length (m)</span><input id="btu-l" data-btu="l" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(v.l)}"></label>
      <label class="field"><span>Width (m)</span><input id="btu-w" data-btu="w" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(v.w)}"></label>
      <label class="field"><span>Ceiling (m)</span><input id="btu-h" data-btu="h" type="number" inputmode="decimal" min="2" step="0.1" value="${esc(v.h)}"></label></div>
    <div class="grid2"><label class="field"><span>Sunlight</span><select id="btu-sun" data-btu="sun">${opt('sun',[['shade','Shaded most of the day'],['normal','Normal'],['sunny','Sunny, big windows'],['west','Afternoon sun (west-facing)']])}</select></label>
      <label class="field"><span>People usually in the room</span><input id="btu-p" data-btu="people" type="number" inputmode="numeric" min="1" max="50" value="${esc(v.people)}"></label></div>
    <div class="row"><label class="row small" style="gap:6px"><input type="checkbox" id="btu-k" data-btu="kitchen" ${v.kitchen?'checked':''}> Kitchen or cooking in the room</label>
      <label class="row small" style="gap:6px"><input type="checkbox" id="btu-r" data-btu="roof" ${v.roof?'checked':''}> Top floor, roof above</label></div>
    <div data-btu-out>${btuResult()}</div>
    ${forBooking?`<div class="row"><button class="btn primary" data-act="useBtu">Use this size</button></div>`:''}
    <p class="small muted">A guide only. Long rooms, open doors or many appliances need more.</p></div>`;
}

/* ---------- converter ---------- */
const CONV = {
  cap:{btu:1, kw:3412.14, ton:12000},          // to BTU/h
  pres:{psi:1, bar:14.5038, kpa:0.145038, mpa:145.038},
  temp:null
};
function convert(group, from, val){
  const out={};
  if(group==='temp'){ const c = from==='c'? val : (val-32)*5/9; out.c=c; out.f=c*9/5+32; return out; }
  const base=val*CONV[group][from]; for(const k in CONV[group]) out[k]=base/CONV[group][k]; return out;
}
const dp = {btu:0, kw:2, ton:2, psi:1, bar:2, kpa:0, mpa:3, c:1, f:1};
function converter(){
  const f=(g,k,l,v)=>`<label class="field"><span>${l}</span><input id="cv-${k}" data-conv="${g}" data-k="${k}" type="number" inputmode="decimal" step="any" value="${v}"></label>`;
  return `<div class="calc"><h4>Cooling capacity</h4><div class="grid3">${f('cap','btu','BTU/h',12000)}${f('cap','kw','kW',(12000/3412.14).toFixed(2))}${f('cap','ton','Ton',1)}</div>
    <h4>Pressure</h4><div class="grid4">${f('pres','psi','psi',120)}${f('pres','bar','bar',(120/14.5038).toFixed(2))}${f('pres','kpa','kPa',(120/0.145038).toFixed(0))}${f('pres','mpa','MPa',(120/145.038).toFixed(3))}</div>
    <h4>Temperature</h4><div class="grid2">${f('temp','c','°C',24)}${f('temp','f','°F',75.2)}</div></div>`;
}

/* ---------- refrigerants ----------
   Saturation pressure (psig) against temperature (°F), from standard P-T charts. */
const PT = {
  'R410A': [[0,48.6],[10,62.2],[20,78.3],[30,97.0],[40,118.8],[50,142.6],[60,170.0],[70,201.0],[80,235.9],[90,274.1],[100,317.6],[110,365.0],[120,418.0]],
  'R22':   [[0,24.0],[10,32.8],[20,43.0],[30,54.9],[40,68.5],[50,84.0],[60,101.6],[70,121.4],[80,143.6],[90,168.4],[100,195.9],[110,226.4],[120,259.9]]
};
function interp(tab, x, xi, yi){
  if(x<=tab[0][xi]) return tab[0][yi] + (x-tab[0][xi])*(tab[1][yi]-tab[0][yi])/(tab[1][xi]-tab[0][xi]);
  for(let i=1;i<tab.length;i++) if(x<=tab[i][xi]) return tab[i-1][yi] + (x-tab[i-1][xi])*(tab[i][yi]-tab[i-1][yi])/(tab[i][xi]-tab[i-1][xi]);
  const n=tab.length; return tab[n-2][yi] + (x-tab[n-2][xi])*(tab[n-1][yi]-tab[n-2][yi])/(tab[n-1][xi]-tab[n-2][xi]);
}
const F2C = f => (f-32)*5/9, C2F = c => c*9/5+32;
export const satTempC = (gas, psig) => PT[gas] ? F2C(interp(PT[gas], +psig, 1, 0)) : null;
function ptState(){ return UI.pt || (UI.pt={gas:'R410A', psi:'120', line:'12'}); }
function ptResult(){
  const v=ptState(), sat=satTempC(v.gas, v.psi);
  if(sat==null || !(+v.psi>0)) return '<p class="muted">Enter the suction pressure from your gauge.</p>';
  const sh = v.line!=='' ? +v.line - sat : null;
  return `<div class="calc-out two"><div><span class="label">Saturation (boiling) temperature</span><b>${sat.toFixed(1)} °C</b><small>${C2F(sat).toFixed(0)} °F at ${(+v.psi).toFixed(0)} psig (${(v.psi/14.5038).toFixed(2)} bar)</small></div>
    ${sh!=null?`<div><span class="label">Superheat</span><b>${sh.toFixed(1)} K</b><small>${sh<3?'Low: possible overcharge, flooding or low airflow.':sh>12?'High: possible low charge or restriction.':'Normal range for most split units.'}</small></div>`:''}</div>`;
}
function ptTool(){
  const v=ptState(), t=PT[v.gas];
  return `<div class="calc" data-calc="pt">
    <div class="grid3"><label class="field"><span>Refrigerant</span><select id="pt-gas" data-pt="gas">${Object.keys(PT).map(g=>`<option ${v.gas===g?'selected':''}>${g}</option>`).join('')}</select></label>
      <label class="field"><span>Suction pressure (psig)</span><input id="pt-psi" data-pt="psi" type="number" inputmode="decimal" value="${esc(v.psi)}"></label>
      <label class="field"><span>Suction line temp (°C)</span><input id="pt-line" data-pt="line" type="number" inputmode="decimal" value="${esc(v.line)}"></label></div>
    <div data-pt-out>${ptResult()}</div>
    <details class="small"><summary>${esc(v.gas)} pressure–temperature table</summary>
      <table class="pt-table"><thead><tr><th>°C</th><th>°F</th><th>psig</th><th>bar</th></tr></thead><tbody>${t.map(([f,p])=>`<tr><td>${F2C(f).toFixed(1)}</td><td>${f}</td><td>${p.toFixed(1)}</td><td>${(p/14.5038).toFixed(2)}</td></tr>`).join('')}</tbody></table></details>
    <p class="small muted"><b>R32</b> runs a little above R410A (a few psi more at the same temperature). Use the R32 scale on your gauges or the manufacturer's chart. Charge R32 and R410A as liquid, by weight.</p></div>`;
}

/* ---------- guides ---------- */
const TROUBLE = [
  ['Not cooling or weak cooling', ['Dirty filters or indoor coil','Dirty or blocked outdoor unit','Low gas (leak): check pressure and look for oil marks','Outdoor fan or compressor not running: check capacitor','Wrong mode or set temperature on the remote']],
  ['Water leaking from the indoor unit', ['Blocked drain pipe or drain pan','Dirty filter making the coil freeze, then drip','Unit not level, or drain pipe not sloping down','Broken drain pipe insulation (sweating)']],
  ['Ice on pipes or coil', ['Dirty filters or low fan speed','Low gas charge','Very low set temperature with the room already cold','Outdoor temperature sensor fault']],
  ['Strange noise', ['Loose front panel or screws','Fan blade touching the housing, or dirt on the blower','Compressor mounts worn (outdoor)','Pipes vibrating against the wall']],
  ['Not turning on', ['Breaker tripped or isolator off','Remote batteries flat, or remote sensor blocked','Blown fuse on the indoor PCB','Error code on display: check the manual for the code']],
  ['Bad smell', ['Mould on the coil, filter or blower: chemical clean','Stagnant water in the drain pan','Drain pipe connected to a sewer line without a trap']],
  ['Outdoor unit runs, indoor blows warm', ['Compressor not starting: check run capacitor and contactor','Very low or no gas','Communication fault between units (check error code)']],
  ['High electricity bill', ['Dirty coils making the compressor work harder','Undersized unit running non-stop','Doors or windows left open','Old non-inverter unit']]
];
const MAINT = [
  ['Clean or wash the filters','Every 2–4 weeks in daily use','Customer can do it'],
  ['General service (filters, coils, drain, check gas and amps)','Every 3–4 months','Salt air and humidity in the Maldives dirty units faster'],
  ['Chemical / deep clean of indoor coil and blower','Every 6–12 months','Or when there is a smell'],
  ['Wash the outdoor unit and check for rust','Every 3–4 months','More often near the sea'],
  ['Check electrical connections and capacitor','Every service','Tighten loose terminals']
];
function guides(){
  return `<div class="calc"><div class="trouble">${TROUBLE.map(([t,list])=>`<details><summary>${esc(t)}</summary><ul>${list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}</div></div>`;
}
function maint(){
  return `<div class="calc"><table class="pt-table maint"><thead><tr><th>Job</th><th>How often</th><th>Note</th></tr></thead><tbody>${MAINT.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <h4>Healthy readings (split unit, cooling)</h4>
    <ul class="small"><li>Air temperature drop across the indoor unit (return minus supply): <b>8–12 °C</b></li>
      <li>Suction pressure: <b>R410A / R32 about 115–145 psig</b>, <b>R22 about 60–75 psig</b>, depending on the weather and load</li>
      <li>Superheat at the outdoor unit: usually <b>4–10 K</b> (inverter units vary: follow the maker's data)</li>
      <li>Running current: compare with the nameplate rated amps</li></ul></div>`;
}

/* ---------- tools page ---------- */
const SECTIONS = [['btu','BTU calculator'],['pt','Pressure & superheat'],['conv','Unit converter'],['trouble','Troubleshooting'],['maint','Service intervals']];
export function toolsView(extraTop=''){
  const cur=UI.tool||'btu', body={btu:()=>btuCalculator(false), pt:ptTool, conv:converter, trouble:guides, maint}[cur]();
  return `${extraTop}<div class="tools"><nav class="tool-nav" aria-label="Tools">${SECTIONS.map(([k,l])=>`<button data-act="tool" data-v="${k}" aria-pressed="${cur===k}">${l}</button>`).join('')}</nav>
    <section class="card tool-card"><div class="card-h"><h3>${SECTIONS.find(s=>s[0]===cur)[1]}</h3></div><div class="card-b">${body}</div></section></div>`;
}
export const toolActions = {
  tool(el){ UI.tool=el.dataset.v; render(); }
};

/* Live results while typing, without redrawing the page. */
document.addEventListener('input', e=>{ const el=e.target;
  if(el.dataset.btu){ btuState()[el.dataset.btu] = el.type==='checkbox'? el.checked : el.value; const o=document.querySelector('[data-btu-out]'); if(o) o.innerHTML=btuResult(); }
  if(el.dataset.pt){ ptState()[el.dataset.pt]=el.value; const o=document.querySelector('[data-pt-out]'); if(o) o.innerHTML=ptResult(); }
  if(el.dataset.conv && el.value!==''){ const g=el.dataset.conv, r=convert(g, el.dataset.k, +el.value);
    for(const k in r){ if(k===el.dataset.k) continue; const i=document.getElementById('cv-'+k); if(i) i.value=+r[k].toFixed(dp[k]); } }
});
document.addEventListener('change', e=>{ const el=e.target;
  if(el.dataset.btu){ btuState()[el.dataset.btu] = el.type==='checkbox'? el.checked : el.value; const o=document.querySelector('[data-btu-out]'); if(o) o.innerHTML=btuResult(); }
  // Only a new refrigerant changes the table; typed numbers already update live (redrawing here would eat the next tap).
  if(el.dataset.pt==='gas'){ ptState().gas=el.value; render(); }
});
export { toast };
