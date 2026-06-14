// Lógica interactiva para el Dashboard de Radar Financiero
document.addEventListener('DOMContentLoaded', () => {
    // Configuración de Supabase para fallback directo desde el cliente
    const supabaseUrl = 'https://aqeosbnkwscpvqsdlehh.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZW9zYm5rd3NjcHZxc2RsZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzQyOTEsImV4cCI6MjA5NjExMDI5MX0.0wqfVBshpfS6lMXYbJQANpZQHLDOA5EnovxWBx_mNpc';
    let supabaseClient = null;

    if (window.supabase) {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    }

    // Determinar la URL base de la API Express
    const getApiBaseUrl = () => {
        return window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
    };

    // --- VARIABLES DE ESTADO LOCAL ---
    let banks = [];
    let rates = [];
    let indicators = [];
    let notifications = [];
    let watchlist = [];
    let registeredUsers = [];
    let activeCharts = {};

    // Datos del Usuario Registrado
    const userName = localStorage.getItem('userName') || 'Usuario Inversionista';
    const userEmail = localStorage.getItem('userEmail') || '';
    const userId = localStorage.getItem('userId') || '1';

    // Inicializar perfil en el Header
    document.getElementById('profile-name').textContent = userName;
    document.getElementById('avatar-letters').textContent = userName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    // --- MANEJO DE ROLES (SIMULACIÓN DE ADMIN) ---
    const adminToggle = document.getElementById('admin-role-toggle');
    const menuAdmin = document.getElementById('menu-admin');
    const profileRole = document.getElementById('profile-role');

    // Inicializar rol desde localStorage
    const savedRole = localStorage.getItem('userRole') || 'user';
    if (savedRole === 'admin') {
        adminToggle.checked = true;
        menuAdmin.classList.remove('hidden');
        profileRole.textContent = 'Administrador Financiero';
    } else {
        adminToggle.checked = false;
        menuAdmin.classList.add('hidden');
        profileRole.textContent = 'Usuario Inversionista';
    }

    adminToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            localStorage.setItem('userRole', 'admin');
            menuAdmin.classList.remove('hidden');
            profileRole.textContent = 'Administrador Financiero';
            showToast('Modo administrador activado.', 'success');
        } else {
            localStorage.setItem('userRole', 'user');
            menuAdmin.classList.add('hidden');
            profileRole.textContent = 'Usuario Inversionista';
            showToast('Modo de solo lectura activado.', 'info');
            
            // Si estaba en la pestaña admin, regresarlo a resumen
            const activeTab = document.querySelector('.menu-item.active').dataset.tab;
            if (activeTab === 'admin') {
                switchTab('resumen');
            }
        }
    });

    // --- SISTEMA DE NAVEGACIÓN SPA ---
    const menuItems = document.querySelectorAll('.menu-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const tabTitle = document.getElementById('tab-title');

    function switchTab(tabId) {
        menuItems.forEach(item => {
            if (item.dataset.tab === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        tabPanels.forEach(panel => {
            if (panel.id === `tab-${tabId}`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        // Títulos de pestañas
        const titles = {
            'resumen': 'Resumen General',
            'comparador': 'Comparador de Tasas Bancarias',
            'indicadores': 'Módulo de Indicadores Económicos',
            'riesgo': 'Modelo de Riesgo Financiero',
            'calculadoras': 'Calculadoras y Simulador Financiero',
            'favoritos': 'Mi Watchlist y Alertas',
            'admin': 'Panel Administrativo del Sistema'
        };
        tabTitle.textContent = titles[tabId] || 'Radar Financiero';

        // Recargar o repintar cosas específicas si es necesario
        if (tabId === 'resumen') {
            renderResumenTab();
        } else if (tabId === 'comparador') {
            renderComparadorTable();
        } else if (tabId === 'indicadores') {
            renderIndicatorsTab();
        } else if (tabId === 'favoritos') {
            renderWatchlist();
            renderNotifications();
        } else if (tabId === 'admin') {
            renderAdminPanel();
        }
    }

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.dataset.tab;
            switchTab(tabId);
        });
    });

    // --- CERRAR SESIÓN ---
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.clear();
        showToast('Sesión cerrada con éxito. Redirigiendo...', 'info');
        setTimeout(() => {
            window.location.href = window.location.protocol === 'file:' ? 'index.html' : '/';
        }, 1200);
    });

    // --- NOTIFICACIONES TOAST DEL DASHBOARD ---
    const toastEl = document.getElementById('dashboard-toast');
    const toastTextEl = toastEl.querySelector('.toast-text');

    function showToast(message, type = 'success') {
        toastTextEl.textContent = message;
        toastEl.className = `toast ${type}`;
        toastEl.classList.remove('hidden');
        setTimeout(() => {
            toastEl.classList.add('hidden');
        }, 4000);
    }

    // ==================== OPERACIONES DE DATOS (CON FALLBACK) ====================

    // Función genérica para llamadas de API con Fallback
    async function apiRequest(endpoint, options = {}, directSupabaseQuery) {
        try {
            // Intentar llamado a Express Backend
            const response = await fetch(`${getApiBaseUrl()}${endpoint}`, options);
            if (!response.ok) {
                const errResult = await response.json();
                throw new Error(errResult.error || 'Error del servidor backend');
            }
            return await response.json();
        } catch (backendError) {
            console.warn(`Error en API local (${endpoint}). Ejecutando consulta directa a Supabase...`, backendError);
            if (supabaseClient) {
                return await directSupabaseQuery(supabaseClient);
            } else {
                throw new Error('No se pudo conectar con el backend y el cliente de base de datos no está inicializado.');
            }
        }
    }

    // 1. Obtener Bancos
    async function loadBanks() {
        banks = await apiRequest('/banks', {}, async (client) => {
            const { data, error } = await client.from('banks').select('*').order('name', { ascending: true });
            if (error) throw error;
            return data;
        });
    }

    // 2. Obtener Tasas / Productos unificados
    async function loadRates() {
        rates = await apiRequest('/rates', {}, async (client) => {
            // En Supabase directo, emulamos la unión
            const { data, error } = await client
                .from('interest_rates')
                .select(`
                    id,
                    rate_type,
                    rate,
                    term_days,
                    min_amount,
                    financial_products (
                        id,
                        name,
                        type,
                        banks (
                            id,
                            name,
                            logo_url
                        )
                    )
                `);
            if (error) throw error;
            return data;
        });
    }

    // 3. Obtener Indicadores Económicos
    async function loadIndicators() {
        indicators = await apiRequest('/indicators', {}, async (client) => {
            const { data, error } = await client.from('economic_indicators').select('*').order('id', { ascending: true });
            if (error) throw error;
            return data;
        });
    }

    // 4. Obtener Notificaciones
    async function loadNotifications() {
        notifications = await apiRequest('/notifications', {}, async (client) => {
            const { data, error } = await client.from('notifications').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        });
    }

    // 5. Obtener Watchlist de Usuario
    async function loadWatchlist() {
        watchlist = await apiRequest(`/watchlist/${userId}`, {}, async (client) => {
            const { data, error } = await client
                .from('watchlists')
                .select(`
                    id,
                    product_id,
                    financial_products (
                        id,
                        name,
                        type,
                        banks (
                            name,
                            logo_url
                        ),
                        interest_rates (
                            id,
                            rate,
                            term_days,
                            min_amount
                        )
                    )
                `)
                .eq('registro_id', userId);
            if (error) throw error;
            return data;
        });
    }

    // Cargar todo al inicio
    async function initData() {
        try {
            await Promise.all([
                loadBanks(),
                loadRates(),
                loadIndicators(),
                loadNotifications(),
                loadWatchlist()
            ]);
            renderResumenTab();
        } catch (err) {
            console.error('Error al inicializar datos:', err);
            showToast('Error de conexión a la base de datos.', 'error');
        }
    }

    initData();

    // ==================== RENDERS DE PESTAÑAS ====================

    // PESTAÑA: RESUMEN GENERAL
    function renderResumenTab() {
        // Cargar los KPI superiores
        const inflacionInd = indicators.find(i => i.name.includes('Inflación'));
        const ufvInd = indicators.find(i => i.name.includes('UFV'));
        
        if (inflacionInd) {
            document.getElementById('metric-inflacion').textContent = `${parseFloat(inflacionInd.value).toFixed(2)}${inflacionInd.unit}`;
            document.getElementById('risk-inflation-val').textContent = `${parseFloat(inflacionInd.value).toFixed(2)}${inflacionInd.unit}`;
        }
        if (ufvInd) {
            document.getElementById('metric-ufv').textContent = `Bs. ${parseFloat(ufvInd.value).toFixed(4)}`;
        }

        // Calcular promedio de tasas pasivas
        const passiveRates = rates.filter(r => r.rate_type === 'passive');
        if (passiveRates.length > 0) {
            const avg = passiveRates.reduce((sum, r) => sum + parseFloat(r.rate), 0) / passiveRates.length;
            document.getElementById('metric-tasa-promedio').textContent = `${avg.toFixed(2)}%`;
            
            // Actualizar valor de riesgo real neto
            if (inflacionInd) {
                const realNet = ((1 + avg/100) / (1 + parseFloat(inflacionInd.value)/100) - 1) * 100;
                document.getElementById('risk-real-val').textContent = `${realNet.toFixed(2)}%`;
            }
        }

        // Renderizar tabla de mejores tasas DPF (plazo 360)
        const bestRatesBody = document.getElementById('best-rates-table');
        bestRatesBody.innerHTML = '';
        
        const dpfRates = rates
            .filter(r => r.financial_products && r.financial_products.type === 'dpf')
            .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate))
            .slice(0, 4);

        if (dpfRates.length === 0) {
            bestRatesBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay tasas de DPF registradas en la base de datos.</td></tr>`;
        }

        dpfRates.forEach(r => {
            const prod = r.financial_products;
            const bank = prod.banks;
            const logo = bank.logo_url ? `<img src="${bank.logo_url}" class="logo-thumbnail" onerror="this.src='https://placehold.co/50x50/151f32/fff?text=${bank.name[0]}'">` : '';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${logo} ${bank.name}</td>
                <td>${prod.name}</td>
                <td class="text-success font-bold">${parseFloat(r.rate).toFixed(2)}%</td>
                <td>${parseFloat(r.min_amount).toLocaleString('es-BO')} Bs.</td>
                <td>
                    <button class="btn-action btn-add-fav" data-id="${prod.id}">Seguir</button>
                </td>
            `;
            bestRatesBody.appendChild(tr);
        });

        // Configurar botones "Seguir" en la tabla
        bestRatesBody.querySelectorAll('.btn-add-fav').forEach(btn => {
            btn.addEventListener('click', () => {
                const prodId = btn.dataset.id;
                toggleWatchlist(prodId);
            });
        });

        // Cargar Alertas Recientes en Resumen
        const alertsList = document.getElementById('resumen-alerts-list');
        alertsList.innerHTML = '';
        notifications.slice(0, 3).forEach(n => {
            const div = document.createElement('div');
            div.className = `alert-item ${n.type || 'info'}`;
            div.innerHTML = `
                <span class="alert-icon">${n.type === 'success' ? '🟢' : n.type === 'rate_change' ? '⚡' : '🔵'}</span>
                <div class="alert-content">
                    <h5>${n.title}</h5>
                    <p>${n.message}</p>
                </div>
            `;
            alertsList.appendChild(div);
        });

        // Inicializar Gráfico de Rendimientos
        initRatesChart();
    }

    // GRÁFICO: RENDIMIENTO DE TASAS
    function initRatesChart() {
        if (activeCharts['rates']) {
            activeCharts['rates'].destroy();
        }

        const ctx = document.getElementById('ratesChart').getContext('2d');
        
        // Obtener tasas pasivas por banco
        const labels = [];
        const dpfData = [];
        const ahorroData = [];

        banks.forEach(b => {
            labels.push(b.name);
            
            // Buscar DPF de este banco
            const bDpf = rates.find(r => r.financial_products && r.financial_products.bank_id === b.id && r.financial_products.type === 'dpf');
            dpfData.push(bDpf ? parseFloat(bDpf.rate) : 0);

            // Buscar Caja de Ahorro
            const bAhorro = rates.find(r => r.financial_products && r.financial_products.bank_id === b.id && r.financial_products.type === 'caja_ahorro');
            ahorroData.push(bAhorro ? parseFloat(bAhorro.rate) : 0);
        });

        activeCharts['rates'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Depósitos a Plazo Fijo (DPF) %',
                        data: dpfData,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    },
                    {
                        label: 'Cajas de Ahorro %',
                        data: ahorroData,
                        backgroundColor: '#6366f1',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Inter' } }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    }

    // PESTAÑA: COMPARADOR DE TASAS
    const compSearch = document.getElementById('comp-search');
    const compType = document.getElementById('comp-type');
    const compSort = document.getElementById('comp-sort');

    compSearch.addEventListener('input', renderComparadorTable);
    compType.addEventListener('change', renderComparadorTable);
    compSort.addEventListener('change', renderComparadorTable);

    function renderComparadorTable() {
        const compBody = document.getElementById('comparador-table');
        compBody.innerHTML = '';

        const searchQuery = compSearch.value.toLowerCase();
        const typeFilter = compType.value;
        const sortFilter = compSort.value;

        // Filtrar
        let filteredRates = rates.filter(r => {
            if (!r.financial_products) return false;
            const prod = r.financial_products;
            const bank = prod.banks || { name: '' };

            const matchesSearch = prod.name.toLowerCase().includes(searchQuery) || bank.name.toLowerCase().includes(searchQuery);
            const matchesType = typeFilter === 'all' || prod.type === typeFilter;

            return matchesSearch && matchesType;
        });

        // Ordenar
        filteredRates.sort((a, b) => {
            if (sortFilter === 'rate-desc') return parseFloat(b.rate) - parseFloat(a.rate);
            if (sortFilter === 'rate-asc') return parseFloat(a.rate) - parseFloat(b.rate);
            if (sortFilter === 'bank-asc') {
                const nameA = a.financial_products.banks.name.toLowerCase();
                const nameB = b.financial_products.banks.name.toLowerCase();
                return nameA.localeCompare(nameB);
            }
            return 0;
        });

        if (filteredRates.length === 0) {
            compBody.innerHTML = `<tr><td colspan="7" class="text-center">No se encontraron productos financieros que coincidan con los filtros.</td></tr>`;
            return;
        }

        filteredRates.forEach(r => {
            const prod = r.financial_products;
            const bank = prod.banks;
            const logo = bank.logo_url ? `<img src="${bank.logo_url}" class="logo-thumbnail" onerror="this.src='https://placehold.co/50x50/151f32/fff?text=${bank.name[0]}'">` : '';
            
            const isFav = watchlist.some(w => w.product_id === prod.id);
            const favIcon = isFav ? '★' : '☆';
            const favClass = isFav ? 'btn-delete' : 'btn-action';

            const term = r.term_days ? `${r.term_days} Días` : 'N/A';
            const minAmt = r.min_amount ? `${parseFloat(r.min_amount).toLocaleString('es-BO')} Bs.` : '0 Bs.';
            const isCred = prod.type === 'credito';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${logo} ${bank.name}</td>
                <td><span class="badge ${prod.type}">${prod.type.toUpperCase().replace('_', ' ')}</span></td>
                <td>${prod.name}</td>
                <td class="${isCred ? 'text-error' : 'text-success'} font-bold">${parseFloat(r.rate).toFixed(2)}%</td>
                <td>${term}</td>
                <td>${minAmt}</td>
                <td>
                    <button class="${favClass} btn-fav" data-id="${prod.id}">${favIcon}</button>
                </td>
            `;
            compBody.appendChild(tr);
        });

        // Agregar eventos de favoritos
        compBody.querySelectorAll('.btn-fav').forEach(btn => {
            btn.addEventListener('click', () => {
                const prodId = btn.dataset.id;
                toggleWatchlist(prodId);
            });
        });
    }

    // PESTAÑA: INDICADORES ECONOMICOS
    function renderIndicatorsTab() {
        const detailsContainer = document.getElementById('indicators-list-details');
        detailsContainer.innerHTML = '';

        indicators.forEach(ind => {
            const div = document.createElement('div');
            div.className = 'indicator-row';
            div.innerHTML = `
                <span class="indicator-name">${ind.name}</span>
                <div class="indicator-val-group">
                    <span class="indicator-value">${parseFloat(ind.value).toFixed(ind.name.includes('UFV') ? 4 : 2)}</span>
                    <span class="indicator-unit">${ind.unit}</span>
                </div>
            `;
            detailsContainer.appendChild(div);
        });

        // Gráfico de Indicadores
        initIndicatorsChart();
    }

    function initIndicatorsChart() {
        if (activeCharts['indicators']) {
            activeCharts['indicators'].destroy();
        }

        const ctx = document.getElementById('indicatorsChart').getContext('2d');
        const labels = indicators.map(i => i.name.replace(' (INE)', '').replace(' Diario', ''));
        const values = indicators.map(i => parseFloat(i.value));

        activeCharts['indicators'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Valores macroeconómicos Bolivia',
                    data: values,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    }

    // PESTAÑA: MODELO DE RIESGO FINANCIERO
    const btnCalcRisk = document.getElementById('btn-calc-risk');
    const riskAmount = document.getElementById('risk-amount');
    const riskRate = document.getElementById('risk-rate');
    const riskResult = document.getElementById('risk-result');

    btnCalcRisk.addEventListener('click', () => {
        const amount = parseFloat(riskAmount.value);
        const nominalRate = parseFloat(riskRate.value);

        const inflacionInd = indicators.find(i => i.name.includes('Inflación'));
        const inflationRate = inflacionInd ? parseFloat(inflacionInd.value) : 3.12;

        if (isNaN(amount) || isNaN(nominalRate)) {
            showToast('Por favor, ingresa montos válidos.', 'error');
            return;
        }

        // Cálculos
        const nominalInterest = amount * (nominalRate / 100);
        
        // Rendimiento real ajustado: (1 + nominal) / (1 + inflacion) - 1
        const realRate = ((1 + nominalRate/100) / (1 + inflationRate/100) - 1);
        const realGain = amount * realRate;
        const inflationLoss = amount * (inflationRate / 100);

        document.getElementById('res-risk-capital').textContent = `${amount.toLocaleString('es-BO', {minimumFractionDigits: 2})} Bs.`;
        document.getElementById('res-risk-nominal').textContent = `+${nominalInterest.toLocaleString('es-BO', {minimumFractionDigits: 2})} Bs.`;
        document.getElementById('res-risk-loss').textContent = `-${inflationLoss.toLocaleString('es-BO', {minimumFractionDigits: 2})} Bs.`;
        document.getElementById('res-risk-net').textContent = `${realGain >= 0 ? '+' : ''}${realGain.toLocaleString('es-BO', {minimumFractionDigits: 2})} Bs.`;

        const netEl = document.getElementById('res-risk-net');
        if (realGain < 0) {
            netEl.className = 'text-error font-bold';
        } else {
            netEl.className = 'text-success font-bold';
        }

        riskResult.classList.remove('hidden');
    });

    // PESTAÑA: CALCULADORAS (SUB-TABS)
    const subTabBtns = document.querySelectorAll('.tab-sub-btn');
    const subTabPanels = document.querySelectorAll('.sub-tab-panel');

    subTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            subTabBtns.forEach(b => b.classList.remove('active'));
            subTabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const subId = btn.dataset.sub;
            document.getElementById(subId).classList.add('active');

            if (subId === 'calc-sim') {
                updateSimulator();
            }
        });
    });

    // Calculadora DPF
    const formDpf = document.getElementById('form-calc-dpf');
    formDpf.addEventListener('submit', (e) => {
        e.preventDefault();
        const capital = parseFloat(document.getElementById('dpf-capital').value);
        const rate = parseFloat(document.getElementById('dpf-tasa').value);
        const days = parseInt(document.getElementById('dpf-plazo').value);

        const interest = (capital * (rate / 100) * days) / 360;
        const total = capital + interest;

        document.getElementById('val-dpf-capital').textContent = `${capital.toLocaleString('es-BO')} Bs.`;
        document.getElementById('val-dpf-interes').textContent = `${interest.toLocaleString('es-BO', {maximumFractionDigits: 2})} Bs.`;
        document.getElementById('val-dpf-total').textContent = `${total.toLocaleString('es-BO', {maximumFractionDigits: 2})} Bs.`;

        document.getElementById('dpf-result').classList.remove('hidden');
    });

    // Calculadora de Rendimiento Real
    const formReal = document.getElementById('form-calc-real');
    formReal.addEventListener('submit', (e) => {
        e.preventDefault();
        const nominal = parseFloat(document.getElementById('real-nominal').value);
        const inflation = parseFloat(document.getElementById('real-inflacion').value);

        const realRate = (((1 + nominal/100) / (1 + inflation/100)) - 1) * 100;
        const resultVal = document.getElementById('val-real-result');
        resultVal.textContent = `${realRate.toFixed(2)}%`;

        if (realRate < 0) {
            resultVal.className = 'text-error text-center';
        } else {
            resultVal.className = 'text-success text-center';
        }

        document.getElementById('real-result').classList.remove('hidden');
    });

    // Simulador de Escenarios
    const simCapitalInput = document.getElementById('sim-capital');
    simCapitalInput.addEventListener('input', updateSimulator);

    function updateSimulator() {
        const capital = parseFloat(simCapitalInput.value) || 0;
        
        // Optimista: Nominal 6.5%, Inflación 2%
        const optRate = ((1 + 6.50/100) / (1 + 2.00/100) - 1);
        document.getElementById('sim-opt-real').textContent = `${(capital * optRate).toLocaleString('es-BO', {maximumFractionDigits: 2})} Bs.`;

        // Base: Nominal 5.68%, Inflación 3.12%
        const baseRate = ((1 + 5.68/100) / (1 + 3.12/100) - 1);
        document.getElementById('sim-base-real').textContent = `${(capital * baseRate).toLocaleString('es-BO', {maximumFractionDigits: 2})} Bs.`;

        // Pesimista: Nominal 5.0%, Inflación 6.5%
        const pesRate = ((1 + 5.00/100) / (1 + 6.50/100) - 1);
        const pesVal = capital * pesRate;
        const pesEl = document.getElementById('sim-pes-real');
        pesEl.textContent = `${pesVal.toLocaleString('es-BO', {maximumFractionDigits: 2})} Bs.`;
        pesEl.className = pesVal < 0 ? 'text-error font-bold' : 'text-success font-bold';
    }

    // PESTAÑA: WATCHLIST Y ALERTAS
    function renderWatchlist() {
        const body = document.getElementById('watchlist-table-body');
        body.innerHTML = '';

        if (watchlist.length === 0) {
            body.innerHTML = `<tr><td colspan="4" class="text-center">No estás siguiendo ningún producto aún.</td></tr>`;
            return;
        }

        watchlist.forEach(w => {
            const prod = w.financial_products;
            if (!prod) return;
            const bank = prod.banks;
            const rateObj = prod.interest_rates && prod.interest_rates[0] ? prod.interest_rates[0] : { rate: 0 };
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${bank ? bank.name : ''}</td>
                <td>${prod.name}</td>
                <td class="text-success font-bold">${parseFloat(rateObj.rate).toFixed(2)}%</td>
                <td>
                    <button class="btn-delete btn-remove-fav" data-id="${prod.id}">Eliminar</button>
                </td>
            `;
            body.appendChild(tr);
        });

        body.querySelectorAll('.btn-remove-fav').forEach(btn => {
            btn.addEventListener('click', () => {
                const prodId = btn.dataset.id;
                toggleWatchlist(prodId);
            });
        });
    }

    function renderNotifications() {
        const container = document.getElementById('alerts-list-container');
        container.innerHTML = '';

        notifications.forEach(n => {
            const div = document.createElement('div');
            div.className = `alert-item ${n.type || 'info'}`;
            div.innerHTML = `
                <span class="alert-icon">${n.type === 'success' ? '🟢' : n.type === 'rate_change' ? '⚡' : '🔵'}</span>
                <div class="alert-content">
                    <h5>${n.title}</h5>
                    <p>${n.message}</p>
                    <small class="text-secondary">${new Date(n.created_at).toLocaleString()}</small>
                </div>
            `;
            container.appendChild(div);
        });
    }

    // TOGGLE WATCHLIST (ADD / REMOVE)
    async function toggleWatchlist(productId) {
        const isFav = watchlist.some(w => w.product_id === parseInt(productId));

        try {
            if (isFav) {
                // Eliminar de favoritos
                await apiRequest(`/watchlist?registro_id=${userId}&product_id=${productId}`, {
                    method: 'DELETE'
                }, async (client) => {
                    const { error } = await client
                        .from('watchlists')
                        .delete()
                        .eq('registro_id', userId)
                        .eq('product_id', productId);
                    if (error) throw error;
                    return { success: true };
                });
                
                showToast('Eliminado de tu lista de seguimiento.', 'info');
            } else {
                // Agregar a favoritos
                await apiRequest('/watchlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registro_id: userId, product_id: productId })
                }, async (client) => {
                    const { data, error } = await client
                        .from('watchlists')
                        .insert([{ registro_id: userId, product_id: productId }])
                        .select();
                    if (error) throw error;
                    return data[0];
                });

                showToast('Agregado a tu lista de seguimiento.', 'success');
            }

            // Recargar datos y actualizar UI activa
            await loadWatchlist();
            const activeTab = document.querySelector('.menu-item.active').dataset.tab;
            if (activeTab === 'comparador') renderComparadorTable();
            if (activeTab === 'favoritos') renderWatchlist();
            if (activeTab === 'resumen') renderResumenTab();

        } catch (err) {
            console.error('Error al modificar favorito:', err);
            showToast('No se pudo guardar la acción.', 'error');
        }
    }

    // ==================== PANEL DE ADMINISTRACIÓN (CRUD) ====================

    // Cargar listas y desplegables de admin
    function renderAdminPanel() {
        // Rellenar Lista de Bancos
        const banksList = document.getElementById('admin-banks-list');
        banksList.innerHTML = '';
        banks.forEach(b => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${b.name}</span>
                <button class="btn-delete btn-del-bank" data-id="${b.id}">Borrar</button>
            `;
            banksList.appendChild(li);
        });

        banksList.querySelectorAll('.btn-del-bank').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (confirm('¿Estás seguro de eliminar este banco? Se borrarán todas sus tasas asociadas.')) {
                    await deleteBank(id);
                }
            });
        });

        // Rellenar Selector de Bancos en Formulario de Tasas
        const bankSelect = document.getElementById('admin-rate-bank');
        bankSelect.innerHTML = '<option value="">-- Seleccionar Banco --</option>';
        banks.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            bankSelect.appendChild(opt);
        });

        // Rellenar Tabla de Indicadores para Modificación Rápida
        const indTable = document.getElementById('admin-indicators-table');
        indTable.innerHTML = '';
        indicators.forEach(ind => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${ind.name}</td>
                <td><input type="number" step="0.0001" value="${parseFloat(ind.value)}" class="input-inline-val" data-id="${ind.id}"></td>
                <td>${ind.unit}</td>
                <td>
                    <button class="btn-action btn-update-ind" data-id="${ind.id}">Actualizar</button>
                </td>
            `;
            indTable.appendChild(tr);
        });

        indTable.querySelectorAll('.btn-update-ind').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const valInput = indTable.querySelector(`input[data-id="${id}"]`);
                await updateIndicator(id, parseFloat(valInput.value));
            });
        });

        // Cargar Tabla de Usuarios Registrados
        loadRegisteredUsers();
    }

    // Cargar Usuarios
    async function loadRegisteredUsers() {
        try {
            registeredUsers = await apiRequest('/registros', {}, async (client) => {
                const { data, error } = await client.from('registros').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            });

            const usersTable = document.getElementById('admin-users-table');
            usersTable.innerHTML = '';
            
            if (registeredUsers.length === 0) {
                usersTable.innerHTML = `<tr><td colspan="4" class="text-center">No hay usuarios registrados en el sistema.</td></tr>`;
                return;
            }

            registeredUsers.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.nombre_completo}</td>
                    <td>${u.correo}</td>
                    <td>${u.telefono}</td>
                    <td>${new Date(u.created_at).toLocaleDateString()}</td>
                `;
                usersTable.appendChild(tr);
            });
        } catch (err) {
            console.error('Error al cargar usuarios:', err);
        }
    }

    // CRUD: Agregar Banco
    const bankForm = document.getElementById('admin-bank-form');
    bankForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('admin-bank-name').value.trim();
        const logo_url = document.getElementById('admin-bank-logo').value.trim();

        try {
            await apiRequest('/banks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, logo_url })
            }, async (client) => {
                const { data, error } = await client.from('banks').insert([{ name, logo_url }]).select();
                if (error) throw error;
                return data[0];
            });

            showToast('Banco agregado con éxito.', 'success');
            bankForm.reset();
            await loadBanks();
            renderAdminPanel();
        } catch (err) {
            console.error(err);
            showToast('Error al agregar el banco.', 'error');
        }
    });

    // CRUD: Eliminar Banco
    async function deleteBank(id) {
        try {
            await apiRequest(`/banks/${id}`, {
                method: 'DELETE'
            }, async (client) => {
                const { error } = await client.from('banks').delete().eq('id', id);
                if (error) throw error;
                return { success: true };
            });

            showToast('Banco eliminado con éxito.', 'info');
            await loadBanks();
            await loadRates(); // Como elimina en cascada las tasas
            renderAdminPanel();
        } catch (err) {
            console.error(err);
            showToast('Error al eliminar banco.', 'error');
        }
    }

    // CRUD: Registrar Tasa / Producto
    const rateForm = document.getElementById('admin-rate-form');
    rateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bank_id = document.getElementById('admin-rate-bank').value;
        const type = document.getElementById('admin-rate-type').value;
        const name = document.getElementById('admin-rate-name').value.trim();
        const rate = parseFloat(document.getElementById('admin-rate-value').value);
        const term_days = document.getElementById('admin-rate-term').value;
        const min_amount = document.getElementById('admin-rate-min').value;

        const rate_type = type === 'credito' ? 'active' : 'passive';

        const payload = {
            bank_id: parseInt(bank_id),
            type,
            name,
            rate_type,
            rate,
            term_days: term_days ? parseInt(term_days) : null,
            min_amount: min_amount ? parseFloat(min_amount) : 0
        };

        try {
            await apiRequest('/rates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, async (client) => {
                // Flujo manual en Supabase directo
                const { data: prodData, error: prodErr } = await client
                    .from('financial_products')
                    .insert([{ bank_id: payload.bank_id, type: payload.type, name: payload.name }])
                    .select();
                
                if (prodErr) throw prodErr;
                
                const { data: rateData, error: rateErr } = await client
                    .from('interest_rates')
                    .insert([{
                        product_id: prodData[0].id,
                        rate_type: payload.rate_type,
                        rate: payload.rate,
                        term_days: payload.term_days,
                        min_amount: payload.min_amount
                    }])
                    .select();
                
                if (rateErr) throw rateErr;
                return { success: true };
            });

            showToast('Producto y tasa registrados.', 'success');
            rateForm.reset();
            await loadRates();
            renderAdminPanel();
        } catch (err) {
            console.error(err);
            showToast('Error al registrar producto financiero.', 'error');
        }
    });

    // CRUD: Actualizar Indicador
    async function updateIndicator(id, value) {
        try {
            await apiRequest(`/indicators/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value })
            }, async (client) => {
                const { data, error } = await client
                    .from('economic_indicators')
                    .update({ value, updated_at: new Date() })
                    .eq('id', id)
                    .select();
                if (error) throw error;
                return data[0];
            });

            showToast('Indicador económico actualizado.', 'success');
            await loadIndicators();
            renderAdminPanel();
        } catch (err) {
            console.error(err);
            showToast('Error al actualizar el indicador.', 'error');
        }
    }
});
