/* Customer portal: home screen with what needs attention, step-by-step booking with a price estimate,
   simple job pages with one clear next step, payments with receipts, and alerts for every update. */
import * as K from './core.js';
const { S, ME, UI, F, db, WINDOWS, AC_TYPES, BTUS, SVC_ICONS, METHODS, TZ, esc, money, today, addDays, nowISO, fd, ft, slotText,
  job, sv, tech, co, PCFG, stage, pill, jobTitle, myCustomer, pickDefault, run, toast, render, saveUI, d, c, event, initials,
  trackingSec, quoteSec, invoiceSec, ratingSec, workSec, messagesSec, avgRating, stars, etaHTML, totals, overdue, staleTrip,
  pushState, pushPrompt, accepted } = K;

const ICON = {
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  plus:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  quote:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
  pay:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
  star:'<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'
};
const svg = (p, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const TABS = [['home','Home',ICON.home],['book','Book',ICON.plus],['jobs','My services',ICON.list],['profile','Profile',ICON.user]];
const ISSUES = ['Not cooling','Water leaking','Strange noise','Bad smell','Not turning on','Ice on the unit','Remote not working','Regular service'];
const BK_STEPS = ['Service','Your AC','Date & time','Address','Review'];

const firstName = () => String(myCustomer()?.name || ME.profile?.name || '').split(' ')[0];
function greeting(){ const h=+new Date().toLocaleString('en-US',{hour:'numeric',hourCycle:'h23',timeZone:TZ}); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }
const sortJobs = list => [...list].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
const isActive = j => !j.cancelled && j.payment?.status!=='paid' && !(j.finishedAt && !j.invoice && j.rating);
const tab = () => ({requests:'jobs'})[UI.ctab] || UI.ctab || 'home';

/* ---------- shell ---------- */
function customerView(){
  const me=myCustomer();
  if(!me) return `<div class="cwrap">${profileCard(null)}</div>`;
  if(UI.sel && job(UI.sel)) return `<div class="cwrap">${customerJob(job(UI.sel))}</div>${bottomNav()}`;
  const t=tab();
  const body = t==='book' ? bookWizard(me) : t==='jobs' ? jobsList() : t==='profile' ? profileCard(me) : home(me);
  return `<nav class="ctabs" role="tablist">${TABS.map(([k,l])=>`<button role="tab" aria-selected="${t===k}" data-act="ctab" data-v="${k}">${l}</button>`).join('')}</nav>
    <div class="cwrap">${body}</div>${bottomNav()}`;
}
function bottomNav(){
  const t=UI.sel? 'jobs' : tab(), n=S.jobs.filter(j=>actionFor(j)).length;
  return `<nav class="bnav" aria-label="Customer menu">${TABS.map(([k,l,ic])=>`<button data-act="ctab" data-v="${k}" aria-current="${t===k}">${svg(ic)}<span>${l}</span>${k==='jobs'&&n?`<i>${n}</i>`:''}</button>`).join('')}</nav>`;
}

/* ---------- home ---------- */
function home(me){
  const jobs=sortJobs(S.jobs);
  const live=jobs.find(j=>j.departedAt && !j.arrivedAt && !j.cancelled && !staleTrip(j));
  const todo=jobs.filter(j=>actionFor(j));
  const upcoming=jobs.filter(j=>isActive(j) && j!==live && !actionFor(j)).slice(0,3);
  const recent=jobs.filter(j=>!isActive(j)).slice(0,3);
  return `
  <section class="hello"><div><p class="muted">${greeting()},</p><h1>${esc(firstName())}</h1><p>What can we help you with today?</p></div>
    <button class="btn coral lg" data-act="startBook">Book a service</button></section>
  ${pushBanner()}
  ${live?liveCard(live):''}
  ${todo.length?`<section class="csec"><h2>Needs your attention</h2><div class="todo">${todo.map(todoItem).join('')}</div></section>`:''}
  ${upcoming.length?`<section class="csec"><h2>In progress</h2><div class="cards">${upcoming.map(jobCard).join('')}</div></section>`:''}
  ${S.services.length?`<section class="csec"><h2>Our services</h2><div class="svc-grid">${S.services.slice(0,6).map(svcTile).join('')}</div></section>`:''}
  ${!jobs.length?howItWorks():''}
  ${recent.length?`<section class="csec"><div class="row" style="justify-content:space-between"><h2>Recent</h2><button class="linkbtn" data-act="ctab" data-v="jobs">See all</button></div><div class="cards">${recent.map(jobCard).join('')}</div></section>`:''}
  ${contactCard()}`;
}
function pushBanner(){
  if(pushState()!=='default' || UI.pushLater) return '';
  return `<div class="push-banner"><div><b>Get an alert for every update</b><span>Know when your quotation is ready and when the technician is on the way.</span></div>
    <div class="row"><button class="btn sm primary" data-act="enablePush">Turn on alerts</button><button class="btn sm" data-act="pushLater">Not now</button></div></div>`;
}
function liveCard(j){
  const t=tech(j.techId);
  return `<section class="live-card"><div class="row" style="justify-content:space-between"><h2>${esc(t?.name?.split(' ')[0]||'Your technician')} is on the way</h2><span class="pill live">Live</span></div>
    <div class="eta" data-eta="${j.id}">${etaHTML(j)}</div>
    <div class="map small" data-map="track-${j.id}" role="img" aria-label="Technician's location"></div>
    <button class="btn primary" data-act="openJob" data-id="${j.id}">Open ${esc(j.no)}</button></section>`;
}
/* The one thing the customer needs to do on a job, if any. */
function actionFor(j){
  if(j.cancelled) return null;
  if(j.quote?.status==='sent') return {tone:'orchid', ic:ICON.quote, t:'Approve your quotation', s:`${j.no} · ${money(totals(j.quote).total)}`, cta:'Review'};
  if(j.invoice && !j.payment) return {tone:overdue(j)?'bad':'coral', ic:ICON.pay, t:overdue(j)?'Your invoice is overdue':'Pay your invoice', s:`${j.no} · ${money(j.invoice.total)} · due ${fd(j.invoice.dueDate)}`, cta:'Pay now'};
  if(j.finishedAt && !j.rating) return {tone:'mango', ic:ICON.star, t:'Rate your visit', s:`How did ${esc(tech(j.techId)?.name?.split(' ')[0]||'we')} do on ${j.no}?`, cta:'Rate'};
  return null;
}
function todoItem(j){ const a=actionFor(j);
  return `<button class="todo-item t-${a.tone}" data-act="openJob" data-id="${j.id}"><span class="ti-ic">${svg(a.ic)}</span><span class="ti-txt"><b>${a.t}</b><small>${a.s}</small></span><span class="ti-go">${a.cta} →</span></button>`; }
function jobCard(j){
  const dt=j.slot?.date||j.preferredDate||(j.createdAt||'').slice(0,10), x=new Date(dt+'T12:00:00Z'), t=accepted(j)?tech(j.techId):null;
  return `<button class="jcard" data-act="openJob" data-id="${j.id}">
    <span class="jdate"><b>${x.getUTCDate()||''}</b><small>${x.toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'})}</small></span>
    <span class="jc-main"><b>${esc(jobTitle(j))}</b><small>${esc(j.no)}${j.slot?' · '+t12s(j.slot.time):j.window?' · '+esc(WINDOWS[j.window].split(',')[0]):''}${t?' · '+esc(t.name):''}</small></span>${pill(j)}</button>`;
}
const t12s = hm => K.t12(hm);
function svcTile(s,i){ return `<button class="svc-tile" data-act="startBook" data-svc="${s.id}"><span class="sicon c${i%5}"><svg viewBox="0 0 24 24">${SVC_ICONS[i%5]}</svg></span><b>${esc(s.name)}</b><small>from ${money(s.price)}</small></button>`; }
function howItWorks(){
  return `<section class="csec"><h2>How it works</h2><ol class="how">
    <li><b>Book</b><span>Pick a service and a time that suits you. It takes a minute.</span></li>
    <li><b>Approve</b><span>We confirm the visit and send a quotation for you to approve.</span></li>
    <li><b>Track</b><span>Follow your technician on the map as they come to you.</span></li>
    <li><b>Pay and rate</b><span>Pay by bank transfer, cash or card, and tell us how we did.</span></li></ol></section>`;
}
function contactCard(){
  const C=co();
  return `<section class="contact"><div><b>${esc(C.name)}</b><span class="small muted">${esc(C.address||'')}</span></div>
    <div class="row">${C.phone?`<a class="btn sm" href="tel:${esc(C.phone.replace(/\s/g,''))}">${svg(ICON.phone,'ic')} ${esc(C.phone)}</a>`:''}${C.email?`<span class="small mono">${esc(C.email)}</span>`:''}</div></section>`;
}

/* ---------- my services ---------- */
function jobsList(){
  const f=UI.jf||'active', all=sortJobs(S.jobs), list=all.filter(j=>f==='active'?isActive(j):!isActive(j));
  return `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h1 class="ctitle">My services</h1>
    <div class="seg" role="tablist">${[['active','Active'],['past','Past']].map(([k,l])=>`<button role="tab" aria-selected="${f===k}" data-act="jf" data-v="${k}">${l} <span class="muted">${all.filter(j=>k==='active'?isActive(j):!isActive(j)).length}</span></button>`).join('')}</div></div>
    ${list.length?`<div class="cards">${list.map(j=>actionFor(j)?todoItem(j):jobCard(j)).join('')}</div>`
      :`<div class="empty card"><h3>${f==='active'?'Nothing in progress':'No past services yet'}</h3><p>${f==='active'?'Book a service and you can follow every step here.':'Finished and paid services appear here.'}</p>${f==='active'?'<button class="btn coral" data-act="startBook">Book a service</button>':''}</div>`}`;
}

/* ---------- job page ---------- */
function statusInfo(j){
  const s=stage(j), t=tech(j.techId), tn=esc(t?.name?.split(' ')[0]||'Your technician'), I=j.invoice;
  switch(s){
    case 'requested': return {tone:'lagoon', title:'Request received', sub:`We'll confirm your appointment soon. You asked for ${fd(j.preferredDate)}${j.window?', '+WINDOWS[j.window].split(',')[0].toLowerCase():''}.`};
    case 'scheduled': return {tone:'lagoon', title:'Appointment confirmed', sub:`${slotText(j.slot)}. We'll tell you who is coming.`};
    case 'quoted': return {tone:'orchid', title:'Your quotation is ready', sub:`${money(totals(j.quote).total)} including GST. Review it below and approve.`};
    case 'declined': return {tone:'coral', title:'You declined the quotation', sub:'The office will get in touch to talk it through.'};
    case 'approved': return {tone:'lagoon', title:'Quotation approved', sub:j.slot?`See you ${slotText(j.slot)}.`:"We'll confirm the visit time soon."};
    case 'offered': case 'awaiting': return {tone:'lagoon', title:'Finding your technician', sub:`${j.slot?'Your visit is '+slotText(j.slot)+'. ':''}We'll tell you as soon as a technician confirms.`};
    case 'assigned': return {tone:'lagoon', title:`${tn} will visit you`, sub:j.slot?slotText(j.slot)+'.':'Visit time to be confirmed.'};
    case 'enroute': return staleTrip(j)? {tone:'lagoon', title:`${tn} is on the way`, sub:'Live location is no longer available for this trip.'} : {tone:'teal', title:`${tn} is on the way`, sub:'Follow them on the map below.'};
    case 'onsite': return {tone:'teal', title:`${tn} is working on your AC`, sub:`Arrived at ${ft(j.arrivedAt)}.`};
    case 'completed': return {tone:'mango', title:'Work finished', sub:`Your invoice will arrive shortly.${j.rating?'':' Tell us how it went below.'}`};
    case 'invoiced': return j.payment?.status==='pending'
      ? {tone:'mango', title:`Pay ${money(I.total)} on site`, sub:`By ${METHODS[j.payment.method].n.toLowerCase()}. The office confirms it once the money is received.`}
      : {tone:overdue(j)?'coral':'mango', title:overdue(j)?'Your invoice is overdue':'Your invoice is ready', sub:`${money(I.total)}, due ${fd(I.dueDate)}. Pay below.`};
    case 'paid': return {tone:'teal', title:'All done. Thank you!', sub:j.payment.verified===false?"We've received your payment details and are checking the transfer.":`Paid ${money(j.payment.amount)} on ${fd(j.payment.paidAt)}.`};
    default: return {tone:'mute', title:'Request cancelled', sub:'You can book again any time.'};
  }
}
function miniSteps(j){
  const steps=[['Booked',true],['Confirmed',!!(j.slot||j.quote?.status==='accepted')],['On the way',!!j.departedAt],['Finished',!!j.finishedAt],['Paid',j.payment?.status==='paid']];
  const cur=steps.findIndex(x=>!x[1]);
  return `<ol class="msteps">${steps.map(([l,ok],i)=>`<li class="${ok?'done':i===cur?'cur':''}"><i></i><span>${l}</span></li>`).join('')}</ol>`;
}
function customerJob(j){
  const st=statusInfo(j), s=stage(j);
  let h=`<div class="cjob"><button class="btn sm" data-act="closeJob">← Back</button>
    <section class="status-hero tone-${st.tone}"><span class="mono small">${esc(j.no)} · ${esc(jobTitle(j))}</span><h1>${st.title}</h1><p>${st.sub}</p></section>
    ${s!=='cancelled'?miniSteps(j):''}<div class="pane cpane">`;
  if(j.departedAt) h+=trackingSec(j);
  if(j.quote?.status==='sent') h+=quoteSec(j);
  if(j.invoice && j.payment?.status!=='paid') h+=invoiceSec(j);
  if(j.finishedAt && !j.rating) h+=ratingSec(j);
  h+=detailsSec(j);
  if(j.finishedAt) h+=workSec(j);
  if(j.quote && j.quote.status!=='sent') h+=quoteSec(j);
  if(j.invoice && j.payment?.status==='paid') h+=invoiceSec(j);
  if(j.rating) h+=ratingSec(j);
  h+=messagesSec(j);
  if(s!=='cancelled' && !j.departedAt && PCFG().customerCancel) h+=`<div class="sec"><div class="row"><button class="btn danger sm ${UI.confirm==='cancel'+j.id?'armed':''}" data-act="cancelJob" data-id="${j.id}">${UI.confirm==='cancel'+j.id?'Tap again to cancel this request':'Cancel this request'}</button></div></div>`;
  return h+`</div></div>`;
}
function detailsSec(j){
  const t=accepted(j)?tech(j.techId):null, ar=t?avgRating(t.id):null, phone=PCFG().showTechPhone && t?.phone;
  return `<div class="sec"><h3>Visit details</h3><div class="kv">
      <div><span class="label">When</span><b>${j.slot?slotText(j.slot):'Waiting for confirmation'}</b>${j.slot?'':`<span class="small muted">You asked for ${fd(j.preferredDate)}${j.window?', '+esc(WINDOWS[j.window].split(',')[0].toLowerCase()):''}</span>`}</div>
      <div><span class="label">Where</span><b>${esc(j.address||'')}${j.island?', '+esc(j.island):''}</b></div>
      <div><span class="label">Your AC</span><b>${esc(j.units||1)} × ${esc(j.acType||'AC')}</b><span class="small muted">${esc(j.btu||'')}</span></div>
      <div><span class="label">Services</span><b>${esc(jobTitle(j))}</b></div></div>
    ${j.issue?`<div class="callout"><span class="label">What you told us</span><p>${esc(j.issue)}</p></div>`:''}
    ${t?`<div class="tech-card"><span class="avatar">${initials(t.name)}</span><div style="min-width:0;flex:1"><b>${esc(t.name)}</b><span class="small muted">Your technician${ar?' · '+stars(ar.avg)+' '+ar.avg.toFixed(1):''}</span></div>${phone?`<a class="btn sm" href="tel:${esc(t.phone.replace(/\s/g,''))}">${svg(ICON.phone,'ic')} Call</a>`:''}</div>`:''}</div>`;
}

/* ---------- booking wizard ---------- */
function bookingDates(){
  const lead=PCFG().leadDays||0, out=[];
  for(let i=lead;i<lead+10;i++) out.push(addDays(today(),i));
  return out;
}
function newBooking(svcId){
  const me=myCustomer()||{}, w=Object.keys(WINDOWS).filter(k=>PCFG().windows[k]);
  return {step:svcId?2:1, svcs:svcId?[svcId]:[], units:1, acType:AC_TYPES[0], btu:'12,000 BTU', issues:[], note:'', date:bookingDates()[PCFG().leadDays?0:1]||bookingDates()[0], window:w[0]||'morning', island:me.island||'', address:me.address||'', savePin:me.lat==null};
}
function estimate(b){
  if(!b.svcs.length) return null;
  return totals({lines:b.svcs.map(id=>({qty:b.units, rate:sv(id)?.price||0})), discount:0, gstRate:co().gstRate});
}
function bookWizard(me){
  if(!S.services.length) return `<div class="empty card"><h3>Booking opens soon</h3><p>The office hasn't listed its services yet.</p></div>`;
  const b=UI.bk || (UI.bk=newBooking()), est=estimate(b);
  const steps=[bkService,bkAC,bkWhen,bkWhere,bkReview];
  return `<section class="wiz">
    <div class="wiz-top"><h1 class="ctitle">Book a service</h1>
      <ol class="wiz-steps">${BK_STEPS.map((l,i)=>`<li class="${i+1<b.step?'done':i+1===b.step?'cur':''}">${i+1<b.step?`<button data-act="bkGo" data-v="${i+1}">`:'<span>'}<i>${i+1}</i><span class="ws-l">${l}</span>${i+1<b.step?'</button>':'</span>'}</li>`).join('')}</ol></div>
    <div class="wiz-body card">${steps[b.step-1](b,me)}</div>
    <div class="wiz-bar">${b.step>1?'<button class="btn" data-act="bkBack">Back</button>':'<span></span>'}
      <div class="est">${est?`<span class="small">Estimate</span><b>${money(est.total)}</b>`:''}</div>
      ${b.step<5?'<button class="btn primary" data-act="bkNext">Next</button>':'<button class="btn coral" data-act="bkSend">Send request</button>'}</div>
  </section>`;
}
function bkService(b){
  return `<h2>What do you need?</h2><p class="muted">Choose one or more. Prices are per AC unit, before GST.</p>
    <div class="svc-pick">${S.services.map((s,i)=>`<button class="svc-opt" data-act="bkSvc" data-id="${s.id}" aria-pressed="${b.svcs.includes(s.id)}"><span class="sicon c${i%5}"><svg viewBox="0 0 24 24">${SVC_ICONS[i%5]}</svg></span><span class="so-txt"><b>${esc(s.name)}</b><small>${esc(s.desc||'')}</small></span><span class="so-price">${money(s.price)}</span><span class="so-check" aria-hidden="true"></span></button>`).join('')}</div>`;
}
function chips(k, list, cur){ return `<div class="chips big">${list.map(v=>`<button class="chip" data-act="bkSet" data-k="${k}" data-v="${esc(v)}" aria-pressed="${cur===v}">${esc(v)}</button>`).join('')}</div>`; }
function bkAC(b){
  return `<h2>Tell us about your AC</h2>
    <div class="field"><span>How many units?</span><div class="stepper"><button data-act="bkUnits" data-d="-1" aria-label="Fewer units">−</button><b>${b.units}</b><button data-act="bkUnits" data-d="1" aria-label="More units">+</button></div></div>
    <div class="field"><span>Type of AC</span>${chips('acType',AC_TYPES,b.acType)}</div>
    <div class="field"><span>Capacity <small class="muted">(on the sticker on the indoor unit)</small></span>${chips('btu',BTUS,b.btu)}</div>
    <div class="field"><span>What's the problem? <small class="muted">(pick any)</small></span><div class="chips big">${ISSUES.map(v=>`<button class="chip" data-act="bkIssue" data-v="${esc(v)}" aria-pressed="${b.issues.includes(v)}">${esc(v)}</button>`).join('')}</div></div>
    <label class="field"><span>Anything else we should know? <small class="muted">(optional)</small></span><textarea id="bk-note" data-bk="note" placeholder="e.g. The bedroom unit drips water at night">${esc(b.note)}</textarea></label>`;
}
function bkWhen(b){
  const dates=bookingDates(), t=today();
  const label = dt => dt===t?'Today':dt===addDays(t,1)?'Tomorrow':new Date(dt+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'});
  const w=Object.entries(WINDOWS).filter(([k])=>PCFG().windows[k]);
  return `<h2>When suits you?</h2><p class="muted">Pick a day and a time window. The office confirms the exact time.</p>
    <div class="date-row">${dates.map(dt=>{ const x=new Date(dt+'T12:00:00Z'); return `<button class="date-chip" data-act="bkSet" data-k="date" data-v="${dt}" aria-pressed="${b.date===dt}"><small>${label(dt)}</small><b>${x.getUTCDate()}</b><small>${x.toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'})}</small></button>`; }).join('')}</div>
    <label class="field" style="max-width:240px"><span>Or choose another date</span><input type="date" id="bk-date" data-np data-bkdate min="${dates[0]}" value="${esc(b.date)}"></label>
    <div class="field"><span>Time window</span><div class="win-pick">${w.map(([k,v])=>{ const [n,r]=v.split(', '); return `<button class="win-opt" data-act="bkSet" data-k="window" data-v="${k}" aria-pressed="${b.window===k}"><b>${n}</b><small>${r}</small></button>`; }).join('')}</div></div>`;
}
function bkWhere(b){
  return `<h2>Where should we come?</h2>
    <div class="grid2"><label class="field"><span>Island / city</span><input id="bk-island" data-bk="island" value="${esc(b.island)}" placeholder="Malé, Hulhumalé, Thulusdhoo…"></label>
    <label class="field"><span>Address</span><input id="bk-addr" data-bk="address" value="${esc(b.address)}" placeholder="House name, road, floor"></label></div>
    <div class="field"><span>Pin the exact spot <small class="muted">(helps the technician find you)</small></span><div class="map small" data-map="pick-book"></div>
      <div class="row"><span class="small muted" data-pickinfo="book"></span><button type="button" class="btn sm" data-act="locate" data-key="book">Use my current location</button></div></div>
    <label class="row small" style="gap:8px"><input type="checkbox" id="bk-save" data-bk="savePin" ${b.savePin?'checked':''}> Save this as my home address</label>`;
}
function bkReview(b){
  const est=estimate(b), w=WINDOWS[b.window]||'';
  const row=(l,v,step)=>`<div class="rv-row"><span class="label">${l}</span><b>${v}</b><button class="linkbtn" data-act="bkGo" data-v="${step}">Change</button></div>`;
  return `<h2>Check and send</h2>
    <div class="rv">${row('Services',b.svcs.map(id=>esc(sv(id)?.name)).join(', '),1)}
      ${row('Your AC',`${b.units} × ${esc(b.acType)}, ${esc(b.btu)}`,2)}
      ${row('Problem',esc([...b.issues,b.note].filter(Boolean).join('. ')||'Not described'),2)}
      ${row('When',`${fd(b.date)}, ${esc(w.split(',')[0].toLowerCase())} (${esc(w.split(', ')[1]||'')})`,3)}
      ${row('Where',`${esc(b.address)}, ${esc(b.island)}${(UI.pick.book||pickDefault('home'))?' · pinned on map':''}`,4)}</div>
    ${est?`<div class="est-box"><div class="tot">${b.svcs.map(id=>`<span>${esc(sv(id)?.name)} × ${b.units}</span><span>${money((sv(id)?.price||0)*b.units)}</span>`).join('')}<span>GST ${est.rate}%</span><span>${money(est.gst)}</span><span class="grand">Estimated total</span><span class="grand">${money(est.total)}</span></div>
      <p class="small muted">This is an estimate. The office confirms the final price in a quotation for you to approve before work starts.</p></div>`:''}`;
}

/* ---------- profile ---------- */
function profileCard(me){
  const C=co();
  return `<h1 class="ctitle">${me?'Profile':'Welcome! Tell us where you are'}</h1>
  <div class="cols">
  <form class="card" data-form="profile"><div class="card-h"><h3>My details</h3>${me?'':'<span class="pill coral">Needed before booking</span>'}</div><div class="card-b stack">
    <div class="grid2"><label class="field"><span>Full name</span><input id="pf-name" name="name" value="${esc(me?.name||ME.profile?.name||'')}" required></label>
    <label class="field"><span>Mobile</span><input id="pf-phone" name="phone" value="${esc(me?.phone||ME.profile?.phone||'')}" required></label>
    <label class="field"><span>Island / city</span><input id="pf-island" name="island" value="${esc(me?.island||'')}" required></label>
    <label class="field"><span>Address</span><input id="pf-address" name="address" value="${esc(me?.address||'')}" required></label></div>
    <div class="field"><span>Home location</span><div class="map small" data-map="pick-home"></div><div class="row"><span class="small muted" data-pickinfo="home"></span><button type="button" class="btn sm" data-act="locate" data-key="home">Use my current location</button></div></div>
    <div><button class="btn primary">Save my details</button></div></div></form>
  ${me?`<div class="stack">
    <div class="card"><div class="card-h"><h3>Alerts</h3></div><div class="card-b stack">${pushPrompt()}<p class="small muted">You also see every update under the bell at the top.</p></div></div>
    <div class="card"><div class="card-h"><h3>Account</h3></div><div class="card-b stack"><p class="small">Signed in as <b>${esc(ME.user.email||'')}</b></p><div><button class="btn" data-act="signOut">Sign out</button></div></div></div>
    <div class="card"><div class="card-h"><h3>Contact ${esc(C.name)}</h3></div><div class="card-b stack small">${C.phone?`<a href="tel:${esc(C.phone.replace(/\s/g,''))}">${esc(C.phone)}</a>`:''}${C.email?`<span class="mono">${esc(C.email)}</span>`:''}<span class="muted">${esc(C.address||'')}</span></div></div>
  </div>`:''}</div>`;
}

/* ---------- actions ---------- */
const actions = {
  ctab(el){ UI.ctab=el.dataset.v; UI.sel=''; if(el.dataset.v==='book' && !UI.bk) UI.bk=newBooking(); saveUI(); render(); scrollTo(0,0); },
  jf(el){ UI.jf=el.dataset.v; render(); },
  pushLater(){ UI.pushLater=true; render(); },
  startBook(el){ UI.bk=newBooking(el.dataset.svc); UI.ctab='book'; UI.sel=''; saveUI(); render(); scrollTo(0,0); },
  bkSvc(el){ const b=UI.bk, id=el.dataset.id; b.svcs = b.svcs.includes(id) ? b.svcs.filter(x=>x!==id) : [...b.svcs,id]; render(); },
  bkSet(el){ UI.bk[el.dataset.k]=el.dataset.v; render(); },
  bkIssue(el){ const b=UI.bk, v=el.dataset.v; b.issues = b.issues.includes(v) ? b.issues.filter(x=>x!==v) : [...b.issues,v]; render(); },
  bkUnits(el){ UI.bk.units=Math.max(1,Math.min(30,UI.bk.units+(+el.dataset.d))); render(); },
  bkGo(el){ UI.bk.step=+el.dataset.v; render(); scrollTo(0,0); },
  bkBack(){ UI.bk.step=Math.max(1,UI.bk.step-1); render(); scrollTo(0,0); },
  bkNext(){ const b=UI.bk;
    if(b.step===1 && !b.svcs.length) return toast('Choose at least one service.');
    if(b.step===3 && (!b.date || !b.window)) return toast('Choose a day and a time window.');
    if(b.step===3 && b.date < bookingDates()[0]) return toast(`The earliest day you can book is ${fd(bookingDates()[0])}.`);
    if(b.step===4 && (!b.island.trim() || !b.address.trim())) return toast('Enter your island and address.');
    b.step++; render(); scrollTo(0,0); },
  bkSend(el){ const b=UI.bk, me=myCustomer(), p=UI.pick.book || pickDefault('home');
    el.disabled=true;
    run(async()=>{
      const ref=F.doc(c('jobs'));
      const created=await F.runTransaction(db, async tx=>{ const cref=d('counters','jobs'), cs=await tx.get(cref), n=(cs.exists()?cs.data().n:0)+1; tx.set(cref,{n});
        const data={no:'SR-'+(1000+n), customerId:ME.user.uid, customerName:me.name, customerPhone:me.phone||'', serviceIds:b.svcs, units:b.units, acType:b.acType, btu:b.btu,
          preferredDate:b.date, window:b.window, island:b.island.trim(), address:b.address.trim(), issue:[...b.issues, b.note.trim()].filter(Boolean).join('. '), createdAt:nowISO()};
        if(p) data.dest={lat:p.lat,lng:p.lng};
        tx.set(ref,data); return data; });
      if(b.savePin && p) await F.setDoc(d('customers',ME.user.uid),{lat:p.lat, lng:p.lng, island:b.island.trim(), address:b.address.trim()},{merge:true}).catch(()=>{});
      const j={...created, id:ref.id};
      await event(j,`New request from ${me.name}: ${jobTitle(j)}, ${fd(b.date)} ${WINDOWS[b.window].split(',')[0].toLowerCase()}`,['office'],'New service request');
      UI.bk=null; delete UI.pick.book; UI.ctab='jobs'; UI.sel=ref.id; saveUI(); scrollTo(0,0);
    }, 'Request sent. We will confirm your appointment soon.').finally(()=>{ el.disabled=false; });
  }
};
const forms = {
  profile(f,dd){ const uid=ME.user.uid, p=UI.pick.home || pickDefault('home');
    const data={name:dd.name, phone:dd.phone, island:dd.island, address:dd.address, email:ME.user.email||''}; if(p){ data.lat=p.lat; data.lng=p.lng; }
    run(async()=>{ const b=F.writeBatch(db); b.set(d('customers',uid), myCustomer()? data : {...data, hasLogin:true, createdAt:nowISO()}, {merge:true}); b.update(d('users',uid),{name:dd.name, phone:dd.phone}); await b.commit(); UI.ctab='home'; saveUI(); }, 'Details saved'); }
};
document.addEventListener('input', e=>{ const k=e.target.dataset.bk; if(k && UI.bk) UI.bk[k] = e.target.type==='checkbox' ? e.target.checked : e.target.value; });
document.addEventListener('change', e=>{ if(e.target.dataset.bkdate!==undefined && UI.bk && e.target.value){ UI.bk.date=e.target.value; render(); } });

K.start({view:customerView, actions, forms});
