/* Start page of the Android app (/app.html): enter the company code once, choose Customer, Technician or Office,
   and the app opens that portal from then on. "Switch" inside the portals comes back here. */
let firebaseConfig = null;
try { ({ firebaseConfig } = await import('./firebase-config.js')); } catch (e) {}
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const RESERVED = ['tech','admin','platform','assets','css','js','functions','index','sw','api','www'];
const ROLES = [
  {key:'customer', title:'Customer', text:'Book a service, follow your technician, pay and rate.'},
  {key:'technician', title:'Technician', text:'Accept jobs, share your trip, write work reports.'},
  {key:'admin', title:'Office', text:'Run the service desk for your company.'}
];
const local = /^(localhost|127\.)/.test(location.hostname);
const pathFor = (co, role) => local ? `/${{customer:'index.html',technician:'tech.html',admin:'admin.html'}[role]}?c=${co}` : `/${co}${{customer:'',technician:'/tech',admin:'/admin'}[role]}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);

let F = null, db = null;
async function firestore(){
  if (db) return db;
  const [app, fs] = await Promise.all([import(FB+'firebase-app.js'), import(FB+'firebase-firestore.js')]);
  F = fs; db = fs.getFirestore(app.initializeApp(firebaseConfig, 'app-start'));
  return db;
}
const UI = { co:'', company:null, brand:null, error:'', busy:false };
try { const s = JSON.parse(localStorage.getItem('acsp-app') || 'null'); if (s?.co) UI.co = s.co; } catch (e) {}

function mark(){
  if (UI.brand?.logo) return `<img class="mark logo" src="${esc(UI.brand.logo)}" alt="">`;
  return `<svg class="mark" viewBox="0 0 38 38" aria-hidden="true"><rect class="u" x="3" y="6" width="32" height="16" rx="5"/><line class="l" x1="9" y1="17" x2="29" y2="17"/><path class="w" d="M10 27c2 2 2 4 0 6M19 27c2 2 2 4 0 6M28 27c2 2 2 4 0 6"/></svg>`;
}
function render(){
  const heroStyle = UI.brand?.color ? ` style="background:linear-gradient(150deg,${esc(UI.brand.color)},${esc(UI.brand.color2||UI.brand.color)})"` : '';
  let right;
  if (!UI.company) right = `<form class="auth-card" data-form="code"><h2>Your company</h2>
      <p class="muted">Enter the company code your service company gave you. You only do this once.</p>
      <label class="field"><span>Company code</span><input id="code" name="code" value="${esc(UI.co)}" placeholder="e.g. reefside" autocapitalize="none" autocomplete="off" required></label>
      ${UI.error?`<p class="small" style="color:var(--bad)">${esc(UI.error)}</p>`:''}
      <button class="btn primary block lg" ${UI.busy?'disabled':''}>${UI.busy?'Checking…':'Continue'}</button></form>`;
  else right = `<div class="auth-card"><h2>How do you use ${esc(UI.company.name)}?</h2>
      <div class="role-pick">${ROLES.map(r=>`<button class="role-opt" data-role="${r.key}"><b>${r.title}</b><span>${r.text}</span></button>`).join('')}</div>
      <button class="linkbtn" data-act="change">Use a different company</button></div>`;
  $('#app').innerHTML = `<div class="auth"><section class="auth-hero"${heroStyle}><div class="brand" style="margin:0">${mark()}<div><b>${esc(UI.company?.name||'AC Service')}</b><small>${UI.company?'Choose your portal':'Welcome'}</small></div></div>
    <h1>${UI.company?'Nearly there.':'Air-conditioning service, in your pocket.'}</h1>
    <p>${UI.company?'Pick how you use the app. You can switch later from the portal.':'Book and track services, take jobs and run the office, all in one app.'}</p></section>
    <section class="auth-form">${right}</section></div>`;
}
async function lookUp(code){
  UI.busy = true; UI.error = ''; render();
  try {
    const d = await firestore();
    const t = await F.getDoc(F.doc(d, 'tenants', code));
    if (!t.exists()) { UI.error = `There's no company with the code "${code}". Check it with your service company.`; return; }
    if (t.data().status !== 'active') { UI.error = `${t.data().name || 'This company'} is unavailable at the moment.`; return; }
    const b = await F.getDoc(F.doc(d, 'tenants', code, 'company', 'brand')).catch(() => null);
    UI.co = code; UI.company = t.data(); UI.brand = b?.exists() ? b.data() : null;
  } catch (e) { UI.error = "Couldn't check the code. Check your internet connection and try again."; }
  finally { UI.busy = false; render(); }
}
function go(role){
  const path = pathFor(UI.co, role);
  try { localStorage.setItem('acsp-app', JSON.stringify({co:UI.co, role, path})); } catch (e) {}
  try { window.AndroidApp?.setHome?.(path); } catch (e) {}
  location.href = path;
}
document.addEventListener('submit', e => { if (e.target.dataset.form !== 'code') return; e.preventDefault();
  const code = String(new FormData(e.target).get('code') || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!code || RESERVED.includes(code)) { UI.error = 'Enter your company code.'; return render(); }
  lookUp(code); });
document.addEventListener('click', e => {
  const r = e.target.closest('[data-role]'); if (r) return go(r.dataset.role);
  if (e.target.closest('[data-act=change]')) { UI.company = null; UI.brand = null; UI.co = ''; try { window.AndroidApp?.setHome?.(''); } catch (e) {} render(); }
});
render();
if (UI.co) lookUp(UI.co);
