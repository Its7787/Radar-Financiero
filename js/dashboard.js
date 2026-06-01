/* ================================================================
   RADAR Financiero — Dashboard JavaScript
   Conexión directa a Supabase (Serverless)
   Autenticación simplificada sin contraseña via localStorage
   ================================================================ */

'use strict';

// ── CONFIGURACIÓN DE SUPABASE ─────────────────────────────────
// NOTA: Reemplaza estos valores con las credenciales reales de tu panel de Supabase
const SUPABASE_URL = 'https://tu-proyecto-id.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key-de-supabase-aqui';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── ESTADOS DE LA APLICACIÓN ─────────────────────────────────
let sessionUser = null;
let userRole = 'viewer';

let BANKS = [];
let DPF_RATES = [];
let AHORRO_RATES = [];
let CREDITO_RATES = [];
let INDICATORS = [];
let RECENT_CHANGES = [
  { banco: 'Banco Unión',   producto: 'DPF', plazo: '360d', prev: 5.25, curr: 5.50, fecha: 'Hoy 09:30' },
  { banco: 'BancoSol',      producto: 'DPF', plazo: '180d', prev: 4.10, curr: 4.30, fecha: 'Hoy 08:15' },
  { banco: 'Banco Fie',     producto: 'DPF', plazo: '720d', prev: 6.00, curr: 6.20, fecha: 'Ayer 16:45' },
  { banco: 'Banco Fortaleza', producto: 'CA', plazo: '—',   prev: 2.40, curr: 2.60, fecha: 'Ayer 14:20' },
  { banco: 'Banco BISA',    producto: 'DPF', plazo: '1080d', prev: 6.20, curr: 6.40, fecha: 'Ayer 11:00' },
];
let ALERTS_DATA = [
  { id: 1, type: 'green', title: 'Nueva tasa DPF — Banco Unión',     msg: 'Banco Unión actualizó su tasa DPF 360d de 5.25% a 5.50%', time: 'Hace 30 min',  read: false },
  { id: 2, type: 'amber', title: 'Inflación actualizada — INE',       msg: 'INE publicó inflación acumulada: 3.21% (+0.12% vs anterior)', time: 'Hace 2 h',   read: false },
  { id: 3, type: 'blue',  title: 'UFV actualizada — BCB',              msg: 'Nueva UFV: 2.425810 BOB (actualización diaria)',           time: 'Hace 4 h',   read: false },
  { id: 4, type: 'green', title: 'BancoSol mejora tasa DPF 180d',     msg: 'Tasa pasó de 4.10% a 4.30% en Bolivianos',                 time: 'Ayer 16:45', read: true  },
  { id: 5, type: 'amber', title: 'Oportunidad: Banco Fortaleza',      msg: 'Fortaleza ofrece DPF 1080d al 6.90%, mejor del mercado',   time: 'Ayer 14:20', read: true  },
];

let watchlist = [];
let allRatesRaw = []; // Guarda todas las tasas recibidas de Supabase

// Charts instances (to destroy on re-render)
const charts = {};

// ── PROTECCIÓN DE ACCESO & AUTENTICACIÓN (LOCALSTORAGE) ───────
function checkAuth() {
  const email = localStorage.getItem('radar_user_email');
  const name  = localStorage.getItem('radar_user_name');
  
  if (!email) {
    console.log('[RADAR] Sesión no detectada en localStorage. Redirigiendo a index.html...');
    window.location.href = 'index.html';
    return false;
  }
  
  sessionUser = { email, name };
  userRole = email.toLowerCase().includes('admin') ? 'admin' : 'viewer';
  
  console.log('[RADAR] Usuario autenticado:', email, 'Rol asignado:', userRole);
  
  // Actualizar UI del usuario
  const avatarElements = document.querySelectorAll('.user-avatar');
  avatarElements.forEach(avatar => {
    avatar.textContent = email.substring(0, 2).toUpperCase();
  });
  
  const nameEl = document.querySelector('.user-info .user-name');
  if (nameEl) nameEl.textContent = name || email.split('@')[0];

  const roleEl = document.querySelector('.user-info .user-role');
  if (roleEl) {
    roleEl.textContent = userRole === 'admin' ? 'Administrador' : 'Inversionista';
  }
  
  // Ocultar o mostrar pestaña de administración según el rol
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) {
    adminNav.style.display = userRole === 'admin' ? 'flex' : 'none';
  }

  return true;
}

