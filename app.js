(() => {
  "use strict";
  const DB_KEY = "hanout_credit_db_v1";
  const PIN_KEY = "hanout_credit_pin_v1";
  const $ = id => document.getElementById(id);
  const money = n => `${Number(n || 0).toLocaleString("fr-MA",{minimumFractionDigits:2,maximumFractionDigits:2})} DH`;
  const nowISO = () => new Date().toISOString();
  const localDate = iso => new Date(iso).toLocaleString("ar-MA",{dateStyle:"medium",timeStyle:"short"});
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  let db = loadDB(), activeCustomerId = null, currentFilter = "all", toastTimer;
  let editingCustomerId = null;

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return {version:1, customers:[], transactions:[]};
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.customers) || !Array.isArray(parsed.transactions)) throw new Error("invalid");
      return parsed;
    } catch(e) { return {version:1, customers:[], transactions:[]}; }
  }
  function saveDB() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true; }
    catch(e) { showToast("ما قدرناش نحفظو البيانات. فرّغ شوية المساحة ولا صدّر نسخة احتياطية."); return false; }
  }
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`); }
  function escapeHTML(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function balance(customerId) {
    return db.transactions.filter(t => t.customerId === customerId).reduce((sum,t) => sum + (t.type === "credit" ? Number(t.amount) : -Number(t.amount)), 0);
  }
  function getCustomer(id) { return db.customers.find(c => c.id === id); }
  function showToast(message) {
    const el = $("toast"); el.textContent = message; el.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
  }
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }
  function render() {
    $("todayLabel").textContent = new Date().toLocaleDateString("ar-MA",{weekday:"short",day:"numeric",month:"short"});
    const total = db.customers.reduce((sum,c) => sum + Math.max(0,balance(c.id)),0);
    $("totalDebt").textContent = money(total);
    $("customerCount").textContent = db.customers.length;
    $("owingCount").textContent = db.customers.filter(c => balance(c.id) > 0.004).length;
    const paidToday = db.transactions.filter(t => t.type === "payment" && new Date(t.createdAt) >= dayStart).reduce((s,t)=>s+Number(t.amount),0);
    $("todayPayments").textContent = money(paidToday);
    renderCustomers();
  }
  function renderCustomers() {
    const q = $("searchInput").value.trim().toLocaleLowerCase();
    const customers = [...db.customers].filter(c => {
      const b = balance(c.id);
      const matchesFilter = currentFilter === "all" || (currentFilter === "owing" ? b > 0.004 : b <= 0.004);
      return matchesFilter && (`${c.name} ${c.phone||""}`.toLocaleLowerCase().includes(q));
    }).sort((a,b) => a.name.localeCompare(b.name,"ar"));
    const list = $("customerList");
    if (!customers.length) {
      list.innerHTML = `<div class="empty"><strong>${db.customers.length ? "ما لقينا حتى زبون" : "باقي ما زدتي حتى زبون"}</strong>${db.customers.length ? "جرّب تبدّل البحث ولا التصفية." : "زيد أول زبون وبدا سجّل الكريدي ديالو."}</div>`;
      return;
    }
    list.innerHTML = customers.map(c => {
      const b = balance(c.id), txCount = db.transactions.filter(t=>t.customerId===c.id).length;
      return `<button class="customer-card" data-customer="${escapeHTML(c.id)}">
        <span class="avatar">${escapeHTML((c.name||"?").trim().charAt(0))}</span>
        <span class="customer-info"><span class="customer-name">${escapeHTML(c.name)}</span><span class="customer-meta">${escapeHTML(c.phone || "ما كاينش رقم الهاتف")} · ${txCount} عملية</span></span>
        <span class="customer-amount ${b>0.004?"owing":"clear"}">${money(Math.max(0,b))}<br><small>${b>0.004?"باقي عليه":"صافي"}</small></span>
      </button>`;
    }).join("");
    list.querySelectorAll("[data-customer]").forEach(btn => btn.addEventListener("click",()=>openCustomer(btn.dataset.customer)));
  }
  function openCustomer(id) {
    activeCustomerId = id;
    const c = getCustomer(id); if (!c) return;
    $("detailName").textContent = c.name;
    $("detailPhone").textContent = [c.phone,c.notes].filter(Boolean).join(" · ") || "ما كايناش معلومات إضافية";
    $("detailBalance").textContent = money(Math.max(0,balance(id)));
    const txs = db.transactions.filter(t=>t.customerId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    $("detailLedger").innerHTML = txs.length ? txs.map(transactionHTML).join("") : `<div class="empty">مازال ما تسجلات حتى عملية.</div>`;
    openModal("customerDetailModal");
  }
  function transactionHTML(t) {
    const c = getCustomer(t.customerId);
    const isCredit = t.type === "credit";
    return `<div class="ledger-item"><span class="ledger-icon ${t.type}">${isCredit?"＋":"−"}</span><span class="ledger-copy"><span class="ledger-title">${isCredit?"كريدي جديد":"خلاص"}${c ? ` · ${escapeHTML(c.name)}` : ""}</span><span class="ledger-sub">${localDate(t.createdAt)}${t.note ? " · "+escapeHTML(t.note) : ""}</span></span><span class="ledger-amount ${t.type}">${isCredit?"+":"−"}${money(t.amount)}</span></div>`;
  }
  function fillCustomerSelect(preferredId) {
    const select = $("transactionCustomer");
    select.innerHTML = db.customers.length ? db.customers.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)} — ${money(Math.max(0,balance(c.id)))}</option>`).join("") : `<option value="">زيد زبون الأول</option>`;
    if (preferredId && getCustomer(preferredId)) select.value = preferredId;
  }
  function openTransaction(type, customerId) {
    if (!db.customers.length) { showToast("زيد زبون الأول باش تسجّل العملية."); openCustomerForm(); return; }
    fillCustomerSelect(customerId || activeCustomerId);
    const radio = document.querySelector(`input[name="transactionType"][value="${type||"credit"}"]`); if(radio) radio.checked=true;
    $("transactionAmount").value=""; $("transactionNote").value=""; $("transactionWarning").classList.add("hidden");
    closeModal("customerDetailModal"); openModal("transactionModal");
  }
  function openCustomerForm(customer=null) {
    editingCustomerId = customer ? customer.id : null;
    $("customerModalTitle").textContent = customer ? "تعديل معلومات الزبون" : "زيد زبون جديد";
    $("customerName").value = customer?.name || ""; $("customerPhone").value=customer?.phone||""; $("customerNotes").value=customer?.notes||"";
    openModal("customerModal");
  }
  $("addCustomerOpen").addEventListener("click",()=>openCustomerForm());
  $("addTransactionOpen").addEventListener("click",()=>openTransaction("credit"));
  $("customerForm").addEventListener("submit",e=>{
    e.preventDefault();
    const name=$("customerName").value.trim(); if(!name) return;
    const phone=$("customerPhone").value.trim(), notes=$("customerNotes").value.trim();
    if(editingCustomerId) {
      const c=getCustomer(editingCustomerId); if(c) Object.assign(c,{name,phone,notes,updatedAt:nowISO()});
      showToast("تبدلات معلومات الزبون.");
    } else {
      db.customers.push({id:uid(),name,phone,notes,createdAt:nowISO()}); showToast("تزاد الزبون بنجاح.");
    }
    saveDB(); closeModal("customerModal"); render();
  });
  $("transactionForm").addEventListener("submit",e=>{
    e.preventDefault();
    const customerId=$("transactionCustomer").value, amount=Number($("transactionAmount").value);
    const type=document.querySelector('input[name="transactionType"]:checked')?.value || "credit";
    const note=$("transactionNote").value.trim();
    if(!getCustomer(customerId) || !Number.isFinite(amount) || amount<=0) { showToast("دخل معلومات صحيحة."); return; }
    if(type==="payment" && amount-balance(customerId)>0.004) {
      $("transactionWarning").textContent=`الخلاص أكبر من الدين الحالي (${money(Math.max(0,balance(customerId)))}). تأكد من المبلغ.`;
      $("transactionWarning").classList.remove("hidden"); return;
    }
    db.transactions.push({id:uid(),customerId,type,amount:Math.round(amount*100)/100,note,createdAt:nowISO()});
    saveDB(); closeModal("transactionModal"); render(); showToast(type==="credit"?"تسجّل الكريدي.":"تسجّل الخلاص.");
    if($("customerDetailModal").classList.contains("hidden")===false) openCustomer(customerId);
  });
  $("detailCreditBtn").addEventListener("click",()=>openTransaction("credit",activeCustomerId));
  $("detailPaymentBtn").addEventListener("click",()=>openTransaction("payment",activeCustomerId));
  $("editCustomerBtn").addEventListener("click",()=>{const c=getCustomer(activeCustomerId);closeModal("customerDetailModal");if(c)openCustomerForm(c);});
  $("deleteCustomerBtn").addEventListener("click",()=>{
    const c=getCustomer(activeCustomerId); if(!c)return;
    if(!confirm(`واش متأكد بغيتي تحذف ${c.name} وجميع العمليات ديالو؟ هاد العملية ما كتترجعش.`)) return;
    db.customers=db.customers.filter(x=>x.id!==activeCustomerId);
    db.transactions=db.transactions.filter(t=>t.customerId!==activeCustomerId);
    saveDB();closeModal("customerDetailModal");render();showToast("تحذف الزبون والحساب ديالو.");
  });
  $("searchInput").addEventListener("input",renderCustomers);
  document.querySelectorAll(".filter").forEach(btn=>btn.addEventListener("click",()=>{
    currentFilter=btn.dataset.filter;document.querySelectorAll(".filter").forEach(b=>b.classList.toggle("active",b===btn));renderCustomers();
  }));
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(backdrop=>backdrop.addEventListener("click",e=>{if(e.target===backdrop)closeModal(backdrop.id);}));
  $("historyNav").addEventListener("click",()=>{
    const txs=[...db.transactions].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
    $("allHistory").innerHTML=txs.length?txs.map(transactionHTML).join(""):`<div class="empty">مازال ما تسجلات حتى عملية.</div>`;
    openModal("historyModal");
  });
  $("backupNav").addEventListener("click",()=>document.querySelector(".tools-panel").scrollIntoView({behavior:"smooth",block:"center"}));
  $("homeNav").addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
  $("exportBtn").addEventListener("click",()=>{
    const payload={app:"Hanout Credit",version:1,exportedAt:nowISO(),data:db};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), a=document.createElement("a");a.href=url;a.download=`hanout-credit-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);showToast("وجدنا ليك نسخة احتياطية.");
  });
  $("importFile").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try {
      const parsed=JSON.parse(await file.text()), next=parsed.data||parsed;
      if(!Array.isArray(next.customers)||!Array.isArray(next.transactions))throw new Error("invalid");
      const ids=new Set(next.customers.map(c=>c.id));
      if(next.transactions.some(t=>!ids.has(t.customerId)||!["credit","payment"].includes(t.type)||!Number.isFinite(Number(t.amount))||Number(t.amount)<=0))throw new Error("invalid");
      if(!confirm(`غادي نعوضو البيانات الحالية بـ ${next.customers.length} زبون. واش متأكد؟ صدّر نسخة من البيانات الحالية قبل الاسترجاع إلا محتاجها.`))return;
      db={version:1,customers:next.customers,transactions:next.transactions};saveDB();render();showToast("ترجعات النسخة الاحتياطية.");
    } catch(err){showToast("هاد الملف ماشي نسخة صحيحة ديال Hanout Credit.");}
    finally{e.target.value="";}
  });
  $("lockBtn").addEventListener("click",()=>{const existing=localStorage.getItem(PIN_KEY);if(existing){document.body.classList.add("app-locked");$("lockScreen").classList.remove("hidden");}else openModal("pinModal");});
  $("pinForm").addEventListener("submit",async e=>{
    e.preventDefault();const pin=$("pinInput").value;
    if(!/^\d{4,8}$/.test(pin)){showToast("الرمز خاصو يكون بين 4 و8 أرقام.");return;}
    localStorage.setItem(PIN_KEY,await hashPin(pin));closeModal("pinModal");$("pinInput").value="";showToast("تفعّل رمز PIN.");
  });
  $("disablePinBtn").addEventListener("click",()=>{if(confirm("واش متأكد بغيتي تعطل رمز PIN؟")){localStorage.removeItem(PIN_KEY);closeModal("pinModal");showToast("تعطّل رمز PIN.");}});
  async function hashPin(pin){const data=new TextEncoder().encode(pin);const hash=await crypto.subtle.digest("SHA-256",data);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");}
  $("unlockForm").addEventListener("submit",async e=>{
    e.preventDefault();const pin=$("unlockPin").value, hash=await hashPin(pin);
    if(hash===localStorage.getItem(PIN_KEY)){$("lockScreen").classList.add("hidden");$("unlockError").textContent="";$("unlockPin").value="";}
    else $("unlockError").textContent="الرمز ماشي صحيح. عاود جرّب.";
  });
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }
  render();
})();