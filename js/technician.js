/* Technician portal: assigned jobs, live trip sharing, work reports. */
import * as K from './core.js';
const { S, UI, GPS, esc, job, jobItem, jobDetail, myActiveTrip } = K;

/* ---------- technician ---------- */
function techView(){
  const mine=S.jobs.filter(j=>!j.cancelled).sort((a,b)=>((a.slot?.date||'9')+(a.slot?.time||'')).localeCompare((b.slot?.date||'9')+(b.slot?.time||'')));
  const open=mine.filter(j=>!j.finishedAt), done=mine.filter(j=>j.finishedAt).reverse(), sel=job(UI.sel);
  const list=a=>`<ul class="joblist">${a.map(j=>jobItem(j,j.id===UI.sel)).join('')}</ul>`;
  const trip=myActiveTrip();
  return `${trip?`<div class="notice live"><b>Sharing your location for ${esc(trip.no)}.</b> ${GPS.error?esc(GPS.error):'Keep this page open until you tap "I\'ve arrived".'}</div>`:''}
    <div class="split ${sel?'has-sel':''}">
    <section class="pane list-pane"><div class="pane-head"><h2>My jobs</h2><p class="small muted">${open.length} to do · ${done.length} finished</p></div>
      ${open.length?list(open):`<div class="empty"><p>No open jobs assigned to you.</p></div>`}
      ${done.length?`<div class="pane-head" style="border-top:1px solid var(--line)"><span class="label">Finished</span></div>${list(done)}`:''}</section>
    <section class="pane detail-pane">${sel?jobDetail(sel):`<div class="empty"><h3>Pick a job</h3><p>Start the trip when you leave the office so the customer can follow you on the map.</p></div>`}</section></div>`;
}

K.start({view:techView});