// ── CARGA DINÁMICA DE DATOS DESDE SUPABASE ─────────────────────
async function loadAllData() {
  try {
    // 1. Obtener Bancos
    const { data: banksData, error: banksErr } = await supabase
      .from('banks')
      .select('*')
      .order('name', { ascending: true });

    if (banksErr) throw banksErr;
    BANKS = banksData;

    // 2. Obtener Tasas con sus Relaciones (Joins)
    const { data: ratesData, error: ratesErr } = await supabase
      .from('rates')
      .select(`
        id,
        rate,
        term_days,
        effective_date,
        banks ( id, short_name, rating, type, active ),
        financial_products ( id, name, type, currency, min_amount )
      `);

    if (ratesErr) throw ratesErr;
    allRatesRaw = ratesData;

    // Parsear tasas recibidas (mantienen la estructura gracias al select relacional)
    parseDPFRates(allRatesRaw);
    parseAhorroRates(allRatesRaw);
    parseCreditoRates(allRatesRaw);

    // 3. Obtener Indicadores Económicos
    const { data: indicatorsData, error: indicatorsErr } = await supabase
      .from('indicators')
      .select('*')
      .order('code', { ascending: true });

    if (indicatorsErr) throw indicatorsErr;
    
    INDICATORS = indicatorsData.map(ind => ({
      id: ind.id,
      name: ind.name,
      code: ind.code,
      value: parseFloat(ind.value),
      unit: ind.unit,
      source: ind.source,
      change: ind.code === 'UFV' ? '+0.00082' : ind.code === 'INF' ? '+0.12%' : 'Estable'
    }));

    // 4. Sincronizar Watchlist local
    loadWatchlist();

    // 5. Renderizar todas las vistas
    renderAllViews();

  } catch (err) {
    console.error('[RADAR] Error al cargar datos desde Supabase:', err.message || err);
  }
}

// ── AUXILIARES DE PARSEO DE DATOS ──────────────────────────────
function parseDPFRates(rawRates) {
  const grouped = {};
  rawRates.forEach(r => {
    if (r.financial_products && r.financial_products.type === 'DPF' && r.banks && r.banks.active) {
      const bankCode = r.banks.short_name;
      if (!grouped[bankCode]) {
        grouped[bankCode] = {
          bank: bankCode,
          rating: r.banks.rating || 'A',
          d30: 0, d60: 0, d90: 0, d180: 0, d360: 0, d720: 0, d1080: 0
        };
      }
      const term = r.term_days;
      const rate = parseFloat(r.rate);
      if (term === 30) grouped[bankCode].d30 = rate;
      else if (term === 60) grouped[bankCode].d60 = rate;
      else if (term === 90) grouped[bankCode].d90 = rate;
      else if (term === 180) grouped[bankCode].d180 = rate;
      else if (term === 360) grouped[bankCode].d360 = rate;
      else if (term === 720) grouped[bankCode].d720 = rate;
      else if (term === 1080) grouped[bankCode].d1080 = rate;
    }
  });
  DPF_RATES = Object.values(grouped);
}

function parseAhorroRates(rawRates) {
  const grouped = {};
  rawRates.forEach(r => {
    if (r.financial_products && r.financial_products.type === 'CajaAhorro' && r.banks && r.banks.active) {
      const bankCode = r.banks.short_name;
      if (!grouped[bankCode]) {
        grouped[bankCode] = {
          bank: bankCode,
          tipo: r.banks.type,
          bob: 0,
          usd: 0,
          minimo: r.financial_products.min_amount ? `Bs. ${r.financial_products.min_amount}` : 'Bs. 0',
          beneficios: r.financial_products.name || 'Sin comisión'
        };
      }
      if (r.financial_products.currency === 'BOB') grouped[bankCode].bob = parseFloat(r.rate);
      if (r.financial_products.currency === 'USD') grouped[bankCode].usd = parseFloat(r.rate);
    }
  });
  AHORRO_RATES = Object.values(grouped);
}

