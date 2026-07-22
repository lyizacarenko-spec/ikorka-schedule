<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Графік — IkorkaShop</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐟</text></svg>">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f7f2ec;color:#2c2218;min-height:100vh}
button{cursor:pointer;border:none;font-family:inherit}
input,select{font-family:inherit}

/* TOP BAR */
.topbar{
  background:#ede8e0;border-bottom:1px solid #d4cdc4;
  padding:12px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;
}
.logo{font-size:1rem;font-weight:700;color:#2c2218;white-space:nowrap}
.logo span{color:#b84e30}
.month-nav{display:flex;align-items:center;gap:6px}
.month-nav button{background:#d4cdc4;color:#6a5848;border-radius:6px;padding:5px 11px;font-size:.82rem;transition:.15s}
.month-nav button:hover{background:#ccc8c0;color:#2c2218}
.month-label{font-size:.92rem;font-weight:600;min-width:120px;text-align:center}
.topbar-right{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.save-dot{font-size:.75rem;color:#5a4535}
.save-dot.ok{color:#2e7d52}

/* TOOLBAR */
.toolbar{display:flex;gap:6px;flex-wrap:wrap}
.btn{border-radius:7px;padding:6px 14px;font-size:.8rem;font-weight:500;transition:.15s}
.btn-ghost{background:#e2dbd0;color:#7a6050;border:1px solid #d4cdc4}
.btn-ghost:hover{background:#d4cdc4;color:#4a3828}
.btn-orange{background:#b84e30;color:#2c2218}
.btn-orange:hover{background:#9a4025}
.btn-green{background:#2e7d52;color:#2c2218}
.btn-green:hover{background:#236040}

/* DEPT TABS */
.dept-tabs{
  background:#ede8e0;border-bottom:2px solid #d4cdc4;
  padding:0 20px;display:flex;gap:0;overflow-x:auto;
}
.dept-tab{
  padding:10px 22px;font-size:.84rem;font-weight:600;
  color:#5a4535;border-bottom:2px solid transparent;margin-bottom:-2px;
  white-space:nowrap;transition:.15s;
}
.dept-tab:hover{color:#6a5848}
.dept-tab.active{color:#b84e30;border-bottom-color:#b84e30}

/* STATS ROW */
.stats-row{
  display:flex;gap:10px;flex-wrap:wrap;
  padding:12px 20px;background:#ede8e0;border-bottom:1px solid #d4cdc4;
}
.stat-card{
  background:#ede8e0;border:1px solid #d4cdc4;border-radius:8px;
  padding:8px 14px;display:flex;flex-direction:column;align-items:center;min-width:64px;
}
.stat-card .n{font-size:1.25rem;font-weight:700;color:#b84e30}
.stat-card .l{font-size:.67rem;color:#5a4535;margin-top:1px;white-space:nowrap}

/* PLAN CARDS */
.plan-cards{display:flex;gap:10px;flex-wrap:wrap;flex:1}
.plan-card{
  background:#ede8e0;border:1px solid #d4cdc4;border-radius:8px;
  padding:10px 14px;flex:1;min-width:220px;
}
.plan-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
.plan-dept{font-size:.75rem;font-weight:700;color:#b84e30;letter-spacing:.04em}
.plan-edit-btn{font-size:.7rem;color:#5a4535;background:#d4cdc4;border-radius:5px;padding:2px 8px;transition:.12s}
.plan-edit-btn:hover{color:#6a5848}
.plan-nums{display:flex;align-items:baseline;gap:6px;margin-bottom:6px}
.plan-fact{font-size:1.1rem;font-weight:700;color:#2e7d52}
.plan-of{font-size:.75rem;color:#4a3828}
.plan-total{font-size:.82rem;color:#6a5040}
.pbar{height:5px;background:#d4cdc4;border-radius:3px;overflow:hidden;margin-bottom:6px}
.pbar-fill{height:100%;border-radius:3px;transition:width .4s}
.pbar-fill.ok{background:linear-gradient(90deg,#2e7d52,#2e7d52)}
.pbar-fill.warn{background:linear-gradient(90deg,#b8860b,#ffc107)}
.pbar-fill.danger{background:linear-gradient(90deg,#8b1a1a,#ef5350)}
.plan-breakdown{display:flex;gap:6px;flex-wrap:wrap}
.level-chip{font-size:.68rem;padding:2px 7px;border-radius:4px;font-weight:600}
.lc-top{background:#1a3040;color:#42a5f5}
.lc-mid{background:#1a2840;color:#7986cb}
.lc-jun{background:#251a40;color:#9c71d4}

/* TABLE */
.table-wrap{overflow:auto;padding:0 20px 40px;max-height:calc(100vh - 180px)}
table{border-collapse:collapse;font-size:.75rem;background:#ede8e0;border-radius:0;overflow:visible;box-shadow:0 4px 24px rgba(0,0,0,.1);min-width:700px;width:100%}
thead th{background:#ede8e0;color:#6a5040;padding:7px 4px;text-align:center;font-weight:500;white-space:nowrap;position:sticky;top:0;z-index:12;border-bottom:1px solid #d4cdc4;box-shadow:0 2px 4px rgba(0,0,0,.08)}
thead th.name-th{text-align:left;padding-left:12px;min-width:160px;position:sticky;left:0;top:0;z-index:20;background:#ede8e0}
thead .dow-row th{font-size:.63rem;color:#383c58;padding:2px 4px;background:#ddd8d0;position:sticky;top:36px;z-index:12}
thead .dow-row th.wk{color:#b84e3066}
tbody tr{border-bottom:1px solid #e2dbd0;transition:.07s}
tbody tr:hover{background:#e2dbd0}
td{padding:4px 3px;text-align:center;vertical-align:middle;white-space:nowrap}
td.name-td{text-align:left;padding-left:12px;font-weight:500;color:#4a3828;background:#ede8e0;position:sticky;left:0;z-index:8;border-right:1px solid #d4cdc4;cursor:pointer;min-width:160px}
tbody tr:hover td.name-td{background:#e2dbd0;position:sticky;left:0;z-index:10}
td.level-badge{cursor:default;width:36px}
.lbadge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:.62rem;font-weight:700}
.lbadge.top{background:#1a3040;color:#42a5f5}
.lbadge.mid{background:#1a2840;color:#7986cb}
.lbadge.jun{background:#251a40;color:#9c71d4}
.lbadge.new{background:#e8e4e0;color:#888}
.lbadge.director{background:#1a3a5c;color:#64b5f6}
.director-name{color:#1a6aaa;font-weight:700}
td.stat-td{background:#ede8e0;font-weight:600;border-left:1px solid #d4cdc4;cursor:default;min-width:40px}
td.rev-td{background:#ede8e0;font-size:.7rem;color:#2e7d52;font-weight:600;border-left:1px solid #d4cdc4;cursor:pointer;min-width:64px}
td.rev-td:hover{background:#1a2535}
td.rev-td.empty{color:#2a3040}
td.wk{background:#e8e4dc}
td.today-cell{background:#fff3ef;border-left:2px solid #b84e30;border-right:2px solid #b84e30}
td.director-cell{background:#f0f5ff}
.cs-director{background:#d4e4f8;color:#1a5c8a;border:1px solid #a8c4dc}
tbody tr:hover td.wk{background:#e4e0d8}
tr.group-row td{background:#f7f2ec;color:#b84e30;font-size:.7rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:9px 12px;cursor:default;border-top:2px solid #d4cdc4;position:sticky;left:0;z-index:5}
tr.pct-row td{background:#ddd8d0;cursor:default;padding:4px 3px;border-bottom:2px solid #d4cdc4}
.pct-bar-cell{padding:0 3px}
.pct-mini{height:3px;background:#d4cdc4;border-radius:2px;overflow:hidden}
.pct-mini-fill{height:100%;border-radius:2px}

/* CHIPS */
.chip{display:inline-block;padding:2px 6px;border-radius:5px;font-weight:600;min-width:44px;font-size:.7rem;cursor:pointer;transition:.1s;user-select:none}
.chip:hover{filter:brightness(1.25)}
.cs-work {background:#d4edd8;color:#2e7d52;border:1px solid #a8d4b0}
.cs-work2{background:#d4edea;color:#4db6ac;border:1px solid #a8d4cc}
.cs-off  {background:#d4cdc4;color:#7878cc;border:1px solid #353565}
.cs-sick {background:#f0d4d4;color:#ef5350;border:1px solid #dca8a8}
.cs-vac  {background:#f0ecd0;color:#ffc107;border:1px solid #d4c890}
.cs-rem  {background:#d4e4f0;color:#42a5f5;border:1px solid #a8c4dc}
.cs-train{background:#d4eaf0;color:#26c6da;border:1px solid #a8d0dc}
.cs-late {background:#f0e4d0;color:#ff9800;border:1px solid #d4b890}
.cs-extra{background:#e4d4f0;color:#ba68c8;border:1px solid #c4a8d4}
.cs-fired{background:#e8e4e0;color:#333;border:1px solid #d0ccc8}
.cs-empty{background:#f0ede8;color:#ccc;border:1px solid #e8e4e0}
.cs-custom{background:#e8f0f8;color:#1a5c8a;border:1px solid #a8c4dc}.cs-before{background:#f0ede8;color:transparent;border:1px solid transparent;cursor:default}

/* POPUP */
.popup-ov{display:none;position:fixed;inset:0;z-index:100}
.popup-ov.open{display:block}
.popup{position:fixed;background:#e2dbd0;border:1px solid #c8c0b4;border-radius:11px;box-shadow:0 12px 40px rgba(0,0,0,.7);padding:14px;min-width:210px;z-index:101}
.popup h4{font-size:.76rem;color:#6a5040;margin-bottom:10px;font-weight:500}
.status-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.s-btn{padding:5px 8px;border-radius:6px;font-size:.72rem;font-weight:600;text-align:center;transition:.12s}
.s-btn:hover{filter:brightness(1.3);transform:scale(1.04)}
.s-btn.cur{box-shadow:0 0 0 2px #fff}
.p-close{position:absolute;top:9px;right:11px;color:#333;font-size:.9rem;background:none;transition:.12s}
.p-close:hover{color:#7a6050}

/* MODALS */
.modal-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;align-items:center;justify-content:center}
.modal-ov.open{display:flex}
.modal{background:#e2dbd0;border:1px solid #c8c0b4;border-radius:13px;padding:22px;min-width:320px;max-width:460px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.8)}
.modal h3{font-size:.98rem;color:#2c2218;margin-bottom:16px}
.modal label{font-size:.77rem;color:#6a5040;display:block;margin-bottom:3px}
.modal input,.modal select{width:100%;background:#ede8e0;border:1px solid #c8c0b4;color:#2c2218;border-radius:7px;padding:7px 11px;font-size:.88rem;margin-bottom:12px;outline:none}
.modal input:focus,.modal select:focus{border-color:#b84e30}
.modal-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.btn-cancel{background:#d4cdc4;color:#777;border-radius:7px;padding:7px 16px;font-size:.82rem}
.btn-cancel:hover{color:#5a4838}
.btn-save{background:#b84e30;color:#2c2218;border-radius:7px;padding:7px 18px;font-size:.82rem;font-weight:600}
.btn-save:hover{background:#9a4025}

/* plan modal grid */
.plan-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px}
.plan-grid-cell{display:flex;flex-direction:column}
.plan-grid-cell label{color:#7a6050;font-size:.7rem;margin-bottom:3px}
.plan-grid-cell input{width:100%;background:#ede8e0;border:1px solid #c8c0b4;color:#2c2218;border-radius:7px;padding:6px 9px;font-size:.85rem;outline:none;margin-bottom:0}
.plan-grid-cell .sublabel{font-size:.63rem;color:#4a3828;margin-top:2px}

/* rev modal */
.rev-mode-tabs{display:flex;gap:6px;margin-bottom:12px}
.rev-mode-tab{flex:1;padding:7px;border-radius:7px;font-size:.78rem;font-weight:600;background:#d4cdc4;color:#6a5040;text-align:center;transition:.15s}
.rev-mode-tab.active{background:#b84e30;color:#2c2218}
.dept-btns{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.dept-btn{padding:6px 13px;border-radius:7px;background:#d4cdc4;color:#6a5040;font-size:.78rem;font-weight:600;transition:.15s}
.dept-btn.sel{background:#b84e30;color:#2c2218}

.loading{text-align:center;padding:50px;color:#4a3828;font-size:.88rem}

/* SALARY CALC */
.sal-block{background:#f0ede8;border:1px solid #d4cdc4;border-radius:10px;padding:14px;margin-bottom:14px}
.sal-block h4{font-size:.78rem;color:#b84e30;font-weight:700;margin-bottom:10px}
.sal-row{display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap}
.sal-field{display:flex;flex-direction:column;gap:3px;flex:1;min-width:90px}
.sal-field label{font-size:.65rem;color:#8a7060}
.sal-field input{background:#fff;border:1px solid #c8c0b4;color:#2c2218;border-radius:6px;padding:6px 8px;font-size:.82rem;outline:none;width:100%}
.sal-field input:focus{border-color:#b84e30}
.sal-result{background:#fff;border:1px solid #c8c0b4;border-radius:8px;padding:10px 12px;margin-top:6px}
.sal-result-row{display:flex;justify-content:space-between;font-size:.75rem;padding:3px 0;border-bottom:1px solid #ede8e0}
.sal-result-row:last-child{border-bottom:none;font-weight:700;font-size:.82rem;padding-top:6px}
.sal-result-row span:last-child{color:#b84e30}
.sal-result-row.green span:last-child{color:#2e7d52}


/* MANAGER CARD */
.mgr-card-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;align-items:center;justify-content:center}
.mgr-card-ov.open{display:flex}
.mgr-card{background:#f7f2ec;border:1px solid #c8c0b4;border-radius:14px;padding:22px;min-width:340px;max-width:500px;width:92%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.mgr-card h3{font-size:1rem;color:#2c2218;margin-bottom:4px}
.mgr-card .mgr-sub{font-size:.75rem;color:#8a7060;margin-bottom:16px}
.mgr-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.mgr-stat{background:#ede8e0;border-radius:8px;padding:8px 12px;text-align:center}
.mgr-stat .n{font-size:1.1rem;font-weight:700;color:#b84e30}
.mgr-stat .l{font-size:.65rem;color:#8a7060}
.mgr-month{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:14px}
.mgr-day{text-align:center;font-size:.6rem;padding:3px 2px;border-radius:4px;cursor:default}
.mgr-day.hdr{color:#8a7060;font-weight:600}

/* VACATION RANGE MODAL */
.vac-modal input[type=date]{width:100%}

/* DAILY PLAN ROW */
.daily-plan-row{background:#fff8f4;border-bottom:1px solid #e8e0d8;padding:6px 20px;font-size:.78rem;color:#7a5040;display:flex;gap:16px;flex-wrap:wrap}
.daily-plan-item{display:flex;gap:6px;align-items:center}
.daily-plan-item strong{color:#b84e30;font-size:.88rem}

</style>
</head>
<body>

<div class="topbar">
  <div class="logo">🐟 Ikorka<span>Shop</span></div>
  <div class="month-nav">
    <button onclick="changeMonth(-1)">◀</button>
    <div class="month-label" id="month-label">—</div>
    <button onclick="changeMonth(1)">▶</button>
  </div>
  <div class="toolbar">
    <button class="btn btn-green"  onclick="openRevModal()">💰 Виручка</button>
    <button class="btn btn-ghost"  onclick="openPlanModal()">📊 Плани</button>
    <button class="btn btn-orange" onclick="openAddEmpModal()">＋ Менеджер</button>
    <button class="btn btn-ghost" onclick="openExportModal()" style="background:#1a3a27;color:#4caf79;border-color:#2d5c3e">📊 Експорт ЗП</button>
    <button class="btn btn-ghost" onclick="toggleArchive()" id="btn-archive">📦 Архів</button>
  </div>
  <div class="topbar-right">
    <div class="save-dot" id="save-dot">—</div>
  </div>
</div>

<div class="dept-tabs">
  <button class="dept-tab active" id="tab-rzpk"       onclick="setDept('rzpk')">РЗПК</button>
  <button class="dept-tab"        id="tab-hot"         onclick="setDept('hot')">Гарячі продажі</button>
  <button class="dept-tab"        id="tab-refuse"      onclick="setDept('refuse')">Відмови</button>
  <button class="dept-tab"        id="tab-management"  onclick="setDept('management')">Керівництво</button>
  <button class="dept-tab"        id="tab-admin"       onclick="setDept('admin')">Адмін блок</button>
  <button class="dept-tab"        id="tab-training"    onclick="setDept('training')">Навчання</button>
  <button class="dept-tab"        id="tab-accounting"  onclick="setDept('accounting')">Бухгалтерія</button>
  <button class="dept-tab"        id="tab-logistics"   onclick="setDept('logistics')">Логістика</button>
  <button class="dept-tab"        id="tab-warehouse"   onclick="setDept('warehouse')">Склад</button>
</div>

<div class="stats-row" id="stats-row"><div class="loading">Завантаження...</div></div>

<div class="daily-plan-bar" id="daily-plan-bar"></div>
<div class="table-wrap">
  <div id="table-area" class="loading">Завантаження графіка...</div>
</div>

<!-- STATUS POPUP -->
<div class="popup-ov" id="popup-ov" onclick="closePopup(event)">
  <div class="popup" id="status-popup">
    <button class="p-close" onclick="closePopupForce()">✕</button>
    <h4 id="popup-title">—</h4>
    <div class="status-grid" id="popup-grid"></div>
  </div>
</div>

<!-- PLAN MODAL -->
<div class="modal-ov" id="plan-modal-ov">
  <div class="modal">
    <h3>📊 Плани по рівнях</h3>
    <div id="plan-modal-body"></div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closePlanModal()">Скасувати</button>
      <button class="btn-save"   onclick="savePlans()">Зберегти</button>
    </div>
  </div>
</div>

<!-- REVENUE MODAL -->
<div class="modal-ov" id="rev-modal-ov">
  <div class="modal">
    <h3>💰 Внести виручку</h3>
    <div class="rev-mode-tabs">
      <div class="rev-mode-tab active" id="rev-tab-dept" onclick="setRevMode('dept')">По відділу</div>
      <div class="rev-mode-tab"        id="rev-tab-emp"  onclick="setRevMode('emp')">По менеджерах</div>
    </div>
    <label>Дата</label>
    <input type="date" id="rev-date">
    <div id="rev-body"></div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeRevModal()">Скасувати</button>
      <button class="btn-save"   onclick="saveRevenue()">Зберегти</button>
    </div>
  </div>
</div>

<!-- ADD EMPLOYEE MODAL -->
<div class="modal-ov" id="ae-modal-ov">
  <div class="modal">
    <h3>➕ Додати співробітника</h3>
    <label>Ім'я та прізвище</label>
    <input type="text" id="ae-name" placeholder="Іванова Марія">
    <label>Відділ</label>
    <select id="ae-dept" class="ae-dept-select" onmousedown="if(!this.options.length){this.innerHTML=departments.map(d=>`<option value='${d.id}'>${d.name}</option>`).join('')}"></select>
    <label>Рівень <span style="font-size:.7rem;color:#8a7060">(тільки для РЗПК)</span></label>
    <select id="ae-level">
      <option value="new" selected>Новий / Не застосовується</option>
      <option value="jun">Джун</option>
      <option value="mid">Мідл</option>
      <option value="top">Топ</option>
    </select>
    <label>Роль</label>
    <select id="ae-role">
      <option value="manager">Менеджер</option>
      <option value="senior">Старший менеджер</option>
      <option value="rop">РОП</option>
    </select>
    <label>Посада (необов.)</label>
    <input type="text" id="ae-position" placeholder="наприклад: Пакувальник, Бухгалтер...">
    <label>Дата початку (перший день)</label>
    <input type="date" id="ae-start-date" style="margin-bottom:4px">
    <label style="margin-top:4px">Кількість днів навчання</label>
    <input type="number" id="ae-navch-days" placeholder="наприклад 5" min="0" max="31" style="margin-bottom:4px">
    <div style="font-size:.72rem;color:#8a7060;margin-bottom:12px">До дати — прочерки. З дати — навч (стільки днів). Далі заповниш вручну.</div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeAeModal()">Скасувати</button>
      <button class="btn-save"   onclick="saveEmployee()">Додати</button>
    </div>
  </div>
</div>

<script>
// ══ CONFIG ══════════════════════════════════════════
const API = 'https://ikorka-schedule-production.up.railway.app';

// ══ STATUSES ════════════════════════════════════════
const STATUSES = [
  {v:'10-18',   label:'10-18',   cls:'cs-work', h:8},
  {v:'11-18',   label:'11-18',   cls:'cs-work2',h:7},
  {v:'10-17',   label:'10-17',   cls:'cs-work', h:7},
  {v:'9:30-17:30',label:'9:30-17:30',cls:'cs-work', h:8},
  {v:'9-17',      label:'9-17',      cls:'cs-work', h:8},
  {v:'9-18',      label:'9-18',      cls:'cs-work', h:9},
  {v:'8:30-16:30',label:'8:30-16:30',cls:'cs-work', h:8},
  {v:'вих',     label:'вих',     cls:'cs-off',  h:0},
  {v:'больн',   label:'больн',   cls:'cs-sick', h:0},
  {v:'відпуск', label:'відпуск', cls:'cs-vac',  h:0},
  {v:'удаленка',label:'удален.', cls:'cs-rem',  h:8},
  {v:'навч',    label:'навч',    cls:'cs-train',h:0},
  {v:'запізн',  label:'запізн',  cls:'cs-late', h:7},
  {v:'відробіт',label:'відробіт',cls:'cs-extra',h:8},
  {v:'-',       label:'звіл.',   cls:'cs-fired',h:0},
  {v:'custom',  label:'✏️ свій', cls:'cs-train',h:8},
  {v:'',        label:'—',       cls:'cs-empty',h:0},
];
const SM = Object.fromEntries(STATUSES.map(s=>[s.v,s]));
const sc = v => (SM[v]||{cls:'cs-custom'}).cls;
const sl = v => v && !SM[v] ? v : ((SM[v]||SM['']).label || '—');
const sh = v => (SM[v]||{h:8}).h;

const LEVEL_LABEL = {top:'ТОП',mid:'Мідл',jun:'Джун',new:'Новий'};
const MONTH_UA = ['','Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

// ══ STATE ════════════════════════════════════════════
let Y = new Date().getFullYear();
let M = new Date().getMonth()+1;
let curDept = 'rzpk';
let employees=[], departments=[], schedMap={}, revDetailMap={}, revDeptMap={}, statsData=[], salaryMap={};
let pending={};
let revMode = 'dept';
let showArchive = false;
let revDeptSel = 1;

// ══ DAYS ════════════════════════════════════════════
function getDays(y,m){
  const n=new Date(y,m,0).getDate();
  const dows=['нд','пн','вт','ср','чт','пт','сб'];
  return Array.from({length:n},(_,i)=>{
    const dt=new Date(y,m-1,i+1);
    const dd=String(i+1).padStart(2,'0'), mm=String(m).padStart(2,'0');
    return{d:i+1,date:`${y}-${mm}-${dd}`,label:`${dd}.${mm}`,dow:dows[dt.getDay()],isW:dt.getDay()===0||dt.getDay()===6};
  });
}

// ══ API ══════════════════════════════════════════════
async function api(path,opts={}){
  const r=await fetch(API+path,{headers:{'Content-Type':'application/json'},...opts});
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadAll(){
  [employees,departments]=await Promise.all([api('/api/employees'),api('/api/departments')]);
  await loadMonthData();
}

async function loadMonthData(){
  const qs=`?year=${Y}&month=${M}`;
  const [sched,revD,revDept,stats,salData]=await Promise.all([
    api('/api/schedule'+qs),
    api('/api/revenue/detail'+qs),
    api('/api/revenue/dept'+qs),
    api('/api/stats'+qs),
    api('/api/salary'+qs),
  ]);
  salaryMap={};
  salData.forEach(s=>{ salaryMap[s.employee_id]=s; });
  schedMap={};
  sched.forEach(e=>{schedMap[`${e.employee_id}_${e.entry_date.slice(0,10)}`]=e;});
  revDetailMap={};
  revD.forEach(e=>{revDetailMap[`${e.employee_id}_${e.revenue_date.slice(0,10)}`]=e;});
  revDeptMap={};
  revDept.forEach(e=>{revDeptMap[`${e.department_id}_${e.revenue_date.slice(0,10)}`]=e;});
  statsData=stats;
  renderAll();
}

function getStatus(empId,date){
  const k=`${empId}_${date}`;
  if(k in pending) return pending[k];
  if(k in schedMap) return schedMap[k].status;
  const emp=employees.find(e=>e.id===empId);
  // If employee has start_date and date is before it - show empty
  if(emp&&emp.start_date&&date<emp.start_date) return '';
  // New employees without filled status show empty
  if(emp&&emp.level==='new') return '';
  // Default shifts per department
  const dow = new Date(date).getDay();
  if(emp&&emp.dept_code==='refuse') return '9:30-17:30';
  if(emp&&emp.dept_code==='admin'&&emp.name==='Мединська Ірина'){
    if(dow===0||dow===6) return 'вих';
    return '9:30-17:30';
  }
  if(emp&&emp.dept_code==='accounting'){
    if(dow===0||dow===6) return 'вих';
    return '9-17';
  }
  if(emp&&emp.dept_code==='warehouse') return '9-18';
  if(emp&&emp.dept_code==='logistics'){
    if(dow===0) return 'вих';
    return '8:30-16:30';
  }
  if(emp&&['management','training','admin'].includes(emp.dept_code)&&(dow===0||dow===6)) return 'вих';
  return '10-18';
}

// ══ RENDER ════════════════════════════════════════════
function renderAll(){
  document.getElementById('month-label').textContent=`${MONTH_UA[M]} ${Y}`;
  renderStats();
  renderTable();
  renderDailyPlanBar();
}

function fmtM(n){
  if(!n) return '0';
  if(n>=1000000) return (n/1000000).toFixed(2)+' млн';
  if(n>=1000) return Math.round(n/1000)+'K';
  return Math.round(n)+'';
}

function pbarCls(pct){ return pct>=80?'ok':pct>=50?'warn':'danger'; }

function renderStats(){
  const days=getDays(Y,M);
  const visEmps=getVisEmps();
  let wd=0,hrs=0,sick=0,vac=0,rem=0,late=0;
  visEmps.forEach(e=>{
    days.forEach(d=>{
      const v=getStatus(e.id,d.date);
      const h=sh(v); if(h>0){wd++;hrs+=h;}
      if(v==='больн')sick++;
      if(v==='відпуск')vac++;
      if(v==='удаленка')rem++;
      if(v==='запізн')late++;
    });
  });

  const visDepts = curDept==='all' ? departments : departments.filter(d=>d.code===curDept);

  let planCards='';
  visDepts.forEach(dept=>{
    const s=statsData.find(x=>x.dept_code===dept.code)||{plan_total:0,fact_total:0,pct:0,plan_breakdown:{}};
    // exclude rop from employee count for display
    const pct=s.pct;
    const cls=pbarCls(pct);
    const bd=s.plan_breakdown||{};
    planCards+=`
    <div class="plan-card">
      <div class="plan-card-top">
        <div class="plan-dept">${dept.name}</div>
        <button class="plan-edit-btn" onclick="openPlanModal('${dept.code}')">✏️ план</button>
      </div>
      <div class="plan-nums">
        <span class="plan-fact">${fmtM(s.fact_total)} ₴</span>
        <span class="plan-of">з</span>
        <span class="plan-total">${fmtM(s.plan_total)} ₴</span>
        <span style="font-size:.82rem;font-weight:700;color:${cls==='ok'?'#2e7d52':cls==='warn'?'#ffc107':'#ef5350'}">&nbsp;${pct}%</span>
      </div>
      <div class="pbar"><div class="pbar-fill ${cls}" style="width:${Math.min(pct,100)}%"></div></div>
      <div class="plan-breakdown">
        ${['top','mid','jun'].map(lvl=>{
          const b=bd[lvl]||{cnt:0,plan_per_person:0,subtotal:0};
          return b.cnt>0?`<span class="level-chip lc-${lvl}">${LEVEL_LABEL[lvl]}: ${b.cnt}×${fmtM(b.plan_per_person)}=${fmtM(b.subtotal)}</span>`:'';
        }).join('')}
      </div>
    </div>`;
  });

  document.getElementById('stats-row').innerHTML=`
    <div class="stat-card"><span class="n">${visEmps.length}</span><span class="l">Менедж.</span></div>
    <div class="stat-card"><span class="n">${wd}</span><span class="l">Змін</span></div>
    <div class="stat-card"><span class="n">${hrs}</span><span class="l">Годин</span></div>
    <div class="stat-card"><span class="n" style="color:#ef5350">${sick}</span><span class="l">Лікарн.</span></div>
    <div class="stat-card"><span class="n" style="color:#ffc107">${vac}</span><span class="l">Відпуст.</span></div>
    <div class="stat-card"><span class="n" style="color:#42a5f5">${rem}</span><span class="l">Удален.</span></div>
    <div class="stat-card"><span class="n" style="color:#ff9800">${late}</span><span class="l">Запізн.</span></div>
    <div class="plan-cards">${planCards}</div>
  `;
}

function getVisEmps(){
  return employees.filter(e=>e.dept_code===curDept);
}

function renderTable(){
  const days=getDays(Y,M);
  const emps=getVisEmps();
  // Group by team within dept - fixed order
  const TEAM_ORDER = ['РОП','Команда Чопового','Команда Шелковникової','Команда Кіндюшенко','Нові співробітники','Віддалено','Гарячі продажі','Відмови','Керівництво','Адмін блок','Відділ навчання','Бухгалтерія','Логістика'];
  const groupsRaw={};
  emps.forEach(e=>{
    const teamKey = e.team || e.dept_code;
    if(!groupsRaw[teamKey]) groupsRaw[teamKey]={name:e.team||e.dept_name,code:e.dept_code,id:departments.find(d=>d.code===e.dept_code)?.id,emps:[]};
    // Sort: rop first, then senior, then by name
    groupsRaw[teamKey].emps.push(e);
  });
  // Admin dept custom order
  const ADMIN_ORDER = ['Мединська Ірина','Чубострoєва Валентина','Овсюченко Луїза','Демидов Сергій','Озерна Карина','Пальчун Дмитро'];
  // Sort employees within each team: rop → senior → manager, then by name
  Object.values(groupsRaw).forEach(g=>{
    g.emps.sort((a,b)=>{
      // Admin dept - custom order
      const ai=ADMIN_ORDER.indexOf(a.name), bi=ADMIN_ORDER.indexOf(b.name);
      if(ai!==-1||bi!==-1){
        if(ai!==-1&&bi!==-1) return ai-bi;
        if(ai!==-1) return -1;
        if(bi!==-1) return 1;
      }
      const roleOrder={rop:0,senior:1,manager:2};
      const ra=roleOrder[a.role]??2, rb=roleOrder[b.role]??2;
      if(ra!==rb) return ra-rb;
      return a.name.localeCompare(b.name,'uk');
    });
  });
  // Order groups by TEAM_ORDER
  const groups={};
  TEAM_ORDER.forEach(t=>{ if(groupsRaw[t]) groups[t]=groupsRaw[t]; });
  // Add any remaining teams not in order
  Object.keys(groupsRaw).forEach(t=>{ if(!groups[t]) groups[t]=groupsRaw[t]; });

  const todayDate = new Date().toISOString().slice(0,10);
  let h=`<table><thead>
  <tr>
    <th class="name-th">Менеджер</th>
    <th style="width:34px"></th>`;
  days.forEach(d=>{
    const isToday = d.date===todayDate;
    const cls = isToday ? 'today-col' : (d.isW?'wk':'');
    h+=`<th class="${cls}" ${isToday?'style="background:#b84e30;color:#fff;border-radius:6px 6px 0 0"':''}>${d.label}</th>`;
  });
  h+=`<th>Зм.</th><th>Год.</th><th>💰</th></tr>
  <tr class="dow-row"><th class="name-th"></th><th></th>`;
  days.forEach(d=>{
    const isToday2=d.date===todayDate;
    h+=`<th class="${isToday2?'today-col':(d.isW?'wk':'')}" ${isToday2?'style="background:#c96c2d;color:#fff"':''}>${d.dow}</th>`;
  });
  h+=`<th></th><th></th><th></th></tr></thead><tbody>`;

  // Daily plan row — dynamic per working managers each day
  const s3 = statsData.find(x=>x.dept_code===curDept);
  if(s3 && s3.plan_total){
    const today3 = new Date().toISOString().slice(0,10);
    const bd3 = s3.plan_breakdown||{};
    const WORK_ST3 = ['10-18','11-18','10-17','9:30-17:30','удаленка','відробіт','запізн'];
    const planPerDay3 = {};
    ['top','mid','jun'].forEach(lvl=>{
      const pm=bd3[lvl]?.plan_per_person||0;
      planPerDay3[lvl]=pm>0?Math.round(pm/days.length):0;
    });

    h+=`<tr style="background:#fff8f4;border-bottom:2px solid #e8d8c8">`;
    h+=`<td class="name-td" style="background:#fff8f4;font-size:.65rem;color:#b84e30;font-weight:700;cursor:default">📊 План/день</td><td style="background:#fff8f4"></td>`;

    days.forEach(d=>{
      const isT3=d.date===today3;
      let dayPlan3=0;
      emps.forEach(e=>{
        if(e.role==='rop'||e.level==='new') return;
        if(WORK_ST3.includes(getStatus(e.id,d.date))) dayPlan3+=planPerDay3[e.level]||0;
      });
      const col=isT3?'#b84e30':'#8a6050', fw=isT3?'700':'500', bg=isT3?'#ffeee8':'#fff8f4';
      h+=`<td style="font-size:.6rem;color:${col};font-weight:${fw};padding:2px;text-align:center;background:${bg}">${dayPlan3>0?fmtM(dayPlan3):'—'}</td>`;
    });
    h+=`<td style="background:#fff8f4"></td><td style="background:#fff8f4"></td><td style="background:#fff8f4"></td></tr>`;
  }

  // Calc daily plan per level
  const today2 = new Date().toISOString().slice(0,10);
  const s2 = statsData.find(x=>x.dept_code===curDept);
  const bd2 = s2?.plan_breakdown||{};
  const workDays2 = days.filter(d=>!d.isW).length||22;

  // Total dept daily summary (above ROP)
  let deptDayHtml = '';
  if(s2&&s2.plan_total){
    const totalDay = Math.round(s2.plan_total/workDays2);
    const lvlParts = ['top','mid','jun'].map(lvl=>{
      const b=bd2[lvl]||{cnt:0,plan_per_person:0};
      if(!b.cnt||!b.plan_per_person) return '';
      const dayPer = Math.round(b.plan_per_person/workDays2);
      return `<span style="margin-right:10px"><b>${LEVEL_LABEL[lvl]}:</b> ${fmtM(dayPer)} ₴/ос</span>`;
    }).filter(Boolean).join('');
    deptDayHtml = `<span style="margin-right:16px;font-weight:700;color:#b84e30">📊 День: ${fmtM(totalDay)} ₴</span>${lvlParts}`;
  }

  Object.values(groups).forEach(g=>{
    // Per-team daily plan
    let teamDayHtml = '';
    if(g.name !== 'РОП' && s2 && s2.plan_total){
      const lvlCounts={top:0,mid:0,jun:0};
      g.emps.forEach(e=>{
        if(e.role==='rop') return;
        const v=getStatus(e.id,today2);
        const working=['10-18','11-18','10-17','9:30-17:30','удаленка','відробіт'].includes(v);
        if(working && lvlCounts[e.level]!==undefined) lvlCounts[e.level]++;
      });
      const parts=[];
      ['top','mid','jun'].forEach(lvl=>{
        const b=bd2[lvl]||{cnt:0,plan_per_person:0};
        if(!lvlCounts[lvl]||!b.plan_per_person) return;
        const dayPer=Math.round(b.plan_per_person/workDays2);
        const teamTotal=Math.round(dayPer*lvlCounts[lvl]);
        parts.push(`${LEVEL_LABEL[lvl]}: ${lvlCounts[lvl]}×${fmtM(dayPer)}=<b>${fmtM(teamTotal)}</b>`);
      });
      if(parts.length) teamDayHtml = ` <span style="font-weight:400;font-size:.65rem;color:#8a6050;margin-left:8px">${parts.join(' · ')}</span>`;
    }

    if(g.name==='РОП' && deptDayHtml){
      h+=`<tr class="group-row"><td colspan="${days.length+5}" style="font-size:.68rem">${deptDayHtml}</td></tr>`;
    }
    h+=`<tr class="group-row"><td colspan="${days.length+5}">${g.name}${teamDayHtml}</td></tr>`;

    g.emps.forEach(emp=>{
      let wd=0,hrs=0;
      let empRevTotal=0;
      days.forEach(d=>{
        const ek=`${emp.id}_${d.date}`;
        empRevTotal+=parseFloat(revDetailMap[ek]?.amount||0);
      });
      const empPos = POSITIONS[emp.name]||'';
      const empIsDir = ['Желюбовська Анастасія','Галаєва Анна'].includes(emp.name);
      let row=`<tr>
        <td class="name-td ${empIsDir?'director-name':''}" onclick="openMgrCard(${emp.id})" style="cursor:pointer">
          <div>${emp.name}${empIsDir?'<span style="font-size:.6rem;color:#64b5f6;margin-left:4px">Директ</span>':''}</div>
          ${empPos?`<div style="font-size:.6rem;color:#a09080;margin-top:1px">${empPos}</div>`:''}
        </td>
        <td class="level-badge">${emp.dept_code==='rzpk'&&emp.role!=='rop'&&emp.level!=='new'?`<span class="lbadge ${emp.level}">${LEVEL_LABEL[emp.level]}</span>`:''}</td>`;
      days.forEach(d=>{
        const v=getStatus(emp.id,d.date);
        const h2=sh(v);if(h2>0){wd++;hrs+=h2;}
        const isToday3=d.date===todayDate;
        const isDirector=['Желюбовська Анастасія','Галаєва Анна'].includes(emp.name);
        const cellCls=isToday3?'today-cell':(d.isW?'wk':(isDirector?'director-cell':''));
        const chipCls=isDirector&&sc(v)==='cs-work'?'cs-director':sc(v);
        row+=`<td class="${cellCls}" data-emp="${emp.id}" data-date="${d.date}"
               onclick="openPopup(event,${emp.id},'${d.date}','${v}',this)">
               <span class="chip ${chipCls}">${sl(v)}</span></td>`;
      });
      row+=`<td class="stat-td">${wd}</td>
            <td class="stat-td">${hrs}</td>
            <td class="rev-td ${empRevTotal?'':'empty'}" onclick="openRevEmpModalById(${emp.id})">${empRevTotal?fmtM(empRevTotal)+' ₴':'—'}</td>
            </tr>`;
      h+=row;
    });
  });
  h+=`</tbody></table>`;
  document.getElementById('table-area').innerHTML=h;
}

// ══ POPUP ════════════════════════════════════════════
let pEmp=null,pDate=null;
function openPopup(e,empId,date,cur,nameTd){
  e.stopPropagation();
  pEmp=empId;pDate=date;
  const emp=employees.find(x=>x.id===empId);
  const name=emp?.name||'';
  document.getElementById('popup-title').textContent=`${name} · ${date.slice(8)}.${date.slice(5,7)}`;
  document.getElementById('popup-grid').innerHTML=STATUSES.map(s=>
    `<button class="s-btn ${s.cls} ${s.v===cur?'cur':''}" onclick="applyStatus('${s.v}')">${s.label||'—'}</button>`
  ).join('');
  const ov=document.getElementById('popup-ov');
  ov.classList.add('open');
  const x=Math.min(e.clientX,window.innerWidth-230);
  const y=Math.min(e.clientY+6,window.innerHeight-290);
  document.getElementById('status-popup').style.cssText=`left:${x}px;top:${y}px`;
}
function closePopup(e){ if(e&&e.target.id!=='popup-ov')return; document.getElementById('popup-ov').classList.remove('open'); }
function closePopupForce(){ document.getElementById('popup-ov').classList.remove('open'); }

async function applyStatus(v){
  closePopupForce();
  if(v==='запізн'){
    const emp=employees.find(e=>e.id===pEmp);
    openLatePopup(pEmp,pDate,emp?.name||'');
    return;
  }
  if(v==='custom'){
    const cur=schedMap[`${pEmp}_${pDate}`];
    const txt=prompt('Введи свій статус (наприклад "12-20"):',cur?.status&&cur.status!=='custom'?cur.status:'');
    if(txt===null) return;
    v=txt.trim()||'';
  }
  if(v==='відпуск'){
    const emp=employees.find(e=>e.id===pEmp);
    openVacModal(pEmp,emp?.name||'');
    return;
  }
  // Звільнення — заповнюємо до кінця місяця
  if(v==='-'){
    const emp=employees.find(e=>e.id===pEmp);
    const empName=emp?.name||'менеджера';
    if(!confirm(`Поставити звільнення для ${empName} з ${pDate.slice(8)}.${pDate.slice(5,7)} до кінця місяця?`)) return;
    setSave('Збереження...',false);
    try{
      const days=getDays(Y,M);
      const fromDay=days.find(d=>d.date===pDate);
      if(!fromDay) return;
      const toFill=days.filter(d=>d.date>=pDate);
      for(const d of toFill){
        await api('/api/schedule',{method:'PUT',body:JSON.stringify({employee_id:pEmp,entry_date:d.date,status:'-'})});
        schedMap[`${pEmp}_${d.date}`]={employee_id:pEmp,entry_date:d.date,status:'-'};
      }
      renderTable();renderStats();
      setSave(`Звільнення встановлено з ${pDate.slice(8)}.${pDate.slice(5,7)} (${toFill.length} днів) ✓`,true);
    }catch(e){setSave('Помилка ✗',false);}
    return;
  }
  const k=`${pEmp}_${pDate}`;
  pending[k]=v;
  renderTable();renderStats();
  setSave('Збереження...',false);
  try{
    await api('/api/schedule',{method:'PUT',body:JSON.stringify({employee_id:pEmp,entry_date:pDate,status:v})});
    delete pending[k];
    schedMap[k]={employee_id:pEmp,entry_date:pDate,status:v};
    setSave('Збережено ✓',true);
  }catch(e){setSave('Помилка ✗',false);}
}

// ══ PLAN MODAL ════════════════════════════════════════
let planDeptFilter=null;
function openPlanModal(deptCode){
  planDeptFilter=deptCode||null;
  const visDepts=planDeptFilter
    ? departments.filter(d=>d.code===planDeptFilter)
    : departments;

  let body='';
  visDepts.forEach(dept=>{
    const s=statsData.find(x=>x.dept_code===dept.code)||{plan_breakdown:{},plan_total:0};
    const bd=s.plan_breakdown||{};
    const total=s.plan_total||0;
    const daysInMonth=getDays(Y,M).length;
    body+=`<div style="margin-bottom:18px">
      <div style="font-size:.78rem;color:#b84e30;font-weight:700;margin-bottom:10px">${dept.name}</div>

      <div style="margin-bottom:12px">
        <div style="font-size:.72rem;color:#8a7060;margin-bottom:4px">Загальний план відділу на місяць (грн)</div>
        <input type="number" id="plan-dept-total-${dept.id}" value="${total||''}"
          placeholder="наприклад 5400000"
          style="width:100%;background:#ede8e0;border:1px solid #c8c0b4;color:#2c2218;border-radius:7px;padding:8px 12px;font-size:.92rem;outline:none;margin-bottom:4px"
          oninput="updatePlanTotal('${dept.id}')">
        <div style="font-size:.68rem;color:#aaa" id="plan-dept-day-${dept.id}">${total>0?`≈ ${fmtM(Math.round(total/daysInMonth))} ₴/день`:''}</div>
      </div>

      <div style="font-size:.72rem;color:#8a7060;margin-bottom:6px;border-top:1px solid #d4cdc4;padding-top:10px">Індивідуальний план для розрахунку ЗП (грн/особу)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:8px">
        ${['top','mid','jun'].map(lvl=>{
          const b=bd[lvl]||{cnt:0,plan_per_person:0};
          return `<div>
            <div style="font-size:.68rem;color:#8a7060;margin-bottom:3px">${LEVEL_LABEL[lvl]} (${b.cnt} ос.)</div>
            <input type="number" id="plan-${dept.id}-${lvl}" value="${b.plan_per_person||''}"
              placeholder="план/особу"
              style="width:100%;background:#ede8e0;border:1px solid #c8c0b4;color:#2c2218;border-radius:7px;padding:5px 9px;font-size:.82rem;outline:none"
              oninput="updatePlanTotal('${dept.id}')">
            <div style="font-size:.6rem;color:#aaa;margin-top:2px" id="plan-sub-${dept.id}-${lvl}">${b.cnt>0&&b.plan_per_person?fmtM(b.plan_per_person*b.cnt)+' ₴':''}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="background:#ede8e0;border-radius:7px;padding:7px 12px;font-size:.72rem;color:#8a7060" id="plan-total-show-${dept.id}">
        Сума по рівнях: <b id="plan-levels-sum-${dept.id}">${total>0?fmtM(total)+' ₴':'—'}</b>
      </div>
    </div>`;
  });
  document.getElementById('plan-modal-body').innerHTML=body;
  document.getElementById('plan-modal-ov').classList.add('open');
}

function updatePlanTotal(deptId){
  const s=statsData.find(x=>x.dept_code===(departments.find(d=>d.id==deptId)?.code))||{plan_breakdown:{}};
  const bd=s.plan_breakdown||{};
  // Update dept total preview
  const deptTotal=parseFloat(document.getElementById(`plan-dept-total-${deptId}`)?.value)||0;
  const dayEl=document.getElementById(`plan-dept-day-${deptId}`);
  const dAll=getDays(Y,M);
  if(dayEl) dayEl.textContent=deptTotal>0?`≈ ${fmtM(Math.round(deptTotal/dAll.length))} ₴/день`:'';
  // Update levels sum
  let lvlSum=0;
  ['top','mid','jun'].forEach(lvl=>{
    const cnt=bd[lvl]?.cnt||0;
    const val=parseFloat(document.getElementById(`plan-${deptId}-${lvl}`)?.value)||0;
    const sub=val*cnt;
    lvlSum+=sub;
    const subEl=document.getElementById(`plan-sub-${deptId}-${lvl}`);
    if(subEl) subEl.textContent=cnt>0&&val?fmtM(sub)+' ₴':'';
  });
  const sumEl=document.getElementById(`plan-levels-sum-${deptId}`);
  if(sumEl) sumEl.textContent=lvlSum>0?fmtM(lvlSum)+' ₴':'—';
}

function closePlanModal(){ document.getElementById('plan-modal-ov').classList.remove('open'); }

async function savePlans(){
  const visDepts=planDeptFilter ? departments.filter(d=>d.code===planDeptFilter) : departments;
  setSave('Збереження...',false);
  try{
    for(const dept of visDepts){
      // Save individual level plans (for salary calc)
      let lvlSum=0;
      const s=statsData.find(x=>x.dept_code===dept.code)||{plan_breakdown:{}};
      const bd=s.plan_breakdown||{};
      for(const lvl of ['top','mid','jun']){
        const el=document.getElementById(`plan-${dept.id}-${lvl}`);
        if(!el) continue;
        const amt=parseFloat(el.value)||0;
        lvlSum+=amt*(bd[lvl]?.cnt||0);
        await api('/api/plans',{method:'PUT',body:JSON.stringify({
          department_id:dept.id,plan_year:Y,plan_month:M,level:lvl,plan_amount:amt
        })});
      }
      // If dept total is set and differs from levels sum - save dept total as override
      const deptTotalEl=document.getElementById(`plan-dept-total-${dept.id}`);
      const deptTotal=parseFloat(deptTotalEl?.value)||0;
      // If dept total set but levels not filled - distribute evenly
      if(deptTotal>0 && lvlSum===0){
        const cnt=Object.values(bd).reduce((a,b)=>a+(b.cnt||0),0)||1;
        const perPerson=Math.round(deptTotal/cnt);
        for(const lvl of ['top','mid','jun']){
          if(!(bd[lvl]?.cnt>0)) continue;
          await api('/api/plans',{method:'PUT',body:JSON.stringify({
            department_id:dept.id,plan_year:Y,plan_month:M,level:lvl,plan_amount:perPerson
          })});
        }
      }
    }
    await loadMonthData();
    closePlanModal();
    setSave('Плани збережено ✓',true);
  }catch(e){ alert('Помилка: '+e.message); }
}

// ══ REVENUE MODAL ═════════════════════════════════════
function setRevMode(mode){
  revMode=mode;
  document.getElementById('rev-tab-dept').classList.toggle('active',mode==='dept');
  document.getElementById('rev-tab-emp').classList.toggle('active',mode==='emp');
  renderRevBody();
}
function openRevModal(){
  document.getElementById('rev-date').value=new Date().toISOString().slice(0,10);
  revDeptSel=departments[0]?.id||1;
  renderRevBody();
  document.getElementById('rev-modal-ov').classList.add('open');
}
function closeRevModal(){ document.getElementById('rev-modal-ov').classList.remove('open'); }

function renderRevBody(){
  if(revMode==='dept'){
    document.getElementById('rev-body').innerHTML=`
      <label>Відділ</label>
      <div class="dept-btns">${departments.map(d=>
        `<button class="dept-btn ${d.id===revDeptSel?'sel':''}" onclick="selRevDept(${d.id},this)">${d.name}</button>`
      ).join('')}</div>
      <label>Сума (грн)</label>
      <input type="number" id="rev-amount-dept" placeholder="0">
      <label>Примітка</label>
      <input type="text" id="rev-note-dept" placeholder="">
    `;
  } else {
    const date=document.getElementById('rev-date').value;
    const visEmps=getVisEmps();
    document.getElementById('rev-body').innerHTML=`
      <div style="max-height:280px;overflow-y:auto">
      ${visEmps.map(e=>{
        const k=`${e.id}_${date}`;
        const cur=parseFloat(revDetailMap[k]?.amount||0);
        return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="flex:1;font-size:.8rem;color:#4a3828">${e.name} <span class="lbadge ${e.level}" style="font-size:.6rem">${LEVEL_LABEL[e.level]}</span></div>
          <input type="number" id="rev-emp-${e.id}" value="${cur||''}" placeholder="0"
                 style="width:110px;background:#ede8e0;border:1px solid #c8c0b4;color:#2c2218;border-radius:6px;padding:5px 8px;font-size:.82rem;outline:none">
        </div>`;
      }).join('')}
      </div>
    `;
  }
}
function selRevDept(id,el){
  revDeptSel=id;
  document.querySelectorAll('.dept-btn').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
}
// also called when emp cell is clicked

function openRevEmpModalById(empId){
  const emp=employees.find(e=>e.id===empId);
  openRevEmpModal(empId,emp?.name||'');
}

function openRevEmpModal(empId,name){
  revMode='emp';
  document.getElementById('rev-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('rev-tab-dept').classList.remove('active');
  document.getElementById('rev-tab-emp').classList.add('active');
  renderRevBody();
  document.getElementById('rev-modal-ov').classList.add('open');
  // scroll to that employee
  setTimeout(()=>{
    const el=document.getElementById(`rev-emp-${empId}`);
    if(el)el.scrollIntoView({block:'center'});
  },100);
}

async function saveRevenue(){
  const date=document.getElementById('rev-date').value;
  if(!date){alert('Вкажіть дату');return;}
  setSave('Збереження...',false);
  try{
    if(revMode==='dept'){
      const amt=parseFloat(document.getElementById('rev-amount-dept').value)||0;
      const note=document.getElementById('rev-note-dept').value;
      const r=await api('/api/revenue/dept',{method:'PUT',body:JSON.stringify({department_id:revDeptSel,revenue_date:date,amount:amt,note})});
      revDeptMap[`${revDeptSel}_${date}`]=r;
    } else {
      const visEmps=getVisEmps();
      for(const e of visEmps){
        const el=document.getElementById(`rev-emp-${e.id}`);
        if(!el)continue;
        const amt=parseFloat(el.value)||0;
        if(amt>0){
          const r=await api('/api/revenue/detail',{method:'PUT',body:JSON.stringify({employee_id:e.id,revenue_date:date,amount:amt})});
          revDetailMap[`${e.id}_${date}`]=r;
        }
      }
    }
    closeRevModal();
    await loadMonthData();
    setSave('Виручку збережено ✓',true);
  }catch(e){alert('Помилка: '+e.message);}
}

// ══ ADD EMPLOYEE ══════════════════════════════════════
function openAddEmpModal(){
  const sel = document.getElementById('ae-dept');
  if(departments && departments.length){
    sel.innerHTML = departments.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
  }
  document.getElementById('ae-modal-ov').classList.add('open');
}
function closeAeModal(){ document.getElementById('ae-modal-ov').classList.remove('open'); }
async function saveEmployee(){
  const name=document.getElementById('ae-name').value.trim();
  const dept=parseInt(document.getElementById('ae-dept').value);
  const level=document.getElementById('ae-level').value;
  const role=document.getElementById('ae-role').value;
  const startDate=document.getElementById('ae-start-date').value;
  if(!name){alert('Введіть ім\'я');return;}
  try{
    const deptObj=departments.find(x=>x.id===dept);
    const autoTeam=deptObj?.name||'';
    const r=await api('/api/employees',{method:'POST',body:JSON.stringify({name,department_id:dept,level,role,team:autoTeam})});
    const d=departments.find(x=>x.id===dept);
    const position2=document.getElementById('ae-position')?.value?.trim();
    if(position2) POSITIONS[r.name]=position2;
    employees.push({...r,dept_code:d?.code,dept_name:d?.name});

    if(startDate){
      const navchDays = parseInt(document.getElementById('ae-navch-days').value)||0;
      const allDays = getDays(Y,M);
      // Fill navch from startDate for navchDays working days
      let filled = 0;
      for(const d of allDays){
        if(d.date < startDate) continue;
        const status = filled < navchDays ? 'навч' : null;
        if(status){
          await api('/api/schedule',{method:'PUT',body:JSON.stringify({
            employee_id:r.id, entry_date:d.date, status
          })});
          schedMap[`${r.id}_${d.date}`]={employee_id:r.id,entry_date:d.date,status};
          filled++;
        }
      }
      // Save start_date to employee
      await api('/api/employees/'+r.id,{method:'PATCH',body:JSON.stringify({start_date:startDate})});
      employees[employees.length-1].start_date=startDate;
      setSave(`${name} додано з ${startDate.slice(8)}.${startDate.slice(5,7)}, навч ${navchDays} дн. ✓`,true);
    } else {
      setSave('Менеджера додано ✓',true);
    }

    closeAeModal();
    document.getElementById('ae-name').value='';
    document.getElementById('ae-start-date').value='';
    if(document.getElementById('ae-position')) document.getElementById('ae-position').value='';
    await loadMonthData();
  }catch(e){alert('Помилка: '+e.message);}
}

// ══ NAV ══════════════════════════════════════════════
function changeMonth(d){
  M+=d;if(M>12){M=1;Y++;}if(M<1){M=12;Y--;}
  pending={};
  loadMonthData();
}
function setDept(code){
  curDept=code;
  document.querySelectorAll('.dept-tab').forEach(t=>{t.classList.toggle('active',t.id==='tab-'+code);});
  renderAll();
}

function setSave(msg,ok){
  const el=document.getElementById('save-dot');
  el.textContent=msg;el.className='save-dot'+(ok?' ok':'');
}


// ══ DAILY PLAN BAR ════════════════════════════════════
function renderDailyPlanBar(){
  const today = new Date().toISOString().slice(0,10);
  const visDepts = departments.filter(d=>d.code===curDept);
  let barHtml = '';
  visDepts.forEach(dept=>{
    const s = statsData.find(x=>x.dept_code===dept.code);
    if(!s||!s.plan_total) return;
    const deptEmps = employees.filter(e=>e.dept_code===dept.code);
    const workingToday = deptEmps.filter(e=>{
      if(e.role==='rop') return false;
      const v = getStatus(e.id, today);
      return ['10-18','11-18','10-17','9:30-17:30','удаленка','відробіт','запізн'].includes(v);
    }).length;

    const days = getDays(Y,M);
    const deptId = departments.find(d=>d.code===dept.code)?.id;

    // calc cumulative fact up to yesterday
    let cumFact = 0;
    days.forEach(d=>{
      if(d.date >= today) return;
      if(d.isW) return;
      let df = deptId ? parseFloat(revDeptMap[`${deptId}_${d.date}`]?.amount||0) : 0;
      if(!df) deptEmps.forEach(e=>{ df+=parseFloat(revDetailMap[`${e.id}_${d.date}`]?.amount||0); });
      cumFact += df;
    });

    // Today's plan = sum of per-person-per-day plans for those working today
    const bd2 = s.plan_breakdown||{};
    const WORK_ST = ['10-18','11-18','10-17','9:30-17:30','удаленка','відробіт','запізн'];
    let todayPlan2 = 0;
    deptEmps.forEach(e=>{
      if(e.role==='rop'||e.level==='new') return;
      const v=getStatus(e.id,today);
      if(WORK_ST.includes(v)){
        const perMonth=bd2[e.level]?.plan_per_person||0;
        todayPlan2+=perMonth>0?Math.round(perMonth/days.length):0;
      }
    });
    const perPerson2 = workingToday>0 ? Math.round(todayPlan2/workingToday) : 0;

    barHtml += `<div class="daily-plan-item">
      <span style="color:#8a7060">Сьогодні в зміні:</span>
      <strong>${workingToday} менедж.</strong>
      <span style="color:#aaa">•</span>
      <span style="color:#8a7060">План на день:</span>
      <strong style="color:#b84e30">${fmtM(todayPlan2)} ₴</strong>
      <span style="color:#aaa">•</span>
      <span style="color:#8a7060">На людину:</span>
      <strong>${fmtM(perPerson2)} ₴</strong>
    </div>`;
  });
  const bar = document.getElementById('daily-plan-bar');
  if(bar) bar.innerHTML = barHtml ? `<div class="daily-plan-row">${barHtml}</div>` : '';
}

// ══ MANAGER CARD ══════════════════════════════════════
function openMgrCard(empId){
  const emp = employees.find(e=>e.id===empId);
  if(!emp) return;
  const days = getDays(Y,M);
  let wd=0,hrs=0,sick=0,vac=0,late=0,rem=0,rev=0;
  const dows=['нд','пн','вт','ср','чт','пт','сб'];
  const LEVEL_LABEL2={top:'ТОП',mid:'Мідл',jun:'Джун'};

  let calHtml='';
  // header days
  dows.forEach(d=>{ calHtml+=`<div class="mgr-day hdr">${d}</div>`; });
  // empty cells before first day
  const firstDow = new Date(Y,M-1,1).getDay();
  for(let i=0;i<firstDow;i++) calHtml+=`<div class="mgr-day"></div>`;

  days.forEach(d=>{
    const v=getStatus(empId,d.date);
    const h=sh(v);
    if(h>0){wd++;hrs+=h;}
    if(v==='больн') sick++;
    if(v==='відпуск') vac++;
    if(v==='запізн') late++;
    if(v==='удаленка') rem++;
    const ek=`${empId}_${d.date}`;
    rev+=parseFloat(revDetailMap[ek]?.amount||0);
    const bg = v==='10-18'||v==='11-18'||v==='10-17'?'#d4edd8':
               v==='вих'?'#e8e4dc':
               v==='больн'?'#f0d4d4':
               v==='відпуск'?'#f0ecd0':
               v==='удаленка'?'#d4e4f0':
               v==='запізн'?'#f0e4d0':'#ede8e0';
    const tc = v==='10-18'||v==='11-18'||v==='10-17'?'#1a5c30':
               v==='вих'?'#6a5848':
               v==='больн'?'#b71c1c':
               v==='відпуск'?'#7a5c00':
               v==='удаленка'?'#1a5c8a':
               v==='запізн'?'#7a4000':'#4a3828';
    calHtml+=`<div class="mgr-day" style="background:${bg};color:${tc}" title="${v||'—'}">${d.d}<br><span style="font-size:.55rem">${v?v.slice(0,3):'—'}</span></div>`;
  });

  const s = statsData.find(x=>x.dept_code===emp.dept_code);
  const bd = s?.plan_breakdown||{};
  const empPlan = bd[emp.level]?.plan_per_person||0;

  document.getElementById('mgr-card-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h3>${emp.name}</h3>
        <div class="mgr-sub">${emp.dept_name} · ${LEVEL_LABEL2[emp.level]} · ${emp.role==='rop'?'РОП':emp.role==='senior'?'Старший менеджер':'Менеджер'}</div>
      </div>
      <button onclick="closeMgrCardForce()" style="background:none;color:#aaa;font-size:1.1rem;cursor:pointer">✕</button>
    </div>
    <div class="mgr-stats">
      <div class="mgr-stat"><div class="n">${wd}</div><div class="l">Змін</div></div>
      <div class="mgr-stat"><div class="n">${hrs}</div><div class="l">Годин</div></div>
      <div class="mgr-stat"><div class="n" style="color:#ef5350">${sick}</div><div class="l">Хвороба</div></div>
      <div class="mgr-stat"><div class="n" style="color:#ffc107">${vac}</div><div class="l">Відпустка</div></div>
      <div class="mgr-stat"><div class="n" style="color:#ff9800">${late}</div><div class="l">Запізнень</div></div>
      <div class="mgr-stat"><div class="n" style="color:#42a5f5">${rem}</div><div class="l">Удалено</div></div>
      ${rev>0?`<div class="mgr-stat"><div class="n" style="color:#2e7d52">${fmtM(rev)} ₴</div><div class="l">Виручка</div></div>`:''}
      ${empPlan>0?`<div class="mgr-stat"><div class="n">${fmtM(empPlan)} ₴</div><div class="l">План</div></div>`:''}
    </div>
    <div class="sal-block">
      <h4>💰 Розрахунок ЗП — ${MONTH_UA[M]} ${Y}</h4>
      ${ ['management','admin','training','accounting','logistics','warehouse'].includes(emp.dept_code) ? '<div style="font-size:.75rem;color:#8a7060;padding:8px 0">Розрахунок ЗП не передбачений для цього відділу</div>' : '' }
      <div id="rop-pin-block" style="${ropUnlocked?'display:none':'display:block'}">
        <div style="text-align:center;padding:8px 0 12px">
          <div style="font-size:.78rem;color:#8a7060;margin-bottom:8px">🔒 Доступ тільки для РОП</div>
          <div style="display:flex;gap:6px;justify-content:center">
            <input type="password" id="rop-pin-input" placeholder="PIN" maxlength="4"
              style="width:80px;background:#ede8e0;border:1px solid #c8c0b4;border-radius:6px;padding:6px 8px;font-size:.85rem;text-align:center;outline:none"
              onkeydown="if(event.key==='Enter')checkRopPin()">
            <button onclick="checkRopPin()" style="background:#b84e30;color:#fff;border-radius:6px;padding:6px 12px;font-size:.8rem;font-weight:600">Увійти</button>
          </div>
        </div>
      </div>
      <div id="sal-unlock-block" style="${ropUnlocked?'display:block':'display:none'}">
        ${emp.dept_code==='refuse'?`
        <div class="sal-row">
          <div class="sal-field"><label>Кількість замовлень</label><input type="number" id="sal-plan-${emp.id}" placeholder="90+" value="${salaryMap[emp.id]?.plan_amount||''}"></div>
          <div class="sal-field"><label>Сума замовлень (грн)</label><input type="number" id="sal-fact-${emp.id}" placeholder="0" value="${salaryMap[emp.id]?.fact_amount||''}"></div>
          <div class="sal-field"><label>% повернень</label><input type="number" id="sal-ret-${emp.id}" placeholder="0" min="0" max="100" value="${salaryMap[emp.id]?.returns_pct||''}"></div>
          <div class="sal-field"><label>Відпрац. днів</label><input type="number" id="sal-days-${emp.id}" value="${salaryMap[emp.id]?.worked_days||wd}"></div>
        </div>
        <div class="sal-row" style="margin-top:4px">
          <div class="sal-field"><label>Дзвінків за місяць</label><input type="number" id="sal-calls-${emp.id}" placeholder="1600" value="${salaryMap[emp.id]?.calls||''}"></div>
          <div class="sal-field"><label>Штраф (грн)</label><input type="number" id="sal-penalty-${emp.id}" placeholder="0" value="${salaryMap[emp.id]?.penalty||''}"></div>
          <div class="sal-field"><label>Примітка</label><input type="text" id="sal-note-${emp.id}" placeholder="" value="${salaryMap[emp.id]?.note||''}"></div>
        </div>`:`
        <div class="sal-row">
          <div class="sal-field"><label>Індивід. план (грн)</label><input type="number" id="sal-plan-${emp.id}" placeholder="260000" value="${salaryMap[emp.id]?.plan_amount||''}"></div>
          <div class="sal-field"><label>Факт оборот (грн)</label><input type="number" id="sal-fact-${emp.id}" placeholder="0" value="${salaryMap[emp.id]?.fact_amount||''}"></div>
          <div class="sal-field"><label>% повернень</label><input type="number" id="sal-ret-${emp.id}" placeholder="0" min="0" max="100" value="${salaryMap[emp.id]?.returns_pct||''}"></div>
          <div class="sal-field"><label>Відпрац. днів</label><input type="number" id="sal-days-${emp.id}" value="${salaryMap[emp.id]?.worked_days||wd}"></div>
        </div>
        <div class="sal-row" style="margin-top:4px">
          <div class="sal-field"><label>Доплата старш. мен. (грн)</label><input type="number" id="sal-bonus-${emp.id}" placeholder="0" value="${salaryMap[emp.id]?.senior_bonus||''}"></div>
          <div class="sal-field"><label>Штраф (грн)</label><input type="number" id="sal-penalty-${emp.id}" placeholder="0" value="${salaryMap[emp.id]?.penalty||''}"></div>
          <div class="sal-field"><label>Примітка</label><input type="text" id="sal-note-${emp.id}" placeholder="" value="${salaryMap[emp.id]?.note||''}"></div>
        </div>`}
        <div style="display:flex;gap:6px;margin-top:4px">
          <button onclick="calcSalary(${emp.id})" style="flex:1;padding:8px;background:#b84e30;color:#fff;border-radius:7px;font-weight:600;font-size:.82rem">🧮 Розрахувати</button>
          <button onclick="saveSalary(${emp.id})" style="flex:0 0 auto;padding:8px 14px;background:#2e7d52;color:#fff;border-radius:7px;font-weight:600;font-size:.82rem">💾 Зберегти</button>
        </div>
        <div id="sal-result-${emp.id}" style="margin-top:8px">
          ${salaryMap[emp.id]?.fact_amount?'<div style="font-size:.72rem;color:#8a7060">📋 Є збережені дані — натисни Розрахувати для перегляду</div>':'<div style="font-size:.75rem;color:#aaa">Введи дані та натисни Розрахувати</div>'}
        </div>
      </div>
    </div>
    <div style="font-size:.7rem;color:#8a7060;margin-bottom:6px">Календар ${MONTH_UA[M]} ${Y}</div>
    <div class="mgr-month">${calHtml}</div>
    <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
      <button class="btn-save" style="flex:1" onclick="closeMgrCardForce();openVacModalById(${emp.id})">🌴 Відпустка</button>
      <button class="btn-ghost btn" style="flex:1" onclick="openCustomRangeModalById(${emp.id})">✏️ Свій графік</button>
      <button class="btn-ghost btn" style="flex:1" onclick="openLevelModal(${emp.id},this)">⭐ Рівень</button>
      <button class="btn-ghost btn" style="flex:1" onclick="openTeamModal(${emp.id},this)">👥 Команда</button>
      <button class="btn-ghost btn" style="flex:0 0 auto;background:#f0d4d4;color:#b71c1c;border-color:#dca8a8" onclick="deactivateEmpById(${emp.id})">🗑️</button>
    </div>
  `;
  document.getElementById('mgr-card-ov').classList.add('open');
}
function closeMgrCard(e){ if(e&&e.target.id!=='mgr-card-ov')return; document.getElementById('mgr-card-ov').classList.remove('open'); }
function closeMgrCardForce(){ document.getElementById('mgr-card-ov').classList.remove('open'); }

// ══ VACATION RANGE ════════════════════════════════════
let vacEmpId=null;
function openVacModal(empId,name){
  vacEmpId=empId;
  document.getElementById('vac-emp-name').textContent=name;
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('vac-from').value=today;
  document.getElementById('vac-to').value=today;
  document.getElementById('vac-modal-ov').classList.add('open');
}
function closeVacModal(){ document.getElementById('vac-modal-ov').classList.remove('open'); }
async function saveVacation(){
  const from=document.getElementById('vac-from').value;
  const to=document.getElementById('vac-to').value;
  if(!from||!to||from>to){alert('Перевір дати');return;}
  setSave('Збереження...',false);
  try{
    const days=getDays(Y,M);
    const inRange=days.filter(d=>d.date>=from&&d.date<=to);
    for(const d of inRange){
      await api('/api/schedule',{method:'PUT',body:JSON.stringify({
        employee_id:vacEmpId,entry_date:d.date,status:'відпуск'
      })});
      schedMap[`${vacEmpId}_${d.date}`]={employee_id:vacEmpId,entry_date:d.date,status:'відпуск'};
    }
    closeVacModal();
    renderTable();renderStats();
    setSave(`Відпустку встановлено (${inRange.length} днів) ✓`,true);
  }catch(e){alert('Помилка: '+e.message);}
}

// ══ LATE POPUP (час + коментар) ══════════════════════
let lateEmpId=null,lateDate=null;
function openLatePopup(empId,date,name){
  lateEmpId=empId;lateDate=date;
  const existing=schedMap[`${empId}_${date}`];
  const note=existing?.note||'';
  const time=note.match(/\d{2}:\d{2}/)?.[0]||'';
  const comment=note.replace(/прийшов о \d{2}:\d{2}\s*/,'');
  document.getElementById('late-modal-title').textContent=`Запізнення — ${name}`;
  document.getElementById('late-time').value=time;
  document.getElementById('late-comment').value=comment;
  document.getElementById('late-modal-ov').classList.add('open');
}
function closeLateModal(){ document.getElementById('late-modal-ov').classList.remove('open'); }
async function saveLate(){
  const time=document.getElementById('late-time').value;
  const comment=document.getElementById('late-comment').value;
  const note=(time?`прийшов о ${time} `:'')+(comment||'');
  setSave('Збереження...',false);
  try{
    await api('/api/schedule',{method:'PUT',body:JSON.stringify({
      employee_id:lateEmpId,entry_date:lateDate,status:'запізн',note
    })});
    schedMap[`${lateEmpId}_${lateDate}`]={employee_id:lateEmpId,entry_date:lateDate,status:'запізн',note};
    closeLateModal();
    renderTable();
    setSave('Збережено ✓',true);
  }catch(e){alert('Помилка: '+e.message);}
}







// ══ POSITIONS ══════════════════════════════════════
const POSITIONS = {
  // Адмін блок
  'Мединська Ірина': 'Адмін офіс',
  'Чубострoєва Валентина': 'Адмін офіс',
  'Овсюченко Луїза': 'Адмін офіс',
  'Демидов Сергій': 'Медіабайер',
  'Озерна Карина': 'Контент/СММ',
  'Пальчун Дмитро': 'Адмін офіс',
  // Навчання
  'Бажан Данило': 'Коуч',
  'Саєнко Аліна': 'Рекрутер',
  'Великий Олександр': 'Наставник',
  // Бухгалтерія
  'Карпусь Анна': 'Бухгалтер',
  // Склад
  'Довбня Наталья': 'Нач. складу',
  'Терещенко Валерія': 'Пакувальник',
  'Шквира Марія': 'Пакувальник',
  'Руденко Вікторія': 'Фасовка',
  'Чоботько Влад': 'Вантажник',
  'Васильковський Богдан': 'Водій/Вантажник',
  // Логістика
  'Зайченко Олена': 'Логіст',
  'Ільєнкова Ольга': 'Логіст',
  // Керівництво
  'Щербина Катерина': 'СЕО',
  'Лунько Євгенія': 'Операційний директор',
  'Пальчун Елла': 'Комерційний директор',
  'Константинов Денис': 'Керівник маркетингу',
  'Шаповалова Вікторія': 'HR-D',
  // РЗПК
  'Чоповий Максим': 'Старший менеджер',
  'Шелковникова Оксана': 'Старший менеджер',
  'Кіндюшенко Аліна': 'Старший менеджер',
  'Екатерина П': 'РОП',
  // Гарячі
  'Романенко Антон': 'РОП',
  'Галаєва Анна': 'Директ менеджер',
  'Желюбовська Анастасія': 'Директ менеджер',
  'Мажара Аліна': 'Старший менеджер',
  // Відмови
  'Даніелла': 'РОП',
};

// ══ SAVE SALARY ════════════════════════════════════════
async function saveSalary(empId){
  const plan  = parseFloat(document.getElementById('sal-plan-'+empId).value)||0;
  const fact  = parseFloat(document.getElementById('sal-fact-'+empId).value)||0;
  const ret   = parseFloat(document.getElementById('sal-ret-'+empId).value)||0;
  const days  = parseInt(document.getElementById('sal-days-'+empId).value)||0;
  if(!plan||!fact){ alert('Введи план та оборот'); return; }
  try{
    const seniorBonus2=parseFloat(document.getElementById('sal-bonus-'+empId)?.value)||0;
    const penalty2=parseFloat(document.getElementById('sal-penalty-'+empId)?.value)||0;
    const note2=document.getElementById('sal-note-'+empId)?.value||'';
    const r = await api('/api/salary',{method:'PUT',body:JSON.stringify({
      employee_id:empId, calc_year:Y, calc_month:M,
      plan_amount:plan, fact_amount:fact, returns_pct:ret, worked_days:days,
      senior_bonus:seniorBonus2, penalty:penalty2, note:note2
    })});
    salaryMap[empId]=r;
    setSave('ЗП збережено ✓',true);
    // auto-calc after save
    calcSalary(empId);
  }catch(e){ alert('Помилка збереження: '+e.message); }
}

// ══ ROP PIN ═══════════════════════════════════════════
let ropUnlocked = false;
const ROP_PIN = '6773';

function checkRopPin(){
  const pin = document.getElementById('rop-pin-input')?.value;
  if(pin === ROP_PIN){
    ropUnlocked = true;
    document.getElementById('rop-pin-block').style.display='none';
    document.getElementById('sal-unlock-block').style.display='block';
  } else {
    alert('Невірний PIN');
  }
}

// ══ SALARY CALCULATOR ═════════════════════════════════
function fmtFull(n){
  return n.toLocaleString('uk-UA', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' ₴';
}

function calcSalary(empId){
  const emp = employees.find(e=>e.id===empId);
  const isRefuse = emp?.dept_code==='refuse';
  const fact = parseFloat(document.getElementById('sal-fact-'+empId).value)||0;
  const ret  = parseFloat(document.getElementById('sal-ret-'+empId).value)||0;
  const days = parseInt(document.getElementById('sal-days-'+empId).value)||0;
  const res  = document.getElementById('sal-result-'+empId);
  const seniorBonus = parseFloat(document.getElementById('sal-bonus-'+empId)?.value)||0;
  const penalty = parseFloat(document.getElementById('sal-penalty-'+empId)?.value)||0;

  if(!fact){ res.innerHTML='<div style="font-size:.75rem;color:#aaa">Введи суму замовлень / оборот</div>'; return; }

  // Повернення (спільне для всіх)
  const retNorm = 6;
  const retExcess = Math.max(0, ret - retNorm);
  const retCorrection = fact * retExcess / 100;
  const cleanBase = fact - retCorrection;

  let rate=0, bonusPct=0, rateLabel='', overtimeRate=400;
  let rows='';

  if(isRefuse){
    // ══ ВІДМОВИ: по кількості замовлень ══
    const orders = parseFloat(document.getElementById('sal-plan-'+empId).value)||0;
    const calls  = parseFloat(document.getElementById('sal-calls-'+empId)?.value)||0;
    if(!orders){ res.innerHTML='<div style="font-size:.75rem;color:#aaa">Введи кількість замовлень</div>'; return; }

    overtimeRate = 450;

    // Шкала по замовленнях
    if(orders >= 150){ rate=11000; bonusPct=9; rateLabel='від 150 замовлень 🏆'; }
    else if(orders >= 115){ rate=10000; bonusPct=8; rateLabel='від 115 замовлень'; }
    else if(orders >= 90){ rate=9000; bonusPct=7; rateLabel='від 90 замовлень'; }
    else { rate=0; bonusPct=5; rateLabel='менше 90 замовлень (відпустка/лікарняний)'; }

    // Умови повної ставки: 22 дні + 1600 дзвінків + норма замовлень
    const fullRate = days>=22 && (calls>=1600||calls===0) && orders>=90;
    const actualRate = fullRate ? rate : Math.round(rate * days / 22);
    const bonus = cleanBase * bonusPct / 100;
    const overtimeDays = Math.max(0, days-22);
    const overtimePay = overtimeDays * overtimeRate;
    const total = actualRate + bonus + overtimePay + seniorBonus - penalty;

    rows=`
      <div class="sal-result-row"><span>Замовлень</span><span>${orders} — ${rateLabel}</span></div>
      <div class="sal-result-row"><span>Відпрацьовано днів</span><span>${days} з 22</span></div>
      ${calls>0?`<div class="sal-result-row"><span>Дзвінків</span><span>${calls} ${calls>=1600?'✅':'⚠️ <1600'}</span></div>`:''}
      <div class="sal-result-row"><span>Чиста сума замовлень (після повернень)</span><span>${fmtFull(cleanBase)}</span></div>
      ${retExcess>0?`<div class="sal-result-row"><span>Коригування повернень (${retExcess}% надлишок)</span><span style="color:#ef5350">−${fmtFull(retCorrection)}</span></div>`:''}
      <div class="sal-result-row"><span>Ставка ${fullRate?'(повна)':'(пропорційна '+days+'/22)'}</span><span>${fmtFull(actualRate)}</span></div>
      <div class="sal-result-row"><span>Бонус ${bonusPct}% від ${fmtFull(cleanBase)}</span><span>${fmtFull(bonus)}</span></div>
      ${overtimeDays>0?`<div class="sal-result-row"><span>Переробка ${overtimeDays} дн. × 450 ₴</span><span style="color:#2e7d52">+${fmtFull(overtimePay)}</span></div>`:''}
      ${seniorBonus>0?`<div class="sal-result-row"><span>Доплата</span><span style="color:#2e7d52">+${fmtFull(seniorBonus)}</span></div>`:''}
      ${penalty>0?`<div class="sal-result-row"><span>Штраф</span><span style="color:#ef5350">−${fmtFull(penalty)}</span></div>`:''}
      <div class="sal-result-row green"><span>💰 Підсумкова ЗП</span><span>${fmtFull(total)}</span></div>`;

  } else {
    // ══ РЗПК / ГАРЯЧІ: по % виконання плану ══
    const plan = parseFloat(document.getElementById('sal-plan-'+empId).value)||0;
    if(!plan){ res.innerHTML='<div style="font-size:.75rem;color:#aaa">Введи план та оборот</div>'; return; }
    const pct = Math.round(cleanBase / plan * 100);

    if(days < 15 && pct < 80){ rate=8000; bonusPct=4; rateLabel='Неповний місяць'; }
    else if(pct < 70){ rate=13000; bonusPct=4; rateLabel='Зона ризику (<70%)'; }
    else if(pct < 80){ rate=13000; bonusPct=4.5; rateLabel='Базова страховка (70–79%)'; }
    else if(pct < 100){ rate=15000; bonusPct=5; rateLabel='Стабільна зона (80–99%)'; }
    else if(pct < 110){ rate=15000; bonusPct=6; rateLabel='План виконано (100–110%)'; }
    else { rate=15000; bonusPct=7; rateLabel='Топ-перформер (110%+) 🏆'; }

    const bonus = cleanBase * bonusPct / 100;
    const overtimeDays = Math.max(0, days-22);
    const overtimePay = overtimeDays * 400;
    const total = rate + bonus + overtimePay + seniorBonus - penalty;

    rows=`
      <div class="sal-result-row"><span>Виконання плану</span><span>${pct}% — ${rateLabel}</span></div>
      <div class="sal-result-row"><span>Чиста база (після повернень)</span><span>${fmtFull(cleanBase)}</span></div>
      ${retExcess>0?`<div class="sal-result-row"><span>Коригування повернень (${retExcess}% надлишок)</span><span style="color:#ef5350">−${fmtFull(retCorrection)}</span></div>`:''}
      <div class="sal-result-row"><span>Ставка</span><span>${fmtFull(rate)}</span></div>
      <div class="sal-result-row"><span>Бонус ${bonusPct}% від ${fmtFull(cleanBase)}</span><span>${fmtFull(bonus)}</span></div>
      ${overtimeDays>0?`<div class="sal-result-row"><span>Переробка ${overtimeDays} дн. × 400 ₴</span><span style="color:#2e7d52">+${fmtFull(overtimePay)}</span></div>`:''}
      ${seniorBonus>0?`<div class="sal-result-row"><span>Доплата старш. менеджера</span><span style="color:#2e7d52">+${fmtFull(seniorBonus)}</span></div>`:''}
      ${penalty>0?`<div class="sal-result-row"><span>Штраф</span><span style="color:#ef5350">−${fmtFull(penalty)}</span></div>`:''}
      <div class="sal-result-row green"><span>💰 Підсумкова ЗП</span><span>${fmtFull(total)}</span></div>`;
  }

  res.innerHTML = `<div class="sal-result">${rows}</div>`;
}




// ══ GOOGLE SHEETS EXPORT ══════════════════════════════
function updateExportSheetName(){
  const MONTHS=['','Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
  const DEPT_NAMES={'rzpk':'РЗПК','hot':'Гарячі','refuse':'Відмови',''  :'Всі'};
  const deptKey=document.getElementById('export-dept').value;
  const deptLabel=DEPT_NAMES[deptKey]||'';
  document.getElementById('export-sheet-name').value=`ЗП ${deptLabel ? deptLabel+' ' : ''}${MONTHS[M]} ${Y}`.trim();
}

function openExportModal(){
  const MONTHS=['','Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
  const DEPT_NAMES={'rzpk':'РЗПК','hot':'Гарячі','refuse':'Відмови',''  :'Всі'};
  const deptKey=curDept==='all'?'':curDept;
  const deptLabel=DEPT_NAMES[deptKey]||'';
  document.getElementById('export-sheet-name').value=`ЗП ${deptLabel ? deptLabel+' ' : ''}${MONTHS[M]} ${Y}`.trim();
  document.getElementById('export-dept').value=deptKey;
  document.getElementById('export-status').textContent='';
  document.getElementById('export-modal-ov').classList.add('open');
}
function closeExportModal(){ document.getElementById('export-modal-ov').classList.remove('open'); }
async function doExport(){
  const sheetName=document.getElementById('export-sheet-name').value.trim();
  const dept=document.getElementById('export-dept').value;
  const statusEl=document.getElementById('export-status');
  statusEl.textContent='Експортуємо...';
  statusEl.style.color='#8a7060';
  try{
    const r=await api('/api/export/salary',{
      method:'POST',
      body:JSON.stringify({year:Y,month:M,dept:dept||undefined,sheet_name:sheetName})
    });
    if(r.ok){
      statusEl.textContent='✅ '+r.message;
      statusEl.style.color='#2e7d52';
    } else {
      statusEl.textContent='⚠️ '+r.message;
      statusEl.style.color='#b84e30';
    }
  }catch(e){
    statusEl.textContent='❌ Помилка: '+e.message;
    statusEl.style.color='#ef5350';
  }
}


function openVacModalById(empId){
  const emp=employees.find(e=>e.id===empId);
  closeMgrCardForce();
  openVacModal(empId,emp?.name||'');
}
function openCustomRangeModalById(empId){
  const emp=employees.find(e=>e.id===empId);
  openCustomRangeModal(empId,emp?.name||'');
}

// ══ CUSTOM RANGE ══════════════════════════════════════
let customRangeEmpId=null;
function openCustomRangeModal(empId,name){
  customRangeEmpId=empId;
  document.getElementById('custom-range-emp').textContent=name;
  document.getElementById('custom-range-status').value='';
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('custom-range-from').value=today;
  document.getElementById('custom-range-to').value=today;
  closeMgrCardForce();
  document.getElementById('custom-range-ov').classList.add('open');
}
function closeCustomRangeModal(){ document.getElementById('custom-range-ov').classList.remove('open'); }
async function saveCustomRange(){
  const status=document.getElementById('custom-range-status').value.trim();
  const from=document.getElementById('custom-range-from').value;
  const to=document.getElementById('custom-range-to').value;
  if(!status){alert('Введи статус');return;}
  if(!from||!to||from>to){alert('Перевір дати');return;}
  setSave('Збереження...',false);
  try{
    const days=getDays(Y,M);
    const inRange=days.filter(d=>d.date>=from&&d.date<=to);
    for(const d of inRange){
      await api('/api/schedule',{method:'PUT',body:JSON.stringify({
        employee_id:customRangeEmpId,entry_date:d.date,status
      })});
      schedMap[`${customRangeEmpId}_${d.date}`]={employee_id:customRangeEmpId,entry_date:d.date,status};
    }
    closeCustomRangeModal();
    renderTable();renderStats();
    setSave(`Статус "${status}" поставлено на ${inRange.length} днів ✓`,true);
  }catch(e){alert('Помилка: '+e.message);}
}


// ══ ARCHIVE ════════════════════════════════════════════
let archivedEmployees = [];

async function toggleArchive(){
  showArchive = !showArchive;
  const btn = document.getElementById('btn-archive');
  if(showArchive){
    btn.style.background='#3a2a10';
    btn.style.color='#ffc107';
    // Load archived employees
    try{
      const all = await api('/api/employees/archived');
      archivedEmployees = all;
    }catch(e){ archivedEmployees=[]; }
  } else {
    btn.style.background='';
    btn.style.color='';
    archivedEmployees=[];
  }
  renderAll();
}

async function restoreEmployee(empId, name){
  if(!confirm(`Відновити ${name}?`)) return;
  try{
    await api('/api/employees/'+empId,{method:'PATCH',body:JSON.stringify({is_active:true})});
    archivedEmployees = archivedEmployees.filter(e=>e.id!==empId);
    // reload employees
    employees = await api('/api/employees');
    renderAll();
    setSave(`${name} відновлено ✓`,true);
  }catch(e){alert('Помилка: '+e.message);}
}

// ══ TEAM CHANGE ═══════════════════════════════════════
let teamEmpId=null;
function openTeamModal(empId,btn){
  const emp=employees.find(e=>e.id===empId);
  const name=emp?.name||'';
  const curTeam=emp?.team||'Нові співробітники';
  teamEmpId=empId;
  document.getElementById('team-emp-name').textContent=name;
  document.getElementById('team-select').value=curTeam;
  closeMgrCardForce();
  document.getElementById('team-modal-ov').classList.add('open');
}
function closeTeamModal(){ document.getElementById('team-modal-ov').classList.remove('open'); }
async function saveTeam(){
  const team=document.getElementById('team-select').value;
  setSave('Збереження...',false);
  try{
    await api('/api/employees/'+teamEmpId,{method:'PATCH',body:JSON.stringify({team})});
    const emp=employees.find(e=>e.id===teamEmpId);
    if(emp) emp.team=team;
    closeTeamModal();
    renderAll();
    setSave('Команду змінено ✓',true);
  }catch(e){alert('Помилка: '+e.message);}
}


function deactivateEmpById(empId){
  const emp=employees.find(e=>e.id===empId);
  deactivateEmp(empId,emp?.name||'');
}

// ══ DEACTIVATE EMPLOYEE ═══════════════════════════════
async function deactivateEmp(empId, name){
  if(!confirm(`Архівувати ${name}?\nСпівробітник зникне з графіка, але дані збережуться. Можна відновити через кнопку Архів.`)) return;
  try{
    await api('/api/employees/'+empId,{method:'PATCH',body:JSON.stringify({is_active:false})});
    employees = employees.filter(e=>e.id!==empId);
    closeMgrCardForce();
    renderAll();
    setSave(`${name} архівовано ✓`,true);
  }catch(e){alert('Помилка: '+e.message);}
}

// ══ LEVEL CHANGE ══════════════════════════════════════
let levelEmpId=null, selectedLevel=null;
function openLevelModal(empId,btn){
  const emp=employees.find(e=>e.id===empId);
  const name=emp?.name||'';
  const curLevel=emp?.level||'mid';
  levelEmpId=empId;
  selectedLevel=curLevel;
  document.getElementById('level-emp-name').textContent=name;
  closeMgrCardForce();
  // highlight current
  ['top','mid','jun'].forEach(l=>{
    const btn=document.getElementById('lopt-'+l);
    btn.style.border=l===curLevel?'2px solid #b84e30':'2px solid transparent';
    btn.style.opacity=l===curLevel?'1':'0.7';
  });
  document.getElementById('level-modal-ov').classList.add('open');
}
function selLevel(level){
  selectedLevel=level;
  ['top','mid','jun'].forEach(l=>{
    const btn=document.getElementById('lopt-'+l);
    btn.style.border=l===level?'2px solid #b84e30':'2px solid transparent';
    btn.style.opacity=l===level?'1':'0.7';
  });
}
function closeLevelModal(){ document.getElementById('level-modal-ov').classList.remove('open'); }
async function saveLevel(){
  if(!levelEmpId||!selectedLevel) return;
  setSave('Збереження...',false);
  try{
    await api('/api/employees/'+levelEmpId,{method:'PATCH',body:JSON.stringify({level:selectedLevel})});
    // update local
    const emp=employees.find(e=>e.id===levelEmpId);
    if(emp) emp.level=selectedLevel;
    closeLevelModal();
    await loadMonthData();
    setSave('Рівень змінено ✓',true);
  }catch(e){alert('Помилка: '+e.message);}
}

// ══ INIT ══════════════════════════════════════════════
(async()=>{
  try{ await loadAll(); }
  catch(e){
    document.getElementById('table-area').innerHTML=
      `<div class="loading" style="color:#ef5350">⚠️ Не вдалось підключитись до API.<br>
       <small style="color:#5a4535">Задеплой бекенд → заміни API URL у рядку const API='...'</small></div>`;
    document.getElementById('stats-row').innerHTML='';
  }
})();
</script>

<!-- MANAGER CARD -->
<div class="mgr-card-ov" id="mgr-card-ov" onclick="closeMgrCard(event)">
  <div class="mgr-card" id="mgr-card-content">
  </div>
</div>


<!-- LATE MODAL -->
<div class="modal-ov" id="late-modal-ov">
  <div class="modal">
    <h3 id="late-modal-title">⏰ Запізнення</h3>
    <label>Час приходу</label>
    <input type="time" id="late-time" placeholder="09:30">
    <label>Коментар (необов.)</label>
    <input type="text" id="late-comment" placeholder="причина...">
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeLateModal()">Скасувати</button>
      <button class="btn-save"   onclick="saveLate()">Зберегти</button>
    </div>
  </div>
</div>

<!-- VACATION RANGE MODAL -->
<div class="modal-ov" id="vac-modal-ov">
  <div class="modal vac-modal">
    <h3>🌴 Відпустка</h3>
    <div id="vac-emp-name" style="font-size:.8rem;color:#8a7060;margin-bottom:12px"></div>
    <label>Від</label>
    <input type="date" id="vac-from">
    <label>До</label>
    <input type="date" id="vac-to">
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeVacModal()">Скасувати</button>
      <button class="btn-save"   onclick="saveVacation()">Поставити відпустку</button>
    </div>
  </div>
</div>

<!-- LEVEL MODAL -->
<div class="modal-ov" id="level-modal-ov">
  <div class="modal">
    <h3>⭐ Змінити рівень</h3>
    <div id="level-emp-name" style="font-size:.8rem;color:#8a7060;margin-bottom:14px"></div>
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <button class="level-opt" id="lopt-top" onclick="selLevel('top')"
        style="flex:1;padding:14px;border-radius:10px;background:#d4e4f0;color:#1a5c8a;font-weight:700;font-size:.9rem;border:2px solid transparent;transition:.15s">
        ТОП<br><span style="font-size:.7rem;font-weight:400">260К/міс</span>
      </button>
      <button class="level-opt" id="lopt-mid" onclick="selLevel('mid')"
        style="flex:1;padding:14px;border-radius:10px;background:#e4d4f0;color:#6a1a80;font-weight:700;font-size:.9rem;border:2px solid transparent;transition:.15s">
        МІДЛ<br><span style="font-size:.7rem;font-weight:400">235К/міс</span>
      </button>
      <button class="level-opt" id="lopt-jun" onclick="selLevel('jun')"
        style="flex:1;padding:14px;border-radius:10px;background:#d4edd8;color:#1a5c30;font-weight:700;font-size:.9rem;border:2px solid transparent;transition:.15s">
        ДЖУН<br><span style="font-size:.7rem;font-weight:400">187К/міс</span>
      </button>
    </div>
    <div style="font-size:.75rem;color:#8a7060;margin-bottom:14px">
      ⚡ Зміна рівня автоматично перерахує план відділу
    </div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeLevelModal()">Скасувати</button>
      <button class="btn-save"   onclick="saveLevel()">Зберегти</button>
    </div>
  </div>
</div>

<!-- TEAM MODAL -->
<div class="modal-ov" id="team-modal-ov">
  <div class="modal">
    <h3>👥 Змінити команду</h3>
    <div id="team-emp-name" style="font-size:.8rem;color:#8a7060;margin-bottom:14px"></div>
    <label>Команда</label>
    <select id="team-select" style="width:100%;background:#ede8e0;border:1px solid #c8c0b4;color:#2c2218;border-radius:7px;padding:7px 11px;font-size:.88rem;margin-bottom:14px;outline:none">
      <option value="РОП">РОП</option>
      <option value="Команда Чопового">Команда Чопового</option>
      <option value="Команда Шелковникової">Команда Шелковникової</option>
      <option value="Команда Кіндюшенко">Команда Кіндюшенко</option>
      <option value="Нові співробітники">Нові співробітники</option>
      <option value="Віддалено">Віддалено</option>
    </select>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeTeamModal()">Скасувати</button>
      <button class="btn-save"   onclick="saveTeam()">Зберегти</button>
    </div>
  </div>
</div>

<!-- CUSTOM RANGE MODAL -->
<div class="modal-ov" id="custom-range-ov">
  <div class="modal">
    <h3>✏️ Свій графік на діапазон</h3>
    <div id="custom-range-emp" style="font-size:.8rem;color:#8a7060;margin-bottom:12px"></div>
    <label>Статус (наприклад 10-21)</label>
    <input type="text" id="custom-range-status" placeholder="10-21" style="margin-bottom:4px">
    <label>Від</label>
    <input type="date" id="custom-range-from">
    <label>До</label>
    <input type="date" id="custom-range-to">
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeCustomRangeModal()">Скасувати</button>
      <button class="btn-save" onclick="saveCustomRange()">Поставити</button>
    </div>
  </div>
</div>

<!-- EXPORT MODAL -->
<div class="modal-ov" id="export-modal-ov">
  <div class="modal">
    <h3>📊 Експорт ЗП в Google Sheets</h3>
    <div style="font-size:.78rem;color:#8a7060;margin-bottom:14px">Дані будуть записані у нову вкладку таблиці бухгалтера</div>
    <label>Назва вкладки в таблиці</label>
    <input type="text" id="export-sheet-name" placeholder="ЗП Липень 2026">
    <label>Відділ</label>
    <select id="export-dept" onchange="updateExportSheetName()" style="width:100%;background:#ede8e0;border:1px solid #c8c0b4;color:#2c2218;border-radius:7px;padding:7px 11px;font-size:.88rem;margin-bottom:12px;outline:none">
      <option value="">Всі відділи</option>
      <option value="rzpk">РЗПК</option>
      <option value="hot">Гарячі продажі</option>
      <option value="refuse">Відмови</option>
    </select>
    <div id="export-status" style="font-size:.78rem;color:#8a7060;min-height:20px;margin-bottom:8px"></div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeExportModal()">Скасувати</button>
      <button class="btn-save" onclick="doExport()" style="background:#2e7d52">📤 Експортувати</button>
    </div>
  </div>
</div>
</body>
</html>
