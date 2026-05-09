document.addEventListener('DOMContentLoaded', () => {
    const refreshBadge = document.getElementById('refreshBadge');
    const lastUpdate = document.getElementById('lastUpdate');
    const cardsContainer = document.getElementById('monitoringCards');
    const emptyState = document.getElementById('monitoringEmpty');

    const metricAvgCpu = document.getElementById('metricAvgCpu');
    const metricAvgRam = document.getElementById('metricAvgRam');
    const metricAvgDisk = document.getElementById('metricAvgDisk');
    const metricOverloaded = document.getElementById('metricOverloaded');

    const historyMap = new Map();

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function formatNumber(value, digits = 1) {
        if (!Number.isFinite(Number(value))) return '--';
        return Number(value).toFixed(digits);
    }

    function formatGbFromKb(kb) {
        const num = Number(kb);
        if (!Number.isFinite(num)) return '--';
        return `${(num / 1024 / 1024).toFixed(2)} GB`;
    }

    function pushHistory(serverId, cpu, memory) {
        if (!historyMap.has(serverId)) {
            historyMap.set(serverId, { cpu: [], memory: [] });
        }

        const state = historyMap.get(serverId);
        state.cpu.push(Number(cpu) || 0);
        state.memory.push(Number(memory) || 0);

        if (state.cpu.length > 30) state.cpu.shift();
        if (state.memory.length > 30) state.memory.shift();
    }

    function pathFromSeries(series, width, height) {
        if (!series || series.length === 0) return '';
        const maxY = 100;
        const stepX = width / Math.max(series.length - 1, 1);

        return series.map((v, i) => {
            const x = i * stepX;
            const y = height - (Math.min(Math.max(v, 0), 100) / maxY) * height;
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(' ');
    }

    function healthClass(health) {
        if (health === 'critical') return 'status-critical';
        if (health === 'warning') return 'status-warning';
        return 'status-healthy';
    }

    function healthLabel(health) {
        if (health === 'critical') return 'Critico';
        if (health === 'warning') return 'Alerta';
        return 'Saudavel';
    }

    function createUnavailableCard(server) {
        const div = document.createElement('div');
        div.className = 'monitor-card unavailable';
        div.innerHTML = `
            <div class="monitor-card-head">
                <div>
                    <div class="server-title">${escapeHtml(server.name)}</div>
                    <div class="server-meta">${escapeHtml(server.provider)} | ${escapeHtml(server.ipAddress || '-')}</div>
                </div>
                <span class="status-chip status-off">Sem dados</span>
            </div>
            <p class="unavailable-text">${escapeHtml(server.reason || 'Nao foi possivel coletar metricas no momento.')}</p>
        `;
        return div;
    }

    function createServerCard(server) {
        const div = document.createElement('div');
        div.className = 'monitor-card';

        const h = historyMap.get(server.id) || { cpu: [], memory: [] };
        const cpuPath = pathFromSeries(h.cpu, 220, 60);
        const memoryPath = pathFromSeries(h.memory, 220, 60);

        div.innerHTML = `
            <div class="monitor-card-head">
                <div>
                    <div class="server-title">${escapeHtml(server.name)}</div>
                    <div class="server-meta">${escapeHtml(server.provider)} | ${escapeHtml(server.ipAddress)}</div>
                </div>
                <span class="status-chip ${healthClass(server.health)}">${healthLabel(server.health)}</span>
            </div>

            <div class="resource-grid">
                <div class="resource-item">
                    <div class="resource-top"><span>CPU</span><strong>${formatNumber(server.cpuUsagePct, 0)}%</strong></div>
                    <div class="bar"><div class="fill cpu" style="width:${Math.min(server.cpuUsagePct, 100)}%"></div></div>
                </div>
                <div class="resource-item">
                    <div class="resource-top"><span>Memoria</span><strong>${formatNumber(server.memoryUsagePct, 0)}%</strong></div>
                    <div class="bar"><div class="fill memory" style="width:${Math.min(server.memoryUsagePct, 100)}%"></div></div>
                    <div class="resource-sub">${formatGbFromKb(server.memoryUsedKb)} / ${formatGbFromKb(server.memoryTotalKb)}</div>
                </div>
                <div class="resource-item">
                    <div class="resource-top"><span>Disco</span><strong>${formatNumber(server.diskUsagePct, 0)}%</strong></div>
                    <div class="bar"><div class="fill disk" style="width:${Math.min(server.diskUsagePct, 100)}%"></div></div>
                    <div class="resource-sub">${formatGbFromKb(server.diskUsedKb)} / ${formatGbFromKb(server.diskTotalKb)}</div>
                </div>
            </div>

            <div class="traffic-row">
                <span><i class="fas fa-arrow-down"></i> ${formatNumber(server.rxKbps, 0)} KB/s</span>
                <span><i class="fas fa-arrow-up"></i> ${formatNumber(server.txKbps, 0)} KB/s</span>
                <span>Load: ${formatNumber(server.load1, 2)} / ${formatNumber(server.load5, 2)} / ${formatNumber(server.load15, 2)}</span>
            </div>

            <div class="sparkline-wrap">
                <div>
                    <div class="sparkline-label">CPU (historico)</div>
                    <svg viewBox="0 0 220 60" class="sparkline">
                        <path d="${cpuPath}" class="line-cpu"></path>
                    </svg>
                </div>
                <div>
                    <div class="sparkline-label">Memoria (historico)</div>
                    <svg viewBox="0 0 220 60" class="sparkline">
                        <path d="${memoryPath}" class="line-memory"></path>
                    </svg>
                </div>
            </div>

            <div class="suggestion">${escapeHtml(server.suggestion)}</div>
        `;

        return div;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function loadMetrics() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            setText('monitoringEmpty', 'Sessao expirada. Faça login novamente.');
            return;
        }

        refreshBadge.textContent = 'Atualizando...';

        try {
            const response = await fetch('/api/server-metrics', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Erro ${response.status}`);
            }

            const data = await response.json();
            const servers = Array.isArray(data.servers) ? data.servers : [];

            metricAvgCpu.textContent = data.summary?.avgCpuUsagePct !== null && data.summary?.avgCpuUsagePct !== undefined
                ? `${formatNumber(data.summary.avgCpuUsagePct, 1)}%`
                : '--';
            metricAvgRam.textContent = data.summary?.avgMemoryUsagePct !== null && data.summary?.avgMemoryUsagePct !== undefined
                ? `${formatNumber(data.summary.avgMemoryUsagePct, 1)}%`
                : '--';
            metricAvgDisk.textContent = data.summary?.avgDiskUsagePct !== null && data.summary?.avgDiskUsagePct !== undefined
                ? `${formatNumber(data.summary.avgDiskUsagePct, 1)}%`
                : '--';
            metricOverloaded.textContent = `${data.summary?.overloadedServers || 0}`;

            lastUpdate.textContent = data.generatedAt
                ? new Date(data.generatedAt).toLocaleString('pt-BR')
                : '--';

            cardsContainer.innerHTML = '';

            if (!servers.length) {
                emptyState.style.display = 'block';
                emptyState.textContent = 'Nenhum servidor com IP valido para monitoramento.';
                refreshBadge.textContent = 'Sem dados';
                return;
            }

            emptyState.style.display = 'none';

            servers.forEach((server) => {
                if (server.available) {
                    pushHistory(server.id, server.cpuUsagePct, server.memoryUsagePct);
                    cardsContainer.appendChild(createServerCard(server));
                } else {
                    cardsContainer.appendChild(createUnavailableCard(server));
                }
            });

            refreshBadge.textContent = `Tempo real (${data.refreshSeconds || 10}s)`;
        } catch (err) {
            console.error(err);
            refreshBadge.textContent = 'Erro ao atualizar';
            emptyState.style.display = 'block';
            emptyState.textContent = `Falha ao carregar metricas: ${err.message}`;
        }
    }

    loadMetrics();
    setInterval(loadMetrics, 10000);
});