function parseCreditoRates(rawRates) {
  const grouped = {};
  rawRates.forEach(r => {
    if (r.financial_products && r.financial_products.type === 'Credito' && r.banks && r.banks.active) {
      const bankCode = r.banks.short_name;
      if (!grouped[bankCode]) {
        grouped[bankCode] = {
          bank: bankCode,
          tipo: r.financial_products.name || 'Crédito de Vivienda',
          bob: 0,
          usd: 0,
          plazo: 'Hasta 30 años',
          costo: 'Seguros incluidos'
        };
      }
      if (r.financial_products.currency === 'BOB') grouped[bankCode].bob = parseFloat(r.rate);
      if (r.financial_products.currency === 'USD') grouped[bankCode].usd = parseFloat(r.rate);
    }
  });
  CREDITO_RATES = Object.values(grouped);
}

// ── WATCHLIST LOCAL STORAGE SYNC ───────────────────────────────
function loadWatchlist() {
  const localData = localStorage.getItem('radar_watchlist');
  if (localData) {
    try {
      watchlist = JSON.parse(localData);
    } catch {
      watchlist = [];
    }
  } else {
    watchlist = [];
  }
}

window.addToWatchlist = function(bankShort, productType, rateVal) {
  if (watchlist.find(w => w.bank === bankShort && w.product === productType)) return;

  watchlist.push({
    bank: bankShort,
    product: productType,
    rate: parseFloat(rateVal)
  });

  localStorage.setItem('radar_watchlist', JSON.stringify(watchlist));
  updateWatchlistCount();
  renderWatchlist();
};

window.removeFromWatchlist = function(idx) {
  watchlist.splice(idx, 1);
  localStorage.setItem('radar_watchlist', JSON.stringify(watchlist));
  updateWatchlistCount();
  renderWatchlist();
};

// ── RENDER SYSTEM ──────────────────────────────────────────────
function renderAllViews() {
  renderRecentChanges();
  renderDPFTable(DPF_RATES);
  renderAhorroTable();
  renderCreditoTable();
  renderIndicators();
  renderAlerts();
  renderWatchlist();
  renderWatchAddTable();
  
  renderAdminBanks();
  renderAdminTasas();
  renderAdminIndicadores();
  updateWatchlistCount();

  document.getElementById('btn-calcular-riesgo')?.click();
  document.getElementById('btn-calc-dpf')?.click();
  document.getElementById('btn-calc-real')?.click();
}

// ── NAVIGATION ──────────────────────────────────────────────
const PAGE_TITLES = {
  overview:     ['Dashboard', 'Resumen general del mercado financiero boliviano'],
  comparador:   ['Comparador de Tasas', 'Compara DPF, cajas de ahorro y créditos'],
  indicadores:  ['Indicadores Económicos', 'Bolivia — Banco Central & INE'],
  riesgo:       ['Modelo de Riesgo', 'Evalúa el riesgo real de tu inversión'],
  calculadoras: ['Calculadoras', 'DPF, rendimiento real y simulador de escenarios'],
  watchlist:    ['Mi Watchlist', 'Productos financieros guardados'],
  alertas:      ['Alertas', 'Notificaciones y configuración de alertas'],
  admin:        ['Panel Administrativo', 'Gestión de bancos, tasas, indicadores y usuarios'],
};

function navigate(view) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const navEl = document.getElementById(`nav-${view}`);
  if (navEl) navEl.classList.add('active');
  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) viewEl.classList.add('active');
  const [title, sub] = PAGE_TITLES[view] || ['Dashboard', ''];
  document.getElementById('page-title-text').textContent = title;
  document.getElementById('page-subtitle').textContent   = sub;
  initViewCharts(view);
  
  if (view === 'admin') {
    renderAdminUsers();
  }
}

document.querySelectorAll('.nav-item[data-view]').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.view));
});

// Sidebar toggle
const sidebar = document.getElementById('sidebar');
const main    = document.getElementById('main');
document.getElementById('menu-btn').addEventListener('click', () => {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('full');
  }
});

// Cerrar sesión
const logoutNav = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.getAttribute('href') === 'index.html');
if (logoutNav) {
  logoutNav.removeAttribute('href');
  logoutNav.innerHTML = `
    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    <span>Cerrar Sesión</span>
  `;
  logoutNav.addEventListener('click', () => {
    localStorage.removeItem('radar_user_email');
    localStorage.removeItem('radar_user_name');
    localStorage.removeItem('radar_user_phone');
    localStorage.removeItem('radar_watchlist');
    window.location.href = 'index.html';
  });
}

