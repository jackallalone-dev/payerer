const STORE_KEY = "payment-schedule-v1";

const COLOR_POOL = ["#c2452d","#1155cc","#b07800","#6a3fb5","#0e7a8a","#8a2d5e",
                    "#2d7a2d","#a4442f","#3358a0","#7a5c00","#555555","#00707a"];

const fmt = n => n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const prettyDate = s => {
  const d = new Date(s + "T00:00:00");
  return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`;
};
const newId = () => "c" + Date.now() + Math.random().toString(36).slice(2,6);

/* ---------- state + persistence ---------- */
let items = [];
let storageOK = true;

function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ items = JSON.parse(raw); return; }
  }catch(e){ storageOK = false; }
  items = [];
}
function save(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  }catch(e){ storageOK = false; }
}

/* ---------- lender colors ---------- */
function lenderColors(){
  const map = {};
  let i = 0;
  for(const it of items){
    if(!(it.lender in map)){
      map[it.lender] = COLOR_POOL[i % COLOR_POOL.length];
      i++;
    }
  }
  return map;
}

/* ---------- render ---------- */
function render(){
  const colors = lenderColors();

  buildLenderDropdown();

  const main = document.getElementById("schedule");
  main.innerHTML = "";

  if(items.length === 0){
    main.innerHTML = `<div class="empty">No payments yet.<br>Tap <strong>+ Add payment</strong>, or import a .txt file from Settings.</div>`;
    refreshTotals();
    return;
  }

  const sorted = [...items].sort((a,b)=> a.date.localeCompare(b.date) || a.lender.localeCompare(b.lender));
  const byMonth = new Map();
  for(const it of sorted){
    const mk = it.date.slice(0,7);
    if(!byMonth.has(mk)) byMonth.set(mk,new Map());
    const m = byMonth.get(mk);
    if(!m.has(it.date)) m.set(it.date,[]);
    m.get(it.date).push(it);
  }

  for(const [mk, dates] of byMonth){
    const [y,m] = mk.split("-").map(Number);
    let mTotal = 0;
    dates.forEach(list => list.forEach(p => mTotal += p.amount));

    const sec = document.createElement("section");
    sec.className = "month";
    sec.innerHTML = `<div class="month-head">
        <h2>${MONTHS[m-1]} ${y}</h2>
        <span class="mtotal">₱${fmt(mTotal)}</span>
      </div>`;

    for(const [dateStr, list] of dates){
      const d = new Date(dateStr + "T00:00:00");
      const g = document.createElement("div");
      g.className = "dategroup";
      const dRemaining = list.reduce((s,p)=>s+(p.paid?0:p.amount),0);
      g.innerHTML = `<div class="datecol">
          <span class="day">${d.getDate()}</span>
          <span class="dow">${DOW[d.getDay()]}</span>
        </div>
        <div class="payments">
          ${list.map(p=>`
            <div class="paywrap" data-id="${p.id}">
              <div class="swipe-bg delete">Delete</div>
              <div class="swipe-bg edit">Edit</div>
              <div class="pay ${p.paid?'done':''}">
                <input type="checkbox" data-id="${p.id}" ${p.paid?'checked':''} aria-label="Mark paid">
                <span class="lender" style="color:${colors[p.lender]}">${p.lender}</span>
                <span class="amt">₱${fmt(p.amount)}</span>
              </div>
            </div>`).join("")}
        </div>
        ${list.length>1 ? `<div class="datetotal" data-date="${dateStr}">Remaining ₱${fmt(dRemaining)}</div>` : ""}`;
      sec.appendChild(g);
    }
    main.appendChild(sec);
  }

  refreshTotals();
  if(location.hash === "#overview") renderOverview();
}

function buildLenderDropdown(){
  const colors = lenderColors();
  const sel = document.getElementById("fLender");
  const prev = sel.value;
  sel.innerHTML = "";
  for(const name of Object.keys(colors)){
    const o = document.createElement("option");
    o.value = o.textContent = name;
    sel.appendChild(o);
  }
  const other = document.createElement("option");
  other.value = "__new__";
  other.textContent = "+ New lender…";
  sel.appendChild(other);
  if([...sel.options].some(o=>o.value===prev)) sel.value = prev;
}

function refreshTotals(){
  const grandTotal = items.reduce((s,p)=>s+p.amount,0);
  const paid = items.filter(p=>p.paid).reduce((s,p)=>s+p.amount,0);
  document.getElementById("grand").textContent = "₱" + fmt(grandTotal);
  document.getElementById("paid").textContent = "₱" + fmt(paid);
  document.getElementById("remaining").textContent = "₱" + fmt(grandTotal - paid);
  const unpaidCount = items.filter(p=>!p.paid).length;
  document.getElementById("count").textContent = `${unpaidCount}/${items.length}`;
}

function refreshDateRemaining(dateStr){
  const el = document.querySelector(`.datetotal[data-date="${dateStr}"]`);
  if(!el) return;
  const rem = items.filter(p=>p.date===dateStr && !p.paid).reduce((s,p)=>s+p.amount,0);
  el.textContent = `Remaining ₱${fmt(rem)}`;
}

/* ---------- checkbox ---------- */
document.getElementById("schedule").addEventListener("change", e=>{
  if(e.target.matches("input[type=checkbox]")){
    const item = items.find(p=>p.id===e.target.dataset.id);
    item.paid = e.target.checked;
    e.target.closest(".pay").classList.toggle("done", e.target.checked);
    save();
    refreshTotals();
    refreshDateRemaining(item.date);
  }
});

/* ---------- swipe gestures ---------- */
const SWIPE_TRIGGER = 72;
const SWIPE_MAX = 110;
let sw = null;

document.getElementById("schedule").addEventListener("pointerdown", e=>{
  const wrap = e.target.closest(".paywrap");
  if(!wrap) return;
  if(e.target.matches("input[type=checkbox]")) return;
  sw = {
    wrap,
    row: wrap.querySelector(".pay"),
    id: wrap.dataset.id,
    startX: e.clientX,
    startY: e.clientY,
    dragging: false,
    pointerId: e.pointerId
  };
  sw.row.classList.remove("snap");
});

document.getElementById("schedule").addEventListener("pointermove", e=>{
  if(!sw || e.pointerId !== sw.pointerId) return;
  const dx = e.clientX - sw.startX;
  const dy = e.clientY - sw.startY;

  if(!sw.dragging){
    if(Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)){
      sw.dragging = true;
      sw.row.setPointerCapture(e.pointerId);
    }else if(Math.abs(dy) > 12){
      sw = null;
      return;
    }else{
      return;
    }
  }

  e.preventDefault();
  const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
  sw.dx = clamped;
  sw.row.style.transform = `translateX(${clamped}px)`;
  sw.wrap.classList.toggle("show-delete", clamped > 12);
  sw.wrap.classList.toggle("show-edit", clamped < -12);
});

function endSwipe(e){
  if(!sw || (e && e.pointerId !== sw.pointerId)) return;
  const s = sw;
  sw = null;

  const dx = s.dx || 0;
  s.row.classList.add("snap");
  s.row.style.transform = "translateX(0)";
  setTimeout(()=>{ s.wrap.classList.remove("show-delete","show-edit"); }, 180);

  if(!s.dragging) return;
  suppressClick = true;
  setTimeout(()=>{ suppressClick = false; }, 300);

  if(dx >= SWIPE_TRIGGER){
    openDeleteDialog(s.id);
  }else if(dx <= -SWIPE_TRIGGER){
    openPayDialog("edit", s.id);
  }
}
document.getElementById("schedule").addEventListener("pointerup", endSwipe);
document.getElementById("schedule").addEventListener("pointercancel", endSwipe);

let suppressClick = false;
document.getElementById("schedule").addEventListener("click", e=>{
  if(suppressClick){
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

/* ---------- delete dialog + undo toast ---------- */
const deleteDialog = document.getElementById("deleteDialog");
let pendingDelete = null;
let lastDeleted = null;
let toastTimer = null;

function openDeleteDialog(id){
  pendingDelete = items.find(p=>p.id===id);
  if(!pendingDelete) return;
  document.getElementById("delsummary").innerHTML =
    `<strong>${pendingDelete.lender}</strong><br>` +
    `₱${fmt(pendingDelete.amount)} · due ${prettyDate(pendingDelete.date)}`;
  deleteDialog.showModal();
}

document.getElementById("cancelDelete").addEventListener("click", ()=>{
  pendingDelete = null;
  deleteDialog.close();
});

document.getElementById("confirmDelete").addEventListener("click", ()=>{
  if(!pendingDelete) return;
  lastDeleted = pendingDelete;
  items = items.filter(p=>p.id!==pendingDelete.id);
  pendingDelete = null;
  deleteDialog.close();
  save();
  render();
  showToast(`Deleted ${lastDeleted.lender} ₱${fmt(lastDeleted.amount)}`);
});

function showToast(msg, withUndo = true){
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  document.getElementById("undoBtn").style.display = withUndo ? "" : "none";
  if(typeof toast.showPopover === "function"){
    try{ toast.showPopover(); }catch(e){}
  }
  requestAnimationFrame(()=> toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 7000);
}
function hideToast(){
  const toast = document.getElementById("toast");
  toast.classList.remove("show");
  setTimeout(()=>{
    if(typeof toast.hidePopover === "function"){
      try{ toast.hidePopover(); }catch(e){}
    }
  }, 260);
  lastDeleted = null;
}

document.getElementById("undoBtn").addEventListener("click", ()=>{
  if(lastDeleted){
    items.push(...(Array.isArray(lastDeleted) ? lastDeleted : [lastDeleted]));
    save();
    render();
  }
  clearTimeout(toastTimer);
  hideToast();
});

/* ---------- add / edit dialog ---------- */
const payDialog = document.getElementById("payDialog");
let editingId = null;

function updateRepeatVisibility(){
  const repeat = document.getElementById("fRepeat").value;
  const endType = document.getElementById("fEndType").value;
  const recurring = repeat !== "none";
  document.getElementById("secondDayField").style.display = repeat === "twice" ? "flex" : "none";
  document.getElementById("endTypeField").style.display = recurring ? "flex" : "none";
  document.getElementById("endCountField").style.display = recurring && endType === "count" ? "flex" : "none";
  document.getElementById("endDateField").style.display = recurring && endType === "date" ? "flex" : "none";
}
document.getElementById("fRepeat").addEventListener("change", updateRepeatVisibility);
document.getElementById("fEndType").addEventListener("change", updateRepeatVisibility);

/* Build the list of due dates for a recurring payment. Day-of-month anchors
   are clamped to the last day of shorter months (e.g. 31 → Feb 28). */
const MAX_RECURRING = 120;
function buildRecurringDates(startISO, repeat, secondDay, endType, endCount, endISO){
  const [sy, sm, sd] = startISO.split("-").map(Number);
  const anchors = repeat === "twice" ? [sd, secondDay] : [sd];
  const limit = endType === "count" ? Math.min(endCount, MAX_RECURRING) : MAX_RECURRING;
  const dates = [];
  for(let k = 0; ; k++){
    const y = sy + Math.floor((sm - 1 + k) / 12);
    const m = (sm - 1 + k) % 12;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const monthDates = [...new Set(anchors.map(d => Math.min(d, lastDay)))]
      .sort((a,b)=>a-b)
      .map(d => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    for(const ds of monthDates){
      if(ds < startISO) continue;
      if(endType === "date" && ds > endISO) return dates;
      dates.push(ds);
      if(dates.length >= limit) return dates;
    }
  }
}

function openPayDialog(mode, id){
  buildLenderDropdown();
  clearForm();
  const isEdit = mode === "edit";
  document.getElementById("repeatField").style.display = isEdit ? "none" : "flex";
  if(isEdit){
    const item = items.find(p=>p.id===id);
    if(!item) return;
    editingId = id;
    document.getElementById("payDialogTitle").textContent = "Edit payment";
    document.getElementById("savePay").textContent = "Save changes";
    document.getElementById("fLender").value = item.lender;
    document.getElementById("fDate").value = item.date;
    document.getElementById("fAmount").value = item.amount;
  }else{
    editingId = null;
    document.getElementById("payDialogTitle").textContent = "Add a payment";
    document.getElementById("savePay").textContent = "Save payment";
  }
  payDialog.showModal();
}

document.getElementById("openAdd").addEventListener("click", ()=> openPayDialog("add"));
document.getElementById("cancelPay").addEventListener("click", ()=> payDialog.close());

document.getElementById("fLender").addEventListener("change", e=>{
  document.getElementById("newLenderField").style.display =
    e.target.value === "__new__" ? "flex" : "none";
});

function clearForm(){
  document.getElementById("fNewLender").value = "";
  document.getElementById("fDate").value = "";
  document.getElementById("fAmount").value = "";
  document.getElementById("fRepeat").value = "none";
  document.getElementById("fSecondDay").value = "";
  document.getElementById("fEndType").value = "count";
  document.getElementById("fEndCount").value = "";
  document.getElementById("fEndDate").value = "";
  updateRepeatVisibility();
  document.getElementById("formerr").style.display = "none";
  document.getElementById("newLenderField").style.display = "none";
  const sel = document.getElementById("fLender");
  if(sel.options.length) sel.selectedIndex = 0;
  document.getElementById("newLenderField").style.display =
    sel.value === "__new__" ? "flex" : "none";
}

document.getElementById("savePay").addEventListener("click", ()=>{
  const sel = document.getElementById("fLender").value;
  const lender = sel === "__new__"
    ? document.getElementById("fNewLender").value.trim()
    : sel;
  const date = document.getElementById("fDate").value;
  const amount = parseFloat(document.getElementById("fAmount").value);

  const err = document.getElementById("formerr");
  if(!lender){ err.textContent = "Enter a name for the new lender."; err.style.display="block"; return; }
  if(!date){ err.textContent = "Pick a due date."; err.style.display="block"; return; }
  if(!(amount > 0)){ err.textContent = "Enter an amount greater than zero."; err.style.display="block"; return; }

  if(editingId){
    const item = items.find(p=>p.id===editingId);
    item.lender = lender;
    item.date = date;
    item.amount = amount;
    editingId = null;
  }else{
    const repeat = document.getElementById("fRepeat").value;
    if(repeat === "none"){
      items.push({ id:newId(), lender, date, amount, paid:false });
    }else{
      const secondDay = parseInt(document.getElementById("fSecondDay").value, 10);
      const endType = document.getElementById("fEndType").value;
      const endCount = parseInt(document.getElementById("fEndCount").value, 10);
      const endDate = document.getElementById("fEndDate").value;

      if(repeat === "twice" && !(secondDay >= 1 && secondDay <= 31)){
        err.textContent = "Enter a day of month (1–31) for the 2nd payment.";
        err.style.display = "block"; return;
      }
      if(endType === "count" && !(endCount >= 1)){
        err.textContent = "Enter how many payments to add.";
        err.style.display = "block"; return;
      }
      if(endType === "count" && endCount > MAX_RECURRING){
        err.textContent = `That's too many payments — the limit is ${MAX_RECURRING}.`;
        err.style.display = "block"; return;
      }
      if(endType === "date" && !endDate){
        err.textContent = "Pick an end date for the repeating payment.";
        err.style.display = "block"; return;
      }
      if(endType === "date" && endDate < date){
        err.textContent = "The end date must be on or after the due date.";
        err.style.display = "block"; return;
      }

      const dates = buildRecurringDates(date, repeat, secondDay, endType, endCount, endDate);
      for(const ds of dates){
        items.push({ id:newId(), lender, date:ds, amount, paid:false });
      }
      showToast(`Added ${dates.length} payment${dates.length===1?"":"s"} for ${lender}`, false);
    }
  }
  save();
  render();
  payDialog.close();
});

