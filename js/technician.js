/* Technician portal: jobs sent to me (accept or decline), open jobs anyone can take,
   live trip sharing and work reports. */
import * as K from './core.js';
const { S, UI, ME, GPS, esc, job, jobItem, jobDetail, myActiveTrip, stage, chatThread, chatUnread, render } = K;

const bySlot = (a,b)=>((a.slot?.date||a.preferredDate||'9')+(a.slot?.time||'')).localeCompare((b.slot?.date||b.preferredDate||'9')+(b.slot?.time||''));

function techView(){
  const mine=S.jobs.filter(j=>!j.cancelled && j.techId===ME.user.uid).sort(bySlot);
  const toAccept=mine.filter(j=>stage(j)==='awaiting');
  const todo=mine.filter(j=>!j.finishedAt && stage(j)!=='awaiting');
  const done=mine.filter(j=>j.finishedAt).reverse();
  const open=(S.openJobs||[]).filter(j=>!j.cancelled && !j.techId).sort(bySlot);
  const sel=job(UI.sel);
  const list=a=>`<ul class="joblist">${a.map(j=>jobItem(j,j.id===UI.sel)).join('')}</ul>`;
  const head=(label, n, cls='')=>`<div class="pane-head list-sub ${cls}"><span class="label">${label}</span>${n?`<span class="count">${n}</span>`:''}</div>`;
  const trip=myActiveTrip(), unread=chatUnread(ME.user.uid);
  const switcher=`<nav class="tabs" role="tablist"><button role="tab" aria-selected="${UI.tview!=='chat'}" data-act="tview" data-v="jobs">My jobs${toAccept.length+open.length?`<span class="count">${toAccept.length+open.length}</span>`:''}</button><button role="tab" aria-selected="${UI.tview==='chat'}" data-act="tview" data-v="chat">Chat with office${unread?'<span class="count">New</span>':''}</button></nav>`;
  if(UI.tview==='chat') return switcher+`<div class="pane chat-pane">${chatThread(ME.user.uid)}</div>`;
  return switcher+`${trip?`<div class="notice live"><b>Sharing your location for ${esc(trip.no)}.</b> ${GPS.error?esc(GPS.error):'Keep this page open until you tap "I\'ve arrived".'}</div>`:''}
    <div class="split ${sel?'has-sel':''}">
    <section class="pane list-pane"><div class="pane-head"><h2>My jobs</h2><p class="small muted">${toAccept.length?toAccept.length+' to accept · ':''}${todo.length} to do · ${done.length} finished${open.length?' · '+open.length+' open to take':''}</p></div>
      ${toAccept.length?head('Waiting for you to accept',toAccept.length,'warm')+list(toAccept):''}
      ${open.length?head('Open jobs: first to take it gets it',open.length,'orchid')+list(open):''}
      ${head('To do')}${todo.length?list(todo):`<div class="empty"><p>No jobs to do right now.${open.length?' Take one of the open jobs above.':''}</p></div>`}
      ${done.length?head('Finished')+list(done):''}</section>
    <section class="pane detail-pane">${sel?jobDetail(sel):`<div class="empty"><h3>Pick a job</h3><p>Accept new jobs, take open ones, and start the trip when you leave so the customer can follow you on the map.</p></div>`}</section></div>`;
}

const actions = { tview(el){ UI.tview=el.dataset.v; render(); scrollTo(0,0); } };
K.start({view:techView, actions});
