/* AC Service Portal — shared core used by the three portals:
   customer (index.html), technician (tech.html) and admin / service provider (admin.html).
   Each portal page loads its own entry file, which registers its screens with start(). */
// The config is loaded with a dynamic import so that a typo in it shows a readable message
// on the page instead of a blank screen.
let firebaseConfig = null, SETTINGS = {}, CONFIG_ERROR = '';
try { ({ firebaseConfig, SETTINGS = {} } = await import('./firebase-config.js')); }
catch (e) { CONFIG_ERROR = String(e && e.message || e); console.error('firebase-config.js', e); }
SETTINGS = { currency:'MVR', timeZone:'Indian/Maldives', mapCenter:[4.1755,73.5093], avgSpeedKmh:22, gpsIntervalSec:12, vapidKey:'', ...SETTINGS };

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CONFIGURED = !!firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).startsWith('YOUR_');
const PORTAL = document.body.dataset.portal || 'customer';            // customer | technician | admin
const ROLE_OF = {customer:'customer', technician:'technician', admin:'provider'};
const PORTAL_ROLE = ROLE_OF[PORTAL];
const PORTAL_URL = {customer:'index.html', technician:'tech.html', admin:'admin.html'};
const PORTAL_NAME = {customer:'Customer portal', technician:'Technician portal', admin:'Admin portal'};
const portalLink = p => new URL(PORTAL_URL[p], location.href).href.replace(/index\.html$/, '');

let A, F, appMod, auth, db, fbApp;
if (CONFIGURED) {
  const [app, authMod, fsMod] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  appMod = app; A = authMod; F = fsMod;
  // A separately named Firebase app per portal keeps each portal's sign-in separate in the same browser.
  fbApp = app.initializeApp(firebaseConfig, 'portal-' + PORTAL);
  auth = A.getAuth(fbApp);
  db = F.initializeFirestore(fbApp, {ignoreUndefinedProperties:true});
}
/* ---------- constants ---------- */
const TZ = SETTINGS.timeZone || 'Indian/Maldives';
const CUR = SETTINGS.currency || 'MVR';
const ACCTS = {
  '1000':{n:'Cash on hand',t:'asset'}, '1010':{n:'BML bank account',t:'asset'}, '1020':{n:'MIB bank account',t:'asset'},
  '1030':{n:'Card settlements',t:'asset'}, '1100':{n:'Accounts receivable',t:'asset'},
  '2100':{n:'GST payable',t:'liability'}, '3000':{n:"Owner's equity",t:'equity'},
  '4000':{n:'Service revenue',t:'income'},
  '5000':{n:'Parts & refrigerant',t:'expense'}, '5100':{n:'Technician wages',t:'expense'}, '5200':{n:'Fuel & boat transport',t:'expense'},
  '5300':{n:'Rent & utilities',t:'expense'}, '5900':{n:'Other expenses',t:'expense'}
};
const METHODS = {
  bml:{n:'BML bank transfer', acct:'1010', transfer:true},
  mib:{n:'MIB bank transfer', acct:'1020', transfer:true},
  cash:{n:'Cash', acct:'1000'},
  card:{n:'Card on site', acct:'1030'}
};
const WINDOWS = {morning:'Morning, 8am to 12pm', afternoon:'Afternoon, 12pm to 4pm', evening:'Evening, 4pm to 8pm'};
const AC_TYPES = ['Split wall unit','Cassette unit','Window unit','Ducted / central','Portable'];
const BTUS = ['9,000 BTU','12,000 BTU','18,000 BTU','24,000 BTU','30,000+ BTU','Not sure'];
const ST = {requested:['New request','coral'],scheduled:['Scheduled','lagoon'],quoted:['Quote sent','orchid'],declined:['Quote declined','coral'],
  approved:['Quote approved','orchid'],offered:['Open to technicians','orchid'],awaiting:['Waiting for technician','mango'],assigned:['Technician assigned','lagoon'],enroute:['On the way','live'],onsite:['On site','live'],
  completed:['Work finished','mango'],invoiced:['Invoice sent','mango'],paid:['Paid','teal'],cancelled:['Cancelled','mute']};
const STEPS = ['Requested','Scheduled','Quoted','Assigned','On the way','Finished','Paid'];
const SVC_ICONS = [
  '<path d="M3 6h18v8H3z"/><path d="M6 11h12M7 18c1 1 1 2 0 3M12 18c1 1 1 2 0 3M17 18c1 1 1 2 0 3"/>',
  '<path d="M12 3v10"/><circle cx="12" cy="16" r="5"/><path d="M12 14v2"/>',
  '<path d="M14 6l4 4-8 8H6v-4z"/><path d="M13 7l4 4"/>',
  '<path d="M12 2c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  '<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M10 20v-6h4v6"/>'
];
/* ---------- state ---------- */
const S = {company:null, portal:null, services:[], techs:[], customers:[], users:[], jobs:[], ledger:[], inbox:[], msgs:{}, loaded:{}, need:[], pub:{}};
const ME = {user:null, profile:null, profileLoaded:false, role:null};
let OWNER_EXISTS = null;
let UI = loadUI();
function loadUI(){ let u={}; try{ u=JSON.parse(localStorage.getItem('acsp-ui-'+PORTAL)||'{}'); }catch(e){}
  return Object.assign({ptab:'jobs',ctab:'home',filter:'action',period:'month'}, u,
    {q:'',sel:'',ed:{},confirm:'',busy:'',pick:{},authMode:'signin',creating:false,payM:{},rcpt:{},bell:false,modal:null,bk:null}); }
