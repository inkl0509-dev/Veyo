/* Inventory (office only): items kept in stock for AC jobs.
   - Buy stock: adds to the quantity, updates the average cost, posts Stock (1200) against cash / bank.
   - Use on an invoice: "+ Add from stock" on any quotation or invoice; sending the invoice takes it out of stock
     (see stockOut in core.js) and moves its cost to Parts & refrigerant (5000). Deleting the invoice puts it back.
   - Adjust: correct the count after counting, or write off damaged / lost items.
   Data: tenants/{co}/items/{id} {name, code, category, unit, qty, cost (average), price, reorder, active}
         tenants/{co}/stock/{id} one line per movement {itemId, name, type: bought|used|adjust|opening, qty (+/-), cost, date, ref, memo, billId} */
import * as K from './core.js';
const { S, UI, F, db, ACCTS, esc, money, r2, fd, today, nowISO, toast, render, run, d, c, item, qtyTxt, myName } = K;

const UNITS = ['pcs','kg','g','m','ft','roll','can','bottle','litre','set','box','pair'];
const CATS = ['Gas / refrigerant','Parts','Pipes & insulation','Electrical','Consumables','Brackets & fittings','Tools','Other'];
const PAY_FROM = [['1000','Cash'],['1010','BML bank account'],['1020','MIB bank account'],['3000','Owner paid (own money)']];
const REASONS = ['Counted the stock','Damaged / broken','Lost / missing','Used without an invoice (warranty, own use)','Returned to supplier','Found extra'];

const low = it => (+it.reorder||0)>0 && (+it.qty||0) <= +it.reorder;
const value = it => r2(Math.max(0,+it.qty||0)*(+it.cost||0));
const items = () => [...S.items].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
const newId = col => F.doc(c(col)).id;
export const lowCount = () => S.items.filter(x=>x.active!==false && low(x)).length;

