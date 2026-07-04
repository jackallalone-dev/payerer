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
      const dTotal = list.reduce((s,p)=>s+p.amount,0);
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
        ${list.length>1 ? `<div class="datetotal">Total ₱${fmt(dTotal)}</div>` : ""}`;
      sec.appendChild(g);
    }
    main.appendChild(sec);
  }

  refreshTotals();
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

/* ---------- checkbox ---------- */
document.getElementById("schedule").addEventListener("change", e=>{
  if(e.target.matches("input[type=checkbox]")){
    const item = items.find(p=>p.id===e.target.dataset.id);
    item.paid = e.target.checked;
    e.target.closest(".pay").classList.toggle("done", e.target.checked);
    save();
    refreshTotals();
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
    items.push(lastDeleted);
    save();
    render();
  }
  clearTimeout(toastTimer);
  hideToast();
});

/* ---------- add / edit dialog ---------- */
const payDialog = document.getElementById("payDialog");
let editingId = null;

function openPayDialog(mode, id){
  buildLenderDropdown();
  clearForm();
  if(mode === "edit"){
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
    items.push({ id:newId(), lender, date, amount, paid:false });
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

/* ---------- init ---------- */
load();
render();

/* ---------- PWA: register service worker ---------- */
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}
