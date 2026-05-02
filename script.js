// Constants and Data Defaults
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DEFAULT_CATEGORIES = [
    'Housing / Rent', 'Groceries', 'Utilities', 'Transportation', 
    'Healthcare', 'Insurance', 'Savings', 'Entertainment', 'Miscellaneous'
];
const CHART_COLORS = [
    '#4f46e5', '#10b981', '#f59e0b', '#ef4444', 
    '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#64748b'
];

let appState = {
    theme: 'light',
    currentMonth: MONTHS[new Date().getMonth()],
    globalSalary: 15000,
    data: {} 
    // Format: { 'January': [{ id, category, planned, actual, status, complete }], ... }
};

let chartInstance = null;
let doughnutChartInstance = null;
let activeUser = null;

// ==========================================
// Initialization & Auth
// ==========================================
function init() {
    setupEventListeners();
    checkAuth();
}

function checkAuth() {
    // Check local storage for persistent login
    const sessionUser = localStorage.getItem('budgetProActiveUser');
    if (sessionUser) {
        activeUser = JSON.parse(sessionUser);
        document.getElementById('display-user-name').textContent = activeUser.username;
        loadUserData();
        showDashboard();
    } else {
        showLogin();
    }
}

function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    
    if(!user || !pass) return showToast('Please enter both fields', 'error');

    // Simple local auth mechanism
    let users = JSON.parse(localStorage.getItem('budgetProUsers') || '{}');
    
    if (users[user]) {
        // User exists, check password
        if(users[user].password === pass) {
            loginSuccess(user);
        } else {
            showToast('Incorrect password for existing user.', 'error');
        }
    } else {
        // Create new user
        users[user] = { password: pass };
        localStorage.setItem('budgetProUsers', JSON.stringify(users));
        showToast('New account created locally!', 'success');
        loginSuccess(user);
    }
}

function loginSuccess(username) {
    activeUser = { username };
    localStorage.setItem('budgetProActiveUser', JSON.stringify(activeUser));
    document.getElementById('display-user-name').textContent = username;
    showDashboard();
    loadUserData();
    showToast(`Welcome, ${username}!`, 'success');
}

function logout() {
    localStorage.removeItem('budgetProActiveUser');
    activeUser = null;
    showLogin();
}

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-layout').classList.remove('hidden');
}

// ==========================================
// Data Management
// ==========================================
function getUserStorageKey() {
    return `budgetProData_${activeUser.username}`;
}

function loadUserData() {
    const saved = localStorage.getItem(getUserStorageKey());
    if (saved) {
        const parsed = JSON.parse(saved);
        appState.globalSalary = parsed.globalSalary || 15000;
        appState.theme = parsed.theme || 'light';
        appState.data = parsed.data || {};
        
        // Ensure all months exist
        MONTHS.forEach(m => {
            if(!appState.data[m]) initializeMonthStructure(m);
        });
    } else {
        appState.globalSalary = 15000;
        appState.data = {};
        MONTHS.forEach(m => initializeMonthStructure(m));
        saveUserData();
    }
    
    applyTheme();
    document.getElementById('monthly-salary').value = appState.globalSalary;
    renderTabs();
    updateDashboardUI();
}

function initializeMonthStructure(monthName) {
    appState.data[monthName] = DEFAULT_CATEGORIES.map((cat, index) => ({
        id: `item-${Date.now()}-${index}`,
        category: cat,
        planned: 0,
        actual: 0,
        status: 'Pending',
        complete: false
    }));
}