/* ---------- the tab ---------- */
export function inventoryView(){
  const st=UI.inv||{}, q=(UI.invq||'').trim().toLowerCase(), f=UI.invf||'all';
  let list=items().filter(x=>f==='hidden' ? x.active===false : x.active!==false);
  if(f==='low') list=list.filter(low);
  if(q) list=list.filter(x=>[x.name,x.code,x.category].join(' ').toLowerCase().includes(q));
  const act=S.items.filter(x=>x.active!==false), total=r2(act.reduce((a,x)=>a+value(x),0)), lc=lowCount();
  const bookV=K.sideBal('1200', K.balances(S.ledger));
  let h=`<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2>Inventory</h2>
    <div class="row"><button class="btn sm" data-act="invOpen" data-mode="hist">Stock history</button><button class="btn sm" data-act="invOpen" data-mode="new">+ New item</button><button class="btn sm coral" data-act="invOpen" data-mode="buy">+ Buy stock</button></div></div>
    <div class="kpis inv-kpis">
      <div class="kpi c0"><span class="label">Items in stock</span><b>${act.filter(x=>+x.qty>0).length}</b><span class="small">of ${act.length} items</span></div>
      <div class="kpi c2"><span class="label">Stock value (cost)</span><b>${money(total)}</b><span class="small">${Math.abs(bookV-total)>0.5?`In Accounting: ${money(bookV)}`:'Matches Accounting'}</span></div>
      <div class="kpi ${lc?'c1':'c3'}"><span class="label">Low stock</span><b>${lc}</b><span class="small">${lc?'Time to buy more':'All good'}</span></div>
    </div>`;
  if(st.mode==='new' || st.mode==='edit') h+=itemForm(st.mode==='edit'?item(st.id):null);
  else if(st.mode==='buy') h+=buyForm();
  else if(st.mode==='adjust') h+=adjustForm(item(st.id));
  else if(st.mode==='hist') h+=historyCard(st.id);
  h+=`<div class="card"><div class="card-h inv-head"><div class="chips">${[['all','All'],['low',`Low stock${lc?` (${lc})`:''}`],['hidden','Hidden']].map(([k,l])=>`<button class="chip" aria-pressed="${f===k}" data-act="invFilter" data-v="${k}">${l}</button>`).join('')}</div>
      <input id="invq" type="search" placeholder="Search items" value="${esc(UI.invq||'')}" data-input="invq" aria-label="Search items" style="max-width:260px"></div>`;
  if(!S.items.length) h+=`<div class="empty"><h3>No items yet</h3><p>Add the parts and gas you keep in stock (gas, capacitors, pipes, brackets…). Then buy stock, and add items to invoices with "+ Add from stock".</p><button class="btn primary" data-act="invOpen" data-mode="new">+ New item</button></div>`;
  else if(!list.length) h+=`<div class="empty"><p>No items match.</p></div>`;
  else h+=`<div class="tscroll"><table class="t inv-table"><thead><tr><th>Item</th><th class="r">In stock</th><th class="r hide-sm">Avg cost</th><th class="r">Sell price</th><th class="r hide-sm">Value</th><th></th></tr></thead><tbody>
    ${list.map(x=>`<tr><td><b>${esc(x.name)}</b><span class="small muted block">${[x.code, x.category].filter(Boolean).map(esc).join(' · ')}</span></td>
      <td class="r"><span class="${+x.qty<0?'neg':''}">${qtyTxt(x.qty, x.unit)}</span>${low(x)?`<span class="pill coral sm-pill">Low</span>`:''}${x.reorder?`<span class="small muted block">low at ${qtyTxt(x.reorder)}</span>`:''}</td>
      <td class="r hide-sm">${money(x.cost||0)}</td><td class="r">${money(x.price||0)}</td><td class="r hide-sm">${money(value(x))}</td>
      <td class="r nowrap inv-acts"><button class="btn sm" data-act="invOpen" data-mode="buy" data-id="${x.id}">Buy</button> <button class="btn sm" data-act="invOpen" data-mode="adjust" data-id="${x.id}">Adjust</button> <button class="btn sm" data-act="invOpen" data-mode="edit" data-id="${x.id}">Edit</button> <button class="btn sm" data-act="invOpen" data-mode="hist" data-id="${x.id}">History</button></td></tr>`).join('')}
    </tbody></table></div>`;
  return h+`</div><p class="small muted" style="margin-top:10px">Add stock items to a quotation or invoice with <b>+ Add from stock</b>. Sending the invoice takes them out of stock and moves their cost to Parts & refrigerant in Accounting. Deleting the invoice puts them back.</p>`;
}