function saveUI(){ try{ const {ptab,ctab,filter,period}=UI; localStorage.setItem('acsp-ui-'+PORTAL,JSON.stringify({ptab,ctab,filter,period})); }catch(e){} }
// Settings the admin controls for the customer and technician portals.
const PCFG = () => {
  const p = S.portal || {};
  return {customerSignup:true, customerCancel:true, showTechPhone:true, techSeePrices:true, leadDays:0, customerNotice:'', techNotice:'', ...p,
    windows:{morning:true, afternoon:true, evening:true, ...(p.windows||{})}};
};
/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r2 = n => Math.round((+n||0)*100)/100;
const money = n => CUR + ' ' + (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nowISO = () => new Date().toISOString();
const today = () => new Date().toLocaleDateString('en-CA',{timeZone:TZ});
const pad = (n,w=4) => String(n).padStart(w,'0');
function addDays(d,n){ const x=new Date(d+'T12:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); }
function fd(d){ if(!d) return ''; const plain=d.length===10; return new Date(plain? d+'T12:00:00Z' : d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone: plain?'UTC':TZ}); }
function ft(iso){ return new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:TZ}); }
function fdt(iso){ return iso ? fd(iso)+', '+ft(iso) : ''; }
function t12(hm){ if(!hm) return ''; let [h,m]=hm.split(':').map(Number); const ap=h>=12?'pm':'am'; h=h%12||12; return h+':'+String(m).padStart(2,'0')+' '+ap; }
const slotText = s => s ? fd(s.date)+' at '+t12(s.time) : '';
const initials = n => String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
function setPath(o,path,v){ const k=path.split('.'); let x=o; for(let i=0;i<k.length-1;i++){ x = x[k[i]] ??= {}; } x[k[k.length-1]]=v; }
const clone = x => JSON.parse(JSON.stringify(x));
function ago(iso){ const s=Math.max(0,Math.round((Date.now()-new Date(iso))/1000)); return s<60? s+' s ago' : s<3600? Math.round(s/60)+' min ago' : fdt(iso); }
function haversineKm(a,b){ const R=6371, toR=x=>x*Math.PI/180; const dLat=toR(b.lat-a.lat), dLng=toR(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }

const co = () => Object.assign({name:'Your AC company', tagline:'Air-conditioning service', gstRate:8, terms:7, phone:'', email:'', address:'', reg:'', tin:'', bml:'', mib:'', methods:{cash:true,bml:true,mib:true,card:true}}, S.company||{});
const sv = id => S.services.find(x=>x.id===id);
const cust = id => S.customers.find(x=>x.id===id);
const tech = id => S.techs.find(x=>x.id===id);
const job = id => S.jobs.find(x=>x.id===id) || (S.openJobs||[]).find(x=>x.id===id);
// A job sent to one technician waits for them to accept it. Older jobs without assignStatus count as accepted.
const accepted = j => !!j.techId && (j.assignStatus||'accepted')==='accepted';
const jobTitle = j => (j.serviceIds||[]).map(id=>sv(id)?.name).filter(Boolean).join(', ') || 'AC service';
const myCustomer = () => S.customers.find(x=>x.id===ME.user?.uid);

function stage(j){
  if(j.cancelled) return 'cancelled';
  if(j.payment?.status==='paid') return 'paid';
  if(j.invoice) return 'invoiced';
  if(j.finishedAt) return 'completed';
  if(j.arrivedAt) return 'onsite';
  if(j.departedAt) return 'enroute';
  if(j.techId && !accepted(j)) return 'awaiting';
  if(j.techId) return 'assigned';
  if(j.open) return 'offered';
  if(j.quote?.status==='accepted') return 'approved';
  if(j.quote?.status==='declined') return 'declined';
  if(j.quote) return 'quoted';
  if(j.slot) return 'scheduled';
  return 'requested';
}
const overdue = j => j.invoice && j.payment?.status!=='paid' && j.invoice.dueDate < today();
function pill(j){
  const s=stage(j); let [l,t]=ST[s];
  if(s==='invoiced' && j.payment?.status==='pending'){ l=METHODS[j.payment.method]?.n+' due'; t='coral'; }
  else if(s==='invoiced' && overdue(j)){ l='Overdue'; t='bad'; }
  else if(s==='paid' && j.payment?.verified===false && ME.role==='provider'){ l='Paid · verify'; t='mango'; }
  else if(s==='awaiting' && ME.role==='technician'){ l='New: accept or decline'; t='coral'; }
  return `<span class="pill ${t}">${esc(l)}</span>`;
}
function hint(j){
  const s=stage(j);
  if(!j.cancelled && !j.techId && !j.open && j.assignStatus==='declined' && !j.departedAt) return 'Technician declined: assign again';
  if(s==='requested') return 'Confirm a time';
  if(s==='declined') return 'Revise the quotation';
  if(s==='scheduled') return 'Send a quote or assign';
  if(s==='approved') return 'Assign a technician';
  if(s==='completed') return 'Send the invoice';
  if(s==='invoiced' && j.payment?.status==='pending') return 'Confirm payment received';
  if(s==='paid' && j.payment?.verified===false) return 'Verify bank transfer';
  return '';
}
function totals(d){
  const sub=(d.lines||[]).reduce((a,l)=>a+(+l.qty||0)*(+l.rate||0),0);
  const disc=Math.min(+d.discount||0, sub), net=r2(sub-disc), rate=d.gstRate ?? co().gstRate, gst=r2(net*rate/100);
  return {sub:r2(sub), disc:r2(disc), net, rate, gst, total:r2(net+gst)};
}
function avgRating(techId){ const r=S.jobs.filter(j=>j.techId===techId && j.rating).map(j=>j.rating.stars); return r.length? {avg:r.reduce((a,b)=>a+b,0)/r.length, n:r.length} : null; }
function stars(n){ n=Math.round(n); return `<span class="stars" aria-label="${n} out of 5 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5-n)}</span></span>`; }
function balances(entries){ const b={}; for(const e of entries) for(const l of (e.lines||[])) b[l.acct]=r2((b[l.acct]||0)+(+l.dr||0)-(+l.cr||0)); return b; }
function sideBal(acct,b){ const t=ACCTS[acct]?.t, v=b[acct]||0; return (t==='asset'||t==='expense')? v : -v; }

/* ---------- toast & errors ---------- */
let toastT;
function toast(t){ const el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true, 3600); }
function errMsg(e){
  const c=String(e?.code||'').replace(/^(auth|firestore)\//,'');
  const M={
    'permission-denied':"You don't have permission to do that.",
    'unavailable':"You're offline. Check your connection and try again.",
    'invalid-credential':'Email or password is incorrect.', 'wrong-password':'Email or password is incorrect.', 'user-not-found':'No account uses that email. Create one instead.',
    'email-already-in-use':'An account already uses that email. Sign in instead.', 'weak-password':'Use a password with at least 6 characters.',
    'invalid-email':'That email address is not valid.', 'popup-closed-by-user':'Google sign-in was closed before finishing.',
    'too-many-requests':'Too many attempts. Wait a few minutes and try again.', 'unauthorized-domain':'This website is not allowed to sign in yet. Add its domain in Firebase → Authentication → Settings → Authorized domains.'
  };
  return M[c] || e?.message || 'Something went wrong. Try again.';
}
async function run(fn, okText){ try{ await fn(); if(okText) toast(okText); return true; }catch(e){ console.error(e); toast(errMsg(e)); return false; } }
/* ---------- firestore refs ---------- */
const d = (...p) => F.doc(db, ...p);
const c = (...p) => F.collection(db, ...p);
const snapList = s => s.docs.map(x=>({...x.data(), id:x.id}));
function sys(text){ return {kind:'sys', text, at:nowISO(), uid:ME.user.uid, role:ME.role, name:myName()}; }
function msgObj(text){ return {kind:'msg', text, at:nowISO(), uid:ME.user.uid, role:ME.role, name:myName()}; }
function myName(){ return ME.role==='provider' ? co().name : (ME.profile?.name || ME.user?.displayName || 'User'); }
function log(jobId, text){ return F.addDoc(c('jobs',jobId,'messages'), sys(text)).catch(e=>console.warn('activity log', e)); }

/* ---------- notifications ----------
   Every step writes a notification to each other party's inbox: inbox/office/items for the office,
   inbox/{uid}/items for a customer or technician. Each portal shows them under the bell, as phone/desktop
   alerts while a portal is open, and (with the optional Cloud Function) as push messages when it's closed. */
const STALE_H = 4;   // location sharing stops on its own if a trip runs longer than this
const staleTrip = j => !!(j.departedAt && !j.arrivedAt && Date.now()-new Date(j.departedAt).getTime() > STALE_H*3600e3);
const inboxId = () => ME.role==='provider' ? 'office' : ME.user.uid;
const portalOfRecipient = (j, rid) => rid==='office' ? 'admin' : rid===j.techId ? 'technician' : 'customer';
function recipients(j, parties){
  const out=new Set();
  for(const p of parties){
    if(p==='office') out.add('office');
    else if(p==='customer' && j.customerId && cust(j.customerId)?.hasLogin!==false) out.add(j.customerId);
    else if(p==='tech' && j.techId) out.add(j.techId);
  }
  if(ME.role==='provider') out.delete('office');
  out.delete(ME.user?.uid);
  return [...out];
}
async function notify(j, parties, title, body){
  const to=recipients(j, parties); if(!to.length) return;
  try{
    const b=F.writeBatch(db);
    for(const rid of to) b.set(F.doc(c('inbox',rid,'items')), {title, body, jobId:j.id, jobNo:j.no||'', at:nowISO(), read:false, from:ME.user.uid, fromName:myName(), portal:portalOfRecipient(j,rid)});
    await b.commit();
  }catch(e){ console.warn('notify', e); }
}
async function notifyTo(j, rids, title, body){
  rids=rids.filter(r=>r && r!==ME.user?.uid); if(!rids.length) return;
  try{ for(let i=0;i<rids.length;i+=400){ const b=F.writeBatch(db);
      for(const rid of rids.slice(i,i+400)) b.set(F.doc(c('inbox',rid,'items')), {title, body, jobId:j.id, jobNo:j.no||'', at:nowISO(), read:false, from:ME.user.uid, fromName:myName(), portal:'technician'});
      await b.commit(); } }catch(e){ console.warn('notify', e); }
}
/** Record a step in the job's activity log and notify the other parties. */
async function event(j, text, parties, title){ await log(j.id, text); await notify(j, parties, title, `${j.no?j.no+' · ':''}${text}`); }
const unread = () => (S.inbox||[]).filter(x=>!x.read).length;
function itemUrl(it){ return new URL(PORTAL_URL[it.portal||PORTAL] + (it.jobId ? '?job='+encodeURIComponent(it.jobId) : ''), location.href).href; }
function pushState(){ if(!('Notification' in window)) return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 'none'; return Notification.permission; }
async function alertItem(it){
  if(!document.hidden){ toast(`${it.title}: ${it.body}`); return; }
  if(pushState()!=='granted') return;
  const opts={body:it.body, tag:it.id, icon:'assets/icon-192.png', badge:'assets/icon-192.png', data:{url:itemUrl(it)}};
  try{ const reg=SW_REG || await navigator.serviceWorker?.getRegistration(); if(reg){ await reg.showNotification(it.title, opts); return; } }catch(e){}
  try{ const n=new Notification(it.title, opts); n.onclick=()=>{ window.focus(); openJobById(it.jobId); render(); }; }catch(e){}
}
let SW_REG=null, PUSH_TOKEN=null, pushTried=null;
async function registerSW(){
  if(!('serviceWorker' in navigator) || !CONFIGURED) return null;
  const q = SETTINGS.vapidKey ? '?'+new URLSearchParams({apiKey:firebaseConfig.apiKey, projectId:firebaseConfig.projectId, messagingSenderId:firebaseConfig.messagingSenderId||'', appId:firebaseConfig.appId||''}) : '';
  try{ SW_REG = await navigator.serviceWorker.register('sw.js'+q); }catch(e){ console.warn('service worker', e); }
  return SW_REG;
}
// Push while every portal is closed needs a VAPID key in firebase-config.js and the Cloud Function in /functions.
async function registerPush(){
  if(!SETTINGS.vapidKey || !ME.user || pushState()!=='granted' || pushTried===ME.user.uid) return;
  pushTried=ME.user.uid;
  try{
    const M=await import(FB+'firebase-messaging.js');
    if(!(await M.isSupported())) return;
    const reg=SW_REG || await registerSW(); if(!reg) return;
    const token=await M.getToken(M.getMessaging(fbApp), {vapidKey:SETTINGS.vapidKey, serviceWorkerRegistration:reg});
    PUSH_TOKEN=token;
    if(token && !(ME.profile?.fcmTokens||[]).includes(token)) await F.updateDoc(d('users',ME.user.uid), {fcmTokens:F.arrayUnion(token)});
  }catch(e){ console.warn('push', e); }
}
function openJobById(id){
  if(!id) return;
  UI.sel=id; UI.bell=false; UI.modal=null;
  if(PORTAL==='admin'){ UI.ptab='jobs'; UI.filter='all'; UI.newJob=null; }
  if(innerWidth<=900) scrollTo(0,0);
}
function bellButton(){
  const n=unread();
  return `<button class="bell" data-act="bell" aria-label="Notifications${n?', '+n+' unread':''}" aria-expanded="${!!UI.bell}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>${n?`<span class="bell-n">${n>9?'9+':n}</span>`:''}</button>`;
}
function pushPrompt(){
  const s=pushState();
  if(s==='granted') return `<p class="bp-note ok">Alerts are on for this device.</p>`;
  if(s==='denied') return `<p class="bp-note">Alerts are blocked for this site. Allow notifications in your browser's site settings to get them.</p>`;
  if(s==='ios') return `<p class="bp-note">On iPhone, tap Share, then Add to Home Screen. Open the portal from your Home Screen and turn on alerts there.</p>`;
  if(s==='none') return '';
  return `<div class="bp-note"><span>Get an alert on this device for every update, even when the portal is in the background.</span><button class="btn sm primary" data-act="enablePush">Turn on alerts</button></div>`;
}
function bellPanel(){
  if(!UI.bell) return '';
  const items=S.inbox||[];
  return `<div class="backdrop clear" data-act="bellClose"></div><section class="bell-panel" role="dialog" aria-label="Notifications">
    <div class="bp-head"><h3>Notifications</h3>${unread()?'<button class="linkbtn" data-act="readAll">Mark all as read</button>':''}</div>
    ${pushPrompt()}
    ${items.length?`<ul class="bp-list">${items.map(it=>`<li><button data-act="openItem" data-id="${it.id}" class="${it.read?'':'unread'}"><b>${esc(it.title)}</b><span>${esc(it.body)}</span><small>${ago(it.at)}${it.fromName?' · '+esc(it.fromName):''}</small></button></li>`).join('')}</ul>`
      :`<div class="empty small"><p>No notifications yet. Every update about your ${PORTAL==='technician'?'jobs':'requests'} will appear here.</p></div>`}
  </section>`;
}
function modalView(){
  if(!UI.modal) return '';
  return `<div class="backdrop" data-act="modalClose"></div><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(UI.modal.title)}"><div class="modal-h"><h3>${esc(UI.modal.title)}</h3><button class="icon" data-act="modalClose" aria-label="Close">×</button></div><div class="modal-b">${UI.modal.html}</div></div>`;
}

/* ---------- payment receipts ----------
   Stored in Firestore (jobs/{id}/files/receipt) so no Cloud Storage bucket or paid plan is needed.
   Photos are resized to stay well under Firestore's 1 MB document limit. */
function fileToDataUrl(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(new Error('Could not read that file.')); r.readAsDataURL(f); }); }
async function readReceipt(file){
  const isPdf = file.type==='application/pdf' || /\.pdf$/i.test(file.name);
  if(isPdf){
    if(file.size>700*1024) throw new Error('That PDF is over 700 KB. Upload a screenshot or photo of the receipt instead.');
    return {dataUrl:await fileToDataUrl(file), name:file.name, type:'application/pdf', size:file.size};
  }
  if(!/^image\//.test(file.type)) throw new Error('Upload a photo, screenshot or PDF of the receipt.');
  const bmp = await createImageBitmap(file).catch(()=>null);
  if(!bmp) throw new Error("This photo format can't be read here. Take a screenshot of the receipt and upload that.");
  let max=1600, q=0.82, out='';
  for(let i=0;i<6;i++){
    const k=Math.min(1, max/Math.max(bmp.width,bmp.height)), cv=document.createElement('canvas');
    cv.width=Math.max(1,Math.round(bmp.width*k)); cv.height=Math.max(1,Math.round(bmp.height*k));
    const g=cv.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,cv.width,cv.height); g.drawImage(bmp,0,0,cv.width,cv.height);
    out=cv.toDataURL('image/jpeg', q); if(out.length<900000) break; max*=0.8; q=Math.max(0.5,q-0.08);
  }
  if(out.length>=900000) throw new Error('That image is too large. Take a screenshot of the receipt and upload that.');
  return {dataUrl:out, name:file.name.replace(/\.[^.]+$/,'')+'.jpg', type:'image/jpeg', size:Math.round(out.length*0.75)};
}
const copyBtn = v => `<button type="button" class="btn sm" data-act="copy" data-v="${esc(v)}">Copy</button>`;
function receiptPicker(j){
  const r=UI.rcpt[j.id];
  if(r) return `<div class="rcpt">${r.type==='application/pdf'?'<span class="rcpt-ic">PDF</span>':`<img src="${esc(r.dataUrl)}" alt="">`}<div style="min-width:0"><b>${esc(r.name)}</b><small>${Math.max(1,Math.round(r.size/1024))} KB · ready to send</small></div><button type="button" class="icon" data-act="rcptRemove" data-id="${j.id}" aria-label="Remove receipt">×</button></div>`;
  return `<label class="upload"><input type="file" id="rfile-${j.id}" data-np accept="image/*,application/pdf" data-change="receiptFile" data-id="${j.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg><span><b>Upload payment receipt</b><small>Photo, screenshot or PDF</small></span></label>`;
}
function receiptLine(j){
  const R=j.receipt; if(!R || !['provider','customer'].includes(ME.role)) return '';
  return `<div class="row small rcpt-line"><span class="pill teal">Receipt uploaded</span><span class="muted">${fdt(R.at)}</span><button class="btn sm" data-act="viewReceipt" data-id="${j.id}">View receipt</button></div>`;
}
async function nextNumber(name){
  return F.runTransaction(db, async tx=>{ const ref=d('counters',name); const s=await tx.get(ref); const n=(s.exists()? s.data().n : 0)+1; tx.set(ref,{n}); return n; });
}
/* ---------- subscriptions ---------- */
let unsubs=[], subRole=null, msgSub={id:null, un:null};
function stopSubs(){ unsubs.forEach(u=>{ try{u();}catch(e){} }); unsubs=[]; subRole=null; if(msgSub.un) msgSub.un(); msgSub={id:null,un:null};
  Object.assign(S,{services:[],techs:[],customers:[],users:[],jobs:[],openJobs:[],ledger:[],inbox:[],msgs:{},loaded:{},need:[]}); }
function subCol(key, q, map=snapList){ S.need.push(key); unsubs.push(F.onSnapshot(q, s=>{ S[key]=map(s); S.loaded[key]=true; schedRender(); }, e=>{ console.error(key,e); S.loaded[key]=true; toast(errMsg(e)); schedRender(); })); }
function startSubs(){
  const role=ME.role, uid=ME.user.uid;
  if(subRole===role) return; stopSubs(); subRole=role;
  subCol('services', c('services'));
  subCol('techs', c('techs'));
  if(role==='provider'){ subCol('customers', c('customers')); subCol('jobs', c('jobs')); subCol('ledger', c('ledger')); subCol('users', c('users')); }
  else if(role==='customer'){
    S.need.push('customers'); unsubs.push(F.onSnapshot(d('customers',uid), s=>{ S.customers = s.exists()? [{...s.data(), id:s.id}] : []; S.loaded.customers=true; schedRender(); }, e=>{ S.loaded.customers=true; schedRender(); }));
    subCol('jobs', F.query(c('jobs'), F.where('customerId','==',uid)));
  } else if(role==='technician'){
    subCol('jobs', F.query(c('jobs'), F.where('techId','==',uid)));
    subCol('openJobs', F.query(c('jobs'), F.where('open','==',true)));
  }
  startInbox();
  registerPush();
}
function startInbox(){
  let first=true;
  S.need.push('inbox');
  unsubs.push(F.onSnapshot(F.query(c('inbox',inboxId(),'items'), F.orderBy('at','desc'), F.limit(50)), s=>{
    const items=snapList(s), prev=new Set((S.inbox||[]).map(x=>x.id));
    if(!first) items.filter(it=>!it.read && !prev.has(it.id)).forEach(alertItem);
    first=false; S.inbox=items; S.loaded.inbox=true;
    try{ const n=items.filter(x=>!x.read).length; document.title=(n?`(${n}) `:'')+document.title.replace(/^\(\d+\) /,''); n? navigator.setAppBadge?.(n).catch(()=>{}) : navigator.clearAppBadge?.().catch(()=>{}); }catch(e){}
    schedRender();
  }, e=>{ console.warn('inbox',e); S.loaded.inbox=true; schedRender(); }));
}
function syncMsgSub(){
  const sj = UI.sel && job(UI.sel);
  // A technician only reads messages on jobs they have; an open job they haven't taken has none for them.
  const id = sj && (ME.role!=='technician' || sj.techId===ME.user.uid) ? sj.id : null;
  if(msgSub.id===id) return;
  if(msgSub.un) msgSub.un(); msgSub={id, un:null};
  if(!id) return;
  msgSub.un = F.onSnapshot(F.query(c('jobs',id,'messages'), F.orderBy('at')), s=>{ S.msgs[id]=snapList(s); schedRender(); }, e=>console.warn('messages',e));
}
function ready(){ return S.pub.company && S.pub.portal && S.need.length && S.need.every(k=>S.loaded[k]); }

