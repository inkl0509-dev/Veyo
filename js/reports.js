/* Accounting reports for the office portal: one report for a date range, saved as a PDF or an Excel file.
   Both are made on the device. The PDF is drawn as real text with jsPDF (crisp, small, prints well);
   the Excel file is a genuine .xlsx written here (no extra library), with real numbers, dates and totals. */
import * as K from './core.js';
const { S, UI, ACCTS, CUR, esc, money, r2, fd, today, co, totals, balances, sideBal, toast, render } = K;

const CASH = ['1000','1010','1020','1030'];
const EXP = () => Object.keys(ACCTS).filter(a=>ACCTS[a].t==='expense');
const dayOf = x => String(x||'').slice(0,10);
const lastDay = ym => { const [y,m]=ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`; };

/** The date range for the period chips on the Accounting tab. */
export function periodRange(per){
  const t=today(), cm=t.slice(0,7), yr=t.slice(0,4);
  const lmD=new Date(t+'T12:00:00Z'); lmD.setUTCDate(1); lmD.setUTCMonth(lmD.getUTCMonth()-1); const lm=lmD.toISOString().slice(0,7);
  if(per==='last') return {from:lm+'-01', to:lastDay(lm)};
  if(per==='year') return {from:yr+'-01-01', to:yr+'-12-31'};
  if(per==='all'){ const first=S.ledger.map(e=>e.date||'').filter(Boolean).sort()[0]; return {from:first||t, to:t}; }
  return {from:cm+'-01', to:lastDay(cm)};
}
export function reportRange(){
  const r=periodRange(UI.period);
  return {from:UI.repFrom||r.from, to:UI.repTo||r.to};
}

/** Everything both files show, worked out once. */
export function reportData(from, to){
  const inR = x => x>=from && x<=to;
  const per=S.ledger.filter(e=>inR(e.date||'')), upto=S.ledger.filter(e=>(e.date||'')<=to);
  const pb=balances(per), ab=balances(upto), exp=EXP();
  const revenue=sideBal('4000',pb), expenses=r2(exp.reduce((a,k)=>a+sideBal(k,pb),0));
  let gstIn=0, gstPaid=0, moneyIn=0;
  for(const e of per){ const fromCustomers=(e.lines||[]).some(l=>l.acct==='1100' && +l.cr>0);
    for(const l of e.lines||[]){
      if(l.acct==='2100'){ gstIn+=+l.cr||0; gstPaid+=+l.dr||0; }
      if(fromCustomers && CASH.includes(l.acct)) moneyIn+=+l.dr||0;   // payments from customers only, not owner's money
    } }
  // Invoices dated by their ledger entry (the business's own date), falling back to when they were issued.
  const ledDate=Object.fromEntries(S.ledger.filter(e=>/^inv-/.test(e.id||'')).map(e=>[e.id.slice(4), e.date]));
  const invoices=S.jobs.filter(j=>j.invoice).map(j=>{ const I=j.invoice, t=totals(I), P=j.payment||{};
      return {date:ledDate[j.id]||dayOf(I.issuedAt), no:I.no||'', customer:j.customerName||'', tin:I.customerTin||j.customerTin||'',
        net:t.net, gst:t.gst, total:t.total, paid:P.status==='paid', paidOn:P.status==='paid'?dayOf(P.paidAt):'', due:dayOf(I.dueDate),
        method:P.status==='paid'?(K.METHODS[P.method]?.n||''):''}; })
    .filter(x=>inR(x.date)).sort((a,b)=>a.date.localeCompare(b.date)||a.no.localeCompare(b.no));
  const expenseRows=[];
  for(const e of [...per].sort((a,b)=>(a.date||'').localeCompare(b.date||'')))
    for(const l of e.lines||[]) if(ACCTS[l.acct]?.t==='expense'){ const v=r2((+l.dr||0)-(+l.cr||0)); if(v) expenseRows.push({date:e.date, ref:e.ref||'', memo:e.memo||'', acct:ACCTS[l.acct].n, amount:v}); }
  const journal=[];
  for(const e of [...per].sort((a,b)=>((a.date||'')+(a.at||'')).localeCompare((b.date||'')+(b.at||''))))
    for(const l of e.lines||[]) journal.push({date:e.date, ref:e.ref||'', memo:e.memo||'', code:l.acct, acct:ACCTS[l.acct]?.n||l.acct, dr:+l.dr||0, cr:+l.cr||0});
  const trial=Object.keys(ACCTS).filter(k=>Math.abs(ab[k]||0)>0.004).map(k=>({code:k, acct:ACCTS[k].n, dr:ab[k]>0?ab[k]:0, cr:ab[k]<0?-ab[k]:0}));
  const unpaid=invoices.filter(x=>!x.paid);
  return { from, to, made:new Date(),
    revenue, expenses, net:r2(revenue-expenses), gstIn:r2(gstIn), gstPaid:r2(gstPaid), moneyIn:r2(moneyIn),
    cash:r2(CASH.reduce((a,k)=>a+sideBal(k,ab),0)), owed:sideBal('1100',ab), gstOwed:sideBal('2100',ab),
    pl:[...exp.map(k=>({acct:ACCTS[k].n, amount:sideBal(k,pb)}))],
    invoices, unpaidCount:unpaid.length, unpaidTotal:r2(unpaid.reduce((a,x)=>a+x.total,0)),
    expenseRows, journal, trial };
}
const rangeText = R => R.from===R.to ? fd(R.from) : `${fd(R.from)} to ${fd(R.to)}`;
const fileName = (R, ext) => `${(co().name||'Accounts').replace(/[^\w]+/g,'-')}-accounts-${R.from}-to-${R.to}.${ext}`.replace(/-+/g,'-');

/* ---------- the card on the Accounting tab ---------- */
export function exportCard(){
  const R=reportRange();
  return `<div class="card export-card" style="margin-bottom:16px"><div class="card-b">
    <div class="export-row">
      <div class="export-txt"><b>Download accounts report</b><span class="small muted">Summary, profit and loss, GST, invoices, expenses, trial balance and journal.</span></div>
      <label class="field"><span>From</span><input type="date" id="rep-from" data-rep="from" data-np value="${esc(R.from)}"></label>
      <label class="field"><span>To</span><input type="date" id="rep-to" data-rep="to" data-np value="${esc(R.to)}"></label>
      <div class="row export-btns"><button class="btn primary" data-act="repPdf">⤓ PDF</button><button class="btn xl" data-act="repXlsx">⤓ Excel</button></div>
    </div></div></div>`;
}
document.addEventListener('input', e=>{ const k=e.target.dataset?.rep; if(k) UI[k==='from'?'repFrom':'repTo']=e.target.value; });

function checkRange(){
  const R=reportRange();
  if(!R.from || !R.to) { toast('Choose both dates.'); return null; }
  if(R.from>R.to){ toast('The "From" date is after the "To" date.'); return null; }
  return R;
}
export const reportActions = {
  period(el){ UI.period=el.dataset.v; UI.repFrom=UI.repTo=''; K.saveUI(); render(); },
  async repPdf(el){ const R=checkRange(); if(!R) return; el.disabled=true;
    try{ toast('Making the PDF…'); const D=reportData(R.from,R.to); const blob=await reportPdf(D); await K.saveBlob(blob, fileName(R,'pdf'), 'application/pdf'); }
    catch(e){ console.error(e); toast(e.message||"Couldn't make the PDF."); } finally{ el.disabled=false; } },
  async repXlsx(el){ const R=checkRange(); if(!R) return; el.disabled=true;
    try{ const D=reportData(R.from,R.to); const blob=reportXlsx(D); await K.saveBlob(blob, fileName(R,'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
    catch(e){ console.error(e); toast(e.message||"Couldn't make the Excel file."); } finally{ el.disabled=false; } }
};

/* ---------- PDF ---------- */
const num = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
// The built-in PDF fonts only cover Western characters: swap the common others so nothing turns to junk.
const pdfTxt = s => String(s??'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/·/g,'|').replace(/[^\x20-\x7E\xA0-\xFF]/g,'?');

async function logoPng(){
  const src=K.BRAND?.logo; if(!src) return null;
  try{ const im=await K.loadImg(src), k=Math.min(1, 240/Math.max(im.width,im.height)), cv=document.createElement('canvas');
    cv.width=Math.max(1,Math.round(im.width*k)); cv.height=Math.max(1,Math.round(im.height*k));
    const g=cv.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,cv.width,cv.height); g.drawImage(im,0,0,cv.width,cv.height);
    return {data:cv.toDataURL('image/png'), w:cv.width, h:cv.height}; }catch(e){ return null; }
}

export async function reportPdf(D){
  const jsPDF=await K.jsPdfLib(), C=co();
  const pdf=new jsPDF({unit:'pt', format:'a4'});
  const W=pdf.internal.pageSize.getWidth(), H=pdf.internal.pageSize.getHeight(), M=40, CW=W-2*M;
  const INK=[20,32,43], MUTED=[100,114,128], LINE=[222,228,235], BRANDC=hexRgb(K.BRAND?.color)||[10,77,140], BAND=[244,247,250];
  let y=M;
  const font=(sz, bold, col=INK)=>{ pdf.setFont('helvetica', bold?'bold':'normal'); pdf.setFontSize(sz); pdf.setTextColor(...col); };
  const fit=(s,w)=>{ s=pdfTxt(s); if(pdf.getTextWidth(s)<=w) return s; while(s.length>1 && pdf.getTextWidth(s+'...')>w) s=s.slice(0,-1); return s+'...'; };
  const space=h=>{ if(y+h>H-M-18){ pdf.addPage(); y=M; return true; } return false; };

  // Heading: company on the left, report details on the right.
  const logo=await logoPng(); let lx=M;
  if(logo){ const h=46, w=Math.min(110, logo.w*h/logo.h); pdf.addImage(logo.data,'PNG',M,y,w,h); lx=M+w+12; }
  font(16,true); pdf.text(fit(C.name, 280), lx, y+16);
  font(8.5,false,MUTED);
  const info=[K.addrLine(C), [C.phone, C.email].filter(Boolean).join('  ·  '), C.tin?`GST TIN ${C.tin}`:''].filter(Boolean);
  info.forEach((t,i)=>pdf.text(fit(t, 300), lx, y+30+i*11));
  font(13,true,BRANDC); pdf.text('Accounts report', W-M, y+16, {align:'right'});
  font(9,false,INK); pdf.text(pdfTxt(rangeText(D)), W-M, y+30, {align:'right'});
  font(8,false,MUTED); pdf.text(pdfTxt(`Made ${fd(dayOf(D.made.toISOString()))} · amounts in ${CUR}`), W-M, y+42, {align:'right'});
  y+=Math.max(60, 30+info.length*11+8);
  pdf.setDrawColor(...BRANDC); pdf.setLineWidth(1.5); pdf.line(M,y,W-M,y); y+=18;

  // Summary tiles.
  const tiles=[['Revenue (before GST)',D.revenue],['Expenses',D.expenses],['Net profit',D.net],
               ['GST collected',D.gstIn],['Paid by customers',D.moneyIn],['Unpaid invoices',D.unpaidTotal]];
  const tw=(CW-2*10)/3, th=46;
  tiles.forEach(([l,v],i)=>{ const x=M+(i%3)*(tw+10), ty=y+Math.floor(i/3)*(th+10);
    pdf.setFillColor(...BAND); pdf.setDrawColor(...LINE); pdf.setLineWidth(.6); pdf.roundedRect(x,ty,tw,th,5,5,'FD');
    font(8,false,MUTED); pdf.text(l, x+10, ty+16);
    font(13,true, l==='Net profit'&&v<0?[190,40,40]:INK); pdf.text(num(v), x+10, ty+35); });
  y+=2*th+10+8;
  font(8,false,MUTED);
  pdf.text(pdfTxt(`At ${fd(D.to)}: cash & bank ${num(D.cash)} · customers owe ${num(D.owed)} (${D.unpaidCount} unpaid in this period) · GST owed to MIRA ${num(D.gstOwed)}`), M, y); y+=20;

  // Tables.
  function table(title, cols, rows, foot, note){
    space(60); font(11.5,true,BRANDC); pdf.text(title, M, y); y+=6;
    if(note){ font(8,false,MUTED); pdf.text(note, W-M, y-6, {align:'right'}); }
    const tot=cols.reduce((a,c)=>a+c.w,0), ws=cols.map(c=>c.w/tot*CW), xs=ws.map((_,i)=>M+ws.slice(0,i).reduce((a,b)=>a+b,0));
    const RH=15;
    const head=()=>{ pdf.setFillColor(...BAND); pdf.rect(M,y,CW,RH+2,'F'); font(8,true,MUTED);
      cols.forEach((c,i)=>pdf.text(c.h, c.r?xs[i]+ws[i]-4:xs[i]+4, y+11, c.r?{align:'right'}:undefined)); y+=RH+2; };
    const line=(r,bold)=>{ font(8.5,bold);
      cols.forEach((c,i)=>{ const v=r[i]; if(v==null||v==='') return; const s=fit(typeof v==='number'?num(v):v, ws[i]-8);
        pdf.text(s, c.r?xs[i]+ws[i]-4:xs[i]+4, y+10.5, c.r?{align:'right'}:undefined); });
      y+=RH; };
    head();
    if(!rows.length){ font(8.5,false,MUTED); pdf.text('Nothing in this period.', M+4, y+10.5); y+=RH; }
    rows.forEach(r=>{ if(space(RH)) head(); line(r,false); pdf.setDrawColor(...LINE); pdf.setLineWidth(.4); pdf.line(M,y,W-M,y); });
    if(foot){ if(space(RH+2)) head(); pdf.setDrawColor(...INK); pdf.setLineWidth(.8); pdf.line(M,y,W-M,y); y+=1; line(foot,true); }
    y+=16;
  }
  table('Profit and loss', [{h:'',w:5},{h:'Amount',w:2,r:1}],
    [['Service revenue (before GST)', D.revenue], ...D.pl.filter(x=>x.amount).map(x=>['   '+x.acct, x.amount]), ['Total expenses', D.expenses]],
    ['Net profit', D.net]);
  table('GST', [{h:'',w:5},{h:'Amount',w:2,r:1}],
    [['GST charged on invoices in this period', D.gstIn], ['GST paid to MIRA in this period', D.gstPaid]],
    [`GST owed to MIRA at ${fd(D.to)}`, D.gstOwed]);
  const it=D.invoices.reduce((a,x)=>({n:a.n+x.net,g:a.g+x.gst,t:a.t+x.total}),{n:0,g:0,t:0});
  table('Invoices', [{h:'Date',w:1.1},{h:'Invoice',w:1.25},{h:'Customer',w:2.2},{h:'Net',w:1,r:1},{h:'GST',w:.85,r:1},{h:'Total',w:1.05,r:1},{h:'Status',w:1.5}],
    D.invoices.map(x=>[fd(x.date), x.no, x.customer+(x.tin?` (TIN ${x.tin})`:''), x.net, x.gst, x.total, x.paid?`Paid ${fd(x.paidOn)}`:'Unpaid']),
    D.invoices.length?[`${D.invoices.length} invoice${D.invoices.length>1?'s':''}`,'','',r2(it.n),r2(it.g),r2(it.t),'']:null);
  table('Expenses', [{h:'Date',w:1.1},{h:'Reference',w:1.5},{h:'Description',w:2.55},{h:'Account',w:1.8},{h:'Amount',w:1.2,r:1}],
    D.expenseRows.map(x=>[fd(x.date), x.ref, x.memo, x.acct, x.amount]),
    D.expenseRows.length?['Total','','','',D.expenses]:null);
  const td=D.trial.reduce((a,x)=>a+x.dr,0), tc=D.trial.reduce((a,x)=>a+x.cr,0);
  table('Trial balance', [{h:'Account',w:5},{h:'Debit',w:1.5,r:1},{h:'Credit',w:1.5,r:1}],
    D.trial.map(x=>[`${x.code}  ${x.acct}`, x.dr||'', x.cr||'']), ['Total', r2(td), r2(tc)], `at ${fd(D.to)}`);
  const jd=D.journal.reduce((a,x)=>a+x.dr,0), jc=D.journal.reduce((a,x)=>a+x.cr,0);
  table('Journal', [{h:'Date',w:1.1},{h:'Reference',w:1.5},{h:'Description',w:2.3},{h:'Account',w:1.8},{h:'Debit',w:1.1,r:1},{h:'Credit',w:1.1,r:1}],
    D.journal.map(x=>[fd(x.date), x.ref, x.memo, x.acct, x.dr||'', x.cr||'']), D.journal.length?['Total','','','',r2(jd),r2(jc)]:null);

  // Footer on every page.
  const n=pdf.getNumberOfPages();
  for(let i=1;i<=n;i++){ pdf.setPage(i); font(7.5,false,MUTED);
    pdf.text(pdfTxt(`${C.name} · Accounts report · ${rangeText(D)}`), M, H-22); pdf.text(`Page ${i} of ${n}`, W-M, H-22, {align:'right'}); }
  return pdf.output('blob');
}
function hexRgb(h){ const m=/^#?([0-9a-f]{6})$/i.exec(h||''); if(!m) return null; const v=parseInt(m[1],16); return [v>>16&255, v>>8&255, v&255]; }

/* ---------- Excel (.xlsx) ---------- */
// Cells: a string, a number, {date:'YYYY-MM-DD'}, {v, s} with a style, or {f:'SUM(..)', v} for a formula.
const ST = {text:0, bold:1, num:2, numBold:3, title:4, head:5, date:6, sub:7, headR:8, numTotal:9, label:10};
export function reportXlsx(D){
  const C=co(), R=rangeText(D), money2=v=>({v:+v||0, s:ST.num});
  const titleRows = (sheetTitle, range=R) => [[{v:C.name, s:ST.title}], [{v:range?`${sheetTitle} · ${range}`:sheetTitle, s:ST.sub}], [{v:`Amounts in ${CUR}${C.tin?' · GST TIN '+C.tin:''}`, s:ST.sub}], []];
  const head = (...h) => h.map(x=>({v:x.replace(/^>/,''), s:x[0]==='>'?ST.headR:ST.head}));
  const sheets=[];

  // Summary
  sheets.push({name:'Summary', cols:[42,18], rows:[...titleRows('Accounts report'),
    head('Item','>Amount'),
    ['Revenue (before GST)', money2(D.revenue)], ['Expenses', money2(D.expenses)], [{v:'Net profit',s:ST.bold}, {v:D.net, s:ST.numBold}], [],
    ['GST charged on invoices', money2(D.gstIn)], ['GST paid to MIRA', money2(D.gstPaid)], ['Paid by customers', money2(D.moneyIn)], [],
    [{v:`Balances at ${fd(D.to)}`, s:ST.bold}],
    ['Cash & bank', money2(D.cash)], ['Customers owe you', money2(D.owed)], ['GST owed to MIRA', money2(D.gstOwed)], [],
    ['Invoices in this period', {v:D.invoices.length, s:0}], ['Unpaid invoices in this period', {v:D.unpaidCount, s:0}], ['Unpaid amount', money2(D.unpaidTotal)], [],
    [{v:`Made ${fd(dayOf(D.made.toISOString()))}`, s:ST.sub}]]});

  // Profit and loss, with live formulas for the totals.
  { const rows=[...titleRows('Profit and loss'), head('Account','>Amount'), ['Service revenue (before GST)', money2(D.revenue)], [{v:'Expenses',s:ST.bold}]];
    const first=rows.length+1; D.pl.forEach(x=>rows.push(['   '+x.acct, money2(x.amount)])); const last=rows.length;
    const revRow=first-2;
    rows.push([{v:'Total expenses',s:ST.bold}, {f:D.pl.length?`SUM(B${first}:B${last})`:'0', v:D.expenses, s:ST.numTotal}]);
    rows.push([{v:'Net profit',s:ST.bold}, {f:`B${revRow}-B${rows.length}`, v:D.net, s:ST.numTotal}]);
    sheets.push({name:'Profit and loss', cols:[42,18], rows}); }

  // Invoices
  { const rows=[...titleRows('Invoices'), head('Date','Invoice','Customer','Customer TIN','>Net','>GST','>Total','Status','Paid on','Paid by','Due')];
    const first=rows.length+1;
    D.invoices.forEach(x=>rows.push([{date:x.date}, x.no, x.customer, x.tin, money2(x.net), money2(x.gst), money2(x.total), x.paid?'Paid':'Unpaid', x.paidOn?{date:x.paidOn}:'', x.method, x.due?{date:x.due}:'']));
    const last=rows.length;
    if(D.invoices.length){ const t=D.invoices.reduce((a,x)=>({n:a.n+x.net,g:a.g+x.gst,t:a.t+x.total}),{n:0,g:0,t:0});
      rows.push([{v:'Total',s:ST.bold},'','','', {f:`SUM(E${first}:E${last})`,v:r2(t.n),s:ST.numTotal}, {f:`SUM(F${first}:F${last})`,v:r2(t.g),s:ST.numTotal}, {f:`SUM(G${first}:G${last})`,v:r2(t.t),s:ST.numTotal}]); }
    else rows.push(['No invoices in this period.']);
    sheets.push({name:'Invoices', cols:[12,14,28,16,13,12,13,10,12,18,12], rows, freeze:first}); }

  // Expenses
  { const rows=[...titleRows('Expenses'), head('Date','Reference','Description','Account','>Amount')];
    const first=rows.length+1; D.expenseRows.forEach(x=>rows.push([{date:x.date}, x.ref, x.memo, x.acct, money2(x.amount)])); const last=rows.length;
    if(D.expenseRows.length) rows.push([{v:'Total',s:ST.bold},'','','', {f:`SUM(E${first}:E${last})`, v:D.expenses, s:ST.numTotal}]);
    else rows.push(['No expenses in this period.']);
    sheets.push({name:'Expenses', cols:[12,16,40,24,14], rows, freeze:first}); }

  // Trial balance
  { const rows=[...titleRows(`Trial balance at ${fd(D.to)}`, ''), head('Code','Account','>Debit','>Credit')];
    const first=rows.length+1; D.trial.forEach(x=>rows.push([x.code, x.acct, x.dr?money2(x.dr):'', x.cr?money2(x.cr):''])); const last=rows.length;
    const td=D.trial.reduce((a,x)=>a+x.dr,0), tc=D.trial.reduce((a,x)=>a+x.cr,0);
    rows.push(['', {v:'Total',s:ST.bold}, {f:`SUM(C${first}:C${last})`, v:r2(td), s:ST.numTotal}, {f:`SUM(D${first}:D${last})`, v:r2(tc), s:ST.numTotal}]);
    sheets.push({name:'Trial balance', cols:[10,30,16,16], rows}); }

  // Journal
  { const rows=[...titleRows('Journal'), head('Date','Reference','Description','Code','Account','>Debit','>Credit')];
    const first=rows.length+1; D.journal.forEach(x=>rows.push([{date:x.date}, x.ref, x.memo, x.code, x.acct, x.dr?money2(x.dr):'', x.cr?money2(x.cr):''])); const last=rows.length;
    const jd=D.journal.reduce((a,x)=>a+x.dr,0), jc=D.journal.reduce((a,x)=>a+x.cr,0);
    if(D.journal.length) rows.push([{v:'Total',s:ST.bold},'','','','', {f:`SUM(F${first}:F${last})`, v:r2(jd), s:ST.numTotal}, {f:`SUM(G${first}:G${last})`, v:r2(jc), s:ST.numTotal}]);
    else rows.push(['Nothing posted in this period.']);
    sheets.push({name:'Journal', cols:[12,16,38,8,24,14,14], rows, freeze:first}); }

  return new Blob([xlsxBytes(sheets)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

const xe = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const colName = i => { let s=''; i++; while(i){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; };
const serial = ymd => { const [y,m,d]=String(ymd).split('-').map(Number); return (Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000; };
function sheetXml(sh){
  const rows=sh.rows.map((r,ri)=>{ const n=ri+1;
    const cells=r.map((v,ci)=>{ if(v==null||v==='') return ''; const ref=colName(ci)+n;
      if(typeof v==='number') return `<c r="${ref}" s="${ST.num}"><v>${v}</v></c>`;
      if(typeof v==='string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
      if(v.date){ const s=serial(v.date); return isNaN(s)?'':`<c r="${ref}" s="${ST.date}"><v>${s}</v></c>`; }
      if(v.f!=null) return `<c r="${ref}" s="${v.s??ST.num}"><f>${xe(v.f)}</f><v>${+v.v||0}</v></c>`;
      if(typeof v.v==='number') return `<c r="${ref}" s="${v.s??ST.num}"><v>${v.v}</v></c>`;
      return `<c r="${ref}" s="${v.s??0}" t="inlineStr"><is><t xml:space="preserve">${xe(v.v)}</t></is></c>`; }).join('');
    return `<row r="${n}">${cells}</row>`; }).join('');
  const pane=sh.freeze?`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze-1}" topLeftCell="A${sh.freeze}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`:'<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetFormatPr defaultRowHeight="15"/>`+
    `<cols>${sh.cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>`+
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sh.cols.length>6?'landscape':'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/><numFmt numFmtId="165" formatCode="dd mmm yyyy"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF5A6B7B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A4D8C"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"/><bottom style="double"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
function xlsxBytes(sheets){
  const names=sheets.map(s=>xe(s.name.replace(/[\\/?*[\]:]/g,' ').slice(0,31)));
  const files=[
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Accounts report</dc:title><dc:creator>${xe(co().name||'')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/,'Z')}</dcterms:created></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n,i)=>`<sheet name="${n}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`, sheetXml(s)])
  ];
  return zipStore(files.map(([n,t])=>[n, new TextEncoder().encode(t)]));
}

/* A plain (uncompressed) ZIP, which is all an .xlsx needs. */
const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
const crc32 = b => { let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=CRC[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
function zipStore(entries){
  const enc=new TextEncoder(), parts=[], central=[]; let off=0;
  const now=new Date(), dosT=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1), dosD=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const [name,data] of entries){
    const nb=enc.encode(name), crc=crc32(data), h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true); h.setUint16(10,dosT,true); h.setUint16(12,dosD,true);
    h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,nb.length,true); h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true); c.setUint16(12,dosT,true); c.setUint16(14,dosD,true);
    c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,nb.length,true); c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer), nb);
    off+=30+nb.length+data.length;
  }
  const cdSize=central.reduce((a,b)=>a+b.length,0), e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true); e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true); e.setUint32(12,cdSize,true); e.setUint32(16,off,true);
  const all=[...parts, ...central, new Uint8Array(e.buffer)], out=new Uint8Array(all.reduce((a,b)=>a+b.length,0)); let p=0;
  for(const b of all){ out.set(b,p); p+=b.length; }
  return out;
}