/* ---------- theme ---------- */
const THEME_KEY = "payment-schedule-theme";
const themeSelect = document.getElementById("themeSelect");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

function applyTheme(){
  let pref = "system";
  try{ pref = localStorage.getItem(THEME_KEY) || "system"; }catch(e){}
  const dark = pref === "dark" || (pref === "system" && systemDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  themeSelect.value = pref;
  /* keep the browser/status bar the same color as the app background */
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
  if(themeColorMeta && paper) themeColorMeta.setAttribute("content", paper);
}
themeSelect.addEventListener("change", ()=>{
  try{ localStorage.setItem(THEME_KEY, themeSelect.value); }catch(e){}
  applyTheme();
});
systemDark.addEventListener("change", applyTheme);
applyTheme();

/* ---------- custom title ---------- */
const TITLE_KEY = "payment-schedule-title";
const DEFAULT_TITLE = "Payment Schedule";
const titleInput = document.getElementById("titleInput");

function applyTitle(){
  let raw = "";
  try{ raw = localStorage.getItem(TITLE_KEY) || ""; }catch(e){}
  const title = (raw.trim() || DEFAULT_TITLE).slice(0,30);
  document.getElementById("pageTitle").textContent = title;
  document.title = title;
  if(document.activeElement !== titleInput) titleInput.value = raw;
}
titleInput.addEventListener("input", ()=>{
  try{ localStorage.setItem(TITLE_KEY, titleInput.value.slice(0,30)); }catch(e){}
  applyTitle();
});
// pointerdown (not click): on mobile the input's blur would hide the
// button before a click event could fire
document.getElementById("titleDone").addEventListener("pointerdown", e=>{
  e.preventDefault();
  titleInput.blur();
});
applyTitle();

/* ---------- super secret settings ---------- */
const SECRET_KEY = "payment-schedule-secret";
const secretToggle = document.getElementById("secretToggle");

const NORMAL_LABELS = {
  lblGrand:"Total owed", lblPaid:"Paid so far",
  lblRemaining:"Remaining", lblCount:"Payments"
};
const SECRET_LABELS = {
  lblGrand:"STOP RIGHT THERE!", lblPaid:"IS THIS ALL YOU GOT?!",
  lblRemaining:"BRING ME DOWN!", lblCount:"0 IS BETTER THAN 1"
};

function secretOn(){
  try{ return localStorage.getItem(SECRET_KEY) === "1"; }catch(e){ return false; }
}

function applySecret(){
  const on = secretOn();
  const labels = on ? SECRET_LABELS : NORMAL_LABELS;
  for(const id in labels) document.getElementById(id).textContent = labels[id];
  const addBtn = document.getElementById("openAdd");
  addBtn.textContent = on ? "× Don't Click Me" : "+ Add payment";
  addBtn.classList.toggle("danger", on);
  secretToggle.checked = on;
}

secretToggle.addEventListener("change", ()=>{
  try{ localStorage.setItem(SECRET_KEY, secretToggle.checked ? "1" : "0"); }catch(e){}
  applySecret();
});

/* ---------- settings: import / export ---------- */
const settingsDialog = document.getElementById("settingsDialog");
const setmsg = document.getElementById("setmsg");

document.getElementById("openSettings").addEventListener("click", ()=>{
  setmsg.className = "setmsg";
  setmsg.textContent = "";
  document.getElementById("exportText").style.display = "none";
  document.getElementById("pasteFallback").style.display = "none";
  document.getElementById("importPasteArea").value = "";
  settingsDialog.showModal();
  // dialogs auto-focus their first field; keep the keyboard closed
  if(document.activeElement) document.activeElement.blur();
});
document.getElementById("closeSettings").addEventListener("click", ()=> settingsDialog.close());

document.getElementById("importBtn").addEventListener("click", ()=>{
  document.getElementById("importFile").click();
});

function doImport(text){
  try{
    const parsed = parseImport(text);
    items = parsed.map(r=>({
      id:newId(),
      lender:r.lender, date:r.date, amount:r.amount, paid:false
    }));
    save();
    render();
    settingsDialog.close();
    showToast(`Import completed — ${items.length} payments`, false);
    return true;
  }catch(err){
    setmsg.className = "setmsg bad";
    setmsg.textContent = "Import failed: " + err.message;
    return false;
  }
}

document.getElementById("importFile").addEventListener("change", e=>{
  const file = e.target.files[0];
  e.target.value = "";
  if(!file) return;

  const reader = new FileReader();
  reader.onload = () => doImport(reader.result);
  reader.onerror = () => {
    setmsg.className = "setmsg bad";
    setmsg.textContent = "Import failed: could not read the file.";
  };
  reader.readAsText(file);
});

document.getElementById("pasteImportBtn").addEventListener("click", async ()=>{
  let text = "";
  try{ text = await navigator.clipboard.readText(); }catch(e){}
  if(text && text.trim()){
    doImport(text);
  }else{
    // clipboard is blocked or empty: let the user paste manually
    document.getElementById("pasteFallback").style.display = "block";
    setmsg.className = "setmsg bad";
    setmsg.textContent = "Couldn't read the clipboard — paste your data below instead.";
    document.getElementById("importPasteArea").focus();
  }
});

document.getElementById("importPastedBtn").addEventListener("click", ()=>{
  const text = document.getElementById("importPasteArea").value;
  if(!text.trim()){
    setmsg.className = "setmsg bad";
    setmsg.textContent = "Paste your data into the box first.";
    return;
  }
  doImport(text);
});

function parseImport(text){
  let data;
  try{
    // convert single-quoted entries to valid JSON
    data = JSON.parse(text.trim().replace(/'/g, '"'));
  }catch(e){
    throw new Error("the data is not in the expected format.");
  }
  if(!Array.isArray(data) || data.length === 0)
    throw new Error("no payment entries found.");

  return data.map((row,i)=>{
    if(!Array.isArray(row) || row.length < 3)
      throw new Error(`entry ${i+1} is not [lender, date, amount].`);
    const lender = String(row[0]).trim();
    const dateRaw = String(row[1]).trim();
    const amount = Number(row[2]);
    const m = dateRaw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if(!lender) throw new Error(`entry ${i+1} has an empty lender name.`);
    if(!m) throw new Error(`entry ${i+1} date "${dateRaw}" is not MM-DD-YYYY.`);
    if(!(amount > 0)) throw new Error(`entry ${i+1} amount is not a positive number.`);
    return { lender, date:`${m[3]}-${m[1]}-${m[2]}`, amount };
  });
}

function exportString(){
  const sorted = [...items].sort((a,b)=> a.date.localeCompare(b.date) || a.lender.localeCompare(b.lender));
  const body = sorted.map(p=>{
    const [y,m,d] = p.date.split("-");
    return `['${p.lender}', '${m}-${d}-${y}', ${p.amount}]`;
  }).join(", ");
  return "[" + body + "]";
}

document.getElementById("exportBtn").addEventListener("click", ()=>{
  if(items.length === 0){
    setmsg.className = "setmsg bad";
    setmsg.textContent = "Nothing to export yet.";
    return;
  }
  const blob = new Blob([exportString()], {type:"text/plain"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "payment-data.txt";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Export completed — ${items.length} payments`, false);
});

document.getElementById("copyBtn").addEventListener("click", async ()=>{
  if(items.length === 0){
    setmsg.className = "setmsg bad";
    setmsg.textContent = "Nothing to export yet.";
    return;
  }
  const text = exportString();
  let ok = false;
  try{
    await navigator.clipboard.writeText(text);
    ok = true;
  }catch(e){
    // fallback for environments without clipboard permission
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try{ ok = document.execCommand("copy"); }catch(e2){}
    ta.remove();
  }
  if(ok){
    showToast(`Copied ${items.length} payments to clipboard`, false);
  }else{
    // clipboard is blocked: show the data for manual copying
    const ta2 = document.getElementById("exportText");
    ta2.value = text;
    ta2.style.display = "block";
    ta2.focus();
    ta2.select();
    setmsg.className = "setmsg bad";
    setmsg.textContent = "Clipboard is blocked here — select the text above and copy it manually.";
  }
});

/* ---------- overview page ---------- */
const overviewPage = document.getElementById("overviewPage");
const ovSearch = document.getElementById("ovSearch");
const ovLender = document.getElementById("ovLender");
const ovStatus = document.getElementById("ovStatus");
const ovSort = document.getElementById("ovSort");
const ovDir = document.getElementById("ovDir");
const ovDelete = document.getElementById("ovDelete");
let ovAsc = true;
let ovFromButton = false;
let ovSelectMode = false;
const ovSelected = new Set();

function setSelectMode(on){
  ovSelectMode = on;
  ovSelected.clear();
  overviewPage.classList.toggle("selecting", on);
  ovDelete.classList.toggle("confirm", on);
  const label = on ? "Delete selected payments" : "Select payments to delete";
  ovDelete.title = label;
  ovDelete.setAttribute("aria-label", label);
  if(overviewOpen()) renderOverview();
}

ovDelete.addEventListener("click", ()=>{
  if(!ovSelectMode){
    setSelectMode(true);
    return;
  }
  if(ovSelected.size === 0){
    setSelectMode(false);
    return;
  }
  const deleted = items.filter(p=>ovSelected.has(p.id));
  items = items.filter(p=>!ovSelected.has(p.id));
  setSelectMode(false);
  save();
  render();
  lastDeleted = deleted;
  showToast(`Deleted ${deleted.length} payment${deleted.length===1?"":"s"}`);
});

document.getElementById("ovSelectAll").addEventListener("click", ()=>{
  const ids = [...document.querySelectorAll("#overviewList .ov-row")].map(r=>r.dataset.id);
  const allSelected = ids.length > 0 && ids.every(id=>ovSelected.has(id));
  if(allSelected) ids.forEach(id=>ovSelected.delete(id));
  else ids.forEach(id=>ovSelected.add(id));
  renderOverview();
});

function overviewOpen(){ return location.hash === "#overview"; }

function updateView(){
  const on = overviewOpen();
  document.querySelector("header").style.display = on ? "none" : "";
  document.getElementById("schedule").style.display = on ? "none" : "";
  overviewPage.style.display = on ? "" : "none";
  if(on) renderOverview();
  else{
    ovFromButton = false;
    if(ovSelectMode) setSelectMode(false);
  }
}
window.addEventListener("hashchange", updateView);

document.getElementById("openOverview").addEventListener("click", ()=>{
  ovFromButton = true;
  location.hash = "overview";
});
document.getElementById("closeOverview").addEventListener("click", ()=>{
  // prefer back() so the browser history stays clean, but only when the
  // overview was entered from within the app
  if(ovFromButton) history.back();
  else location.hash = "";
});

function buildOvLenderDropdown(){
  const prev = ovLender.value;
  ovLender.innerHTML = `<option value="">All lenders</option>`;
  for(const name of Object.keys(lenderColors())){
    const o = document.createElement("option");
    o.value = o.textContent = name;
    ovLender.appendChild(o);
  }
  if([...ovLender.options].some(o=>o.value===prev)) ovLender.value = prev;
}

function renderOverview(){
  buildOvLenderDropdown();
  const colors = lenderColors();
  const q = ovSearch.value.trim().toLowerCase();

  const list = items.filter(p =>
    (!q || p.lender.toLowerCase().includes(q)) &&
    (!ovLender.value || p.lender === ovLender.value) &&
    (ovStatus.value === "all" || (ovStatus.value === "paid") === !!p.paid)
  );

  const dir = ovAsc ? 1 : -1;
  const key = ovSort.value;
  list.sort((a,b)=>{
    let c = 0;
    if(key === "amount") c = a.amount - b.amount;
    else if(key === "lender") c = a.lender.localeCompare(b.lender);
    else if(key === "status") c = (a.paid?1:0) - (b.paid?1:0);
    return dir * (c || a.date.localeCompare(b.date)) || a.lender.localeCompare(b.lender);
  });

  const total = list.reduce((s,p)=>s+p.amount,0);
  const rem = list.reduce((s,p)=>s+(p.paid?0:p.amount),0);
  document.getElementById("ovStats").textContent = list.length
    ? `${list.length} payment${list.length===1?"":"s"} · ₱${fmt(total)} total · ₱${fmt(rem)} remaining`
    : "";

  const box = document.getElementById("overviewList");
  if(list.length === 0){
    box.innerHTML = `<div class="empty">${items.length ? "No payments match these filters." : "No payments yet."}</div>`;
    return;
  }
  box.innerHTML = list.map(p=>`
    <div class="ov-row ${p.paid?'done':''} ${ovSelectMode && ovSelected.has(p.id)?'sel':''}" data-id="${p.id}">
      <input type="checkbox" data-id="${p.id}" ${(ovSelectMode ? ovSelected.has(p.id) : p.paid)?'checked':''} aria-label="${ovSelectMode?'Select for deletion':'Mark paid'}">
      <div class="ov-main">
        <span class="lender" style="color:${colors[p.lender]}">${p.lender}</span>
        <span class="ov-date">${prettyDate(p.date)}</span>
      </div>
      <span class="amt">₱${fmt(p.amount)}</span>
    </div>`).join("");
}

ovSearch.addEventListener("input", renderOverview);
ovLender.addEventListener("change", renderOverview);
ovStatus.addEventListener("change", renderOverview);
ovSort.addEventListener("change", renderOverview);
ovDir.addEventListener("click", ()=>{
  ovAsc = !ovAsc;
  ovDir.textContent = ovAsc ? "↑ Ascending" : "↓ Descending";
  renderOverview();
});

function toggleSelected(id){
  if(ovSelected.has(id)) ovSelected.delete(id);
  else ovSelected.add(id);
  renderOverview();
}

document.getElementById("overviewList").addEventListener("change", e=>{
  if(!e.target.matches("input[type=checkbox]")) return;
  if(ovSelectMode){
    toggleSelected(e.target.dataset.id);
    return;
  }
  const item = items.find(p=>p.id===e.target.dataset.id);
  if(!item) return;
  item.paid = e.target.checked;
  save();
  render();
});

document.getElementById("overviewList").addEventListener("click", e=>{
  if(e.target.matches("input[type=checkbox]")) return;
  const row = e.target.closest(".ov-row");
  if(!row) return;
  if(ovSelectMode) toggleSelected(row.dataset.id);
  else openPayDialog("edit", row.dataset.id);
});

// the button is hidden in the markup so a stale cached script can't
// leave a dead button in the header
document.getElementById("openOverview").style.display = "";

/* ---------- init ---------- */
load();
render();
applySecret();
updateView();

/* ---------- PWA: register service worker ---------- */
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}