// Tabs
document.querySelectorAll('.tabs').forEach(tabsEl => {
  tabsEl.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    const parent = tab.closest('.tabs-wrap') || tab.closest('.view');
    const targetId = tab.dataset.tab;
    parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const section = tab.closest('.view') || document.body;
    section.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `tab-${targetId}`);
    });
  });
});

// ── CHART.JS GLOBAL DEFAULTS ───────────────────────────────
Chart.defaults.color          = '#94a3b8';
Chart.defaults.borderColor    = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family    = 'Inter';
Chart.defaults.font.size      = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding  = 16;

const MONTHS = ['Jun','Jul','Ago','Sep','Oct','Nov','Dic','Ene','Feb','Mar','Abr','May'];

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function initViewCharts(view) {
  if (view === 'overview') {
    initRatesTrendChart();
    initTopBanksChart();
  }
  if (view === 'indicadores') {
    initInflationChart();
    initUFVChart();
  }
}

// [Lógica interna de gráficos omitida por espacio para mantener el foco en la API]
// ── OVERVIEW CHARTS ────────────────────────────────────────
function initRatesTrendChart() {
  destroyChart('rates-trend');
  const ctx = document.getElementById('chart-rates-trend')?.getContext('2d');
  if (!ctx) return;
  const trendBUN = [4.80,4.80,4.90,5.00,5.00,5.10,5.10,5.20,5.25,5.25,5.40,5.50];
  const trendBNB = [4.60,4.70,4.70,4.80,4.90,4.90,5.00,5.00,5.10,5.10,5.15,5.20];
  const trendFOR = [5.00,5.10,5.20,5.30,5.40,5.50,5.50,5.60,5.60,5.65,5.70,5.70];
  charts['rates-trend'] = new Chart(ctx, {
    type:'line',
    data:{
      labels:MONTHS,
      datasets:[
        { label:'Banco Unión',   data:trendBUN, borderColor:'#50C878', backgroundColor:'rgba(80,200,120,.08)', tension:.4, pointRadius:3, pointHoverRadius:5, fill:true },
        { label:'BNB',          data:trendBNB, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.06)', tension:.4, pointRadius:3, pointHoverRadius:5, fill:true },
        { label:'Banco Fortaleza',data:trendFOR,borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,.06)', tension:.4, pointRadius:3, pointHoverRadius:5, fill:true },
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{ legend:{ position:'top' }, tooltip:{ callbacks:{ label: ctx=>`${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%` } } },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ callback:v=>`${v}%` } }
      }
    }
  });
}

function initTopBanksChart() {
  destroyChart('top-banks');
  const ctx = document.getElementById('chart-top-banks')?.getContext('2d');
  if (!ctx) return;
  const sorted = [...DPF_RATES].sort((a,b)=>b.d360-a.d360).slice(0,5);
  charts['top-banks'] = new Chart(ctx, {
    type:'bar',
    data:{
      labels:sorted.map(r=>r.bank),
      datasets:[{
        label:'Tasa DPF 360d (%)',
        data:sorted.map(r=>r.d360),
        backgroundColor:['rgba(80,200,120,.8)','rgba(59,130,246,.8)','rgba(139,92,246,.8)','rgba(245,158,11,.8)','rgba(239,68,68,.8)'],
        borderRadius:6,borderSkipped:false,
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx=>`${ctx.parsed.y.toFixed(2)}%` } } },
      scales:{
        x:{ grid:{display:false} },
        y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ callback:v=>`${v}%` }, beginAtZero:false, min:4.5 }
      }
    }
  });
}

function initInflationChart() {
  destroyChart('inflation');
  const ctx = document.getElementById('chart-inflation')?.getContext('2d');
  if (!ctx) return;
  const data = [2.45,2.52,2.61,2.70,2.78,2.89,2.95,3.02,3.08,3.12,3.18,3.21];
  charts['inflation'] = new Chart(ctx, {
    type:'line',
    data:{
      labels:MONTHS,
      datasets:[{
        label:'Inflación acumulada (%)',
        data,
        borderColor:'#f59e0b',
        backgroundColor:'rgba(245,158,11,.1)',
        tension:.4,fill:true,pointRadius:4,pointHoverRadius:6
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>`${ctx.parsed.y.toFixed(2)}%` } } },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ callback:v=>`${v}%` } }
      }
    }
  });
}