/* ---------- auth ---------- */
function startAuth(){
  // Public documents every portal needs before sign-in: who owns the portal, company branding, portal settings.
  F.onSnapshot(d('config','owner'), s=>{ OWNER_EXISTS=s.exists(); schedRender(); }, ()=>{ OWNER_EXISTS=true; schedRender(); });
  F.onSnapshot(d('config','portal'), s=>{ S.portal=s.exists()? s.data() : null; S.pub.portal=true; schedRender(); }, ()=>{ S.pub.portal=true; schedRender(); });
  F.onSnapshot(d('company','profile'), s=>{ S.company=s.exists()? s.data() : null; S.pub.company=true; schedRender(); }, ()=>{ S.pub.company=true; schedRender(); });
  let profUn=null;
  A.onAuthStateChanged(auth, user=>{
    if(profUn){ profUn(); profUn=null; }
    stopSubs(); stopGPS();
    ME.user=user; ME.profile=null; ME.role=null; ME.profileLoaded=false; UI.sel='';
    if(user){
      profUn = F.onSnapshot(d('users',user.uid), s=>{
        ME.profile = s.exists()? s.data() : null; ME.profileLoaded=true;
        const ok = ME.profile && ME.profile.role===PORTAL_ROLE && (ME.profile.status||'active')==='active';
        const role = ok ? ME.profile.role : null;
        if(role!==ME.role){ ME.role=role; UI.sel=''; if(role) startSubs(); else stopSubs(); }
        schedRender();
      }, e=>{ ME.profileLoaded=true; toast(errMsg(e)); schedRender(); });
    }
    schedRender();
  });
}
async function createProfile(dd, kind){
  const u=ME.user, b=F.writeBatch(db);
  const base={name:dd.name, email:(u.email||dd.email||'').toLowerCase(), phone:dd.phone||'', status:'active', createdAt:nowISO()};
  if(kind==='owner'){
    b.set(d('users',u.uid), {...base, role:'provider'});
    b.set(d('config','owner'), {uid:u.uid, at:nowISO()});
  } else {
    b.set(d('users',u.uid), {...base, role:'customer'});
    b.set(d('customers',u.uid), {name:dd.name, phone:dd.phone||'', email:base.email, island:dd.island||'', address:dd.address||'', hasLogin:true, createdAt:nowISO()});
  }
  await b.commit();
  if(kind==='owner') await F.setDoc(d('company','profile'), {...co(), name:dd.company||'Your AC company', phone:dd.phone||'', email:base.email});
}
// The admin creates sign-in accounts for technicians, office staff and phone customers.
// A temporary second Firebase app is used so the admin stays signed in.
async function createLogin(email, password){
  const sec = appMod.initializeApp(firebaseConfig, 'creator-' + Date.now());
  try{ const sa=A.getAuth(sec); const cr=await A.createUserWithEmailAndPassword(sa, email, password); await A.signOut(sa); return cr.user.uid; }
  finally{ appMod.deleteApp(sec).catch(()=>{}); }
}

/* ---------- render ---------- */
const P = {view:()=> '', actions:{}, forms:{}, change:{}};
let rq=false;
function schedRender(){ if(rq) return; rq=true; requestAnimationFrame(()=>{ rq=false; render(); }); }
function render(){
  const app=$('#app'), saved={}; let focus=null;
  app.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{ if(el.dataset.np===undefined) saved[el.id]={v:el.value,c:el.checked}; });
  const ae=document.activeElement;
  if(ae && ae.id && app.contains(ae)){ focus={id:ae.id}; try{ focus.s=ae.selectionStart; focus.e=ae.selectionEnd; }catch(e){} }
  const scrolls={}; app.querySelectorAll('[data-keep-scroll]').forEach(el=>scrolls[el.dataset.keepScroll]=[el.scrollTop, el.scrollHeight-el.scrollTop-el.clientHeight<8]);
  app.innerHTML = view();
  for(const id in saved){ const el=document.getElementById(id); if(!el || el.dataset.np!==undefined) continue;
    if(el.type==='checkbox'||el.type==='radio') el.checked=saved[id].c; else if(el.type!=='file') el.value=saved[id].v; }
  app.querySelectorAll('[data-keep-scroll]').forEach(el=>{ const k=el.dataset.keepScroll, v=scrolls[k]; el.scrollTop = (!v || v[1]) ? el.scrollHeight : v[0]; });
  if(focus){ const el=document.getElementById(focus.id); if(el){ el.focus({preventScroll:true}); try{ if(focus.s!=null) el.setSelectionRange(focus.s,focus.e); }catch(e){} } }
  attachMaps();
  if(ME.role) syncMsgSub();
  ensureGPS();
}

