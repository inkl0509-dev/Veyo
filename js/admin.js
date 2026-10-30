/* Admin / service-provider portal: runs the service desk and controls the customer and technician portals. */
import * as K from './core.js';
const { S, ME, UI, F, db, ACCTS, METHODS, WINDOWS, CUR, PORTAL_URL, PORTAL_NAME, portalLink, portalHref, tenantRef, CO,
  esc, money, r2, fd, fdt, today, addDays, nowISO, initials, stars, avgRating, hint, stage, jobTitle, job, sv, co, PCFG,
  balances, sideBal, pill, jobItem, jobDetail, run, toast, render, saveUI, d, c, log, event, createLogin, pickDefault, val, chatThread, chatUnread, ago, loaded, BRAND_PRESETS, brandPalette, readLogo, defaultMarkSvg } = K;

function providerView(){
  const n=S.jobs.filter(j=>hint(j)).length;
  const unreadChats=S.techs.filter(t=>chatUnread(t.id)).length;
  const tabs=[['jobs','Service requests',n],['chat','Team chat',unreadChats],['customers','Customers'],['team','Team'],['portals','Portal controls'],['accounting','Accounting'],['settings','Company & services']];
  let h=`<nav class="tabs" role="tablist">${tabs.map(([k,l,cnt])=>`<button role="tab" aria-selected="${UI.ptab===k}" data-act="ptab" data-v="${k}">${l}${cnt?`<span class="count">${cnt}</span>`:''}</button>`).join('')}</nav>`;
  if(!S.services.length || !S.company?.address) h+=`<div class="notice"><b>Finish setting up.</b> Add your address, GST TIN, bank accounts, office location and the services you offer. Customers see them when booking and on every quotation and invoice. <button class="linkbtn" data-act="ptab" data-v="settings">Open company settings</button></div>`;
  // Each tab waits only for its own data.
  const NEEDS={customers:['customers','users'], team:['techs','users'], chat:['chats','techs'], accounting:['ledger'], settings:['services'], portals:[]};
  if(UI.ptab!=='jobs' && !loaded(...(NEEDS[UI.ptab]||[]))) return h+'<div class="loading">Loading…</div>';
  if(UI.ptab==='jobs') h+= UI.newJob ? newJobForm() : providerJobs();
  else if(UI.ptab==='chat') h+=chatTab();
  else if(UI.ptab==='customers') h+=customersView();
  else if(UI.ptab==='team') h+=teamView();
  else if(UI.ptab==='portals') h+=portalsView();
  else if(UI.ptab==='accounting') h+=accountingView();
  else h+=settingsView();
  return h;
}
function providerJobs(){
  const f=UI.filter, q=UI.q.trim().toLowerCase();
  let list=[...S.jobs].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  if(f==='action') list=list.filter(j=>hint(j));
  else if(f==='active') list=list.filter(j=>!['paid','cancelled'].includes(stage(j)));
  else if(f==='paid') list=list.filter(j=>stage(j)==='paid');
  if(q) list=list.filter(j=>[j.no,j.customerName,j.island,jobTitle(j)].join(' ').toLowerCase().includes(q));
  const sel=job(UI.sel);
  const filters=[['action','Needs you'],['active','Open'],['paid','Paid'],['all','All']];
  return `<div class="split ${sel?'has-sel':''}">
    <section class="pane list-pane"><div class="pane-head"><div class="row" style="justify-content:space-between"><h2>Service requests</h2><button class="btn sm coral" data-act="newJob" data-id="">+ New request</button></div>
      <div class="chips">${filters.map(([k,l])=>`<button class="chip" aria-pressed="${f===k}" data-act="filter" data-v="${k}">${l}</button>`).join('')}</div>
      <input id="jobsearch" type="search" placeholder="Search request no., customer or island" value="${esc(UI.q)}" data-input="search" aria-label="Search requests"></div>
      ${list.length?`<ul class="joblist">${list.map(j=>jobItem(j,j.id===UI.sel)).join('')}</ul>`:`<div class="empty"><h3>${f==='action'?'Nothing needs you right now':'No requests here'}</h3><p>Requests from the customer portal appear here. Take phone bookings with "New request".</p></div>`}
    </section>
    <section class="pane detail-pane">${sel?jobDetail(sel):`<div class="empty"><h3>Pick a request</h3><p>Choose a request to schedule it, quote, assign a technician, follow the trip and invoice.</p></div>`}</section></div>`;
}
/* Private chat with each technician. */
function chatTab(){
  const rows=S.techs.map(t=>({t, ch:S.chats.find(x=>x.id===t.id)})).sort((a,b)=>(b.ch?.lastAt||'').localeCompare(a.ch?.lastAt||'') || String(a.t.name).localeCompare(b.t.name));
  const sel=UI.chatTech && S.techs.find(t=>t.id===UI.chatTech);
  return `<div class="split ${sel?'has-sel':''}">
    <section class="pane list-pane"><div class="pane-head"><h2>Team chat</h2><p class="small muted">Private between the office and each technician. Customers never see it.</p></div>
      ${rows.length?`<ul class="joblist">${rows.map(({t,ch})=>{ const un=chatUnread(t.id), active=S.jobs.find(j=>j.techId===t.id&&j.departedAt&&!j.finishedAt&&!j.cancelled);
        return `<li><button data-act="openChat" data-id="${t.id}" aria-current="${t.id===UI.chatTech}">
          <span class="jl-top"><span class="row" style="gap:8px;flex-wrap:nowrap;min-width:0"><span class="avatar sm">${initials(t.name)}</span><b class="${un?'':'jl-name'}">${esc(t.name)}</b></span><small class="muted">${ch?.lastAt?ago(ch.lastAt):''}</small></span>
          <span class="jl-meta" style="${un?'color:var(--ink);font-weight:700':''}">${ch?.lastText?(ch.lastRole==='provider'?'Office: ':'')+esc(ch.lastText):'No messages yet'}</span>
          ${un?'<span class="jl-hint">New message</span>':active?`<span class="small" style="color:var(--teal-text);font-weight:700">${active.arrivedAt?'On site':'On the way'} · ${esc(active.no)}</span>`:''}</button></li>`; }).join('')}</ul>`
        :`<div class="empty"><p>Add technicians in the Team tab to chat with them.</p></div>`}</section>
    <section class="pane detail-pane">${sel?chatThread(sel.id):`<div class="empty"><h3>Pick a technician</h3><p>Send instructions, share job details, or answer their questions. Each message sends them an alert.</p></div>`}</section></div>`;
}
/* Phone or walk-in booking made by the office for a customer. */
function newJobForm(){
  const pre = UI.newJob.customerId || '';
  return `<form class="card" data-form="adminBook" style="max-width:860px"><div class="card-h"><h2>New request for a customer</h2><button type="button" class="btn sm" data-act="cancelNewJob">Back to requests</button></div><div class="card-b stack">
    ${S.customers.length?`<label class="field"><span>Customer</span><select id="ab-cust" name="customerId" required data-change="abCust"><option value="">Choose a customer…</option>${[...S.customers].sort((a,b)=>String(a.name).localeCompare(b.name)).map(cu=>`<option value="${cu.id}" ${cu.id===pre?'selected':''}>${esc(cu.name)} · ${esc(cu.phone||'')}</option>`).join('')}</select></label>`
      :`<p class="muted">Add the customer in the Customers tab first.</p>`}
    <div class="field"><span>Services</span><div class="opts">${S.services.map((s,i)=>`<label class="opt"><input type="checkbox" id="ab-s-${s.id}" name="svc" value="${s.id}"><span><b>${esc(s.name)}</b><span class="small muted">${money(s.price)} per unit</span></span></label>`).join('')}</div></div>
    <div class="grid3">
      <label class="field"><span>AC units</span><input id="ab-units" name="units" type="number" min="1" value="1"></label>
      <label class="field"><span>AC type</span><select id="ab-type" name="acType">${K.AC_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Capacity</span><select id="ab-btu" name="btu">${K.BTUS.map(t=>`<option ${t==='12,000 BTU'?'selected':''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Preferred date</span><input id="ab-date" name="date" type="date" value="${addDays(today(),1)}" required></label>
      <label class="field"><span>Preferred time</span><select id="ab-win" name="window">${Object.entries(WINDOWS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>What the customer reported</span><textarea id="ab-issue" name="issue"></textarea></label>
    <div class="row"><button class="btn coral">Create request</button><span class="small muted">Address and location come from the customer's record.</span></div></div></form>`;
}

/* ---------- customers ---------- */
function userOf(id){ return S.users.find(u=>u.id===id); }
function statusPill(u){ return !u? '<span class="pill mute">No login</span>' : (u.status||'active')==='active'? '<span class="pill teal">Active</span>' : '<span class="pill bad">Paused</span>'; }
function customersView(){
  const q=(UI.cq||'').toLowerCase();
  const rows=S.customers.filter(cu=>!q || [cu.name,cu.phone,cu.email,cu.island].join(' ').toLowerCase().includes(q)).map(cu=>{ const js=S.jobs.filter(j=>j.customerId===cu.id); const billed=js.filter(j=>j.invoice).reduce((a,j)=>a+j.invoice.total,0); const due=js.filter(j=>j.invoice&&j.payment?.status!=='paid').reduce((a,j)=>a+j.invoice.total,0); return {cu,u:userOf(cu.id),n:js.length,billed,due}; }).sort((a,b)=>b.due-a.due||String(a.cu.name).localeCompare(b.cu.name));
  return `<div class="cols" style="grid-template-columns:minmax(0,2fr) minmax(280px,1fr)">
    <div class="card"><div class="card-h"><h2>Customers</h2><input id="cust-q" type="search" placeholder="Search" value="${esc(UI.cq||'')}" data-input="cq" style="max-width:220px" aria-label="Search customers"></div>
    ${rows.length?`<div class="tscroll"><table class="t"><thead><tr><th>Name</th><th>Contact</th><th>Address</th><th>Portal login</th><th class="r">Requests</th><th class="r">Outstanding</th><th></th></tr></thead><tbody>
    ${rows.map(({cu,u,n,due})=>`<tr><td><b>${esc(cu.name)}</b></td><td>${esc(cu.phone)}<br><span class="small muted">${esc(cu.email||'')}</span></td><td>${esc(cu.address)}${cu.island?', '+esc(cu.island):''}</td><td>${statusPill(u)}</td><td class="r">${n}</td><td class="r" style="${due?'color:var(--coral-text);font-weight:800':''}">${money(due)}</td>
      <td><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="newJob" data-id="${cu.id}">Book</button>${u?`<button class="btn sm" data-act="toggleUser" data-id="${cu.id}">${(u.status||'active')==='active'?'Pause':'Activate'}</button>`:''}</div></td></tr>`).join('')}
    </tbody></table></div>`:`<div class="empty"><h3>No customers yet</h3><p>Customers appear here when they sign up on the customer portal, or when you add them.</p></div>`}</div>
    <form class="card" data-form="addCustomer"><div class="card-h"><h3>Add a customer</h3></div><div class="card-b stack">
      <label class="field"><span>Name</span><input id="nc-name" name="name" required></label>
      <label class="field"><span>Mobile</span><input id="nc-phone" name="phone" required></label>
      <label class="field"><span>Island / city</span><input id="nc-island" name="island"></label>
      <label class="field"><span>Address</span><input id="nc-address" name="address"></label>
      <label class="field"><span>Email (for a portal login)</span><input id="nc-email" name="email" type="email"></label>
      <label class="field"><span>Temporary password</span><input id="nc-pass" name="password" type="text" minlength="6" placeholder="Leave empty for no login"></label>
      <p class="small muted">With an email and password the customer can sign in to the customer portal and change their password with "Forgot password". Without them, you book on their behalf.</p>
      <div><button class="btn primary">Add customer</button></div></div></form></div>`;
}

/* ---------- team: technicians and office staff ---------- */
function teamView(){
  const staff=S.users.filter(u=>u.role==='provider');
  return `<div class="stack"><h2>Technicians</h2>
    <div class="people">${S.techs.map(t=>{ const u=userOf(t.id), ar=avgRating(t.id), act=S.jobs.find(j=>j.techId===t.id&&j.departedAt&&!j.finishedAt&&!j.cancelled), done=S.jobs.filter(j=>j.techId===t.id&&j.finishedAt).length, k='deltech'+t.id, active=(u?.status||'active')==='active';
      return `<div class="person"><div class="row"><span class="avatar">${initials(t.name)}</span><div style="min-width:0"><b>${esc(t.name)}</b><p class="small muted">${[t.phone,t.email].filter(Boolean).map(esc).join(' · ')}</p></div></div>
        <p class="small">${esc(t.skills||'')}</p>
        <div class="row small">${!active?'<span class="pill bad">Paused</span>':act?`<span class="pill live">${act.arrivedAt?'On site':'On the way'} · ${esc(act.no)}</span>`:'<span class="pill teal">Available</span>'}<span class="muted">${done} jobs done</span>${ar?stars(ar.avg)+` <span class="muted">${ar.avg.toFixed(1)} (${ar.n})</span>`:''}</div>
        <div class="row"><button class="btn sm" data-act="toggleUser" data-id="${t.id}">${active?'Pause login':'Activate login'}</button><button class="btn sm" data-act="resetPw" data-email="${esc(t.email||'')}">Send password reset</button>
        <button class="btn sm danger ${UI.confirm===k?'armed':''}" data-act="removeTech" data-id="${t.id}">${UI.confirm===k?'Tap again to remove':'Remove'}</button></div></div>`; }).join('')}
      <form class="person" data-form="addStaff" data-role="technician"><h3>Create a technician login</h3>
        <label class="field"><span>Name</span><input id="nt-name" name="name" required></label>
        <label class="field"><span>Mobile</span><input id="nt-phone" name="phone"></label>
        <label class="field"><span>Email</span><input id="nt-email" name="email" type="email" required></label>
        <label class="field"><span>Temporary password</span><input id="nt-pass" name="password" type="text" minlength="6" required></label>
        <label class="field"><span>Skills</span><input id="nt-skills" name="skills" placeholder="e.g. Split & cassette units, R32/R410A gas"></label>
        <p class="small muted">Give them the email, password and the technician portal link: <span class="mono">${esc(portalLink('technician'))}</span></p>
        <div><button class="btn primary">Create technician</button></div></form></div>
    <h2 style="margin-top:12px">Office staff</h2>
    <div class="people">${staff.map(u=>`<div class="person"><div class="row"><span class="avatar">${initials(u.name)}</span><div style="min-width:0"><b>${esc(u.name)}</b><p class="small muted">${esc(u.email)}</p></div></div>
        <div class="row">${statusPill(u)}${u.id===ME.user.uid?'<span class="small muted">You</span>':`<button class="btn sm" data-act="toggleUser" data-id="${u.id}">${(u.status||'active')==='active'?'Pause login':'Activate login'}</button>`}</div></div>`).join('')}
      <form class="person" data-form="addStaff" data-role="provider"><h3>Add office staff</h3>
        <p class="small muted">Staff get full access to this admin portal.</p>
        <label class="field"><span>Name</span><input id="ns-sname" name="name" required></label>
        <label class="field"><span>Email</span><input id="ns-semail" name="email" type="email" required></label>
        <label class="field"><span>Temporary password</span><input id="ns-spass" name="password" type="text" minlength="6" required></label>
        <div><button class="btn primary">Add staff member</button></div></form></div></div>`;
}

/* ---------- portal controls ---------- */
function portalsView(){
  const p=PCFG();
  const link=(k)=>`<div class="callout"><span class="label">${PORTAL_NAME[k]}</span><div class="row"><span class="mono" style="overflow-wrap:anywhere">${esc(portalLink(k))}</span></div><div class="row"><a class="btn sm" href="${portalHref(k)}" target="_blank" rel="noopener">Open ↗</a><button type="button" class="btn sm" data-act="copy" data-v="${esc(portalLink(k))}">Copy link</button></div></div>`;
  const tog=(name,label,help)=>`<label class="opt"><input type="checkbox" id="pc-${name}" name="${name}" ${p[name]?'checked':''}><span><b>${label}</b><span class="small muted">${help}</span></span></label>`;
  return `<form data-form="portal" class="stack">
    <div class="cols">${link('customer')}${link('technician')}</div>
    <div class="cols">
      <div class="card"><div class="card-h"><h3>Customer portal</h3></div><div class="card-b stack">
        ${tog('customerSignup','Customers can create accounts','Turn off to only allow customers you add yourself.')}
        ${tog('customerCancel','Customers can cancel requests','Only before the technician leaves for the job.')}
        ${tog('showTechPhone',"Show the technician's phone number",'Customers see it once a technician is assigned.')}
        <div class="field"><span>Booking time windows customers can pick</span><div class="row">${Object.entries(WINDOWS).map(([k,v])=>`<label class="row small" style="gap:6px"><input type="checkbox" id="pc-w-${k}" name="w-${k}" ${p.windows[k]?'checked':''}>${v}</label>`).join('')}</div></div>
        <label class="field" style="max-width:240px"><span>Earliest booking (days from today)</span><input id="pc-lead" name="leadDays" type="number" min="0" max="60" value="${esc(p.leadDays)}"></label>
        <label class="field"><span>Message shown to customers</span><textarea id="pc-cn" name="customerNotice" placeholder="e.g. Closed on Friday. Emergency line +960 330 1122.">${esc(p.customerNotice)}</textarea></label>
      </div></div>
      <div class="card"><div class="card-h"><h3>Technician portal</h3></div><div class="card-b stack">
        ${tog('techSeePrices','Technicians see quotation and invoice amounts','Turn off to hide prices in the technician portal.')}
        <label class="field"><span>Message shown to technicians</span><textarea id="pc-tn" name="techNotice" placeholder="e.g. Collect all cash payments before leaving the site.">${esc(p.techNotice)}</textarea></label>
        <p class="small muted">Create, pause or remove technician logins in the Team tab.</p>
      </div></div></div>
    <div><button class="btn primary">Save portal settings</button></div></form>`;
}
/* ---------- accounting ---------- */
function accountingView(){
  const t=today(), cm=t.slice(0,7), lmD=new Date(t+'T12:00:00Z'); lmD.setUTCDate(1); lmD.setUTCMonth(lmD.getUTCMonth()-1); const lm=lmD.toISOString().slice(0,7), yr=t.slice(0,4);
  const per=UI.period, inPer=dt=>per==='all'||(per==='month'?dt.startsWith(cm):per==='last'?dt.startsWith(lm):dt.startsWith(yr));
  const perLabel={month:'This month',last:'Last month',year:'This year',all:'All time'}[per];
  const all=balances(S.ledger), pb=balances(S.ledger.filter(e=>inPer(e.date||'')));
  const income=sideBal('4000',pb), expAccts=Object.keys(ACCTS).filter(a=>ACCTS[a].t==='expense'), exp=expAccts.reduce((a,k)=>a+sideBal(k,pb),0), net=r2(income-exp);
  const ar=sideBal('1100',all), cash=['1000','1010','1020','1030'].reduce((a,k)=>a+sideBal(k,all),0), gst=sideBal('2100',all);
  const invoices=S.jobs.filter(j=>j.invoice).sort((a,b)=>(b.invoice.issuedAt||'').localeCompare(a.invoice.issuedAt||''));
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2>Accounting</h2>
    <div class="chips">${[['month','This month'],['last','Last month'],['year','This year'],['all','All time']].map(([k,l])=>`<button class="chip" aria-pressed="${per===k}" data-act="period" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="kpis">
      <div class="kpi c0"><span class="label">Revenue · ${perLabel}</span><b>${money(income)}</b><span class="small">before GST</span></div>
      <div class="kpi c1"><span class="label">Expenses · ${perLabel}</span><b>${money(exp)}</b></div>
      <div class="kpi c3"><span class="label">Net profit · ${perLabel}</span><b style="${net<0?'color:var(--bad)':''}">${money(net)}</b></div>
      <div class="kpi c2"><span class="label">Customers owe you</span><b>${money(ar)}</b><span class="small">${invoices.filter(j=>j.payment?.status!=='paid').length} unpaid invoices</span></div>
      <div class="kpi c4"><span class="label">Cash & bank</span><b>${money(cash)}</b></div>
      <div class="kpi c0"><span class="label">GST owed to MIRA</span><b>${money(gst)}</b></div></div>
    <div class="cols">
      <div class="card"><div class="card-h"><h3>Revenue and expenses, last 6 months</h3><div class="legend"><span><i class="bg-inc"></i>Revenue</span><span><i class="bg-exp"></i>Expenses</span></div></div><div class="card-b">${chartSVG(t)}</div></div>
      <div class="card"><div class="card-h"><h3>Profit and loss · ${perLabel}</h3></div><div class="card-b">
        <div class="pl-row"><b>Service revenue</b><b>${money(income)}</b></div>
        ${expAccts.map(k=>`<div class="pl-row sub"><span>${ACCTS[k].n}</span><span>${money(sideBal(k,pb))}</span></div>`).join('')}
        <div class="pl-row"><b>Total expenses</b><b>${money(exp)}</b></div>
        <div class="pl-row big"><span>Net profit</span><span style="color:${net<0?'var(--bad)':'var(--teal-text)'}">${money(net)}</span></div></div></div></div>
    <div class="card" style="margin-bottom:18px"><div class="card-h"><h3>Invoices</h3><span class="small muted">Click a row to open the job</span></div>
      ${invoices.length?`<div class="tscroll"><table class="t"><thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Status</th><th class="r">Amount</th></tr></thead><tbody>
      ${invoices.map(j=>`<tr class="click" data-act="gotoJob" data-id="${j.id}"><td class="mono">${esc(j.invoice.no)}</td><td>${esc(j.customerName||'')}</td><td>${fd(j.invoice.issuedAt)}</td><td>${fd(j.invoice.dueDate)}</td><td>${pill(j)}</td><td class="r">${money(j.invoice.total)}</td></tr>`).join('')}
      </tbody></table></div>`:`<div class="empty"><p>Invoices you send appear here.</p></div>`}</div>
    <div class="cols">
      <div class="card"><div class="card-h"><h3>Account balances</h3><span class="small muted">Trial balance, all time</span></div><div class="tscroll">${trialBalance(all)}</div></div>
      <form class="card" data-form="expense"><div class="card-h"><h3>Record money in or out</h3></div><div class="card-b stack">
        <div class="grid2">
          <label class="field"><span>Date</span><input type="date" id="ex-date" name="date" value="${t}" required></label>
          <label class="field"><span>Amount (${CUR})</span><input type="number" id="ex-amt" name="amount" min="0.01" step="0.01" required></label>
          <label class="field"><span>What for</span><select id="ex-cat" name="acct">${expAccts.map(k=>`<option value="${k}">${ACCTS[k].n}</option>`).join('')}<option value="2100">GST paid to MIRA</option><option value="3000">Owner puts money in</option></select></label>
          <label class="field"><span>Account</span><select id="ex-from" name="from"><option value="1000">Cash on hand</option><option value="1010">BML bank account</option><option value="1020">MIB bank account</option></select></label></div>
        <label class="field"><span>Description</span><input id="ex-memo" name="memo" placeholder="e.g. 10 kg R32 refrigerant from supplier"></label>
        <div><button class="btn primary">Record</button></div></div></form></div>
    <div class="card"><div class="card-h"><h3>Journal</h3><span class="small muted">Posted automatically from invoices, payments and the form above</span></div>${journal()}</div>`;
}
function trialBalance(b){
  const rows=Object.keys(ACCTS).filter(k=>Math.abs(b[k]||0)>0.004); let dr=0,cr=0;
  if(!rows.length) return `<div class="empty"><p>No entries yet.</p></div>`;
  return `<table class="t"><thead><tr><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>${rows.map(k=>{ const v=b[k]; if(v>0) dr+=v; else cr-=v; return `<tr><td><span class="mono muted">${k}</span> ${ACCTS[k].n}</td><td class="r">${v>0?money(v):''}</td><td class="r">${v<0?money(-v):''}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td>Total ${Math.abs(dr-cr)<0.01?'<span class="pill teal">Balanced</span>':'<span class="pill bad">Out of balance</span>'}</td><td class="r">${money(dr)}</td><td class="r">${money(cr)}</td></tr></tfoot></table>`;
}
function journal(){
  const es=[...S.ledger].sort((a,b)=>((b.date||'')+(b.at||'')).localeCompare((a.date||'')+(a.at||''))).slice(0,80);
  if(!es.length) return `<div class="empty"><p>Nothing posted yet. Sending an invoice posts the first entry.</p></div>`;
  return `<div class="tscroll"><table class="t"><thead><tr><th>Date</th><th>Reference</th><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>
    ${es.map(e=>(e.lines||[]).map((l,i)=>`<tr>${i===0?`<td rowspan="${e.lines.length}">${fd(e.date)}</td><td rowspan="${e.lines.length}"><span class="mono">${esc(e.ref||'')}</span><br><span class="small muted">${esc(e.memo||'')}</span></td>`:''}<td style="${l.cr?'padding-left:26px':''}">${ACCTS[l.acct]?.n||esc(l.acct)}</td><td class="r">${l.dr?money(l.dr):''}</td><td class="r">${l.cr?money(l.cr):''}</td></tr>`).join('')).join('')}
  </tbody></table></div>`;
}
function chartSVG(t){
  const months=[], base=new Date(t.slice(0,7)+'-15T12:00:00Z');
  for(let i=5;i>=0;i--){ const x=new Date(base); x.setUTCMonth(base.getUTCMonth()-i); months.push(x.toISOString().slice(0,7)); }
  const data=months.map(m=>{ let inc=0,exp=0; for(const e of S.ledger) if((e.date||'').startsWith(m)) for(const l of e.lines||[]){ if(l.acct==='4000') inc+=(+l.cr||0)-(+l.dr||0); else if(ACCTS[l.acct]?.t==='expense') exp+=(+l.dr||0)-(+l.cr||0); } return {m,inc,exp}; });
  const mx=Math.max(1,...data.map(x=>Math.max(x.inc,x.exp)));
  const step=Math.pow(10,Math.floor(Math.log10(mx))), nice=[1,2,2.5,5,10].map(k=>k*step).find(v=>v*4>=mx)||step*10, top=nice*4;
  const W=640,H=230,L=64,R=10,T=12,B=30, cw=(W-L-R)/6, y=v=>T+(H-T-B)*(1-v/top);
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Monthly revenue and expenses">`;
  for(let i=0;i<=4;i++){ const v=nice*i; s+=`<line class="c-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="c-lab" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v>=1000?(v/1000)+'k':v}</text>`; }
  data.forEach((x,i)=>{ const cx=L+cw*i+cw/2, bw=Math.min(26,cw/3);
    s+=`<rect class="c-inc" x="${cx-bw-2}" y="${y(x.inc)}" width="${bw}" height="${Math.max(0,y(0)-y(x.inc))}" rx="4"><title>${x.m} revenue ${money(x.inc)}</title></rect>`;
    s+=`<rect class="c-exp" x="${cx+2}" y="${y(x.exp)}" width="${bw}" height="${Math.max(0,y(0)-y(x.exp))}" rx="4"><title>${x.m} expenses ${money(x.exp)}</title></rect>`;
    s+=`<text class="c-lab" x="${cx}" y="${H-10}" text-anchor="middle">${new Date(x.m+'-15T12:00:00Z').toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'})}</text>`; });
  return s+`<text class="c-lab" x="4" y="${T+4}">${CUR}</text></svg>`;
}

/* ---------- provider: settings ---------- */
/* ---------- brand ---------- */
const DEFAULT_BRAND={color:'#0077B6', color2:'#00A08E', logo:'', iconBg:'white'};
function brandDraft(){ return UI.bd || (UI.bd={...DEFAULT_BRAND, ...(S.brand||{})}); }
function previewVars(b){ const p=brandPalette(b).light; return `--pa:${p['--hero-a']};--pb:${p['--hero-b']};--pm:${p['--lagoon']};--pi:${p['--lagoon-ink']};--ps:${p['--lagoon-soft']}`; }
function brandCard(){
  const b=brandDraft(), base={...DEFAULT_BRAND, ...(S.brand||{})}, dirty=['color','color2','logo','iconBg'].some(k=>(b[k]||'')!==(base[k]||''));
  const mark = b.logo ? `<img src="${esc(b.logo)}" alt="">` : `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(defaultMarkSvg(brandPalette(b).light['--hero-a'],brandPalette(b).light['--hero-b']))}" alt="">`;
  const color=(k,label)=>`<label class="field"><span>${label}</span><span class="color-in"><input type="color" id="brand-${k}" data-np data-brand="${k}" value="${esc(b[k])}"><input class="mono" id="brand-${k}-hex" data-np data-brandhex="${k}" value="${esc(b[k])}" maxlength="7" aria-label="${label} hex code"></span></label>`;
  return `<div class="card brand-card" style="margin-bottom:18px"><div class="card-h"><h3>Brand: logo and colours</h3><span class="small muted">Your customers and technicians see these</span></div>
    <div class="card-b brand-grid">
      <div class="stack">
        <div class="field"><span>Logo</span><div class="row">${b.logo?`<img class="logo-prev" src="${esc(b.logo)}" alt="Your logo">`:'<span class="small muted">No logo yet. The standard AC icon is used.</span>'}
          <label class="btn sm upload-btn"><input type="file" id="brand-logo" data-np accept="image/*" data-change="brandLogo">${b.logo?'Change logo':'Upload logo'}</label>${b.logo?'<button type="button" class="btn sm danger" data-act="brandLogoRemove">Remove</button>':''}</div>
          <span class="small muted">A square logo works best: PNG with a transparent background, or SVG.</span></div>
        <div class="field"><span>Colour themes</span><div class="swatches">${BRAND_PRESETS.map(([n,a,c])=>`<button type="button" class="swatch" data-act="brandPreset" data-a="${a}" data-b="${c}" aria-pressed="${b.color.toLowerCase()===a.toLowerCase()&&b.color2.toLowerCase()===c.toLowerCase()}" title="${n}" style="background:linear-gradient(135deg,${a},${c})"><span class="sr">${n}</span></button>`).join('')}</div></div>
        <div class="grid2">${color('color','Main colour')}${color('color2','Second colour')}</div>
        ${b.logo?`<div class="field"><span>App icon background</span><div class="chips">${[['white','White'],['brand','Main colour']].map(([k,l])=>`<button type="button" class="chip" data-act="brandIconBg" data-v="${k}" aria-pressed="${(b.iconBg||'white')===k}">${l}</button>`).join('')}</div></div>`:''}
        <div class="row"><button class="btn primary" data-act="brandSave">Save brand</button><button class="btn" data-act="brandDefault">Reset to standard</button>${dirty?'<span class="small" style="color:var(--coral-text);font-weight:700">Not saved yet</span>':''}</div>
        <p class="small muted">Saving updates the customer, technician and admin portals straight away, together with quotations, invoices, the browser tab icon and the icon people get when they add a portal to their phone's home screen.</p>
      </div>
      <div class="brand-preview" id="brand-preview" style="${previewVars(b)}" aria-label="Preview">
        <div class="bp-top"><span class="bp-mark">${mark}</span><div><b>${esc(co().name)}</b><small>Customer portal</small></div></div>
        <div class="bp-body"><b>Good morning, Aishath</b><span class="small muted">What can we help you with today?</span>
          <div class="row"><span class="bp-btn">Book a service</span><span class="bp-chip">12,000 BTU</span></div>
          <span class="bp-link">View your invoice</span>
          <div class="bp-app"><span class="bp-icon" style="background:${b.logo&&b.iconBg!=='brand'?'#fff':'var(--pa)'}">${mark}</span><small>${esc((co().name||'').slice(0,14))}</small></div></div>
      </div>
    </div></div>`;
}

function settingsView(){
  const C=co();
  return brandCard()+`<div class="cols">
    <form class="card" data-form="company"><div class="card-h"><h3>Company information</h3><span class="small muted">Shown on quotations and invoices</span></div><div class="card-b stack">
      <div class="grid2">
        <label class="field"><span>Company name</span><input id="co-name" name="name" value="${esc(C.name)}" required></label>
        <label class="field"><span>Tagline</span><input id="co-tagline" name="tagline" value="${esc(C.tagline)}"></label>
        <label class="field"><span>Phone</span><input id="co-phone" name="phone" value="${esc(C.phone)}"></label>
        <label class="field"><span>Email</span><input id="co-email" name="email" type="email" value="${esc(C.email)}"></label>
        <label class="field"><span>Business registration no.</span><input id="co-reg" name="reg" value="${esc(C.reg)}"></label>
        <label class="field"><span>GST TIN</span><input id="co-tin" name="tin" value="${esc(C.tin)}"></label></div>
      <label class="field"><span>Address</span><input id="co-address" name="address" value="${esc(C.address)}"></label>
      <div class="grid2">
        <label class="field"><span>BML account no.</span><input id="co-bml" name="bml" value="${esc(C.bml)}"></label>
        <label class="field"><span>MIB account no.</span><input id="co-mib" name="mib" value="${esc(C.mib)}"></label>
        <label class="field"><span>GST rate (%)</span><input id="co-gst" name="gstRate" type="number" min="0" max="100" step="0.01" value="${esc(C.gstRate)}"></label>
        <label class="field"><span>Payment terms (days)</span><input id="co-terms" name="terms" type="number" min="0" value="${esc(C.terms)}"></label></div>
      <div class="field"><span>Payment methods you accept</span><div class="row">${Object.entries(METHODS).map(([k,m])=>`<label class="row small" style="gap:6px"><input type="checkbox" id="co-m-${k}" name="m-${k}" ${C.methods?.[k]?'checked':''}>${m.n}</label>`).join('')}</div></div>
      <div class="field"><span>Office location (start point on the live map)</span><div class="map small" data-map="pick-co"></div><div class="row"><span class="small muted" data-pickinfo="co"></span><button type="button" class="btn sm" data-act="locate" data-key="co">Use my current location</button></div></div>
      <div><button class="btn primary">Save company details</button></div></div></form>
    <div class="card"><div class="card-h"><h3>Services and prices</h3><span class="small muted">Customers pick from these when booking</span></div><div class="card-b stack">
      ${S.services.map(s=>{ const k='delsvc'+s.id; return `<form class="callout" data-form="svc" data-id="${s.id}">
        <div class="grid2"><label class="field"><span>Service</span><input id="sv-${s.id}-name" name="name" value="${esc(s.name)}" required></label>
        <label class="field"><span>Price (${CUR}, before GST)</span><input id="sv-${s.id}-price" name="price" type="number" min="0" step="0.01" value="${esc(s.price)}" required></label></div>
        <label class="field"><span>Description</span><input id="sv-${s.id}-desc" name="desc" value="${esc(s.desc||'')}"></label>
        <div class="row"><button class="btn sm">Save</button><button type="button" class="btn sm danger ${UI.confirm===k?'armed':''}" data-act="delSvc" data-id="${s.id}">${UI.confirm===k?'Tap again to delete':'Delete'}</button></div></form>`; }).join('')}
      <form class="callout mango" data-form="addSvc"><b>Add a service</b>
        <div class="grid2"><label class="field"><span>Service</span><input id="ns-name" name="name" placeholder="e.g. Gas top-up (R32)" required></label>
        <label class="field"><span>Price (${CUR}, before GST)</span><input id="ns-price" name="price" type="number" min="0" step="0.01" required></label></div>
        <label class="field"><span>Description</span><input id="ns-desc" name="desc"></label>
        <div><button class="btn primary sm">Add service</button></div></form></div></div></div>`;
}

/* ---------- admin actions ---------- */
const actions = {
  brandPreset(el){ const b=brandDraft(); b.color=el.dataset.a.toLowerCase(); b.color2=el.dataset.b.toLowerCase(); render(); },
  brandIconBg(el){ brandDraft().iconBg=el.dataset.v; render(); },
  brandLogoRemove(){ brandDraft().logo=''; render(); },
  brandDefault(){ UI.bd={...DEFAULT_BRAND}; render(); },
  brandSave(el){ const b=brandDraft(); el.disabled=true;
    run(async()=>{ await F.setDoc(d('company','brand'), {color:b.color, color2:b.color2, logo:b.logo||'', iconBg:b.iconBg||'white', updatedAt:nowISO()}); UI.bd=null; },
      'Brand saved. All portals now use it.').finally(()=>el.disabled=false); },
  ptab(el){ UI.ptab=el.dataset.v; UI.sel=''; UI.newJob=null; if(el.dataset.v!=='chat') UI.chatTech=''; saveUI(); render(); },
  filter(el){ UI.filter=el.dataset.v; saveUI(); render(); },
  period(el){ UI.period=el.dataset.v; saveUI(); render(); },
  gotoJob(el){ UI.ptab='jobs'; UI.filter='all'; UI.sel=el.dataset.id; UI.newJob=null; saveUI(); render(); scrollTo(0,0); },
  newJob(el){ UI.ptab='jobs'; UI.newJob={customerId:el.dataset.id||''}; render(); scrollTo(0,0); },
  cancelNewJob(){ UI.newJob=null; render(); },
  async copy(el){ try{ await navigator.clipboard.writeText(el.dataset.v); toast('Link copied'); }catch(e){ toast(el.dataset.v); } },
  toggleUser(el){ const u=userOf(el.dataset.id); if(!u) return; const next=(u.status||'active')==='active'?'paused':'active';
    run(()=>F.updateDoc(d('users',u.id),{status:next}), next==='active'?`${u.name} can sign in again`:`${u.name} is paused and can't use the portal`); },
  resetPw(el){ if(!el.dataset.email) return toast('No email on file.'); run(()=>K.sendReset(el.dataset.email), 'Password reset email sent'); },
  delSvc(el){ const id=el.dataset.id, k='delsvc'+id; if(UI.confirm!==k){ UI.confirm=k; return render(); } UI.confirm=''; run(()=>F.deleteDoc(d('services',id)), 'Service deleted'); },
  removeTech(el){ const id=el.dataset.id, k='deltech'+id; if(UI.confirm!==k){ UI.confirm=k; return render(); } UI.confirm='';
    run(async()=>{ const b=F.writeBatch(db); b.delete(d('techs',id)); if(userOf(id)) b.update(d('users',id),{status:'paused'}); await b.commit(); }, 'Technician removed and their login paused'); }
};

const forms = {
  company(f,dd){ const methods={}; Object.keys(METHODS).forEach(k=>methods[k]=!!dd['m-'+k]);
    const p=UI.pick.co || pickDefault('co');
    const data={name:dd.name,tagline:dd.tagline||'',phone:dd.phone||'',email:dd.email||'',reg:dd.reg||'',tin:dd.tin||'',address:dd.address||'',bml:dd.bml||'',mib:dd.mib||'',gstRate:+dd.gstRate||0,terms:+dd.terms||0,methods};
    if(p){ data.lat=p.lat; data.lng=p.lng; }
    run(async()=>{ await F.setDoc(d('company','profile'),data,{merge:true});
      // Keep the name on the platform's company list in step.
      await F.updateDoc(tenantRef(),{name:data.name, updatedAt:nowISO()}).catch(e=>console.warn('company name',e)); }, 'Company details saved'); },
  svc(f,dd){ run(()=>F.updateDoc(d('services',f.dataset.id),{name:dd.name, price:r2(dd.price), desc:dd.desc||''}), 'Service saved'); },
  addSvc(f,dd){ run(async()=>{ await F.addDoc(c('services'),{name:dd.name,price:r2(dd.price),desc:dd.desc||''}); f.reset(); }, 'Service added'); },
  portal(f,dd){ const windows={}; Object.keys(WINDOWS).forEach(k=>windows[k]=!!dd['w-'+k]);
    if(!Object.values(windows).some(Boolean)) return toast('Keep at least one booking time window.');
    const data={customerSignup:!!dd.customerSignup, customerCancel:!!dd.customerCancel, showTechPhone:!!dd.showTechPhone, techSeePrices:!!dd.techSeePrices,
      leadDays:Math.max(0,+dd.leadDays||0), customerNotice:dd.customerNotice||'', techNotice:dd.techNotice||'', windows, updatedAt:nowISO()};
    run(()=>F.setDoc(d('config','portal'),data), 'Portal settings saved. Both portals update straight away.'); },
  addStaff(f,dd){ const role=f.dataset.role, email=dd.email.toLowerCase();
    const btn=f.querySelector('button'); btn.disabled=true;
    run(async()=>{ const uid=await createLogin(email, dd.password);
      const b=F.writeBatch(db);
      b.set(d('users',uid),{name:dd.name, email, phone:dd.phone||'', role, status:'active', createdAt:nowISO(), createdBy:ME.user.uid});
      if(role==='technician') b.set(d('techs',uid),{name:dd.name, phone:dd.phone||'', email, skills:dd.skills||'', addedAt:nowISO()});
      await b.commit(); f.reset(); }, role==='technician'?'Technician login created':'Staff login created').finally(()=>btn.disabled=false); },
  addCustomer(f,dd){ const email=(dd.email||'').toLowerCase();
    if(email && !dd.password) return toast('Add a temporary password, or clear the email for a customer without a login.');
    const btn=f.querySelector('button'); btn.disabled=true;
    run(async()=>{ let id;
      if(email){ id=await createLogin(email, dd.password); await F.setDoc(d('users',id),{name:dd.name, email, phone:dd.phone, role:'customer', status:'active', createdAt:nowISO(), createdBy:ME.user.uid}); }
      else id=F.doc(c('customers')).id;
      await F.setDoc(d('customers',id),{name:dd.name, phone:dd.phone, email, island:dd.island||'', address:dd.address||'', hasLogin:!!email, createdAt:nowISO()});
      f.reset(); }, 'Customer added').finally(()=>btn.disabled=false); },
  adminBook(f,dd,fdata){ const cu=S.customers.find(x=>x.id===dd.customerId), svcs=fdata.getAll('svc');
    if(!cu) return toast('Choose a customer.'); if(!svcs.length) return toast('Choose at least one service.');
    run(async()=>{ const ref=F.doc(c('jobs'));
      const created=await F.runTransaction(db, async tx=>{ const cref=d('counters','jobs'), cs=await tx.get(cref), n=(cs.exists()?cs.data().n:0)+1; tx.set(cref,{n});
        const data={no:'SR-'+(1000+n), customerId:cu.id, customerName:cu.name, customerPhone:cu.phone||'', serviceIds:svcs, units:+dd.units||1, acType:dd.acType, btu:dd.btu, preferredDate:dd.date, window:dd.window, island:cu.island||'', address:cu.address||'', issue:dd.issue||'', createdAt:nowISO(), bookedBy:'office'};
        if(cu.lat!=null) data.dest={lat:cu.lat,lng:cu.lng};
        tx.set(ref,data); return data; });
      await event({...created, id:ref.id},'Request booked by the office for you',['customer'],'Service request booked');
      UI.newJob=null; UI.filter='all'; UI.sel=ref.id; saveUI(); }, 'Request created'); },
  expense(f,dd){ const amt=r2(dd.amount); if(amt<=0) return;
    const into = dd.acct==='3000';
    const name = into? 'Owner puts money in' : dd.acct==='2100'? 'GST paid to MIRA' : ACCTS[dd.acct].n;
    const lines = into? [{acct:dd.from,dr:amt},{acct:'3000',cr:amt}] : [{acct:dd.acct,dr:amt},{acct:dd.from,cr:amt}];
    run(async()=>{ await F.addDoc(c('ledger'),{date:dd.date, at:nowISO(), ref:(into?'IN-':'PAY-')+dd.date.replace(/-/g,'').slice(2), memo:dd.memo||name, lines}); f.reset(); }, 'Recorded'); }
};
const change = {
  abCust(){},
  async brandLogo(el){ const f=el.files?.[0]; if(!f) return;
    try{ brandDraft().logo=await readLogo(f); render(); }catch(e){ toast(e.message); el.value=''; } }
};
// Colour pickers update the preview live; the page re-renders when the picker closes.
function setBrandColor(k, v){
  if(!/^#[0-9a-f]{6}$/i.test(v)) return false;
  const b=brandDraft(); b[k]=v.toLowerCase();
  const pv=document.getElementById('brand-preview'); if(pv) pv.setAttribute('style', previewVars(b));
  const other=document.getElementById(`brand-${k}-hex`); if(other && other!==document.activeElement) other.value=b[k];
  const pick=document.getElementById(`brand-${k}`); if(pick && pick!==document.activeElement) pick.value=b[k];
  // Update the theme buttons and the preview icons in place (no redraw, so a click on Save isn't lost).
  document.querySelectorAll('.swatch').forEach(sw=>sw.setAttribute('aria-pressed', String(sw.dataset.a.toLowerCase()===b.color && sw.dataset.b.toLowerCase()===b.color2)));
  return true;
}
document.addEventListener('input', e=>{ const t=e.target;
  if(t.dataset.brand) setBrandColor(t.dataset.brand, t.value);
  if(t.dataset.brandhex){ let v=t.value.trim(); if(v && v[0]!=='#') v='#'+v; setBrandColor(t.dataset.brandhex, v); } });

document.addEventListener('input', e=>{ if(e.target.dataset.input==='cq'){ UI.cq=e.target.value; render(); } });

K.start({view:providerView, actions, forms, change});