function initUFVChart() {
  destroyChart('ufv');
  const ctx = document.getElementById('chart-ufv')?.getContext('2d');
  if (!ctx) return;
  const base = 2.395;
  const data = Array.from({length:12},(_,i)=>+(base + i*0.0026).toFixed(6));
  charts['ufv'] = new Chart(ctx, {
    type:'line',
    data:{
      labels:MONTHS,
      datasets:[{
        label:'UFV (BOB)',
        data,
        borderColor:'#8b5cf6',
        backgroundColor:'rgba(139,92,246,.1)',
        tension:.4,fill:true,pointRadius:4,pointHoverRadius:6
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>`Bs. ${ctx.parsed.y.toFixed(6)}` } } },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ callback:v=>`${v.toFixed(3)}` } }
      }
    }
  });
}

// ── RENDERS DE TABLAS DE USUARIO ────────────────────────────────
function getRatingClass(r) {
  if (!r) return '';
  if (r.startsWith('AAA')) return 'rating-aaa';
  if (r.startsWith('AA'))  return 'rating-aa';
  if (r.startsWith('A'))   return 'rating-a';
  return 'rating-bbb';
}

function renderRecentChanges() {
  const tbody = document.getElementById('tbody-recent');
  if (!tbody) return;
  tbody.innerHTML = RECENT_CHANGES.map(r => {
    const diff = (r.curr - r.prev).toFixed(2);
    const up   = r.curr > r.prev;
    return `<tr>
      <td class="font-bold">${r.banco}</td>
      <td>${r.producto}</td>
      <td>${r.plazo}</td>
      <td class="font-mono">${r.prev.toFixed(2)}%</td>
      <td class="font-mono font-bold">${r.curr.toFixed(2)}%</td>
      <td><span class="change-pill ${up?'change-up':'change-down'}">${up?'▲':'▼'} ${Math.abs(+diff).toFixed(2)}%</span></td>
      <td class="text-muted">${r.fecha}</td>
    </tr>`;
  }).join('');
}

function renderDPFTable(data) {
  const tbody = document.getElementById('tbody-dpf');
  if (!tbody) return;
  tbody.innerHTML = data.map((r,i) => `
    <tr>
      <td><input type="checkbox" class="dpf-chk" data-idx="${i}" /></td>
      <td class="font-bold">${r.bank}</td>
      <td><span class="rating-badge ${getRatingClass(r.rating)}">${r.rating}</span></td>
      <td class="font-mono">${r.d30.toFixed(2)}%</td>
      <td class="font-mono">${r.d60.toFixed(2)}%</td>
      <td class="font-mono">${r.d90.toFixed(2)}%</td>
      <td class="font-mono">${r.d180.toFixed(2)}%</td>
      <td class="font-mono text-green">${r.d360.toFixed(2)}%</td>
      <td class="font-mono">${r.d720.toFixed(2)}%</td>
      <td class="font-mono">${r.d1080.toFixed(2)}%</td>
      <td><button class="btn-primary-sm" onclick="addToWatchlist('${r.bank}','DPF',${r.d360})">+ Watch</button></td>
    </tr>`).join('');
}

function renderAhorroTable() {
  const tbody = document.getElementById('tbody-ahorro');
  if (!tbody) return;
  tbody.innerHTML = AHORRO_RATES.map(r => `
    <tr>
      <td class="font-bold">${r.bank}</td>
      <td>${r.tipo}</td>
      <td class="font-mono text-green">${r.bob.toFixed(2)}%</td>
      <td class="font-mono">${r.usd.toFixed(2)}%</td>
      <td>${r.minimo}</td>
      <td class="text-muted" style="max-width:220px;white-space:normal">${r.beneficios}</td>
      <td><span class="rating-badge ${getRatingClass(BANKS.find(b=>b.short_name===r.bank)?.rating||'A')}">${BANKS.find(b=>b.short_name===r.bank)?.rating||'A'}</span></td>
    </tr>`).join('');
}