function view(){
  if(!CONFIGURED) return setupView();
  if(!S.pub.company || !S.pub.portal) return `<div class="loading">Opening the ${PORTAL_NAME[PORTAL].toLowerCase()}…</div>`;
  if(!ME.user) return authView();
  if(!ME.profileLoaded || UI.creating) return `<div class="loading">Setting up your account…</div>`;
  if(!ME.profile){
    if(PORTAL==='customer') return completeProfileView('customer');
    if(PORTAL==='admin' && OWNER_EXISTS===false) return completeProfileView('owner');
    return gateView('No account here yet', PORTAL==='technician'
      ? 'Technician accounts are created by the office. Ask them to set one up for this email.'
      : 'This portal is for the service office only.');
  }
  if(ME.profile.role!==PORTAL_ROLE){
    const right = {customer:'customer', technician:'technician', provider:'admin'}[ME.profile.role];
    return gateView(`This is the ${PORTAL_NAME[PORTAL].toLowerCase()}`, `Your account is ${right==='admin'?'an office':'a '+right} account. Use the ${PORTAL_NAME[right].toLowerCase()} instead.`, right);
  }
  if((ME.profile.status||'active')!=='active') return gateView('Your account is paused', `Please contact ${esc(co().name)}${co().phone?' on '+esc(co().phone):''}.`);
  if(!ready()) return header()+`<div class="loading">Loading…</div>`;
  if(UI.pendingJob && job(UI.pendingJob)){ openJobById(UI.pendingJob); UI.pendingJob=null; }
  const note = PORTAL==='customer'? PCFG().customerNotice : PORTAL==='technician'? PCFG().techNotice : '';
  return header() + `<main class="wrap">${note?`<div class="notice"><b>${esc(co().name)}:</b> ${esc(note)}</div>`:''}${P.view()}</main>` + bellPanel() + modalView();
}
function markSVG(){ return `<svg class="mark" viewBox="0 0 38 38" aria-hidden="true"><rect class="u" x="3" y="6" width="32" height="16" rx="5"/><line class="l" x1="9" y1="17" x2="29" y2="17"/><path class="w" d="M10 27c2 2 2 4 0 6M19 27c2 2 2 4 0 6M28 27c2 2 2 4 0 6"/></svg>`; }
function brandName(){ return S.company?.name || 'AC Service Portal'; }
function header(){
  return `<header class="top"><div class="top-in">
    <div class="brand">${markSVG()}<div><b>${esc(brandName())}</b><small>${PORTAL_NAME[PORTAL]}</small></div></div>
    ${PORTAL==='admin'?`<nav class="portal-links"><a href="${PORTAL_URL.customer}" target="_blank" rel="noopener">Customer portal ↗</a><a href="${PORTAL_URL.technician}" target="_blank" rel="noopener">Technician portal ↗</a></nav>`:''}
    <div class="me">${bellButton()}<span class="avatar">${esc(initials(ME.profile?.name))}</span><div class="me-txt"><div style="font-weight:700;line-height:1.2">${esc(ME.profile?.name||'')}</div><span class="role-badge ${ME.role}">${ME.role==='provider'?'Office':ME.role==='technician'?'Technician':'Customer'}</span></div>
    <button class="btn sm signout" data-act="signOut">Sign out</button></div>
  </div></header>`;
}
function gateView(title, text, linkTo){
  return `<div class="auth"><section class="auth-hero"><div class="brand" style="margin:0">${markSVG()}<div><b>${esc(brandName())}</b><small>${PORTAL_NAME[PORTAL]}</small></div></div><h1>${esc(title)}</h1></section>
    <section class="auth-form"><div class="auth-card"><p>${text}</p>${linkTo?`<a class="btn primary block" href="${PORTAL_URL[linkTo]}">Open the ${PORTAL_NAME[linkTo].toLowerCase()}</a>`:''}
    <button class="btn block" data-act="signOut">Sign out</button></div></section></div>`;
}
function setupView(){
  if(CONFIG_ERROR) return `<div class="setup stack"><h1>There's a mistake in firebase-config.js</h1>
    <p>The browser couldn't read <span class="mono">js/firebase-config.js</span>:</p><pre>${esc(CONFIG_ERROR)}</pre>
    <p>The most common cause is a missing <span class="mono">};</span> at the end of the <span class="mono">firebaseConfig</span> block, or pasting Firebase's whole snippet (with <span class="mono">import</span> and <span class="mono">initializeApp</span> lines) instead of only the values. The file should look like this:</p>
    <pre>export const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};

export const SETTINGS = {
  currency: "MVR",
  timeZone: "Indian/Maldives",
  mapCenter: [4.1755, 73.5093],
  avgSpeedKmh: 22,
  gpsIntervalSec: 12
};</pre></div>`;
  return `<div class="setup stack"><h1>Connect Firebase</h1>
    <p>This portal needs a Firebase project before it can run. Open <span class="mono">js/firebase-config.js</span> and paste the web app config from Firebase console → Project settings → Your apps.</p>
    <pre>export const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  …
};</pre><p class="muted">The full setup steps are in README.md.</p></div>`;
}
const HERO = {
  customer:{h:'Cool rooms, without the waiting around.', items:['Book a service and get a confirmed time and quotation.','Follow your technician on the map as they drive to you.','Approve the work, pay the invoice and rate the visit.']},
  technician:{h:'Your jobs for today, in one place.', items:['See assigned jobs, addresses and what the customer reported.','Start the trip and your location is shared until you arrive.','Write the work report when you finish.']},
  admin:{h:'Run the whole service desk from here.', items:['Schedule, quote, assign and invoice every request.','Create technician and customer accounts and control both portals.','Books update automatically from invoices and payments.']}
};
function authView(){
  const m=UI.authMode, cfg=PCFG(), hero=HERO[PORTAL];
  const heroHTML=`<section class="auth-hero"><div class="brand" style="margin:0">${markSVG()}<div><b>${esc(brandName())}</b><small>${PORTAL_NAME[PORTAL]}</small></div></div>
    <h1>${hero.h}</h1><ul>${hero.items.map((t,i)=>`<li><i>${i+1}</i><span>${t}</span></li>`).join('')}</ul></section>`;
  const canSignup = (PORTAL==='customer' && cfg.customerSignup) || (PORTAL==='admin' && OWNER_EXISTS===false);
  const google = PORTAL!=='technician' ? `<div class="or">or</div><button type="button" class="btn block" data-act="google">Continue with Google</button>` : '';
  let f='';
  if(m==='reset') f=`<form class="auth-card" data-form="reset"><h2>Reset your password</h2><p class="muted">We'll email you a link to choose a new password.</p>
    <label class="field"><span>Email</span><input id="au-email" name="email" type="email" autocomplete="email" required></label>
    <button class="btn primary block">Send reset link</button><button type="button" class="linkbtn" data-act="authMode" data-v="signin">Back to sign in</button></form>`;
  else if(m==='signup' && canSignup) f=`<form class="auth-card" data-form="signup"><h2>${PORTAL==='admin'?'Set up your business':'Create your account'}</h2>
    ${PORTAL==='admin'?`<p class="small muted">This is the first-time setup. The account you create here becomes the main office account.</p>`:''}
    <div class="grid2"><label class="field"><span>Full name</span><input id="au-name" name="name" autocomplete="name" required></label>
    <label class="field"><span>Mobile</span><input id="au-phone" name="phone" autocomplete="tel" placeholder="+960 7xx xxxx" required></label></div>
    ${profileExtraFields(PORTAL==='admin'?'owner':'customer')}
    <label class="field"><span>Email</span><input id="au-email" name="email" type="email" autocomplete="email" required></label>
    <label class="field"><span>Password</span><input id="au-pass" name="password" type="password" autocomplete="new-password" minlength="6" required></label>
    <button class="btn primary block">${PORTAL==='admin'?'Create office account':'Create account'}</button>${google}
    <p class="small muted">Already have an account? <button type="button" class="linkbtn" data-act="authMode" data-v="signin">Sign in</button></p></form>`;
  else f=`<form class="auth-card" data-form="signin"><h2>Sign in</h2>
    ${PORTAL==='admin'&&OWNER_EXISTS===false?`<div class="notice">No office account exists yet. <button type="button" class="linkbtn" data-act="authMode" data-v="signup">Set up your business</button></div>`:''}
    <label class="field"><span>Email</span><input id="au-email" name="email" type="email" autocomplete="email" required></label>
    <label class="field"><span>Password</span><input id="au-pass" name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary block">Sign in</button>${google}
    <div class="row" style="justify-content:space-between">${PORTAL==='customer'? (cfg.customerSignup?`<button type="button" class="linkbtn" data-act="authMode" data-v="signup">Create an account</button>`:`<span class="small muted">New accounts are set up by the office${co().phone?' · '+esc(co().phone):''}</span>`) : PORTAL==='technician'?`<span class="small muted">Your login comes from the office.</span>`:'<span></span>'}<button type="button" class="linkbtn" data-act="authMode" data-v="reset">Forgot password?</button></div></form>`;
  return `<div class="auth">${heroHTML}<section class="auth-form">${f}</section></div>`;
}
function profileExtraFields(kind){
  if(kind==='owner') return `<label class="field"><span>Company name</span><input id="au-company" name="company" placeholder="e.g. Reefside Aircon Services" required></label>`;
  return `<div class="grid2"><label class="field"><span>Island / city</span><input id="au-island" name="island" placeholder="Malé, Hulhumalé, Thulusdhoo…"></label>
    <label class="field"><span>Address</span><input id="au-address" name="address" placeholder="House, road, floor"></label></div>`;
}
function completeProfileView(kind){
  if(kind==='customer' && !PCFG().customerSignup) return gateView('Sign-ups are closed', `New customer accounts are set up by ${esc(co().name)}${co().phone?'. Call '+esc(co().phone):''}.`);
  return `<div class="auth"><section class="auth-hero"><h1>One more step</h1><p>${kind==='owner'?'Tell us about your business.':'Tell us how to reach you about your bookings.'}</p></section>
    <section class="auth-form"><form class="auth-card" data-form="completeProfile" data-kind="${kind}"><h2>Your details</h2>
    <div class="grid2"><label class="field"><span>Full name</span><input id="cp-name" name="name" value="${esc(ME.user.displayName||'')}" required></label>
    <label class="field"><span>Mobile</span><input id="cp-phone" name="phone" placeholder="+960 7xx xxxx" required></label></div>
    ${profileExtraFields(kind)}
    <button class="btn primary block">Continue</button><button type="button" class="linkbtn" data-act="signOut">Use a different account</button></form></section></div>`;
}
function jobItem(j, cur){
  const role=ME.role, t=tech(j.techId); let hn=role==='provider'? hint(j) : '';
  if(role==='technician' && j.open && j.techId!==ME.user.uid) return `<li><button data-act="openJob" data-id="${j.id}" aria-current="${cur}">
    <span class="jl-top"><span class="mono">${esc(j.no)}</span><span class="pill orchid">Open job</span></span>
    <span class="jl-name">${esc(jobTitle(j))}</span>
    <span class="jl-meta">${esc(j.island||'')} · ${j.units||1} × ${esc(j.acType||'AC')} · ${j.slot?slotText(j.slot):'asked for '+fd(j.preferredDate)}</span>
    <span class="jl-hint" style="color:var(--orchid-text)">Take this job</span></button></li>`;
  if(role==='technician' && stage(j)==='awaiting') hn='Accept or decline';
  return `<li><button data-act="openJob" data-id="${j.id}" aria-current="${cur}">
    <span class="jl-top"><span class="mono">${esc(j.no)}</span>${pill(j)}</span>
    <span class="jl-name">${role==='customer'? esc(jobTitle(j)) : esc(j.customerName||'Customer')}</span>
    <span class="jl-meta">${role==='customer'?'':esc(jobTitle(j))+' · '}${esc(j.island||'')}${j.slot?' · '+slotText(j.slot):j.preferredDate?' · asked for '+fd(j.preferredDate):''}${t&&role!=='technician'?' · '+esc(t.name):''}</span>
    ${hn?`<span class="jl-hint">${hn}</span>`:''}</button></li>`;
}
/* What a technician sees of an open job before taking it: the work, area and time, not the exact address or phone. */
function openJobDetail(j){
  const other=S.jobs.find(x=>x.techId===ME.user.uid && x.slot && j.slot && x.slot.date===j.slot.date && !x.finishedAt && !x.cancelled);
  return `<div class="jd-head"><div><button class="btn sm back" data-act="closeJob">← Back</button></div>
    <div class="jd-title"><span class="mono">${esc(j.no)}</span><span class="pill orchid">Open job</span></div><h2>${esc(jobTitle(j))}</h2>
    <p class="muted small">Offered to all technicians ${j.offerAt?fdt(j.offerAt):''}</p></div>
    <div class="sec"><div class="next"><h3>Want this job?</h3>
      <p class="small">The first technician to take it gets it. The office and the customer are told straight away, and the full address and contact details appear in your jobs.</p>
      ${other?`<p class="small"><b>Note:</b> you already have ${esc(other.no)} on ${fd(other.slot.date)}.</p>`:''}
      <div class="row"><button class="btn teal lg" data-act="takeJob" data-id="${j.id}">Take this job</button></div></div></div>
    <div class="sec"><h3>The work</h3><div class="kv">
      <div><span class="label">When</span><b>${j.slot?slotText(j.slot):fd(j.preferredDate)+(j.window?', '+esc(WINDOWS[j.window].split(',')[0].toLowerCase()):'')}</b></div>
      <div><span class="label">Area</span><b>${esc(j.island||'')}</b></div>
      <div><span class="label">AC units</span><b>${esc(j.units||1)} × ${esc(j.acType||'AC')}</b></div>
      <div><span class="label">Capacity</span><b>${esc(j.btu||'Not given')}</b></div></div>
      ${j.issue?`<div class="callout"><span class="label">Customer's description</span><p>${esc(j.issue)}</p></div>`:''}</div>`;
}
/* ---------- job detail ---------- */
function jobDetail(j){
  const role=ME.role, s=stage(j);
  if(role==='technician' && j.techId!==ME.user.uid) return openJobDetail(j);
  let h=`<div class="jd-head"><div><button class="btn sm back" data-act="closeJob">← Back</button></div>
    <div class="jd-title"><span class="mono">${esc(j.no)}</span>${pill(j)}</div><h2>${esc(jobTitle(j))}</h2>
    <p class="muted small">${esc(j.customerName||'')}${j.customerPhone?' · '+esc(j.customerPhone):''} · ${esc(j.address||'')}${j.island?', '+esc(j.island):''} · Requested ${fdt(j.createdAt)}</p></div>`;
  if(s!=='cancelled') h+=tracker(j);
  if(role==='technician') h+=techNext(j);
  if(j.departedAt) h+=trackingSec(j);
  h+=requestSec(j)+scheduleSec(j)+quoteSec(j)+techSec(j);
  if(j.finishedAt) h+=workSec(j);
  h+=invoiceSec(j)+ratingSec(j)+messagesSec(j);
  if(s!=='cancelled' && !j.departedAt && (role==='provider' || (role==='customer' && PCFG().customerCancel))) h+=`<div class="sec"><div class="row"><button class="btn danger sm ${UI.confirm==='cancel'+j.id?'armed':''}" data-act="cancelJob" data-id="${j.id}">${UI.confirm==='cancel'+j.id?'Tap again to cancel this request':'Cancel request'}</button></div></div>`;
  return h;
}
function tracker(j){
  const done=[true, !!j.slot, !!j.quote, accepted(j), !!j.departedAt, !!j.finishedAt, j.payment?.status==='paid'];
  const cur=done.indexOf(false);
  return `<div class="trk" aria-label="Progress">${STEPS.map((l,i)=>`<div class="${done[i]?'done':i===cur?'cur':''}"><i></i>${l}</div>`).join('')}</div>`;
}
function requestSec(j){
  return `<div class="sec"><h3>Request</h3><div class="kv">
    <div><span class="label">AC units</span><b>${esc(j.units||1)} × ${esc(j.acType||'AC')}</b></div>
    <div><span class="label">Capacity</span><b>${esc(j.btu||'Not given')}</b></div>
    <div><span class="label">Preferred</span><b>${fd(j.preferredDate)}${j.window?', '+esc((WINDOWS[j.window]||'').split(',')[0]):''}</b></div>
    <div><span class="label">Address</span><b>${esc(j.address||'')}${j.island?', '+esc(j.island):''}</b>${j.dest?`<a class="small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${j.dest.lat},${j.dest.lng}">Open in Google Maps</a>`:''}</div>
  </div>${j.issue?`<div class="callout"><span class="label">Customer's description</span><p>${esc(j.issue)}</p></div>`:''}</div>`;
}
function scheduleSec(j){
  const role=ME.role, can=role==='provider' && !j.departedAt && !j.cancelled;
  let h=`<div class="sec"><div class="sec-h"><h3>Appointment</h3>${j.slot?`<span class="pill lagoon">${slotText(j.slot)}</span>`:''}</div>`;
  if(can) h+=`<div class="grid3">
      <label class="field"><span>Date</span><input type="date" id="sd-${j.id}" min="${today()}" value="${esc(j.slot?.date||j.preferredDate||today())}"></label>
      <label class="field"><span>Time</span><input type="time" id="st-${j.id}" value="${esc(j.slot?.time||({morning:'09:00',afternoon:'13:00',evening:'16:30'}[j.window]||'10:00'))}"></label></div>
    <label class="field"><span>Reply to customer (optional)</span><textarea id="sm-${j.id}" placeholder="e.g. Our technician will call 15 minutes before arriving. Please clear space around the indoor unit."></textarea></label>
    <div class="row"><button class="btn ${j.slot?'':'primary'}" data-act="schedule" data-id="${j.id}">${j.slot?'Update appointment':'Confirm appointment'}</button></div>`;
  else if(!j.slot) h+=`<p class="muted">${role==='customer'?'Waiting for the office to confirm a time. You asked for '+fd(j.preferredDate)+(j.window?', '+esc(WINDOWS[j.window]):'')+'.':'Not scheduled yet.'}</p>`;
  return h+`</div>`;
}
function quoteSec(j){
  const role=ME.role, Q=j.quote;
  if(role==='technician' && (!Q || !PCFG().techSeePrices)) return '';
  let h=`<div class="sec"><div class="sec-h"><h3>Quotation</h3>${Q?`<span class="pill ${Q.status==='accepted'?'teal':Q.status==='declined'?'bad':'orchid'}">${Q.status==='accepted'?'Accepted':Q.status==='declined'?'Declined':'Awaiting customer'}</span>`:''}</div>`;
  const editable=role==='provider' && !j.finishedAt && !j.cancelled && (!Q || Q.status!=='accepted');
  if(Q) h+=docView('Quotation',Q,j);
  if(Q?.status==='declined' && Q.reason) h+=`<div class="callout coral"><span class="label">Customer's reason</span><p>${esc(Q.reason)}</p></div>`;
  if(role==='customer' && Q?.status==='sent') h+=`<div class="callout"><b>Do you approve this quotation?</b>
      <label class="field"><span>Message to the office (optional)</span><textarea id="qr-${j.id}" placeholder="Anything you want to change or ask"></textarea></label>
      <div class="row"><button class="btn teal" data-act="quoteAccept" data-id="${j.id}">Accept quotation</button><button class="btn" data-act="quoteDecline" data-id="${j.id}">Decline</button></div></div>`;
  if(!Q && role==='customer') h+=`<p class="muted">No quotation yet. The office may send one before the visit.</p>`;
  if(editable){
    const key='q-'+j.id;
    if(Q && !UI.ed[key] && UI.confirm!=='rev'+j.id) h+=`<div class="row"><button class="btn" data-act="reviseQuote" data-id="${j.id}">Revise quotation</button></div>`;
    else {
      const init=Q? {lines:clone(Q.lines), discount:Q.discount||0, notes:Q.notes||''} : {lines:(j.serviceIds||[]).map(sv).filter(Boolean).map(s=>({desc:s.name,qty:j.units||1,rate:s.price})), discount:0, notes:'Price includes labour. Parts or gas beyond the listed quantities are charged separately.'};
      h+=`<div class="callout">${lineEditor(key,init)}
        <label class="field"><span>Terms and notes</span><textarea id="${key}-notes" data-np data-ed="${key}" data-f="notes">${esc(UI.ed[key].notes)}</textarea></label>
        <div class="row"><button class="btn primary" data-act="sendQuote" data-id="${j.id}">${Q?'Send revised quotation':'Send quotation'}</button></div></div>`;
    }
  }
  return h+`</div>`;
}
function lineEditor(key, init){
  if(!UI.ed[key]) UI.ed[key]=clone(init);
  const e=UI.ed[key];
  return `<div class="lines"><div class="lrow lhead"><span>Description</span><span>Qty</span><span>Rate</span><span class="lamt">Amount</span><span></span></div>
    ${e.lines.map((l,i)=>`<div class="lrow">
      <input id="${key}-d${i}" data-np data-ed="${key}" data-f="lines.${i}.desc" value="${esc(l.desc)}" placeholder="Description" aria-label="Description">
      <input id="${key}-q${i}" data-np data-ed="${key}" data-f="lines.${i}.qty" type="number" min="0" step="1" value="${esc(l.qty)}" aria-label="Quantity">
      <input id="${key}-r${i}" data-np data-ed="${key}" data-f="lines.${i}.rate" type="number" min="0" step="0.01" value="${esc(l.rate)}" aria-label="Rate">
      <span class="lamt mono" data-amt="${key}-${i}">${money((+l.qty||0)*(+l.rate||0))}</span>
      <button class="icon" data-act="rmLine" data-key="${key}" data-i="${i}" aria-label="Remove line">×</button></div>`).join('')}
    <div class="row" style="margin-top:4px">
      <select id="${key}-add" data-np data-change="addSvcLine" data-key="${key}" aria-label="Add a service" style="max-width:260px"><option value="">+ Add a service…</option>${S.services.map(s=>`<option value="${s.id}">${esc(s.name)} · ${money(s.price)}</option>`).join('')}</select>
      <button class="btn sm" data-act="addLine" data-key="${key}">+ Custom line</button></div>
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-top:6px">
      <label class="field" style="max-width:160px"><span>Discount (${CUR})</span><input id="${key}-disc" data-np data-ed="${key}" data-f="discount" type="number" min="0" step="0.01" value="${esc(e.discount||0)}"></label>
      <div class="tot" data-tot="${key}">${totHTML(totals(e))}</div></div></div>`;
}
function totHTML(t){ return `<span>Subtotal</span><span>${money(t.sub)}</span>${t.disc?`<span>Discount</span><span>−${money(t.disc)}</span>`:''}<span>GST ${t.rate}%</span><span>${money(t.gst)}</span><span class="grand">Total</span><span class="grand">${money(t.total)}</span>`; }
function updateTotals(key){
  const e=UI.ed[key]; if(!e) return;
  const el=document.querySelector(`[data-tot="${key}"]`); if(el) el.innerHTML=totHTML(totals(e));
  e.lines.forEach((l,i)=>{ const a=document.querySelector(`[data-amt="${key}-${i}"]`); if(a) a.textContent=money((+l.qty||0)*(+l.rate||0)); });
}
function docView(kind, dc, j){
  const C=co(), t=totals(dc), inv=kind==='Invoice', paid=inv && j.payment?.status==='paid';
  return `<div class="doc ${inv?'invoice':''}">
    <div class="doc-h"><div><h3>${esc(C.name)}</h3><p class="small muted">${esc(C.address)}${C.phone?'<br>'+esc(C.phone):''}${C.email?' · '+esc(C.email):''}${C.tin?'<br>GST TIN '+esc(C.tin):''}</p></div>
      <div><div class="doc-kind">${kind}</div><p class="small mono" style="text-align:right">${esc(dc.no)}<br>${inv?'Issued '+fd(dc.issuedAt)+'<br>Due '+fd(dc.dueDate):'Sent '+fd(dc.sentAt)+'<br>Valid until '+fd(dc.validUntil)}</p></div></div>
    <div class="small"><span class="label">Bill to</span><br><b>${esc(j.customerName||'')}</b><br>${esc(j.address||'')}${j.island?', '+esc(j.island):''}${j.customerPhone?' · '+esc(j.customerPhone):''}<br><span class="muted">Ref ${esc(j.no)}</span></div>
    <div class="tscroll"><table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${(dc.lines||[]).map(l=>`<tr><td>${esc(l.desc)}</td><td class="r">${esc(l.qty)}</td><td class="r">${money(l.rate)}</td><td class="r">${money((+l.qty||0)*(+l.rate||0))}</td></tr>`).join('')}</tbody></table></div>
    <div class="doc-foot"><div class="small muted" style="max-width:360px">${esc(dc.notes||'')}${inv&&(dc.methods||[]).length?`<br><br><b>Pay by:</b> ${(dc.methods||[]).map(m=>METHODS[m]?.n).join(', ')}${(dc.methods||[]).includes('bml')&&C.bml?`<br>BML ${esc(C.bml)}`:''}${(dc.methods||[]).includes('mib')&&C.mib?`<br>MIB ${esc(C.mib)}`:''}`:''}</div>
      <div class="row" style="gap:16px;margin-left:auto">${paid?'<span class="stamp">PAID</span>':''}<div class="tot">${totHTML(t)}</div></div></div></div>`;
}
function techSec(j){
  const role=ME.role; if(role==='technician') return '';
  const t=tech(j.techId), showT = t && (role==='provider' || accepted(j));
  let h=`<div class="sec"><div class="sec-h"><h3>Technician</h3>${role==='provider'&&j.techId?(accepted(j)?`<span class="pill teal">Accepted ${j.acceptedAt?ft(j.acceptedAt):''}</span>`:`<span class="pill mango">Waiting for ${esc(t?.name?.split(' ')[0]||'technician')} to accept</span>`):role==='provider'&&j.open?'<span class="pill orchid">Open to all technicians</span>':''}</div>`;
  if(showT){ const ar=avgRating(t.id); h+=`<div class="row"><span class="avatar">${initials(t.name)}</span><div><b>${esc(t.name)}</b><p class="small muted">${role==='customer' && !PCFG().showTechPhone ? '' : esc(t.phone||'')}${ar?' · '+stars(ar.avg)+' '+ar.avg.toFixed(1):''}</p></div></div>`; }
  if(role==='provider'){
    if(j.declined && !j.techId) h+=`<div class="callout coral"><b>${esc(j.declined.name)} declined this job</b><p class="small">${fdt(j.declined.at)}${j.declined.reason?' · “'+esc(j.declined.reason)+'”':''}</p></div>`;
    if(j.open) h+=`<div class="callout"><p class="small">Offered to every technician ${j.offerAt?'since '+fdt(j.offerAt):''}. The first one to take it gets it, and you'll be notified.</p><div><button class="btn sm" data-act="stopOffer" data-id="${j.id}">Stop offering</button></div></div>`;
  }
  if(role==='provider' && !j.departedAt && !j.cancelled){
    if(!S.techs.length) h+=`<p class="muted">Add technicians in the Team tab to assign this job.</p>`;
    else h+=`<div class="assign-box">
      <div class="stack"><span class="label">Send to one technician</span><p class="small muted">They get an alert and must accept the job.</p>
        <div class="row"><select id="as-${j.id}" aria-label="Choose technician" style="max-width:260px">${S.techs.map(x=>`<option value="${x.id}" ${x.id===j.techId?'selected':''}>${esc(x.name)}${busyTech(x.id,j.id)?' (on a job)':''}</option>`).join('')}</select>
        <button class="btn ${j.techId?'':'primary'}" data-act="assign" data-id="${j.id}">${j.techId?'Send to someone else':'Send job'}</button></div></div>
      ${j.open?'':`<div class="stack"><span class="label">Or offer to every technician</span><p class="small muted">All technicians get an alert. The first to take it gets the job.</p>
        <div><button class="btn" data-act="offerAll" data-id="${j.id}">Offer to all technicians</button></div></div>`}</div>`;
  } else if(!showT) h+=`<p class="muted">${j.techId||j.open?"We're confirming your technician now.":'A technician will be assigned before your visit.'}</p>`;
  return h+`</div>`;
}
const busyTech = (tid, except) => S.jobs.some(j=>j.id!==except && j.techId===tid && j.departedAt && !j.finishedAt && !j.cancelled);
function techNext(j){
  const s=stage(j); let h=`<div class="sec"><div class="next">`;
  const other=myActiveTrip();
  if(s==='awaiting'){
    h+=`<h3>New job for you</h3><p class="small">The office sent you this job${j.assignedAt?' at '+ft(j.assignedAt):''}. Accept it to add it to your jobs, or decline so it can go to someone else.</p>
      <label class="field"><span>Reason, if you decline (optional)</span><input id="dr-${j.id}" placeholder="e.g. Already booked that morning"></label>
      <div class="row"><button class="btn teal lg" data-act="acceptJob" data-id="${j.id}">Accept job</button><button class="btn danger" data-act="declineJob" data-id="${j.id}">Decline</button></div>`;
  } else if(['assigned','scheduled','quoted','approved'].includes(s) && other && other.id!==j.id){
    h+=`<h3>You're still on the way to ${esc(other.no)}</h3><p class="small">Tap "I've arrived" on that job before starting this trip.</p>`;
  } else if(['assigned','scheduled','quoted','approved'].includes(s)){
    h+=`<h3>Leaving for this job?</h3><p class="small">Starting the trip shares your phone's location with the customer and the office until you arrive. Keep this page open while you travel.</p>
      <div class="row"><label class="field" style="max-width:170px"><span>Travel time (minutes)</span><input id="eta-${j.id}" type="number" min="1" max="240" value="25"></label>
      <button class="btn teal" data-act="startTrip" data-id="${j.id}" style="align-self:flex-end">Start trip</button></div>`;
  } else if(s==='enroute' && staleTrip(j)){
    h+=`<h3>Location sharing stopped</h3><p class="small">This trip started more than ${STALE_H} hours ago, so your location is no longer shared. Tap "I've arrived" if you're there.</p>
      <div class="row"><button class="btn teal" data-act="arrived" data-id="${j.id}">I've arrived</button></div>`;
  } else if(s==='enroute'){
    const near = j.dest && GPS.last && haversineKm(GPS.last, j.dest) < 0.15;
    if(near) h+=`<div class="callout teal"><b>You're at the customer's location.</b> Tap "I've arrived" to stop sharing your location.</div>`;
    h+=`<h3>You're on the way</h3><p class="small">${GPS.error?`<b style="color:var(--coral-text)">${esc(GPS.error)}</b>`:GPS.watchId!=null?'Sharing your location. Keep this page open.':'Starting location sharing…'}</p>
      <div class="row"><button class="btn teal" data-act="arrived" data-id="${j.id}">I've arrived</button>${j.dest?`<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${j.dest.lat},${j.dest.lng}">Directions</a>`:''}</div>`;
  } else if(s==='onsite'){
    h+=`<h3>Finish the job</h3>
      <label class="field"><span>Work done</span><textarea id="wn-${j.id}" placeholder="e.g. Cleaned filters and coil, topped up R32 gas, outlet 9°C"></textarea></label>
      <label class="field"><span>Parts or gas used (optional)</span><input id="wp-${j.id}" placeholder="e.g. 0.5 kg R32, 1 capacitor 35µF"></label>
      <div class="row"><button class="btn teal" data-act="finish" data-id="${j.id}">Mark job finished</button></div>`;
  } else if(s==='cancelled') h+=`<h3>This request was cancelled</h3>`;
  else h+=`<h3>Job finished ${fdt(j.finishedAt)}</h3><p class="small">${j.payment?.status==='paid'?'Paid. Nothing left to do.':j.payment?.status==='pending'?'The customer will pay '+money(j.invoice.total)+' by '+METHODS[j.payment.method]?.n.toLowerCase()+'. Collect it and hand it to the office.':j.invoice?'Invoice sent to the customer.':'The office will send the invoice.'}</p>`;
  return h+`</div></div>`;
}

