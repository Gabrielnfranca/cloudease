const fs = require('fs');
const path = 'c:\\SISTEMA\\cloudease\\css\\admin-panel.css';
const content = `:root {
    --primary: #6366f1; /* Indigo 500 */
    --primary-dark: #4f46e5;
    --primary-light: #e0e7ff;
    
    --sidebar-bg: #0f172a; /* Slate 900 */
    --sidebar-text: #94a3b8;
    
    --bg-body: #f3f4f6;
    --bg-card: #ffffff;
    
    --text-main: #111827;
    --text-muted: #6b7280;
    
    --border: #e2e8f0;
    
    --success: #10b981;
    --success-bg: #ecfdf5;
    --success-text: #047857;
    
    --warning: #f59e0b;
    --warning-bg: #fffbeb;
    --warning-text: #b45309;
    
    --danger: #ef4444;
    --danger-bg: #fef2f2;
    --danger-text: #b91c1c;

    --info: #3b82f6;
    --info-bg: #eff6ff;
    --info-text: #1d4ed8;
}

* { box-sizing: border-box; }

body.admin-body {
    display: flex;
    margin: 0;
    min-height: 100vh;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background-color: var(--bg-body);
    color: var(--text-main);
}

/* --- Sidebar --- */
.admin-sidebar {
    width: 260px;
    background-color: var(--sidebar-bg);
    color: var(--sidebar-text);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: all 0.3s ease;
    z-index: 10;
}

.sidebar-header {
    height: 70px;
    padding: 0 24px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex;
    align-items: center;
    gap: 12px;
}

.logo-text {
    font-size: 20px;
    font-weight: 700;
    color: white;
    letter-spacing: -0.5px;
}

.badge-admin {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid rgba(99, 102, 241, 0.3);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.admin-nav {
    padding: 24px 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    color: var(--sidebar-text);
    text-decoration: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-item:hover {
    background-color: rgba(255,255,255,0.05);
    color: white;
}

.nav-item.active {
    background: var(--primary);
    color: white;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.nav-item.active i {
    color: white;
}

.nav-item i {
    width: 20px;
    text-align: center;
    font-size: 16px;
    opacity: 0.8;
}

.badge-counter {
    background: var(--danger);
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 99px;
    margin-left: auto;
    min-width: 18px;
    text-align: center;
}

.sidebar-footer {
    padding: 20px;
    border-top: 1px solid rgba(255,255,255,0.05);
}

/* --- Main Content --- */
.admin-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

.admin-topbar {
    background: var(--bg-card);
    padding: 0 32px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 70px;
}

.admin-topbar h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-main);
}

.user-profile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px;
    border-radius: 30px;
    cursor: pointer;
    transition: background 0.2s;
}

.user-profile:hover {
    background: var(--bg-body);
}

.user-profile .avatar {
    width: 36px;
    height: 36px;
    background: #e0e7ff;
    color: var(--primary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
}

.admin-content {
    padding: 32px;
    overflow-y: auto;
    background: var(--bg-body);
}

/* --- Cards & Grid --- */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 24px;
    margin-bottom: 32px;
}

.stat-card {
    background: var(--bg-card);
    border-radius: 12px;
    padding: 24px;
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
}

.stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: #cbd5e1;
}

.stat-card h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-muted);
}

.stat-card .value {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-main);
}

.stat-icon-bg {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 48px;
    color: var(--primary);
    opacity: 0.1;
    pointer-events: none;
}

.trend {
    font-size: 12px;
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
}
.trend.positive { color: var(--success-text); }
.trend.negative { color: var(--danger-text); }

/* --- Charts --- */
.charts-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 24px;
    margin-bottom: 32px;
}

.chart-container {
    background: white;
    padding: 24px;
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

/* --- Tables --- */
.table-wrapper {
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

.admin-table {
    width: 100%;
    border-collapse: collapse;
}

.admin-table thead {
    background: #f8fafc;
    border-bottom: 1px solid var(--border);
}

.admin-table th {
    padding: 12px 24px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.admin-table td {
    padding: 16px 24px;
    color: var(--text-main);
    font-size: 14px;
    border-bottom: 1px solid var(--border);
}

.admin-table tr:last-child td {
    border-bottom: none;
}

.admin-table tbody tr:hover {
    background-color: #f8fafc;
}

/* --- Badges --- */
.badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
}

.badge-pill {
    border-radius: 9999px;
    padding: 4px 10px;
}

.badge-success { background: var(--success-bg); color: var(--success-text); }
.badge-warning { background: var(--warning-bg); color: var(--warning-text); }
.badge-danger  { background: var(--danger-bg);  color: var(--danger-text); }
.badge-info    { background: var(--info-bg);    color: var(--info-text); }

/* --- Buttons --- */
.btn-primary {
    background: var(--primary);
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
}

.btn-primary:hover {
    background: var(--primary-dark);
}

/* --- Support --- */
.support-layout {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 24px;
    height: calc(100vh - 140px);
}

.ticket-list {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow-y: auto;
}

.ticket-detail {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Responsive */
@media (max-width: 768px) {
    .admin-sidebar {
        position: fixed;
        left: -260px;
        height: 100%;
        box-shadow: 10px 0 20px rgba(0,0,0,0.2);
    }
    .admin-sidebar.open {
        left: 0;
    }
    .admin-content {
        padding: 16px;
    }
    .stats-grid {
        grid-template-columns: 1fr;
    }
    .support-layout {
        grid-template-columns: 1fr;
    }
    .ticket-detail {
        display: none; /* Mobile logic needed */
    }
}
`;
fs.writeFileSync(path, content);
console.log('CSS admin atualizado com sucesso via script.');