function renderCreditoTable() {
  const tbody = document.getElementById('tbody-credito');
  if (!tbody) return;
  tbody.innerHTML = CREDITO_RATES.map(r => `
    <tr>
      <td class="font-bold">${r.bank}</td>
      <td>${r.tipo}</td>
      <td class="font-mono text-amber">${r.bob.toFixed(2)}%</td>
      <td class="font-mono">${r.usd.toFixed(2)}%</td>
      <td>${r.plazo}</td>
      <td class="text-muted">${r.costo}</td>
    </tr>`).join('');
}

function renderIndicators() {
  const grid = document.getElementById('indicators-grid');
  if (grid) {
    grid.innerHTML = INDICATORS.map(ind => {
      const isUp = ind.change.startsWith('+');
      const isStable = ind.change === 'Estable';
      return `<div class="indicator-card">
        <span class="indicator-label">${ind.name}</span>
        <span class="indicator-value">${typeof ind.value === 'number' && ind.value > 100 ? ind.value.toLocaleString() : ind.value}</span>
        <span class="indicator-unit">${ind.unit}</span>
        <span class="indicator-source">Fuente: ${ind.source}</span>
        <span style="font-size:.72rem;margin-top:4px;color:${isStable?'var(--text-muted)':isUp?'var(--amber)':'var(--green)'}">${ind.change}</span>
      </div>`;
    }).join('');
  }
}

// ── CRUD PANEL ADMINISTRATIVO (CONEXIÓN DIRECTA A SUPABASE) ───
function renderAdminBanks() {
  const tbody = document.getElementById('tbody-admin-banks');
  if (!tbody) return;
  tbody.innerHTML = BANKS.map(b => `
    <tr>
      <td class="font-bold">${b.name}</td>
      <td><span class="rating-badge rating-aa">${b.short_name}</span></td>
      <td>${b.type}</td>
      <td><span class="rating-badge ${getRatingClass(b.rating)}">${b.rating}</span></td>
      <td><span class="status-badge ${b.active?'status-active':'status-inactive'}">${b.active?'Activo':'Inactivo'}</span></td>
      <td><div class="actions-cell">
        <button class="btn-icon" title="Editar" onclick="openEditBankModal(${b.id}, '${b.name}', '${b.short_name}', '${b.type}', '${b.rating}', '${b.website}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" title="Eliminar" onclick="deleteBank(${b.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
      </div></td>
    </tr>`).join('');
}

function renderAdminTasas() {
  const tbody = document.getElementById('tbody-admin-tasas');
  if (!tbody) return;
  tbody.innerHTML = allRatesRaw.slice(0,15).map(r => `
    <tr>
      <td class="font-bold">${r.banks?.short_name || 'Banco'}</td>
      <td>${r.financial_products?.type || 'DPF'}</td>
      <td>${r.term_days ? r.term_days + ' días' : '—'}</td>
      <td class="font-mono text-green font-bold">${parseFloat(r.rate).toFixed(2)}%</td>
      <td><span class="rating-badge rating-aa">${r.financial_products?.currency || 'BOB'}</span></td>
      <td>${new Date(r.effective_date).toLocaleDateString('es-BO')}</td>
      <td><div class="actions-cell">
        <button class="btn-icon danger" title="Eliminar" onclick="deleteRate(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
      </div></td>
    </tr>`).join('');
}

function renderAdminIndicadores() {
  const tbody = document.getElementById('tbody-admin-indicators');
  if (!tbody) return;
  tbody.innerHTML = INDICATORS.map(ind => `
    <tr>
      <td class="font-bold">${ind.name}</td>
      <td><code style="background:var(--surface-2);padding:2px 6px;border-radius:4px">${ind.code}</code></td>
      <td class="font-mono">${ind.value}</td>
      <td>${ind.unit}</td>
      <td>${ind.source}</td>
      <td>${new Date().toLocaleDateString('es-BO')}</td>
      <td><div class="actions-cell">
        <button class="btn-icon" title="Editar" onclick="openEditIndicatorModal(${ind.id}, '${ind.name}', '${ind.code}', ${ind.value}, '${ind.unit}', '${ind.source}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" title="Eliminar" onclick="deleteIndicator(${ind.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
      </div></td>
    </tr>`).join('');
}