function saveUserData() {
    if(!activeUser) return;
    localStorage.setItem(getUserStorageKey(), JSON.stringify({
        globalSalary: appState.globalSalary,
        theme: appState.theme,
        data: appState.data
    }));
    updateCalculations();
    updateCharts();
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
    // Auth
    document.getElementById('auth-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Theme (Dark/Light mode)
    document.getElementById('theme-toggle-btn').addEventListener('click', (e) => {
        e.preventDefault();
        appState.theme = appState.theme === 'light' ? 'dark' : 'light';
        applyTheme();
        saveUserData();
    });

    // Mobile Sidebar
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    function openSidebar() {
        sidebar.classList.add('open');
        overlay.classList.remove('hidden');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
    }

    document.getElementById('mobile-menu-open').addEventListener('click', openSidebar);
    document.getElementById('mobile-menu-close').addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);

    // Global Salary Edit
    document.getElementById('monthly-salary').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        appState.globalSalary = isNaN(val) || val < 0 ? 0 : val;
        saveUserData();
    });

    // Reset Month with SweetAlert2
    document.getElementById('reset-month-btn').addEventListener('click', (e) => {
        e.preventDefault();
        Swal.fire({
            title: 'Reset Budget?',
            text: `Are you sure you want to clear all data for ${appState.currentMonth}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, clear it!'
        }).then((result) => {
            if (result.isConfirmed) {
                initializeMonthStructure(appState.currentMonth);
                saveUserData();
                renderTable();
                showToast(`${appState.currentMonth} data cleared.`, 'success');
            }
        });
    });

    // Export CSV
    document.getElementById('download-csv-btn').addEventListener('click', (e) => {
        e.preventDefault();
        downloadCSV();
    });

    // Add New Row
    document.getElementById('add-expense-btn').addEventListener('click', () => {
        const monthData = appState.data[appState.currentMonth];
        monthData.push({
            id: `item-${Date.now()}`,
            category: 'New Category',
            planned: 0, actual: 0, status: 'Pending', complete: false
        });
        saveUserData();
        renderTable(); 
        showToast('New row added.', 'success');
    });

    // Tab Scrolling
    const tabsWrapper = document.getElementById('months-tabs');
    document.querySelector('.scroll-btn.left').addEventListener('click', () => tabsWrapper.scrollBy({left: -200, behavior: 'smooth'}));
    document.querySelector('.scroll-btn.right').addEventListener('click', () => tabsWrapper.scrollBy({left: 200, behavior: 'smooth'}));
}

// ==========================================
// UI Rendering
// ==========================================
function applyTheme() {
    const isDark = appState.theme === 'dark';
    if(isDark) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
        document.getElementById('theme-text').textContent = 'Light Mode';
    } else {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        document.getElementById('theme-text').textContent = 'Dark Mode';
    }
    if (chartInstance) updateCharts();
}

function renderTabs() {
    const tabsContainer = document.getElementById('months-tabs');
    tabsContainer.innerHTML = '';
    
    MONTHS.forEach(month => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${appState.currentMonth === month ? 'active' : ''}`;
        btn.textContent = month;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.currentMonth = month;
            updateDashboardUI();
        });
        tabsContainer.appendChild(btn);
    });
    
    // Auto scroll to active tab
    setTimeout(() => {
        const activeTab = tabsContainer.querySelector('.active');
        if(activeTab) activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 100);
}

function updateDashboardUI() {
    document.getElementById('current-month-text').textContent = appState.currentMonth;
    renderTable();
    updateCalculations();
}