/* ---------- new / edit item ---------- */
function itemForm(it){
  const v=(k,dflt='')=>esc(it?.[k]??dflt), sel=(opts,cur)=>opts.map(o=>`<option${o===cur?' selected':''}>${esc(o)}</option>`).join('');
  return `<div class="card inv-form"><div class="card-h"><h3>${it?'Edit item':'New stock item'}</h3><button class="icon" data-act="invClose" aria-label="Close">×</button></div>
    <form class="card-b stack" data-form="invItem" data-id="${it?.id||''}">
      <div class="grid3"><label class="field" style="grid-column:span 2"><span>Name</span><input name="name" required value="${v('name')}" placeholder="e.g. R32 refrigerant gas"></label>
        <label class="field"><span>Code (optional)</span><input name="code" value="${v('code')}" placeholder="SKU or part no."></label></div>
      <div class="grid3"><label class="field"><span>Category</span><select name="category">${sel(CATS, it?.category||'Parts')}</select></label>
        <label class="field"><span>Unit</span><select name="unit">${sel(UNITS, it?.unit||'pcs')}</select></label>
        <label class="field"><span>Low stock at</span><input name="reorder" type="number" min="0" step="any" value="${v('reorder',0)}"></label></div>
      <div class="grid3"><label class="field"><span>Selling price (${K.CUR}, before GST)</span><input name="price" type="number" min="0" step="0.01" value="${v('price',0)}"></label>
        ${it?`<label class="field"><span>Show in lists</span><select name="active"><option value="1"${it.active!==false?' selected':''}>Yes</option><option value="0"${it.active===false?' selected':''}>No, hide it</option></select></label>`
        :`<label class="field"><span>Already in stock (qty)</span><input name="openQty" type="number" min="0" step="any" value="0"></label>
          <label class="field"><span>Cost of each (${K.CUR})</span><input name="openCost" type="number" min="0" step="0.01" value="0"></label>`}</div>
      ${it?'':`<p class="small muted">Stock you already have is added as opening stock (Stock against Owner's equity). Buy new stock with "+ Buy stock" so it's paid from cash or bank.</p>`}
      <div class="row"><button class="btn primary">${it?'Save item':'Add item'}</button><button class="btn" type="button" data-act="invClose">Cancel</button>
        ${it?`<span style="flex:1"></span><button class="btn sm danger ${UI.confirm==='delitem'+it.id?'armed':''}" type="button" data-act="invDelItem" data-id="${it.id}">${UI.confirm==='delitem'+it.id?(+it.qty?'Only items with 0 in stock can be deleted':'Tap again to delete'):'Delete item'}</button>`:''}</div>
    </form></div>`;
}

/* ---------- buy stock (one supplier bill, several items) ---------- */
function buyState(){
  if(!UI.buy){ const it=item(UI.inv?.id); UI.buy={lines:[{itemId:it?.id||'', qty:1, cost:it?+it.lastCost||+it.cost||0:0}], supplier:'', ref:'', date:today(), from:'1000'}; }
  return UI.buy;
}
function buyForm(){
  const B=buyState(), all=items().filter(x=>x.active!==false), tot=r2(B.lines.reduce((a,l)=>a+(+l.qty||0)*(+l.cost||0),0));
  return `<div class="card inv-form"><div class="card-h"><h3>Buy stock</h3><button class="icon" data-act="invClose" aria-label="Close">×</button></div><div class="card-b stack">
    <div class="grid3"><label class="field"><span>Supplier</span><input id="buy-supplier" data-np data-buy="supplier" value="${esc(B.supplier)}" placeholder="Shop or company"></label>
      <label class="field"><span>Bill / receipt no.</span><input id="buy-ref" data-np data-buy="ref" value="${esc(B.ref)}"></label>
      <label class="field"><span>Date</span><input id="buy-date" type="date" data-np data-buy="date" value="${esc(B.date)}"></label></div>
    <div class="lines buy-lines"><div class="lrow lhead"><span>Item</span><span>Qty</span><span>Cost each</span><span class="lamt">Amount</span><span></span></div>
    ${B.lines.map((l,i)=>{ const it=item(l.itemId); return `<div class="lrow">
      <select id="buy-i${i}" data-np data-buy="lines.${i}.itemId" data-change="buyItem" aria-label="Item"><option value="">Choose an item…</option>${all.map(x=>`<option value="${x.id}"${x.id===l.itemId?' selected':''}>${esc(x.name)} (${qtyTxt(x.qty,x.unit)} now)</option>`).join('')}</select>
      <input id="buy-q${i}" data-np data-buy="lines.${i}.qty" type="number" min="0" step="any" value="${esc(l.qty)}" aria-label="Quantity">
      <input id="buy-c${i}" data-np data-buy="lines.${i}.cost" type="number" min="0" step="0.01" value="${esc(l.cost)}" aria-label="Cost each">
      <span class="lamt mono" data-buyamt="${i}">${money((+l.qty||0)*(+l.cost||0))}</span>
      <button class="icon" data-act="buyRm" data-i="${i}" aria-label="Remove line">×</button></div>${it?`<div class="lstock">${esc(it.unit||'pcs')} · average cost now ${money(it.cost||0)}</div>`:''}`; }).join('')}
    <div class="row" style="margin-top:4px"><button class="btn sm" data-act="buyAdd">+ Another item</button><button class="btn sm" data-act="invOpen" data-mode="new" data-back="buy">+ New item</button></div></div>
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <label class="field" style="max-width:240px"><span>Paid from</span><select id="buy-from" data-np data-buy="from">${PAY_FROM.map(([k,n])=>`<option value="${k}"${B.from===k?' selected':''}>${n}</option>`).join('')}</select></label>
      <div class="tot"><span class="grand">Total</span><span class="grand" id="buy-total">${money(tot)}</span></div></div>
    <p class="small muted">Adds the items to stock and records the payment in Accounting (Stock, paid from ${esc(PAY_FROM.find(x=>x[0]===B.from)?.[1]||'cash')}). Enter costs including any GST you paid.</p>
    <div class="row"><button class="btn primary" data-act="buySave">Add to stock</button><button class="btn" data-act="invClose">Cancel</button></div>
  </div></div>`;
}

/* ---------- adjust (count, damaged, lost…) ---------- */
function adjustForm(it){
  if(!it) return '';
  const A=UI.adj||(UI.adj={count:String(+it.qty||0), reason:REASONS[0], memo:''}), diff=r2((+A.count||0)-(+it.qty||0));
  return `<div class="card inv-form"><div class="card-h"><h3>Adjust stock · ${esc(it.name)}</h3><button class="icon" data-act="invClose" aria-label="Close">×</button></div><div class="card-b stack">
    <div class="grid3"><label class="field"><span>In the system</span><input value="${esc(qtyTxt(it.qty,it.unit))}" disabled></label>
      <label class="field"><span>Actual quantity now</span><input id="adj-count" data-np data-adj="count" type="number" step="any" value="${esc(A.count)}"></label>
      <label class="field"><span>Change</span><input id="adj-diff" value="${diff>0?'+':''}${qtyTxt(diff,it.unit)} · ${money(Math.abs(diff)*(+it.cost||0))}" disabled></label></div>
    <div class="grid2"><label class="field"><span>Reason</span><select id="adj-reason" data-np data-adj="reason">${REASONS.map(r=>`<option${r===A.reason?' selected':''}>${esc(r)}</option>`).join('')}</select></label>
      <label class="field"><span>Note (optional)</span><input id="adj-memo" data-np data-adj="memo" value="${esc(A.memo)}"></label></div>
    <p class="small muted">The difference, at average cost, goes to Parts & refrigerant in Accounting (a loss when stock goes down, a gain when it goes up).</p>
    <div class="row"><button class="btn primary" data-act="adjSave" data-id="${it.id}">Save adjustment</button><button class="btn" data-act="invClose">Cancel</button></div>
  </div></div>`;
}

/* ---------- history ---------- */
const TYPE = {bought:['Bought','teal'], used:['Used on invoice','lagoon'], adjust:['Adjusted','coral'], opening:['Opening stock','']};
function historyCard(id){
  const it=id?item(id):null, list=S.stock.filter(m=>!id||m.itemId===id).slice(0,300);
  return `<div class="card inv-form"><div class="card-h"><h3>${it?'History · '+esc(it.name):'Stock history'}</h3><button class="icon" data-act="invClose" aria-label="Close">×</button></div>
    ${list.length?`<div class="tscroll"><table class="t"><thead><tr><th>Date</th>${it?'':'<th>Item</th>'}<th>What</th><th>Reference</th><th class="r">Qty</th><th class="r">Cost each</th><th></th></tr></thead><tbody>
      ${list.map(m=>{ const [t,cl]=TYPE[m.type]||[m.type,''], canDel=m.type!=='used', k='delmv'+(m.billId||m.id);
        return `<tr><td class="nowrap">${fd(m.date)}</td>${it?'':`<td>${esc(m.name||item(m.itemId)?.name||'')}</td>`}<td><span class="pill ${cl}">${t}</span></td>
        <td class="small">${esc([m.ref, m.memo].filter(Boolean).join(' · '))}${m.jobId?` <button class="linkbtn" data-act="gotoJob" data-id="${m.jobId}">Open job</button>`:''}</td>
        <td class="r ${m.qty<0?'neg':''}">${m.qty>0?'+':''}${qtyTxt(m.qty)}</td><td class="r">${money(m.cost||0)}</td>
        <td class="r">${canDel?`<button class="btn sm danger ${UI.confirm===k?'armed':''}" data-act="invDelMove" data-id="${m.id}">${UI.confirm===k?(m.billId?'Tap again: undo the whole bill':'Tap again to undo'):'Undo'}</button>`:''}</td></tr>`; }).join('')}
    </tbody></table></div>`:`<div class="empty"><p>No stock movements yet.</p></div>`}
    <p class="small muted card-b">Items used on an invoice go back into stock when you delete that invoice.</p></div>`;
}

/* ---------- saving ---------- */
export const inventoryForms = {
  invItem(f, dd){ const id=f.dataset.id, at=nowISO();
    const base={name:dd.name, code:dd.code||'', category:dd.category, unit:dd.unit, reorder:+dd.reorder||0, price:r2(dd.price), updatedAt:at};
    if(S.items.some(x=>x.id!==id && String(x.name).trim().toLowerCase()===dd.name.toLowerCase())) return toast('There is already an item with this name.');
    if(id) return run(async()=>{ await F.updateDoc(d('items',id), {...base, active:dd.active!=='0'}); closeForm(); }, 'Item saved');
    const oq=+dd.openQty||0, oc=r2(dd.openCost), nid=newId('items');
    run(async()=>{ const b=F.writeBatch(db);
      b.set(d('items',nid), {...base, qty:oq, cost:oq>0?oc:0, lastCost:oc, active:true, createdAt:at});
      if(oq>0){ const mid=newId('stock'), v=r2(oq*oc);
        b.set(d('stock',mid), {itemId:nid, name:dd.name, type:'opening', qty:oq, cost:oc, date:today(), ref:'Opening', memo:'Already in stock', at, by:myName()});
        if(v>0) b.set(d('ledger','stk-'+mid), {date:today(), at, ref:'STOCK-OPEN', memo:`Opening stock: ${dd.name}`, lines:[{acct:'1200',dr:v},{acct:'3000',cr:v}]}); }
      await b.commit();
      if(UI.inv?.back==='buy'){ const B=buyState(), empty=B.lines.find(l=>!l.itemId); if(empty){ empty.itemId=nid; empty.cost=oc; } else B.lines.push({itemId:nid, qty:1, cost:oc}); UI.inv={mode:'buy'}; render(); }
      else closeForm(); }, 'Item added');
  }
};
function closeForm(){ UI.inv=null; UI.buy=null; UI.adj=null; UI.confirm=''; render(); }

export const inventoryActions = {
  invOpen(el){ const mode=el.dataset.mode, id=el.dataset.id||'';
    if(mode==='buy' && UI.inv?.mode!=='buy') UI.buy=null;
    if(mode==='buy' && UI.inv?.mode==='buy' && id){ const B=buyState(); if(!B.lines.some(l=>l.itemId===id)){ const it=item(id), e=B.lines.find(l=>!l.itemId); if(e){ e.itemId=id; e.cost=+it.lastCost||+it.cost||0; } else B.lines.push({itemId:id, qty:1, cost:+it.lastCost||+it.cost||0}); } }
    if(mode==='adjust') UI.adj=null;
    UI.inv={mode, id, back:el.dataset.back||''}; UI.confirm=''; render(); scrollTo({top:0, behavior:'smooth'}); },
  invClose(){ if(UI.inv?.back==='buy'){ UI.inv={mode:'buy'}; return render(); } closeForm(); },
  invFilter(el){ UI.invf=el.dataset.v; render(); },
  buyAdd(){ buyState().lines.push({itemId:'', qty:1, cost:0}); render(); },
  buyRm(el){ const B=buyState(); B.lines.splice(+el.dataset.i,1); if(!B.lines.length) B.lines.push({itemId:'',qty:1,cost:0}); render(); },
  buySave(el){ const B=buyState(), lines=B.lines.filter(l=>l.itemId && +l.qty>0);
    if(!lines.length) return toast('Choose at least one item and its quantity.');
    if(!B.date) return toast('Choose the date.');
    const ids=[...new Set(lines.map(l=>l.itemId))], billId=newId('stock'), at=nowISO(), total=r2(lines.reduce((a,l)=>a+(+l.qty)*(+l.cost||0),0));
    el.disabled=true;
    run(async()=>{ await F.runTransaction(db, async tx=>{
        const cur={}; for(const id of ids){ const s=await tx.get(d('items',id)); if(!s.exists()) throw new Error('An item on this bill was deleted.'); cur[id]=s.data(); }
        lines.forEach((l,i)=>{ const it=cur[l.itemId], q=+l.qty, cst=r2(l.cost), have=Math.max(0,+it.qty||0);
          // Weighted average cost: what's on the shelf and what's just been bought.
          it.cost = have+q>0 ? r2((have*(+it.cost||0)+q*cst)/(have+q)) : cst; it.qty=r2((+it.qty||0)+q); it.lastCost=cst;
          tx.set(d('stock', i?`${billId}-${i}`:billId), {itemId:l.itemId, name:it.name, type:'bought', qty:q, cost:cst, date:B.date, ref:B.ref||'', memo:B.supplier?`From ${B.supplier}`:'', billId, at, by:myName()}); });
        for(const id of ids) tx.update(d('items',id), {qty:cur[id].qty, cost:cur[id].cost, lastCost:cur[id].lastCost, updatedAt:at});
        if(total>0) tx.set(d('ledger','buy-'+billId), {date:B.date, at, ref:B.ref||('BUY-'+B.date.replace(/-/g,'').slice(2)), memo:`Stock bought${B.supplier?' from '+B.supplier:''}`, lines:[{acct:'1200',dr:total},{acct:B.from,cr:total}]});
      }); closeForm(); }, `Added to stock · ${money(total)} posted to Accounting`).finally(()=>{ el.disabled=false; }); },
  adjSave(el){ const it=item(el.dataset.id), A=UI.adj; if(!it||!A) return;
    const count=+A.count; if(A.count===''||isNaN(count)) return toast('Enter the actual quantity.');
    const diff=r2(count-(+it.qty||0)); if(!diff) return toast('Nothing to change: the quantity is the same.');
    const mid=newId('stock'), at=nowISO(), v=r2(Math.abs(diff)*(+it.cost||0));
    el.disabled=true;
    run(async()=>{ await F.runTransaction(db, async tx=>{
        const s=await tx.get(d('items',it.id)); const now=+s.data().qty||0;
        tx.update(d('items',it.id), {qty:r2(now+diff), updatedAt:at});
        tx.set(d('stock',mid), {itemId:it.id, name:it.name, type:'adjust', qty:diff, cost:+it.cost||0, date:today(), ref:A.reason, memo:A.memo||'', at, by:myName()});
        if(v>0) tx.set(d('ledger','adj-'+mid), {date:today(), at, ref:'STOCK-ADJ', memo:`${A.reason}: ${it.name} ${diff>0?'+':''}${qtyTxt(diff,it.unit)}`,
          lines: diff<0 ? [{acct:'5000',dr:v},{acct:'1200',cr:v}] : [{acct:'1200',dr:v},{acct:'5000',cr:v}]}); });
      closeForm(); }, 'Stock adjusted').finally(()=>{ el.disabled=false; }); },
  invDelItem(el){ const it=item(el.dataset.id), k='delitem'+it.id;
    if(UI.confirm!==k){ UI.confirm=k; return render(); }
    if(+it.qty){ return toast('Adjust the quantity to 0 first, or hide the item instead.'); }
    UI.confirm=''; run(async()=>{ await F.deleteDoc(d('items',it.id)); closeForm(); }, 'Item deleted'); },
  // Undo a purchase (the whole bill), an adjustment or opening stock: quantities, costs and Accounting go back.
  invDelMove(el){ const m=S.stock.find(x=>x.id===el.dataset.id); if(!m) return; const k='delmv'+(m.billId||m.id);
    if(UI.confirm!==k){ UI.confirm=k; return render(); } UI.confirm='';
    const moves=m.billId? S.stock.filter(x=>x.billId===m.billId) : [m], ids=[...new Set(moves.map(x=>x.itemId))];
    run(async()=>{ await F.runTransaction(db, async tx=>{
        const cur={}; for(const id of ids){ const s=await tx.get(d('items',id)); if(s.exists()) cur[id]=s.data(); }
        for(const x of moves){ const it=cur[x.itemId]; if(!it) continue; const left=r2((+it.qty||0)-x.qty);
          if(x.type==='bought' || x.type==='opening'){ const v=(+it.qty||0)*(+it.cost||0)-x.qty*(+x.cost||0); it.cost = left>0 && v>0 ? r2(v/left) : (+it.cost||0); }
          it.qty=left; }
        for(const id of Object.keys(cur)) tx.update(d('items',id), {qty:cur[id].qty, cost:cur[id].cost, updatedAt:nowISO()});
        for(const x of moves) tx.delete(d('stock',x.id));
        if(m.billId) tx.delete(d('ledger','buy-'+m.billId)); else if(m.type==='adjust') tx.delete(d('ledger','adj-'+m.id)); else tx.delete(d('ledger','stk-'+m.id)); });
    }, m.billId?'Bill undone and removed from Accounting':'Undone'); }
};

export const inventoryChange = {
  buyItem(el){ const B=buyState(), i=+el.dataset.buy.split('.')[1], it=item(el.value); B.lines[i].itemId=el.value; if(it) B.lines[i].cost=+it.lastCost||+it.cost||0; render(); }
};

// Typing in the buy and adjust forms: keep the values, update the amounts without a full redraw.
document.addEventListener('input', e=>{ const t=e.target;
  if(t.dataset.input==='invq'){ UI.invq=t.value; render(); return; }
  if(t.dataset.buy && t.tagName!=='SELECT'){ const B=buyState(), p=t.dataset.buy.split('.');
    if(p[0]==='lines'){ B.lines[+p[1]][p[2]]=t.value; const l=B.lines[+p[1]], a=document.querySelector(`[data-buyamt="${p[1]}"]`); if(a) a.textContent=money((+l.qty||0)*(+l.cost||0)); }
    else B[p[0]]=t.value;
    const tot=document.getElementById('buy-total'); if(tot) tot.textContent=money(B.lines.reduce((a,l)=>a+(+l.qty||0)*(+l.cost||0),0)); }
  if(t.dataset.adj && UI.adj){ UI.adj[t.dataset.adj]=t.value; if(t.dataset.adj==='count'){ const it=item(UI.inv?.id), out=document.getElementById('adj-diff');
    if(it && out){ const diff=r2((+t.value||0)-(+it.qty||0)); out.value=`${diff>0?'+':''}${qtyTxt(diff,it.unit)} · ${money(Math.abs(diff)*(+it.cost||0))}`; } } } });
document.addEventListener('change', e=>{ const t=e.target;
  if(t.id==='buy-from' && UI.buy){ UI.buy.from=t.value; render(); }
  if(t.dataset.adj==='reason' && UI.adj) UI.adj.reason=t.value; });