/* ---------- live tracking ---------- */
function trackingSec(j){
  const t=tech(j.techId), live=j.departedAt && !j.arrivedAt;
  if(j.arrivedAt){
    const mins=j.trip?.mins ?? Math.max(1,Math.round((new Date(j.arrivedAt)-new Date(j.departedAt))/60000));
    return `<div class="sec"><div class="sec-h"><h3>Trip</h3><span class="pill mute">Location sharing ended</span></div>
      <p class="small">${esc(t?.name||'The technician')} left at ${ft(j.departedAt)} and arrived at ${ft(j.arrivedAt)}: ${mins} min${j.trip?.km?`, about ${j.trip.km} km`:''}. Location sharing stopped on arrival and the route was deleted.</p></div>`;
  }
  if(staleTrip(j)) return `<div class="sec"><div class="sec-h"><h3>Trip</h3><span class="pill mute">Location sharing stopped</span></div>
      <p class="small">Location sharing stopped automatically because this trip started more than ${STALE_H} hours ago. The route was deleted.</p></div>`;
  return `<div class="sec"><div class="sec-h"><h3>${live?'Live location':'Trip'}</h3>${live?'<span class="pill live">Live</span>':`<span class="small muted">Arrived ${fdt(j.arrivedAt)}</span>`}</div>
    <div class="eta" data-eta="${j.id}">${etaHTML(j)}</div>
    <div class="map" data-map="track-${j.id}" role="img" aria-label="Map of ${esc(t?.name||'the technician')}'s trip"></div>
    <p class="small muted">${esc(t?.name||'Technician')} left at ${ft(j.departedAt)}.</p></div>`;
}
function etaHTML(j){
  if(j.arrivedAt) return `<div><span class="label">Status</span><br><b>Arrived</b></div><div><span class="label">Trip time</span><br><b>${Math.max(1,Math.round((new Date(j.arrivedAt)-new Date(j.departedAt))/60000))} min</b></div>`;
  const planned=new Date(new Date(j.departedAt).getTime()+(+j.etaMins||25)*60000).toISOString();
  if(j.loc && j.dest){
    const km=haversineKm(j.loc,j.dest)*1.25, mins=Math.max(1,Math.round(km/(SETTINGS.avgSpeedKmh||22)*60));
    return `<div><span class="label">Arriving in</span><br><b>${km<0.15?'Any minute':'~'+mins+' min'}</b></div><div><span class="label">Distance</span><br><b>${km.toFixed(1)} km</b></div><div><span class="label">GPS</span><br><span class="small">Updated ${ago(j.loc.at)}</span></div>`;
  }
  return `<div><span class="label">Expected around</span><br><b>${ft(planned)}</b></div><div><span class="label">GPS</span><br><span class="small">${j.loc?'Updated '+ago(j.loc.at):"Waiting for the technician's phone"}</span></div>`;
}
setInterval(()=>{ document.querySelectorAll('[data-eta]').forEach(el=>{ const j=job(el.dataset.eta); if(j) el.innerHTML=etaHTML(j); }); }, 5000);