async function renderAdminUsers() {
  const tbody = document.getElementById('tbody-admin-users');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="padding:20px;text-align:center">Cargando usuarios...</td></tr>`;
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!users || !users.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="padding:20px;text-align:center">No hay usuarios registrados aún.</td></tr>`;
      return;
    }
    tbody.innerHTML = users.map((u,i) => `
      <tr>
        <td class="text-muted">${i+1}</td>
        <td class="font-bold">${u.nombre}</td>
        <td>${u.telefono}</td>
        <td>${u.correo}</td>
        <td class="text-muted">${new Date(u.created_at).toLocaleString('es-BO')}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="padding:20px;text-align:center">Error al conectar con Supabase.</td></tr>`;
  }
}

// ── ACCIONES CRUD DE SUPABASE ──────────────────────────────────
window.deleteBank = async function(id) {
  if (!confirm('¿Estás seguro de eliminar este banco y todos sus productos asociados?')) return;
  try {
    const { error } = await supabase
      .from('banks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await loadAllData();
  } catch (err) { console.error('Error al eliminar banco:', err.message); }
};

window.deleteRate = async function(id) {
  if (!confirm('¿Estás seguro de eliminar esta tasa de interés?')) return;
  try {
    const { error } = await supabase
      .from('rates')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await loadAllData();
  } catch (err) { console.error('Error al eliminar tasa:', err.message); }
};

window.deleteIndicator = async function(id) {
  if (!confirm('¿Estás seguro de eliminar este indicador económico?')) return;
  try {
    const { error } = await supabase
      .from('indicators')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await loadAllData();
  } catch (err) { console.error('Error al eliminar indicador:', err.message); }
};

// ── ALERTS & WATCHLIST ACCIONES LOCALES ────────────────────────
function renderAlerts() {
  const list = document.getElementById('alerts-list');
  if (!list) return;
  list.innerHTML = ALERTS_DATA.map(a => `
    <div class="alert-item ${a.read?'':'unread'}" id="alert-${a.id}">
      <div class="alert-dot ${a.type}"></div>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-msg">${a.msg}</div>
        <div class="alert-time">${a.time}</div>
      </div>
    </div>`).join('');
}

document.getElementById('btn-mark-all')?.addEventListener('click', () => {
  document.querySelectorAll('.alert-item.unread').forEach(el => el.classList.remove('unread'));
  const badges = document.querySelectorAll('.topbar-badge, .alert-badge');
  badges.forEach(b => b.textContent = '0');
});

function updateWatchlistCount() {
  const el = document.getElementById('watchlist-count');
  if (el) el.textContent = watchlist.length;
}

function renderWatchlist() {
  const container = document.getElementById('watchlist-items');
  const empty     = document.getElementById('watchlist-empty');
  if (!container) return;
  if (!watchlist.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';
  container.innerHTML = watchlist.map((w,i) => `
    <div class="watch-card">
      <div class="watch-card-header">
        <div>
          <div class="watch-bank">${w.bank}</div>
          <div class="watch-product">${w.product}</div>
        </div>
        <button class="btn-icon danger" onclick="removeFromWatchlist(${i})" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="watch-rate">${w.rate.toFixed(2)}%</div>
      <div class="watch-meta">
        <span>Tasa anual</span>
        <span class="text-green">▲ Activo</span>
      </div>
    </div>`).join('');
}

function renderWatchAddTable() {
  const tbody = document.getElementById('tbody-watch-add');
  if (!tbody) return;
  tbody.innerHTML = DPF_RATES.map(r => `
    <tr>
      <td class="font-bold">${r.bank}</td>
      <td>DPF</td>
      <td class="font-mono text-green">${r.d360.toFixed(2)}%</td>
      <td>BOB</td>
      <td><button class="btn-primary-sm" onclick="addToWatchlist('${r.bank}','DPF',${r.d360})">+ Agregar</button></td>
    </tr>`).join('');
}

// ── COMPARADOR FILTERS ─────────────────────────────────────
document.getElementById('comp-search')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  const filtered = DPF_RATES.filter(r => r.bank.toLowerCase().includes(q));
  renderDPFTable(filtered);
});

document.getElementById('comp-sort')?.addEventListener('change', e => {
  let sorted = [...DPF_RATES];
  if (e.target.value === 'rate_desc') sorted.sort((a,b)=>b.d360-a.d360);
  if (e.target.value === 'rate_asc')  sorted.sort((a,b)=>a.d360-b.d360);
  if (e.target.value === 'bank_az')   sorted.sort((a,b)=>a.bank.localeCompare(b.bank));
  renderDPFTable(sorted);
});
