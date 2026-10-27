/* Customer portal: book services, approve quotations, track the technician, pay and rate. */
import * as K from './core.js';
const { S, ME, UI, F, db, WINDOWS, AC_TYPES, BTUS, SVC_ICONS, esc, money, today, addDays, nowISO, job, jobItem, jobDetail,
  myCustomer, pickDefault, run, toast, render, saveUI, d, c, log, PCFG } = K;

/* ---------- customer ---------- */
function customerView(){
  const me=myCustomer();
  const tabs=[['requests','My requests'],['book','Book a service'],['profile','My details']];
  let h=`<nav class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${UI.ctab===k}" data-act="ctab" data-v="${k}">${l}</button>`).join('')}</nav>`;
  if(!me || UI.ctab==='profile') return h+profileForm(me);
  if(UI.ctab==='book') return h+bookForm(me);
  const mine=[...S.jobs].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  const sel=job(UI.sel);
  return h+`<div class="split ${sel?'has-sel':''}">
    <section class="pane list-pane"><div class="pane-head"><h2>My requests</h2></div>
      ${mine.length?`<ul class="joblist">${mine.map(j=>jobItem(j,j.id===UI.sel)).join('')}</ul>`:`<div class="empty"><h3>No requests yet</h3><p>Book your first AC service and follow it here.</p><button class="btn coral" data-act="ctab" data-v="book">Book a service</button></div>`}</section>
    <section class="pane detail-pane">${sel?jobDetail(sel):`<div class="empty"><h3>Pick a request</h3><p>See the appointment, quotation, live technician location, invoice and payment.</p></div>`}</section></div>`;
}
function profileForm(me){
  return `<form class="card" data-form="profile" style="max-width:820px"><div class="card-h"><h2>My details</h2>${me?'':'<span class="pill coral">Needed before booking</span>'}</div><div class="card-b stack">
    <div class="grid2"><label class="field"><span>Full name</span><input id="pf-name" name="name" value="${esc(me?.name||ME.profile?.name||'')}" required></label>
    <label class="field"><span>Mobile</span><input id="pf-phone" name="phone" value="${esc(me?.phone||ME.profile?.phone||'')}" required></label>
    <label class="field"><span>Island / city</span><input id="pf-island" name="island" value="${esc(me?.island||'')}" required></label></div>
    <label class="field"><span>Address</span><input id="pf-address" name="address" value="${esc(me?.address||'')}" required></label>
    <div class="field"><span>Home location (helps the technician find you)</span><div class="map small" data-map="pick-home"></div><div class="row"><span class="small muted" data-pickinfo="home"></span><button type="button" class="btn sm" data-act="locate" data-key="home">Use my current location</button></div></div>
    <div><button class="btn primary">Save my details</button></div></div></form>`;
}
function bookForm(me){
  const cfg=PCFG();
  if(!S.services.length) return `<div class="empty"><h3>Booking opens soon</h3><p>The office hasn't listed services yet.</p></div>`;
  if(!UI.pick.book && me.lat!=null) UI.pick.book={lat:me.lat,lng:me.lng};
  return `<form class="card" data-form="book" style="max-width:860px"><div class="card-h"><h2>Book a service</h2></div><div class="card-b stack">
    <div class="field"><span>What do you need?</span><div class="opts">${S.services.map((s,i)=>`<label class="opt"><input type="checkbox" id="bk-s-${s.id}" name="svc" value="${s.id}"><span class="sicon c${i%5}"><svg viewBox="0 0 24 24">${SVC_ICONS[i%5]}</svg></span><span><b>${esc(s.name)}</b><span class="small muted">${money(s.price)} per unit + GST${s.desc?' · '+esc(s.desc):''}</span></span></label>`).join('')}</div></div>
    <div class="grid3">
      <label class="field"><span>Number of AC units</span><input id="bk-units" name="units" type="number" min="1" max="50" value="1" required></label>
      <label class="field"><span>AC type</span><select id="bk-type" name="acType">${AC_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Capacity</span><select id="bk-btu" name="btu">${BTUS.map(t=>`<option ${t==='12,000 BTU'?'selected':''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Preferred date</span><input id="bk-date" name="date" type="date" min="${addDays(today(),cfg.leadDays)}" value="${addDays(today(),Math.max(1,cfg.leadDays))}" required></label>
      <label class="field"><span>Preferred time</span><select id="bk-win" name="window">${Object.entries(WINDOWS).filter(([k])=>cfg.windows[k]).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="field"><span>Island / city</span><input id="bk-island" name="island" value="${esc(me.island||'')}" required></label></div>
    <label class="field"><span>Service address</span><input id="bk-addr" name="address" value="${esc(me.address||'')}" required></label>
    <div class="field"><span>Pin the location</span><div class="map small" data-map="pick-book"></div><div class="row"><span class="small muted" data-pickinfo="book"></span><button type="button" class="btn sm" data-act="locate" data-key="book">Use my current location</button></div></div>
    <label class="field"><span>Describe the problem</span><textarea id="bk-issue" name="issue" placeholder="e.g. Bedroom AC blows warm air and drips water from the indoor unit"></textarea></label>
    <div class="row"><button class="btn coral">Send request</button><span class="small muted">The office confirms the time and may send a quotation.</span></div></div></form>`;
}

const actions = { ctab(el){ UI.ctab=el.dataset.v; saveUI(); render(); } };
const forms = {
  profile(f,dd){ const uid=ME.user.uid, p=UI.pick.home || pickDefault('home');
    const data={name:dd.name, phone:dd.phone, island:dd.island, address:dd.address, email:ME.user.email||''}; if(p){ data.lat=p.lat; data.lng=p.lng; }
    run(async()=>{ const b=F.writeBatch(db); b.set(d('customers',uid), myCustomer()? data : {...data, hasLogin:true, createdAt:nowISO()}, {merge:true}); b.update(d('users',uid),{name:dd.name, phone:dd.phone}); await b.commit(); UI.ctab='requests'; saveUI(); }, 'Details saved'); },
  book(f,dd,fdata){ const svcs=fdata.getAll('svc'); if(!svcs.length) return toast('Choose at least one service.');
    const me=myCustomer(), p=UI.pick.book || (me?.lat!=null? {lat:me.lat,lng:me.lng} : null);
    const btn=f.querySelector('button:not([type])'); if(btn) btn.disabled=true;
    run(async()=>{
      const ref=F.doc(c('jobs'));
      await F.runTransaction(db, async tx=>{ const cref=d('counters','jobs'), cs=await tx.get(cref), n=(cs.exists()?cs.data().n:0)+1; tx.set(cref,{n});
        const data={no:'SR-'+(1000+n), customerId:ME.user.uid, customerName:me.name, customerPhone:me.phone||'', serviceIds:svcs, units:+dd.units||1, acType:dd.acType, btu:dd.btu, preferredDate:dd.date, window:dd.window, island:dd.island, address:dd.address, issue:dd.issue||'', createdAt:nowISO()};
        if(p) data.dest={lat:p.lat,lng:p.lng};
        tx.set(ref,data); });
      await log(ref.id,'Request received');
      f.reset(); delete UI.pick.book; UI.ctab='requests'; UI.sel=ref.id; saveUI();
    }, 'Request sent').finally(()=>{ if(btn) btn.disabled=false; }); }
};
K.start({view:customerView, actions, forms});