/* Leaflet maps survive re-renders: the map element is detached and re-inserted. */
const MAPS={};
function icon(kind, text){ return window.L.divIcon({className:'', html:`<span class="pin pin-${kind}"><span>${esc(text||'')}</span></span>`, iconSize:[34,34], iconAnchor:[17,17]}); }
function attachMaps(){
  const seen=new Set();
  document.querySelectorAll('[data-map]').forEach(ph=>{
    const key=ph.dataset.map; seen.add(key);
    if(!window.L){ ph.innerHTML='<p class="muted small" style="padding:12px">The map could not load. Check your connection.</p>'; return; }
    let m=MAPS[key];
    if(m){ ph.replaceWith(m.el); setTimeout(()=>m.map.invalidateSize(),0); }
    else { m=MAPS[key]=createMap(key, ph); }
    updateMap(key,m);
  });
  for(const k in MAPS) if(!seen.has(k)){ MAPS[k].map.remove(); delete MAPS[k]; }
}
function createMap(key, el){
  const L=window.L, map=L.map(el,{scrollWheelZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const m={el,map,layers:{},fitted:false};
  if(key.startsWith('pick-')) map.on('click', e=>{ UI.pick[key.slice(5)]={lat:+e.latlng.lat.toFixed(6), lng:+e.latlng.lng.toFixed(6)}; updateMap(key,m); });
  return m;
}
function setMarker(m, name, ll, ic){
  const lay=m.layers;
  if(!ll){ if(lay[name]){ lay[name].remove(); delete lay[name]; } return; }
  if(lay[name]) lay[name].setLatLng(ll); else lay[name]=window.L.marker(ll,{icon:ic}).addTo(m.map);
}
function pickDefault(k){
  if(k==='co') return S.company?.lat!=null? {lat:S.company.lat,lng:S.company.lng} : null;
  const me=myCustomer(); return me?.lat!=null? {lat:me.lat,lng:me.lng} : null;
}
function updateMap(key, m){
  const L=window.L, map=m.map;
  if(key.startsWith('pick-')){
    const k=key.slice(5), p=UI.pick[k] || pickDefault(k);
    if(!m.fitted){ map.setView(p?[p.lat,p.lng]:SETTINGS.mapCenter, p?16:13); m.fitted=true; }
    setMarker(m,'pin', p?[p.lat,p.lng]:null, icon(k==='co'?'office':'home',''));
    const info=document.querySelector(`[data-pickinfo="${k}"]`); if(info) info.textContent = p? `Pinned at ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : 'Tap the map to drop a pin on the exact location.';
    return;
  }
  const j=job(key.slice(6)); if(!j) return;
  const C=co(), t=tech(j.techId);
  const office=C.lat!=null?[C.lat,C.lng]:null, dest=j.dest?[j.dest.lat,j.dest.lng]:null, cur=j.loc?[j.loc.lat,j.loc.lng]:null;
  setMarker(m,'office',office,icon('office',''));
  setMarker(m,'dest',dest,icon('home',''));
  setMarker(m,'tech',cur,icon('tech',initials(t?.name||'T')));
  const trail=(j.trail||[]).map(p=>[p.lat,p.lng]);
  if(m.layers.trail){ m.layers.trail.setLatLngs(trail); } else if(trail.length>1){ m.layers.trail=L.polyline(trail,{color:getComputedStyle(document.documentElement).getPropertyValue('--teal').trim()||'#00A08E',weight:5,opacity:.85}).addTo(map); }
  if(!m.fitted){ const pts=[office,dest,cur].filter(Boolean); if(pts.length>1) map.fitBounds(pts,{padding:[40,40],maxZoom:16}); else map.setView(pts[0]||SETTINGS.mapCenter, pts.length?15:12); m.fitted=true; }
  else if(cur && !map.getBounds().contains(cur)) map.panTo(cur);
}

/* ---------- technician GPS ---------- */
const GPS={watchId:null, jobId:null, last:null, lastWrite:0, error:'', wake:null};
function myActiveTrip(){ return ME.role==='technician' ? S.jobs.find(j=>j.techId===ME.user.uid && j.departedAt && !j.arrivedAt && !j.finishedAt && !j.cancelled && !staleTrip(j)) : null; }
const CLEARED=new Set();
function ensureGPS(){
  // Delete any location left on a job whose trip has ended (arrived, finished, cancelled or over STALE_H hours).
  if(ME.role==='technician' || ME.role==='provider') S.jobs.filter(x=>(x.loc||x.trail) && (x.arrivedAt||x.finishedAt||x.cancelled||staleTrip(x)) && !CLEARED.has(x.id) && (ME.role==='provider'||x.techId===ME.user.uid))
    .forEach(x=>{ CLEARED.add(x.id); F.updateDoc(d('jobs',x.id),{loc:F.deleteField(), trail:F.deleteField()}).catch(e=>console.warn('clear location',e)); });
  const j=myActiveTrip();
  if(!j){ if(GPS.watchId!=null) stopGPS(); return; }
  if(GPS.watchId!=null && GPS.jobId===j.id) return;
  stopGPS(); GPS.jobId=j.id;
  if(!navigator.geolocation){ GPS.error='This browser cannot share location.'; return; }
  GPS.watchId=navigator.geolocation.watchPosition(p=>{ GPS.error=''; sendPos(p); }, e=>{ GPS.error = e.code===1? 'Location permission is blocked. Allow location for this site in your browser settings.' : 'Waiting for a GPS signal…'; schedRender(); }, {enableHighAccuracy:true, maximumAge:5000, timeout:30000});
  try{ navigator.wakeLock?.request('screen').then(w=>GPS.wake=w).catch(()=>{}); }catch(e){}
}
function stopGPS(){ if(GPS.watchId!=null && navigator.geolocation) navigator.geolocation.clearWatch(GPS.watchId); GPS.watchId=null; GPS.jobId=null; try{ GPS.wake?.release(); }catch(e){} GPS.wake=null; }
function sendPos(p){
  const j=job(GPS.jobId); if(!j || j.arrivedAt || j.finishedAt || j.cancelled || staleTrip(j)) return;
  const pos={lat:+p.coords.latitude.toFixed(6), lng:+p.coords.longitude.toFixed(6), acc:Math.round(p.coords.accuracy||0), at:nowISO()};
  const now=Date.now(), gap=now-GPS.lastWrite, moved=GPS.last? haversineKm(GPS.last,pos)*1000 : Infinity;
  if(gap < (SETTINGS.gpsIntervalSec||12)*1000) return;
  if(moved < 20 && gap < 60000) return;
  GPS.lastWrite=now; GPS.last=pos;
  const trail=[...(j.trail||[]), {lat:pos.lat,lng:pos.lng}].slice(-120);
  F.updateDoc(d('jobs',j.id),{loc:pos, trail}).catch(e=>console.warn('gps write',e));
}
function getPosOnce(){ return new Promise(res=>{ if(!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p=>res({lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),acc:Math.round(p.coords.accuracy||0),at:nowISO()}), ()=>res(null), {enableHighAccuracy:true,maximumAge:30000,timeout:10000}); }); }

function workSec(j){
  return `<div class="sec"><h3>Work report</h3><div class="kv">
    <div><span class="label">Arrived</span><b>${fdt(j.arrivedAt)||'Not recorded'}</b></div>
    <div><span class="label">Finished</span><b>${fdt(j.finishedAt)}</b></div>
    ${j.arrivedAt?`<div><span class="label">Time on site</span><b>${Math.max(1,Math.round((new Date(j.finishedAt)-new Date(j.arrivedAt))/60000))} min</b></div>`:''}</div>
    ${j.workNotes?`<div class="callout teal"><span class="label">Work done</span><p>${esc(j.workNotes)}</p>${j.parts?`<p class="small">Parts and gas: ${esc(j.parts)}</p>`:''}</div>`:''}</div>`;
}

/* ---------- invoice & payment ---------- */
function invoiceSec(j){
  const role=ME.role, I=j.invoice, P=j.payment, C=co();
  if(role==='technician' && !PCFG().techSeePrices) return I? `<div class="sec"><div class="sec-h"><h3>Invoice</h3>${pill(j)}</div></div>` : '';
  if(!I && role!=='provider') return j.finishedAt? `<div class="sec"><h3>Invoice</h3><p class="muted">The invoice will appear here once the office sends it.</p></div>` : '';
  if(!I && !j.finishedAt) return '';
  let h=`<div class="sec"><div class="sec-h"><h3>Invoice</h3>${I?pill(j):''}</div>`;
  if(!I){
    const key='i-'+j.id;
    const base=j.quote? clone(j.quote.lines) : (j.serviceIds||[]).map(sv).filter(Boolean).map(s=>({desc:s.name,qty:j.units||1,rate:s.price}));
    const init={lines:base, discount:j.quote?.discount||0, notes:'Thank you for your business. Please quote '+(j.no||'')+' as the payment reference.', dueDays:C.terms||7, methods:{...C.methods}};
    h+=`<div class="callout">${lineEditor(key,init)}
      <div class="grid2"><label class="field"><span>Due in (days)</span><input id="${key}-due" data-np data-ed="${key}" data-f="dueDays" type="number" min="0" value="${esc(UI.ed[key].dueDays)}"></label></div>
      <div class="field"><span>Payment methods the customer can use</span><div class="row">${Object.entries(METHODS).map(([k,m])=>`<label class="row small" style="gap:6px"><input type="checkbox" id="${key}-m-${k}" data-np data-ed="${key}" data-f="methods.${k}" ${UI.ed[key].methods[k]?'checked':''}>${m.n}</label>`).join('')}</div></div>
      <label class="field"><span>Notes</span><textarea id="${key}-notes" data-np data-ed="${key}" data-f="notes">${esc(UI.ed[key].notes)}</textarea></label>
      <div class="row"><button class="btn primary" data-act="sendInvoice" data-id="${j.id}">Send invoice</button><span class="small muted">Sending posts the sale, GST and the amount owed to Accounting.</span></div></div>`;
    return h+`</div>`;
  }
  h+=docView('Invoice',I,j);
  if(P?.status==='paid'){
    h+=`<div class="callout teal"><b>Paid ${money(P.amount)} by ${METHODS[P.method]?.n||P.method}</b><p class="small">${fdt(P.paidAt)}${P.ref?' · Reference '+esc(P.ref):''}</p>`;
    h+=receiptLine(j);
    if(role==='provider' && P.verified===false) h+=`<p class="small"><b>Check this ${P.ref?'reference':'receipt'} against your ${P.method==='bml'?'BML':'MIB'} account.</b> It's already posted to the books; reverse it if the money didn't arrive.</p>
      <div class="row"><button class="btn teal sm" data-act="verifyPay" data-id="${j.id}">Transfer received</button><button class="btn danger sm ${UI.confirm==='rev'+j.id?'armed':''}" data-act="reversePay" data-id="${j.id}">${UI.confirm==='rev'+j.id?'Tap again to reverse':'Not received, reverse it'}</button></div>`;
    h+=`</div>`;
  } else if(P?.status==='pending'){
    h+=`<div class="callout coral"><b>${METHODS[P.method]?.n} payment of ${money(I.total)} to collect</b><p class="small">The customer chose this ${fdt(P.requestedAt)}.</p>${receiptLine(j)}${role==='provider'?`<div class="row"><button class="btn coral" data-act="confirmPay" data-id="${j.id}">Confirm ${METHODS[P.method]?.n.toLowerCase()} received</button></div>`:''}</div>`;
  } else if(role==='customer') h+=payPanel(j);
  if(role==='customer' && P && !j.receipt) h+=`<div class="callout"><b>Add your payment receipt</b><p class="small">Optional. It helps the office confirm your payment faster.</p>${receiptPicker(j)}${UI.rcpt[j.id]?`<div><button class="btn teal" data-act="uploadReceipt" data-id="${j.id}">Send receipt</button></div>`:''}</div>`;
  else if(role==='provider') h+=`<details class="callout"><summary><b>Record a payment received another way</b></summary>
      <div class="grid3" style="margin-top:10px"><label class="field"><span>Method</span><select id="rp-m-${j.id}">${Object.entries(METHODS).map(([k,m])=>`<option value="${k}">${m.n}</option>`).join('')}</select></label>
      <label class="field"><span>Reference</span><input id="rp-r-${j.id}" placeholder="Transfer or receipt no."></label></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="recordPay" data-id="${j.id}">Record ${money(I.total)} received</button></div></details>`;
  return h+`</div>`;
}
function payPanel(j){
  const I=j.invoice, C=co(), ms=(I.methods||[]).filter(m=>METHODS[m]);
  if(!ms.length) return `<p class="muted">Contact the office to arrange payment.</p>`;
  const sel=UI.payM[j.id] || ms[0], acct = sel==='bml'? C.bml : C.mib;
  return `<div class="pay">
    <div class="pay-amt"><span class="label">Amount to pay</span><b>${money(I.total)}</b><span class="small">Due ${fd(I.dueDate)}${overdue(j)?' · overdue':''}</span></div>
    <div class="pay-step"><span class="pay-n">1</span><div class="stack" style="flex:1;min-width:0"><b>Choose how to pay</b><div class="opts">${ms.map((m,i)=>`<label class="opt"><input type="radio" name="pm-${j.id}" id="pm-${j.id}-${m}" data-np value="${m}" data-change="payMethod" data-id="${j.id}" ${m===sel?'checked':''}><span class="sicon c${i%5}"><svg viewBox="0 0 24 24">${m==='cash'?'<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="2.5"/>':m==='card'?'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>':'<path d="M4 10h16L12 4zM6 10v8M10 10v8M14 10v8M18 10v8M4 20h16"/>'}</svg></span><span><b>${METHODS[m].n}</b><span class="small muted">${m==='cash'?'Pay the technician or the office':m==='card'?"On the technician's card machine":(m==='bml'?C.bml:C.mib)?'Account '+esc(m==='bml'?C.bml:C.mib):'Bank transfer'}</span></span></label>`).join('')}</div>
    </div></div>
    ${METHODS[sel].transfer?`
    <div class="pay-step"><span class="pay-n">2</span><div class="stack" style="flex:1;min-width:0"><b>Transfer the money</b>
      <div class="bankbox">
        <div><span class="label">Bank</span><b>${sel==='bml'?'Bank of Maldives (BML)':'Maldives Islamic Bank (MIB)'}</b></div>
        <div><span class="label">Account name</span><b>${esc(C.name)}</b></div>
        <div><span class="label">Account number</span><span class="row"><b class="mono">${esc(acct||'Ask the office')}</b>${acct?copyBtn(acct):''}</span></div>
        <div><span class="label">Amount</span><span class="row"><b>${money(I.total)}</b>${copyBtn((+I.total).toFixed(2))}</span></div>
        <div><span class="label">Reference</span><span class="row"><b class="mono">${esc(j.no)}</b>${copyBtn(j.no)}</span></div>
      </div></div></div>
    <div class="pay-step"><span class="pay-n">3</span><div class="stack" style="flex:1;min-width:0"><b>Show us you've paid</b>
      <label class="field"><span>Transfer reference from your bank app</span><input id="pr-${j.id}" placeholder="e.g. BLAZ2610271234"></label>
      ${receiptPicker(j)}
      <p class="small muted">Add the reference, the receipt, or both.</p></div></div>`
    :`<p class="small">${sel==='cash'?`Pay ${money(I.total)} in cash to the technician or at our office.`:`Pay ${money(I.total)} on the technician's card machine.`} The office confirms it once the money is received.</p>`}
    <button class="btn teal block lg" data-act="pay" data-id="${j.id}" data-m="${sel}">${METHODS[sel].transfer?'Send payment details':`I'll pay ${sel==='cash'?'cash':'by card'}`}</button></div>`;
}

/* ---------- rating & messages ---------- */
function ratingSec(j){
  const R=j.rating;
  if(R) return `<div class="sec"><h3>Customer rating</h3><div class="row">${stars(R.stars)}<span class="small muted">${fdt(R.at)}</span></div>${R.text?`<p>“${esc(R.text)}”</p>`:''}</div>`;
  if(ME.role==='customer' && j.finishedAt) return `<div class="sec"><h3>How did we do?</h3>
    <div class="starpick" role="radiogroup" aria-label="Rating">${[5,4,3,2,1].map(n=>`<input type="radio" name="rt-${j.id}" id="rt-${j.id}-${n}" value="${n}"><label for="rt-${j.id}-${n}" title="${n} star${n>1?'s':''}">★</label>`).join('')}</div>
    <label class="field"><span>Feedback (optional)</span><textarea id="rf-${j.id}" placeholder="Was the technician on time? Is the AC cooling well now?"></textarea></label>
    <div class="row"><button class="btn mango" data-act="rate" data-id="${j.id}">Submit rating</button></div></div>`;
  return '';
}
function messagesSec(j){
  const ms=S.msgs[j.id]||[];
  return `<div class="sec"><h3>Activity and messages</h3>
    <div class="thread" data-keep-scroll="th-${j.id}">${ms.length? ms.map(m=>m.kind==='sys'?`<div class="sys">${esc(m.text)} · ${fdt(m.at)}</div>`
      :`<div class="msg r-${esc(m.role)} ${m.uid===ME.user.uid?'mine':''}"><span class="who">${esc(m.name)} · ${m.role==='provider'?'Office':m.role==='technician'?'Technician':'Customer'} · ${fdt(m.at)}</span><p>${esc(m.text)}</p></div>`).join('') : '<p class="muted small">No messages yet.</p>'}</div>
    ${j.cancelled?'':`<div class="row" style="align-items:flex-end;flex-wrap:nowrap"><label class="field" style="flex:1"><span>Message</span><textarea id="msg-${j.id}" rows="2" style="min-height:44px" placeholder="Write a message"></textarea></label><button class="btn primary" data-act="sendMsg" data-id="${j.id}">Send</button></div>`}</div>`;
}
/* ---------- actions ---------- */
const val = id => document.getElementById(id)?.value?.trim() ?? '';
const jobRef = id => d('jobs',id);
const ACT = {
  authMode(el){ UI.authMode=el.dataset.v; render(); },
  async google(){ await run(()=>A.signInWithPopup(auth, new A.GoogleAuthProvider())); },
  async signOut(){ stopGPS();
    if(PUSH_TOKEN && ME.user){ try{ await F.updateDoc(d('users',ME.user.uid),{fcmTokens:F.arrayRemove(PUSH_TOKEN)}); }catch(e){} PUSH_TOKEN=null; }
    pushTried=null; await A.signOut(auth); },
  bell(){ UI.bell=!UI.bell; render(); },
  bellClose(){ UI.bell=false; render(); },
  modalClose(){ UI.modal=null; render(); },
  openItem(el){ const it=(S.inbox||[]).find(x=>x.id===el.dataset.id); UI.bell=false;
    if(it && !it.read) F.updateDoc(d('inbox',inboxId(),'items',it.id),{read:true}).catch(()=>{});
    if(it?.jobId && job(it.jobId)) openJobById(it.jobId); render(); },
  readAll(){ const b=F.writeBatch(db); (S.inbox||[]).filter(x=>!x.read).forEach(x=>b.update(d('inbox',inboxId(),'items',x.id),{read:true})); b.commit().catch(e=>toast(errMsg(e))); },
  async enablePush(){
    try{ const p=await Notification.requestPermission(); if(p!=='granted'){ toast('Alerts were not allowed on this device.'); return render(); }
      await registerSW(); pushTried=null; await registerPush(); toast('Alerts are on for this device'); render(); }
    catch(e){ toast('This browser cannot show alerts.'); } },
  async copy(el){ const v=el.dataset.v; try{ await navigator.clipboard.writeText(v); toast('Copied: '+v); }catch(e){ toast(v); } },
  rcptRemove(el){ delete UI.rcpt[el.dataset.id]; render(); },
  async viewReceipt(el){ const id=el.dataset.id; UI.modal={title:'Payment receipt', html:'<div class="loading">Loading the receipt…</div>'}; render();
    try{ const s=await F.getDoc(d('jobs',id,'files','receipt')); if(!s.exists()) throw new Error('The receipt was not found.');
      const r=s.data(); let body;
      if(r.type==='application/pdf'){ const u=URL.createObjectURL(await (await fetch(r.dataUrl)).blob()); body=`<p><a class="btn primary" href="${u}" target="_blank" rel="noopener">Open the PDF</a></p><embed class="rcpt-pdf" src="${u}" type="application/pdf">`; }
      else body=`<img class="rcpt-full" src="${esc(r.dataUrl)}" alt="Payment receipt">`;
      UI.modal={title:'Payment receipt', html:body+`<p class="small muted">${esc(r.name)} · uploaded ${fdt(r.at)}</p>`};
    }catch(e){ UI.modal={title:'Payment receipt', html:`<p>${esc(errMsg(e))}</p>`}; }
    render(); },
  uploadReceipt(el){ const j=job(el.dataset.id), r=UI.rcpt[j.id]; if(!r) return toast('Choose a receipt file first.');
    el.disabled=true;
    run(async()=>{ const b=F.writeBatch(db), at=nowISO();
      b.set(d('jobs',j.id,'files','receipt'),{...r, at, uid:ME.user.uid}); b.update(jobRef(j.id),{receipt:{name:r.name, type:r.type, at}});
      await b.commit(); delete UI.rcpt[j.id]; await event(j,'Payment receipt uploaded',['office'],'Payment receipt uploaded'); }, 'Receipt sent to the office').finally(()=>el.disabled=false); },
  openJob(el){ UI.sel=el.dataset.id; UI.confirm=''; render(); if(innerWidth<=900) scrollTo(0,0); },
  closeJob(){ UI.sel=''; render(); },
  addLine(el){ UI.ed[el.dataset.key].lines.push({desc:'',qty:1,rate:0}); render(); },
  rmLine(el){ UI.ed[el.dataset.key].lines.splice(+el.dataset.i,1); render(); },
  reviseQuote(el){ UI.confirm='rev'+el.dataset.id; delete UI.ed['q-'+el.dataset.id]; render(); },
  async locate(el){ const k=el.dataset.key; toast('Finding your location…'); const p=await getPosOnce();
    if(!p) return toast('Could not get your location. Allow location access, or tap the map instead.');
    UI.pick[k]={lat:p.lat,lng:p.lng}; const m=MAPS['pick-'+k]; if(m){ m.map.setView([p.lat,p.lng],17); updateMap('pick-'+k,m); } },

  schedule(el){ const j=job(el.dataset.id), date=val('sd-'+j.id), time=val('st-'+j.id), note=val('sm-'+j.id);
    if(!date||!time) return toast('Choose a date and time first.');
    run(async()=>{ await F.updateDoc(jobRef(j.id),{slot:{date,time}});
      await event(j,`${j.slot?'Appointment moved to':'Appointment confirmed for'} ${slotText({date,time})}${note?'. '+note:''}`,['customer','tech'], j.slot?'Appointment changed':'Appointment confirmed');
      if(note){ await F.addDoc(c('jobs',j.id,'messages'),msgObj(note)); const t=document.getElementById('sm-'+j.id); if(t) t.value=''; } }, 'Appointment sent to the customer'); },

  sendQuote(el){ const j=job(el.dataset.id), key='q-'+j.id, e=UI.ed[key];
    const lines=e.lines.filter(l=>String(l.desc).trim()).map(l=>({desc:String(l.desc).trim(),qty:+l.qty||0,rate:r2(l.rate)}));
    if(!lines.length) return toast('Add at least one line to the quotation.');
    run(async()=>{ const no=j.quote?.no || `Q-${today().slice(0,4)}-${pad(await nextNumber('quotes'))}`;
      const quote={no, lines, discount:r2(e.discount), notes:e.notes||'', gstRate:co().gstRate, sentAt:nowISO(), validUntil:addDays(today(),14), status:'sent', rev:(j.quote?.rev||0)+1};
      await F.updateDoc(jobRef(j.id),{quote}); await event(j,`Quotation ${no}${quote.rev>1?' (revised)':''} sent: ${money(totals(quote).total)}. Please review and approve.`,['customer'],'Your quotation is ready'); delete UI.ed[key]; UI.confirm=''; }, 'Quotation sent'); },

  quoteAccept(el){ const j=job(el.dataset.id), note=val('qr-'+j.id);
    run(async()=>{ await F.updateDoc(jobRef(j.id),{quote:{...j.quote,status:'accepted',respondedAt:nowISO()}}); await event(j,`Quotation ${j.quote.no} accepted${note?': '+note:''}`,['office'],'Quotation accepted'); if(note) await F.addDoc(c('jobs',j.id,'messages'),msgObj(note)); }, 'Quotation accepted'); },
  quoteDecline(el){ const j=job(el.dataset.id), note=val('qr-'+j.id);
    run(async()=>{ await F.updateDoc(jobRef(j.id),{quote:{...j.quote,status:'declined',reason:note,respondedAt:nowISO()}}); await event(j,`Quotation ${j.quote.no} declined${note?': '+note:''}`,['office'],'Quotation declined'); }, 'Quotation declined. The office has been told.'); },

  assign(el){ const j=job(el.dataset.id), tid=val('as-'+j.id), t=tech(tid); if(!t) return;
    if(tid===j.techId && accepted(j)) return toast(`${t.name} already has this job.`);
    run(async()=>{ const at=nowISO();
      await F.updateDoc(jobRef(j.id),{techId:tid, assignStatus:'pending', assignedAt:at, open:false, acceptedAt:F.deleteField(), declined:F.deleteField()});
      await log(j.id,`Sent to ${t.name}. Waiting for them to accept`);
      await notify({...j, techId:tid},['tech'],'New job for you: please accept',`${j.no} · ${jobTitle(j)} · ${j.island||''}${j.slot?' · '+slotText(j.slot):''}`); }, `Sent to ${t.name}. You'll be told when they accept.`); },
  offerAll(el){ const j=job(el.dataset.id);
    const active=S.techs.filter(t=>(S.users.find(u=>u.id===t.id)?.status||'active')==='active');
    if(!active.length) return toast('There are no active technicians to offer this job to.');
    run(async()=>{ await F.updateDoc(jobRef(j.id),{open:true, offerAt:nowISO(), techId:F.deleteField(), assignStatus:F.deleteField(), acceptedAt:F.deleteField(), declined:F.deleteField()});
      await log(j.id,'Offered to all technicians');
      await notifyTo({...j, open:true}, active.map(t=>t.id), 'Open job: first to take it gets it', `${j.no} · ${jobTitle(j)} · ${j.island||''}${j.slot?' · '+slotText(j.slot):' · '+fd(j.preferredDate)}`); },
      `Offered to ${active.length} technician${active.length>1?'s':''}`); },
  stopOffer(el){ const j=job(el.dataset.id); run(async()=>{ await F.updateDoc(jobRef(j.id),{open:false}); await log(j.id,'No longer offered to all technicians'); }, 'Job is no longer offered'); },
  acceptJob(el){ const j=job(el.dataset.id); el.disabled=true;
    run(async()=>{ await F.updateDoc(jobRef(j.id),{assignStatus:'accepted', acceptedAt:nowISO()});
      await log(j.id,`${myName()} accepted the job`);
      await notify(j,['office'],'Job accepted',`${j.no} · ${myName()} accepted the job`);
      await notify(j,['customer'],'Your technician is confirmed',`${j.no} · ${myName()} will do your service${j.slot?' on '+slotText(j.slot):''}.`); }, 'Job accepted. The office and the customer have been told.').finally(()=>el.disabled=false); },
  declineJob(el){ const j=job(el.dataset.id), reason=val('dr-'+j.id);
    // Tell the office first: after declining, the job is no longer visible to this technician.
    run(async()=>{ await event(j,`${myName()} declined the job${reason?': '+reason:''}`,['office'],'Job declined');
      await F.updateDoc(jobRef(j.id),{assignStatus:'declined', techId:F.deleteField(), declined:{uid:ME.user.uid, name:myName(), reason, at:nowISO()}});
      UI.sel=''; }, 'Job declined. The office has been told.'); },
  takeJob(el){ const id=el.dataset.id, uid=ME.user.uid; el.disabled=true;
    run(async()=>{ const at=nowISO();
      await F.runTransaction(db, async tx=>{ const s=await tx.get(jobRef(id)), x=s.exists()?s.data():null;
        if(!x || !x.open || x.techId) throw {message:'Another technician already took this job.'};
        tx.update(jobRef(id),{techId:uid, open:false, assignStatus:'accepted', acceptedAt:at, assignedAt:at}); });
      const j={...job(id), techId:uid, open:false};
      await log(id,`${myName()} took the job`);
      await notify(j,['office'],'Job taken',`${j.no} · ${myName()} took the job`);
      await notify(j,['customer'],'Your technician is confirmed',`${j.no} · ${myName()} will do your service${j.slot?' on '+slotText(j.slot):''}.`); }, 'The job is yours. The office and the customer have been told.').finally(()=>el.disabled=false); },

  async startTrip(el){ const j=job(el.dataset.id), eta=Math.max(1,Math.min(240,+val('eta-'+j.id)||25));
    el.disabled=true; toast('Getting your location…');
    const p=await getPosOnce();
    const data={departedAt:nowISO(), etaMins:eta}; if(p){ data.loc=p; data.trail=[{lat:p.lat,lng:p.lng}]; GPS.lastWrite=Date.now(); GPS.last=p; }
    await run(async()=>{ await F.updateDoc(jobRef(j.id),data); await event(j,`${myName()} is on the way. Expected in about ${eta} min`,['customer','office'],'Technician on the way'); }, p?'Trip started. Your location is shared.':'Trip started, but location is off. Allow location access so the customer can follow you.');
    el.disabled=false; },
  arrived(el){ const j=job(el.dataset.id); stopGPS();
    const pts=[...(j.trail||[]), ...(j.loc?[j.loc]:[])]; let km=0; for(let i=1;i<pts.length;i++) km+=haversineKm(pts[i-1],pts[i]);
    const trip={mins:Math.max(1,Math.round((Date.now()-new Date(j.departedAt))/60000)), km:Math.round(km*10)/10};
    run(async()=>{ await F.updateDoc(jobRef(j.id),{arrivedAt:nowISO(), trip, loc:F.deleteField(), trail:F.deleteField()}); CLEARED.add(j.id);
      await event(j,`${myName()} has arrived`,['customer','office'],'Technician has arrived'); }, 'Arrival recorded. Location sharing stopped.'); },
  finish(el){ const j=job(el.dataset.id), notes=val('wn-'+j.id), parts=val('wp-'+j.id);
    if(!notes) return toast('Describe the work done before finishing.');
    stopGPS();
    run(async()=>{ await F.updateDoc(jobRef(j.id),{finishedAt:nowISO(), workNotes:notes, parts, loc:F.deleteField(), trail:F.deleteField()});
      await event(j,`Work finished by ${myName()}: ${notes}`,['customer','office'],'Service finished'); }, 'Job marked finished'); },

  sendInvoice(el){ const j=job(el.dataset.id), key='i-'+j.id, e=UI.ed[key];
    const lines=e.lines.filter(l=>String(l.desc).trim()).map(l=>({desc:String(l.desc).trim(),qty:+l.qty||0,rate:r2(l.rate)}));
    const methods=Object.keys(METHODS).filter(k=>e.methods[k]);
    if(!lines.length) return toast('Add at least one line to the invoice.');
    if(!methods.length) return toast('Choose at least one payment method.');
    el.disabled=true;
    run(async()=>{
      await F.runTransaction(db, async tx=>{
        const cref=d('counters','invoices'), cs=await tx.get(cref), n=(cs.exists()?cs.data().n:0)+1;
        const inv={no:`INV-${today().slice(0,4)}-${pad(n)}`, lines, discount:r2(e.discount), notes:e.notes||'', gstRate:co().gstRate, issuedAt:nowISO(), dueDate:addDays(today(),+e.dueDays||0), methods};
        const t=totals(inv); Object.assign(inv,{subtotal:t.net, gst:t.gst, total:t.total});
        tx.set(cref,{n});
        tx.update(jobRef(j.id),{invoice:inv});
        tx.set(d('ledger','inv-'+j.id),{date:today(), at:nowISO(), ref:inv.no, memo:`Invoice to ${j.customerName||'customer'}`, jobId:j.id,
          lines:[{acct:'1100',dr:t.total},{acct:'4000',cr:t.net},{acct:'2100',cr:t.gst}].filter(l=>(l.dr||l.cr)>0)});
        UI._lastInv=inv;
      });
      await event(j,`Invoice ${UI._lastInv.no}: ${money(UI._lastInv.total)}, due ${fd(UI._lastInv.dueDate)}`,['customer'],'Your invoice is ready'); delete UI.ed[key];
    }, 'Invoice sent and posted to accounts').finally(()=>el.disabled=false); },

  pay(el){ const j=job(el.dataset.id), m=el.dataset.m, I=j.invoice, r=UI.rcpt[j.id], at=nowISO();
    const withReceipt = b => { if(!r) return {}; b.set(d('jobs',j.id,'files','receipt'),{...r, at, uid:ME.user.uid}); return {receipt:{name:r.name, type:r.type, at}}; };
    if(!METHODS[m].transfer) return run(async()=>{ const b=F.writeBatch(db); const extra=withReceipt(b);
      b.update(jobRef(j.id),{payment:{method:m,status:'pending',amount:I.total,requestedAt:at}, ...extra}); await b.commit(); delete UI.rcpt[j.id];
      await event(j,`Customer will pay ${money(I.total)} by ${METHODS[m].n.toLowerCase()} on site`,['office','tech'],'Payment to collect'); }, 'Noted. Pay the technician or the office.');
    const ref=val('pr-'+j.id); if(!ref && !r) return toast('Enter the bank reference or upload the receipt.');
    el.disabled=true;
    run(async()=>{ const b=F.writeBatch(db); const extra=withReceipt(b);
      b.update(jobRef(j.id),{payment:{method:m,ref,amount:I.total,status:'paid',verified:false,paidAt:at}, ...extra});
      b.set(d('ledger','pay-'+j.id), payEntry(j,m,ref||'receipt uploaded'));
      await b.commit(); delete UI.rcpt[j.id];
      await event(j,`${money(I.total)} paid by ${METHODS[m].n}${ref?' · Ref '+ref:''}${r?' · receipt attached':''}. Please verify.`,['office'],'Payment received'); }, 'Payment details sent. Thank you!').finally(()=>el.disabled=false); },
  confirmPay(el){ const j=job(el.dataset.id); settle(j, j.payment.method, j.payment.ref||'', 'Payment recorded'); },
  recordPay(el){ const j=job(el.dataset.id); settle(j, val('rp-m-'+j.id)||'cash', val('rp-r-'+j.id), 'Payment recorded'); },
  verifyPay(el){ const j=job(el.dataset.id); run(async()=>{ await F.updateDoc(jobRef(j.id),{'payment.verified':true}); await event(j,`Your payment of ${money(j.payment.amount)} is confirmed. Thank you!`,['customer'],'Payment confirmed'); }, 'Marked as received'); },
  reversePay(el){ const j=job(el.dataset.id), k='rev'+j.id; if(UI.confirm!==k){ UI.confirm=k; return render(); } UI.confirm='';
    run(async()=>{ const b=F.writeBatch(db); b.update(jobRef(j.id),{payment:F.deleteField()}); b.delete(d('ledger','pay-'+j.id)); await b.commit(); await event(j,`We couldn't find your transfer${j.payment.ref?' ('+j.payment.ref+')':''}. Please check it and pay again, or contact us.`,['customer'],'Payment not received'); }, 'Payment reversed'); },

  rate(el){ const j=job(el.dataset.id), n=+(document.querySelector(`input[name="rt-${j.id}"]:checked`)?.value||0), text=val('rf-'+j.id);
    if(!n) return toast('Choose 1 to 5 stars.');
    run(async()=>{ await F.updateDoc(jobRef(j.id),{rating:{stars:n,text,at:nowISO()}}); await event(j,`Rated ${n} of 5${text?': “'+text+'”':''}`,['office','tech'],'New customer rating'); }, 'Thanks for your feedback'); },
  sendMsg(el){ const j=job(el.dataset.id), text=val('msg-'+j.id); if(!text) return;
    run(async()=>{ await F.addDoc(c('jobs',j.id,'messages'),msgObj(text)); const t=document.getElementById('msg-'+j.id); if(t) t.value='';
      await notify(j,['office','customer','tech'],`Message from ${myName()}`,`${j.no} · ${text.slice(0,180)}`); }); },
  cancelJob(el){ const j=job(el.dataset.id), k='cancel'+j.id; if(UI.confirm!==k){ UI.confirm=k; return render(); } UI.confirm='';
    run(async()=>{ await F.updateDoc(jobRef(j.id),{cancelled:true}); await event(j,`Request cancelled by ${ME.role==='customer'?'the customer':'the office'}`,['office','customer','tech'],'Request cancelled'); }, 'Request cancelled'); },
};
function payEntry(j, method, ref){
  const amt=j.invoice.total;
  return {date:today(), at:nowISO(), ref:j.invoice.no, memo:`Payment by ${METHODS[method]?.n||method}${ref?' · '+ref:''}`, jobId:j.id, lines:[{acct:METHODS[method]?.acct||'1000',dr:amt},{acct:'1100',cr:amt}]};
}
function settle(j, method, ref, okText){
  run(async()=>{ const b=F.writeBatch(db);
    b.update(jobRef(j.id),{payment:{method,ref:ref||'',amount:j.invoice.total,status:'paid',verified:true,paidAt:nowISO()}});
    b.set(d('ledger','pay-'+j.id), payEntry(j,method,ref));
    await b.commit(); await event(j,`Payment of ${money(j.invoice.total)} received by ${METHODS[method]?.n||method}. Thank you!`,['customer'],'Payment confirmed'); }, okText);
}
const FORMS = {
  async signin(f,dd){ await run(()=>A.signInWithEmailAndPassword(auth, dd.email, dd.password)); },
  async signup(f,dd){
    const kind = PORTAL==='admin' ? 'owner' : 'customer';
    if(kind==='owner' && OWNER_EXISTS!==false) return toast('This portal already has an office account. Sign in instead.');
    UI.creating=true; render();
    const ok=await run(async()=>{ const cr=await A.createUserWithEmailAndPassword(auth, dd.email, dd.password); ME.user=cr.user; await A.updateProfile(cr.user,{displayName:dd.name}); await createProfile(dd, kind); }, kind==='owner'?'Welcome! Set up your company next.':'Account created');
    UI.creating=false; if(ok && kind==='owner'){ UI.ptab='settings'; saveUI(); } render(); },
  async completeProfile(f,dd){ const kind=f.dataset.kind; UI.creating=true; render();
    const ok=await run(()=>createProfile({...dd, email:ME.user.email}, kind)); UI.creating=false; if(ok && kind==='owner'){ UI.ptab='settings'; saveUI(); } render(); },
  async reset(f,dd){ await run(()=>A.sendPasswordResetEmail(auth, dd.email), 'Check your email for the reset link'); UI.authMode='signin'; render(); }
};
const CHANGE = {
  async receiptFile(el){ const f=el.files?.[0]; if(!f) return; toast('Preparing the receipt…');
    try{ UI.rcpt[el.dataset.id]=await readReceipt(f); render(); }catch(e){ toast(e.message||'Could not read that file.'); el.value=''; } },
  addSvcLine(el){ const s=sv(el.value); if(!s) return; UI.ed[el.dataset.key].lines.push({desc:s.name,qty:1,rate:s.price}); render(); },
  payMethod(el){ UI.payM[el.dataset.id]=el.value; render(); }
};
const pick = (o,k) => (P[o] && P[o][k]) || ({ACT,FORMS,CHANGE})[{actions:'ACT',forms:'FORMS',change:'CHANGE'}[o]][k];

document.addEventListener('click', e=>{ const el=e.target.closest('[data-act]'); if(!el) return; const fn=pick('actions',el.dataset.act); if(fn){ e.preventDefault(); fn(el); } });
document.addEventListener('submit', e=>{ const f=e.target, h=pick('forms',f.dataset.form); if(!h) return; e.preventDefault(); const fdata=new FormData(f), dd={}; for(const [k,v] of fdata.entries()) dd[k]=typeof v==='string'?v.trim():v; h(f,dd,fdata); });
document.addEventListener('change', e=>{ const el=e.target;
  const fn = el.dataset.change && pick('change',el.dataset.change); if(fn) return fn(el);
  if(el.dataset.ed && el.type==='checkbox') setPath(UI.ed[el.dataset.ed], el.dataset.f, el.checked); });
document.addEventListener('input', e=>{ const el=e.target;
  if(el.dataset.ed && el.type!=='checkbox'){ setPath(UI.ed[el.dataset.ed], el.dataset.f, el.value); updateTotals(el.dataset.ed); }
  if(el.dataset.input==='search'){ UI.q=el.value; render(); } });

const sendReset = email => A.sendPasswordResetEmail(auth, email);

/** Each portal entry file calls start({view, actions, forms, change}). */
function start(def){
  Object.assign(P, def);
  const qj=new URLSearchParams(location.search).get('job');
  if(qj){ UI.pendingJob=qj; try{ history.replaceState(null,'',location.pathname); }catch(e){} }
  if(CONFIGURED){ startAuth(); registerSW(); }
  navigator.serviceWorker?.addEventListener('message', e=>{ if(e.data?.type==='open'){ const id=new URL(e.data.url, location.href).searchParams.get('job'); if(id){ if(job(id)) openJobById(id); else UI.pendingJob=id; render(); } } });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && (UI.bell||UI.modal)){ UI.bell=false; UI.modal=null; render(); } });
  render();
}

export { A, ACCTS, ACT, AC_TYPES, BTUS, CHANGE, CLEARED, CONFIG_ERROR, CUR, F, FORMS, GPS, HERO, MAPS, ME, METHODS, OWNER_EXISTS, P, PCFG, PORTAL, PORTAL_NAME, PORTAL_ROLE, PORTAL_URL, PUSH_TOKEN, S, SETTINGS, ST, STALE_H, STEPS, SVC_ICONS, SW_REG, TZ, UI, WINDOWS, accepted, addDays, ago, alertItem, appMod, attachMaps, auth, authView, avgRating, balances, bellButton, bellPanel, brandName, busyTech, c, clone, co, completeProfileView, copyBtn, createLogin, createMap, createProfile, cust, d, db, docView, ensureGPS, errMsg, esc, etaHTML, event, fbApp, fd, fdt, fileToDataUrl, firebaseConfig, ft, gateView, getPosOnce, haversineKm, header, hint, icon, inboxId, initials, invoiceSec, itemUrl, job, jobDetail, jobItem, jobRef, jobTitle, lineEditor, loadUI, log, markSVG, messagesSec, modalView, money, msgObj, myActiveTrip, myCustomer, myName, nextNumber, notify, notifyTo, nowISO, openJobById, openJobDetail, overdue, pad, payEntry, payPanel, pickDefault, pill, portalLink, portalOfRecipient, profileExtraFields, pushPrompt, pushState, pushTried, quoteSec, r2, ratingSec, readReceipt, ready, receiptLine, receiptPicker, recipients, registerPush, registerSW, render, requestSec, rq, run, saveUI, schedRender, scheduleSec, sendPos, sendReset, setMarker, setPath, settle, setupView, sideBal, slotText, snapList, stage, staleTrip, stars, start, startAuth, startInbox, startSubs, stopGPS, stopSubs, subCol, sv, syncMsgSub, sys, t12, tech, techNext, techSec, toast, toastT, today, totHTML, totals, tracker, trackingSec, unread, unsubs, updateMap, updateTotals, val, view, workSec };