// Table Rendering
function renderTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    const currentData = appState.data[appState.currentMonth];
    
    currentData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = item.complete ? 'row-done' : 'row-pending';
        row.dataset.index = index;
        
        row.innerHTML = `
            <td class="td-category" contenteditable="true" spellcheck="false" title="Click to edit" data-label="Category">${item.category}</td>
            <td data-label="Planned">
                <input type="number" min="0" class="td-input input-planned" value="${item.planned || 0}">
            </td>
            <td data-label="Actual">
                <input type="number" min="0" class="td-input input-actual" value="${item.actual || 0}">
            </td>
            <td data-label="Status">
                <button class="status-btn ${item.status === 'Done' ? 'status-done' : 'status-pending'}">${item.status}</button>
            </td>
            <td data-label="Done">
                <input type="checkbox" class="custom-checkbox complete-toggle" ${item.complete ? 'checked' : ''}>
            </td>
            <td data-label="Actions">
                <button class="action-btn delete-btn" title="Delete Row"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(row);

        // Bind inner listeners (Delegation could be used, but this is fine for ~10 rows)
        const catNode = row.querySelector('.td-category');
        catNode.addEventListener('blur', (e) => {
            currentData[index].category = e.target.textContent.trim() || 'Unnamed';
            saveUserData();
        });

        row.querySelector('.input-planned').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            currentData[index].planned = isNaN(val) || val < 0 ? 0 : val;
            saveUserData();
        });

        row.querySelector('.input-actual').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            currentData[index].actual = isNaN(val) || val < 0 ? 0 : val;
            saveUserData();
        });

        row.querySelector('.status-btn').addEventListener('click', (e) => {
            const btn = e.target;
            const isDone = currentData[index].status !== 'Done';
            currentData[index].status = isDone ? 'Done' : 'Pending';
            currentData[index].complete = isDone;
            saveUserData();
            
            // Visual Update locally without complete re-render
            btn.className = `status-btn ${isDone ? 'status-done' : 'status-pending'}`;
            btn.textContent = currentData[index].status;
            row.querySelector('.complete-toggle').checked = isDone;
            row.className = isDone ? 'row-done' : 'row-pending';
        });

        row.querySelector('.complete-toggle').addEventListener('change', (e) => {
            const isDone = e.target.checked;
            currentData[index].complete = isDone;
            currentData[index].status = isDone ? 'Done' : 'Pending';
            saveUserData();
            
            // Visual Update
            const btn = row.querySelector('.status-btn');
            btn.className = `status-btn ${isDone ? 'status-done' : 'status-pending'}`;
            btn.textContent = currentData[index].status;
            row.className = isDone ? 'row-done' : 'row-pending';
        });

        row.querySelector('.delete-btn').addEventListener('click', () => {
            currentData.splice(index, 1);
            saveUserData();
            renderTable(); // Safe here because element is removed
        });
    });
}

// Math logic
function updateCalculations() {
    const currentData = appState.data[appState.currentMonth];
    if(!currentData) return;

    let totalPlanned = 0;
    let totalActual = 0;
    
    currentData.forEach(item => {
        totalPlanned += item.planned || 0;
        totalActual += item.actual || 0;
    });

    const remainingBal = appState.globalSalary - totalActual;
    const totalSavings = totalPlanned - totalActual;

    animateValue('summary-planned', totalPlanned);
    animateValue('summary-actual', totalActual);
    animateValue('summary-balance', remainingBal);
    animateValue('summary-savings', totalSavings);

    // Contextual Styling
    const balCard = document.getElementById('card-balance');
    if (remainingBal < 0) {
        balCard.classList.remove('theme-green');
        balCard.classList.add('text-danger');
        balCard.style.border = '1px solid var(--danger)';
    } else {
        balCard.classList.add('theme-green');
        balCard.classList.remove('text-danger');
        balCard.style.border = '';
    }

    // Progress Bar Logic
    const progressFill = document.getElementById('budget-progress-bar');
    const progressPercentText = document.getElementById('progress-percent');
    let percent = appState.globalSalary > 0 ? (totalActual / appState.globalSalary) * 100 : 0;
    
    // Cap visual percent at 100 for styling
    let visualPercent = percent > 100 ? 100 : percent;
    progressFill.style.width = `${visualPercent}%`;
    progressPercentText.textContent = `${Math.round(percent)}%`;
    
    progressFill.classList.remove('warning', 'danger');
    if (percent >= 100) {
        progressFill.classList.add('danger');
    } else if (percent >= 75) {
        progressFill.classList.add('warning');
    }
}

function animateValue(id, value) {
    const obj = document.getElementById(id);
    const prefix = '₹';
    // Simple direct update. Counters can be complex if rapid input.
    obj.textContent = `${prefix}${value.toLocaleString()}`;
}

// Chart Visualization
function updateCharts() {
    const data = appState.data[appState.currentMonth] || [];
    const categories = data.map(i => i.category);
    const actuals = data.map(i => i.actual || 0);
    const planneds = data.map(i => i.planned || 0);
    
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#f8fafc' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const isEmpty = categories.length === 0 || (actuals.every(v => v === 0) && planneds.every(v => v === 0));

    handleEmptyState('expenseChart', isEmpty, 'No data to display. Add expenses to see the chart.');
    handleEmptyState('doughnutChart', isEmpty, 'No data to display.');

    if (isEmpty) return;

    if (chartInstance) {
        // Fast update
        chartInstance.data.labels = categories;
        chartInstance.data.datasets[0].data = actuals;
        chartInstance.data.datasets[1].data = planneds;
        
        // Update theme options safely
        if (chartInstance.options?.plugins?.legend?.labels) {
            chartInstance.options.plugins.legend.labels.color = textColor;
        }
        if (chartInstance.options?.scales?.x?.ticks) {
            chartInstance.options.scales.x.ticks.color = textColor;
        }
        if (chartInstance.options?.scales?.y?.ticks) {
            chartInstance.options.scales.y.ticks.color = textColor;
        }
        if (chartInstance.options?.scales?.y?.grid) {
            chartInstance.options.scales.y.grid.color = gridColor;
        }
        
        chartInstance.update('none'); // Update without full animation for performance on typing
    } else {
        const ctx = document.getElementById('expenseChart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [
                    { label: 'Actual Spending', data: actuals, backgroundColor: '#4f46e5', borderRadius: 6 },
                    { label: 'Planned Amount', data: planneds, backgroundColor: isDark ? '#334155' : '#cbd5e1', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor, font: { family: 'Plus Jakarta Sans' } } } },
                scales: {
                    x: { ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } }, grid: { display: false } },
                    y: { ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } }, grid: { color: gridColor } }
                }
            }
        });
    }

    // Doughnut Chart Setup
    if (doughnutChartInstance) {
        doughnutChartInstance.data.labels = categories;
        doughnutChartInstance.data.datasets[0].data = actuals;
        if (doughnutChartInstance.options?.plugins?.legend?.labels) {
            doughnutChartInstance.options.plugins.legend.labels.color = textColor;
        }
        doughnutChartInstance.update('none');
    } else {
        const ctxD = document.getElementById('doughnutChart').getContext('2d');
        doughnutChartInstance = new Chart(ctxD, {
            type: 'doughnut',
            data: {
                labels: categories,
                datasets: [{
                    data: actuals,
                    backgroundColor: CHART_COLORS,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } } } },
                cutout: '70%'
            }
        });
    }
}

function handleEmptyState(canvasId, isEmpty, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    let msgDiv = canvas.parentElement.querySelector('.chart-empty-msg');
    
    if (isEmpty) {
        canvas.style.display = 'none';
        if (!msgDiv) {
            msgDiv = document.createElement('div');
            msgDiv.className = 'chart-empty-msg';
            msgDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-style:italic;text-align:center;padding:1rem;';
            msgDiv.textContent = message;
            canvas.parentElement.appendChild(msgDiv);
        }
        msgDiv.style.display = 'flex';
    } else {
        canvas.style.display = 'block';
        if (msgDiv) msgDiv.style.display = 'none';
    }
}

// CSV Export
function downloadCSV() {
    const data = appState.data[appState.currentMonth];
    let csvData = 'Category,Planned,Actual,Status\n';
    
    const escapeCSV = str => '"' + String(str).replace(/"/g, '""') + '"';

    data.forEach(item => {
        csvData += `${escapeCSV(item.category)},${item.planned},${item.actual},${escapeCSV(item.status)}\n`;
    });
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeUser.username}_budget_${appState.currentMonth}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Toast Notifier
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '<i class="fas fa-check-circle" style="color:#10b981"></i>' : '<i class="fas fa-exclamation-circle" style="color:var(--danger)"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Boot up
window.addEventListener('DOMContentLoaded', init);
