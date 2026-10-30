/* Platform portal (/platform): the platform admin creates companies, pauses or reactivates them and copies
   their links. It never reads a company's customers, jobs, chats or accounts: the database rules don't allow it. */
let firebaseConfig = null, CONFIG_ERROR = '';
try { ({ firebaseConfig } = await import('./firebase-config.js')); } catch (e) { CONFIG_ERROR = String(e?.message || e); }
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CONFIGURED = !!firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).startsWith('YOUR_');
const RESERVED = ['tech','admin','platform','assets','css','js','functions','index','sw','api','www'];

let A, F, appMod, auth, db;
if (CONFIGURED) {
  const [app, authMod, fsMod] = await Promise.all([import(FB+'firebase-app.js'), import(FB+'firebase-auth.js'), import(FB+'firebase-firestore.js')]);
  appMod = app; A = authMod; F = fsMod;
  const fbApp = app.initializeApp(firebaseConfig, 'platform');
  auth = A.getAuth(fbApp); db = F.initializeFirestore(fbApp, {ignoreUndefinedProperties:true});
}

const S = { setup:undefined, user:null, isSuper:null, tenants:[], invites:{}, owners:{}, loaded:false };
const UI = { mode:'signin', confirm:'', q:'' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowISO = () => new Date().toISOString();
const fd = iso => iso ? new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';
const slugify = s => String(s||'').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,30);
const validSlug = s => /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s) && !RESERVED.includes(s);
const local = /^(localhost|127\.)/.test(location.hostname);
const linkFor = (code, p) => new URL(local ? `/${{customer:'index.html',technician:'tech.html',admin:'admin.html'}[p]}?c=${code}` : `/${code}${{customer:'',technician:'/tech',admin:'/admin'}[p]}`, location.href).href;
let toastT;
function toast(t){ const el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true, 3600); }
function errMsg(e){
  const c=String(e?.code||'').replace(/^(auth|firestore)\//,'');
  return ({'permission-denied':"You don't have permission to do that.",'invalid-credential':'Email or password is incorrect.','email-already-in-use':'An account already uses that email. Sign in instead.',
    'weak-password':'Use a password with at least 6 characters.','invalid-email':'That email address is not valid.','too-many-requests':'Too many attempts. Wait a few minutes and try again.'})[c] || e?.message || 'Something went wrong. Try again.';
}
async function run(fn, ok){ try{ await fn(); if(ok) toast(ok); return true; }catch(e){ console.error(e); toast(errMsg(e)); return false; } }
const mark = () => `<svg class="mark" viewBox="0 0 38 38" aria-hidden="true"><rect class="u" x="3" y="6" width="32" height="16" rx="5"/><line class="l" x1="9" y1="17" x2="29" y2="17"/><path class="w" d="M10 27c2 2 2 4 0 6M19 27c2 2 2 4 0 6M28 27c2 2 2 4 0 6"/></svg>`;

/* ---------- data ---------- */
let unsubs=[];
function watch(){
  F.onSnapshot(F.doc(db,'platform','setup'), s=>{ S.setup=s.exists(); S.setupErr=''; render(); }, e=>{ console.error('Platform check failed', e); S.setupErr=e?.code||'error'; S.setup=null; render(); });
  A.onAuthStateChanged(auth, async user=>{
    unsubs.forEach(u=>u()); unsubs=[]; S.user=user; S.isSuper=null; S.tenants=[]; S.loaded=false; render();
    if(!user) return;
    try{ const s=await F.getDoc(F.doc(db,'superAdmins',user.uid)); S.isSuper=s.exists(); }catch(e){ S.isSuper=false; }
    render();
    if(S.isSuper) watchTenants();
  });
}
function watchTenants(){
    if(unsubs.length) return;
    unsubs.push(F.onSnapshot(F.collection(db,'tenants'), async s=>{
      S.tenants=s.docs.map(x=>({...x.data(), id:x.id})).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      S.loaded=true; render();
      // Owner email (private) and whether the owner has finished setting up.
      await Promise.all(S.tenants.map(async t=>{
        if(!(t.id in S.invites)) S.invites[t.id]=(await F.getDoc(F.doc(db,'tenants',t.id,'config','invite')).catch(()=>null))?.data()?.ownerEmail||'';
        S.owners[t.id]=(await F.getDoc(F.doc(db,'tenants',t.id,'config','owner')).catch(()=>null))?.exists?.()||false;
      }));
      render();
    }, e=>{ S.loaded=true; toast(errMsg(e)); render(); }));
}

/* ---------- views ---------- */
function render(){
  const saved={}; document.querySelectorAll('#app input[id]').forEach(el=>saved[el.id]=el.value);
  $('#app').innerHTML=view();
  for(const id in saved){ const el=document.getElementById(id); if(el && el.type!=='password' && !el.dataset.np) el.value=saved[id]; }
}
function shell(inner){
  return `<header class="top"><div class="top-in"><div class="brand">${mark()}<div><b>AC Service Platform</b><small>Platform admin</small></div></div>
    <div class="me"><span class="small" style="opacity:.9">${esc(S.user?.email||'')}</span><button class="btn sm" data-act="signOut">Sign out</button></div></div></header><main class="wrap">${inner}</main>`;
}
function authCard(title, intro, form){
  return `<div class="auth"><section class="auth-hero"><div class="brand" style="margin:0">${mark()}<div><b>AC Service Platform</b><small>Platform admin</small></div></div>
    <h1>${title}</h1><p>${intro}</p></section><section class="auth-form">${form}</section></div>`;
}
function view(){
  if(!CONFIGURED) return `<div class="setup stack"><h1>Connect Firebase</h1><p>${CONFIG_ERROR?esc(CONFIG_ERROR):'Add your Firebase keys to js/firebase-config.js first. See README.md.'}</p></div>`;
  if(S.setup===undefined) return `<div class="loading">Opening the platform…</div>`;
  if(S.setupErr) return authCard(S.setupErr==='permission-denied'?'Publish the database rules':'Couldn\'t reach the database',
    S.setupErr==='permission-denied'?'Firebase blocked the platform page because the database rules are out of date.':'Check your internet connection and reload.',
    `<div class="auth-card stack"><h2>What to do</h2>${S.setupErr==='permission-denied'?`<ol class="small" style="padding-left:18px;margin:0">
      <li>Open Firebase console → <b>Firestore Database</b> → <b>Rules</b>.</li>
      <li>Delete everything there and paste the whole <b>firestore.rules</b> file from the project.</li>
      <li>Tap <b>Publish</b>, wait a minute, then reload this page.</li></ol>`:`<p class="small muted">Error: ${esc(S.setupErr)}</p>`}
      <button class="btn primary block" onclick="location.reload()">Reload</button></div>`);
  if(!S.user){
    if(!S.setup) return authCard('Set up your platform','Create the platform admin account. You use it to create companies and manage them. Only one person can do this, once.',
      `<form class="auth-card" data-form="setup"><h2>Create platform admin</h2>
        <label class="field"><span>Email</span><input id="su-email" name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input id="su-pass" name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <button class="btn primary block">Create platform admin</button>
        <p class="small muted">Already have an account in this Firebase project? Enter the same email and password.</p></form>`);
    return authCard('Platform admin','Create companies, pause or reactivate them, and get their links.',
      `<form class="auth-card" data-form="signin"><h2>Sign in</h2>
        <label class="field"><span>Email</span><input id="si-email" name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input id="si-pass" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary block">Sign in</button></form>`);
  }
  if(S.isSuper===null) return `<div class="loading">Checking your account…</div>`;
  if(!S.isSuper) return authCard('Not a platform admin',`${esc(S.user.email)} can't manage the platform.`,
    `<div class="auth-card"><p>Company staff, technicians and customers use their company's own address, for example <span class="mono">${esc(location.host)}/yourcompany</span>.</p><button class="btn block" data-act="signOut">Sign out</button></div>`);
  return shell(dashboard());
}
function dashboard(){
  const q=UI.q.trim().toLowerCase(), list=S.tenants.filter(t=>!q || (t.name+' '+t.id+' '+(S.invites[t.id]||'')).toLowerCase().includes(q));
  const active=S.tenants.filter(t=>t.status==='active').length;
  return `<div class="kpis">
      <div class="kpi c0"><span class="label">Companies</span><b>${S.tenants.length}</b></div>
      <div class="kpi c3"><span class="label">Active</span><b>${active}</b></div>
      <div class="kpi c1"><span class="label">Paused</span><b>${S.tenants.length-active}</b></div>
      <div class="kpi c2"><span class="label">Waiting for owner setup</span><b>${S.tenants.filter(t=>S.owners[t.id]===false).length}</b></div></div>
    <div class="cols" style="grid-template-columns:minmax(0,2fr) minmax(300px,1fr)">
      <div class="card"><div class="card-h"><h2>Companies</h2><input id="pq" type="search" data-np placeholder="Search" value="${esc(UI.q)}" data-input="pq" style="max-width:220px" aria-label="Search companies"></div>
        ${!S.loaded?'<div class="loading">Loading…</div>':list.length?`<div class="tenant-list">${list.map(tenantRow).join('')}</div>`
          :`<div class="empty"><h3>No companies yet</h3><p>Create the first one with the form on the right.</p></div>`}</div>
      <form class="card" data-form="create"><div class="card-h"><h3>Create a company</h3></div><div class="card-b stack">
        <label class="field"><span>Company name</span><input id="nc-name" name="name" required placeholder="e.g. Reefside Aircon Services" data-input="nameToCode"></label>
        <label class="field"><span>Company code</span><input id="nc-code" name="code" required placeholder="reefside" minlength="3" maxlength="30" data-input="code" autocapitalize="none">
          <span class="small muted" id="nc-hint">3 to 30 lowercase letters, numbers or hyphens. It becomes their address.</span></label>
        <label class="field"><span>Owner's email</span><input id="nc-email" name="email" type="email" required placeholder="owner@company.mv"></label>
        <p class="small muted">The owner opens the company's admin link, creates an account with this email, verifies it, and becomes the company's first office account. Only this email can claim the company.</p>
        <div><button class="btn primary">Create company</button></div></div></form></div>`;
}
function tenantRow(t){
  const k='pause'+t.id, owned=S.owners[t.id], email=S.invites[t.id];
  const link=p=>`<div class="tl-link"><span class="label">${{customer:'Customers',technician:'Technicians',admin:'Office'}[p]}</span><span class="mono">${esc(linkFor(t.id,p))}</span><button class="btn sm" data-act="copy" data-v="${esc(linkFor(t.id,p))}">Copy</button><a class="btn sm" href="${esc(linkFor(t.id,p))}" target="_blank" rel="noopener">Open ↗</a></div>`;
  return `<div class="tenant">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div style="min-width:0"><b class="t-name">${esc(t.name)}</b><div class="small muted"><span class="mono">${esc(t.id)}</span> · created ${fd(t.createdAt)}</div>
        <div class="small">${email?`Owner: ${esc(email)} · `:''}${owned===undefined?'':owned?'<span style="color:var(--teal-text);font-weight:700">Set up</span>':'<span style="color:var(--mango-text);font-weight:700">Waiting for the owner to set up</span>'}</div></div>
      <div class="row">${t.status==='active'?'<span class="pill teal">Active</span>':'<span class="pill bad">Paused</span>'}
        <button class="btn sm ${t.status==='active'?'danger':''} ${UI.confirm===k?'armed':''}" data-act="toggle" data-id="${t.id}">${t.status==='active'?(UI.confirm===k?'Tap again to pause':'Pause'):'Reactivate'}</button></div></div>
    ${link('customer')}${link('technician')}${link('admin')}
    ${owned===false?`<details class="small"><summary>Change owner email</summary><form class="row" data-form="invite" data-id="${t.id}" style="margin-top:8px"><input name="email" type="email" required value="${esc(email||'')}" style="max-width:280px"><button class="btn sm">Save</button></form></details>`:''}
  </div>`;
}

/* ---------- actions ---------- */
const ACT = {
  async signOut(){ await A.signOut(auth); },
  async copy(el){ try{ await navigator.clipboard.writeText(el.dataset.v); toast('Link copied'); }catch(e){ toast(el.dataset.v); } },
  toggle(el){ const t=S.tenants.find(x=>x.id===el.dataset.id), k='pause'+t.id;
    if(t.status==='active' && UI.confirm!==k){ UI.confirm=k; return render(); } UI.confirm='';
    const next=t.status==='active'?'paused':'active';
    run(()=>F.updateDoc(F.doc(db,'tenants',t.id),{status:next, updatedAt:nowISO()}), next==='paused'?`${t.name} is paused. Its portals are closed until you reactivate it.`:`${t.name} is active again.`); }
};
const FORMS = {
  async signin(f,d){ await run(()=>A.signInWithEmailAndPassword(auth,d.email,d.password)); },
  async setup(f,d){
    await run(async()=>{
      let user;
      try{ user=(await A.createUserWithEmailAndPassword(auth,d.email,d.password)).user; }
      catch(e){ if(String(e?.code).includes('email-already-in-use')) user=(await A.signInWithEmailAndPassword(auth,d.email,d.password)).user; else throw e; }
      const b=F.writeBatch(db);
      b.set(F.doc(db,'superAdmins',user.uid),{email:d.email.toLowerCase(), at:nowISO()});
      b.set(F.doc(db,'platform','setup'),{uid:user.uid, at:nowISO()});
      await b.commit(); S.isSuper=true; watchTenants();
    }, 'Platform set up. Create your first company.');
    render(); },
  async create(f,d){
    const code=d.code.toLowerCase(), email=d.email.toLowerCase();
    if(!validSlug(code)) return toast(RESERVED.includes(code)?`"${code}" is reserved. Choose another code.`:'Use 3 to 30 lowercase letters, numbers or hyphens for the code.');
    const btn=f.querySelector('button'); btn.disabled=true;
    await run(async()=>{
      if((await F.getDoc(F.doc(db,'tenants',code))).exists()) throw {message:`The code "${code}" is already used. Choose another.`};
      const b=F.writeBatch(db), at=nowISO();
      b.set(F.doc(db,'tenants',code),{name:d.name, status:'active', createdAt:at, createdBy:S.user.uid});
      b.set(F.doc(db,'tenants',code,'config','invite'),{ownerEmail:email, at});
      b.set(F.doc(db,'tenants',code,'company','profile'),{name:d.name, tagline:'Air-conditioning service', gstRate:8, terms:7, phone:'', email, address:'', reg:'', tin:'', bml:'', mib:'', methods:{cash:true,bml:true,mib:true,card:true}});
      await b.commit(); S.invites[code]=email; f.reset();
    }, `${d.name} created. Send the owner the office link.`);
    btn.disabled=false; },
  async invite(f,d){ const id=f.dataset.id, email=d.email.toLowerCase();
    await run(async()=>{ await F.setDoc(F.doc(db,'tenants',id,'config','invite'),{ownerEmail:email, at:nowISO()}); S.invites[id]=email; }, 'Owner email updated'); render(); }
};
document.addEventListener('click', e=>{ const el=e.target.closest('[data-act]'); if(el && ACT[el.dataset.act]){ e.preventDefault(); ACT[el.dataset.act](el); } });
document.addEventListener('submit', e=>{ const f=e.target, h=FORMS[f.dataset.form]; if(!h) return; e.preventDefault(); const d={}; for(const [k,v] of new FormData(f).entries()) d[k]=String(v).trim(); h(f,d); });
document.addEventListener('input', e=>{ const t=e.target;
  if(t.dataset.input==='pq'){ UI.q=t.value; const p=t.selectionStart; render(); const n=$('#pq'); n.focus(); n.setSelectionRange(p,p); }
  if(t.dataset.input==='nameToCode'){ const c=$('#nc-code'); if(c && !c.dataset.touched) c.value=slugify(t.value); }
  if(t.dataset.input==='code'){ t.dataset.touched='1'; t.value=t.value.toLowerCase().replace(/[^a-z0-9-]/g,''); } });

if(CONFIGURED) watch();
render();
