(function () {
    const state = {
        currentStep: 1,
        serverId: null,
        createdSite: null,
        provisionInput: {
            domain: '',
            platform: 'wordpress',
            wpAdminUser: '',
            wpAdminPass: '',
            wpAdminEmail: ''
        }
    };

    const feedback = {
        provider: document.getElementById('providerFeedback'),
        server: document.getElementById('serverFeedback'),
        site: document.getElementById('siteFeedback'),
        delivery: document.getElementById('deliveryFeedback')
    };

    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = 'index.html';
        return;
    }

    const providerEl = document.getElementById('provider');
    const connectionNameEl = document.getElementById('connectionName');
    const providerTokenEl = document.getElementById('providerToken');
    const serverSelectEl = document.getElementById('serverSelect');

    const domainEl = document.getElementById('domain');
    const platformEl = document.getElementById('platform');
    const wpFieldsEl = document.getElementById('wpFields');
    const wpAdminUserEl = document.getElementById('wpAdminUser');
    const wpAdminPassEl = document.getElementById('wpAdminPass');
    const wpAdminEmailEl = document.getElementById('wpAdminEmail');

    function setFeedback(target, message, isError) {
        if (!feedback[target]) return;
        feedback[target].textContent = message || '';
        feedback[target].style.color = isError ? '#b91c1c' : '#335a84';
    }

    function setStep(step) {
        state.currentStep = step;

        document.querySelectorAll('.step').forEach((item) => {
            const itemStep = Number(item.dataset.step || '0');
            item.classList.toggle('is-active', itemStep === step);
        });

        document.querySelectorAll('.panel').forEach((panel) => {
            const panelStep = Number(panel.dataset.panel || '0');
            panel.classList.toggle('is-active', panelStep === step);
        });
    }

    function mapProviderLabel(provider) {
        if (provider === 'vultr') return 'Vultr';
        if (provider === 'linode') return 'Linode';
        if (provider === 'digitalocean') return 'DigitalOcean';
        if (provider === 'aws') return 'AWS';
        return provider;
    }

    function createStrongPassword(length) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*()-_=+';
        const values = new Uint32Array(length);
        window.crypto.getRandomValues(values);
        let out = '';
        for (let i = 0; i < values.length; i += 1) {
            out += chars[values[i] % chars.length];
        }
        return out;
    }

    function normalizeDomain(raw) {
        return String(raw || '')
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/.*/, '');
    }

    function setButtonLoading(button, loadingText, loading) {
        if (!button) return;
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
        }
        button.disabled = loading;
        button.innerHTML = loading ? loadingText : button.dataset.originalText;
    }

    async function apiRequest(path, options) {
        const response = await fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                ...(options && options.headers ? options.headers : {})
            }
        });

        const ct = response.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await response.json() : { error: await response.text() };

        if (!response.ok) {
            throw new Error(data.error || `Falha na chamada: ${path}`);
        }

        return data;
    }

    async function loadServers(showSyncFeedback) {
        setFeedback('server', 'Sincronizando servidores, aguarde...', false);

        await apiRequest('/api/servers?sync=true', { method: 'GET' });
        const list = await apiRequest('/api/servers', { method: 'GET' });

        serverSelectEl.innerHTML = '<option value="">Selecione um servidor...</option>';

        if (!Array.isArray(list) || list.length === 0) {
            serverSelectEl.innerHTML = '<option value="">Nenhum servidor encontrado</option>';
            setFeedback('server', 'Nenhum servidor ativo encontrado. Conecte outro provedor ou crie servidor antes.', true);
            return;
        }

        const providerFilter = providerEl.value;
        const filtered = providerFilter ? list.filter((item) => String(item.provider || '').toLowerCase() === providerFilter) : list;
        const source = filtered.length > 0 ? filtered : list;

        source.forEach((server) => {
            const option = document.createElement('option');
            option.value = String(server.id);
            option.textContent = `${server.name} (${server.ip_address || 'sem IP'}) - ${server.provider}`;
            serverSelectEl.appendChild(option);
        });

        if (showSyncFeedback) {
            setFeedback('server', `${source.length} servidor(es) disponiveis para instalacao.`, false);
        }
    }

    async function connectProvider() {
        const provider = providerEl.value;
        const token = providerTokenEl.value.trim();
        const label = connectionNameEl.value.trim() || `${mapProviderLabel(provider)} Principal`;

        if (!provider) {
            setFeedback('provider', 'Selecione o provedor.', true);
            return;
        }

        if (provider === 'aws') {
            setFeedback('provider', 'AWS ainda nao esta habilitado para conexao automatica neste ambiente.', true);
            return;
        }

        if (!token) {
            setFeedback('provider', 'Cole o token da API para continuar.', true);
            return;
        }

        const button = document.getElementById('btnConnectProvider');
        setButtonLoading(button, '<i class="fas fa-spinner fa-spin"></i> Conectando...', true);
        setFeedback('provider', '', false);

        try {
            const data = await apiRequest('/api/providers', {
                method: 'POST',
                body: JSON.stringify({
                    provider,
                    name: label,
                    token
                })
            });

            setFeedback('provider', `Conexao criada com sucesso. ${data.syncedServers || 0} servidor(es) sincronizados.`, false);
            await loadServers(true);
            setStep(2);
        } catch (error) {
            setFeedback('provider', error.message, true);
        } finally {
            setButtonLoading(button, '', false);
        }
    }

    async function useExistingProvider() {
        const provider = providerEl.value;
        if (!provider) {
            setFeedback('provider', 'Selecione o provedor antes de continuar.', true);
            return;
        }

        if (provider === 'aws') {
            setFeedback('provider', 'Para AWS, finalize primeiro a conexao manual e depois volte para este fluxo.', true);
            return;
        }

        const button = document.getElementById('btnSkipProvider');
        setButtonLoading(button, '<i class="fas fa-spinner fa-spin"></i> Carregando...', true);
        setFeedback('provider', '', false);

        try {
            await loadServers(true);
            setStep(2);
        } catch (error) {
            setFeedback('provider', error.message, true);
        } finally {
            setButtonLoading(button, '', false);
        }
    }

    function continueToSiteStep() {
        if (!serverSelectEl.value) {
            setFeedback('server', 'Selecione um servidor para continuar.', true);
            return;
        }
        state.serverId = serverSelectEl.value;
        setFeedback('server', '', false);
        setStep(3);
    }

    function updatePlatformFields() {
        const platform = platformEl.value;
        const showWp = platform === 'wordpress';
        wpFieldsEl.style.display = showWp ? 'block' : 'none';
    }

    async function installSite() {
        const domain = normalizeDomain(domainEl.value);
        const platform = platformEl.value;

        if (!state.serverId) {
            setFeedback('site', 'Servidor nao selecionado. Volte ao passo anterior.', true);
            return;
        }

        if (!domain || !domain.includes('.')) {
            setFeedback('site', 'Informe um dominio valido. Exemplo: meusite.com', true);
            return;
        }

        const wpAdminUser = wpAdminUserEl.value.trim() || 'admin';
        const wpAdminPass = wpAdminPassEl.value.trim() || createStrongPassword(14);
        const wpAdminEmail = wpAdminEmailEl.value.trim() || `admin@${domain}`;

        state.provisionInput = {
            domain,
            platform,
            wpAdminUser,
            wpAdminPass,
            wpAdminEmail
        };

        const button = document.getElementById('btnInstallSite');
        setButtonLoading(button, '<i class="fas fa-spinner fa-spin"></i> Instalando...', true);
        setFeedback('site', 'Criando site e iniciando provisionamento. Isso pode levar alguns minutos.', false);

        try {
            const createPayload = {
                serverId: Number(state.serverId),
                domain,
                platform,
                phpVersion: '8.2',
                enableTempUrl: true,
                wpTitle: domain,
                wpAdminUser: platform === 'wordpress' ? wpAdminUser : null,
                wpAdminPass: platform === 'wordpress' ? wpAdminPass : null,
                wpAdminEmail: platform === 'wordpress' ? wpAdminEmail : null,
                wpLang: 'pt_BR'
            };

            const created = await apiRequest('/api/sites', {
                method: 'POST',
                body: JSON.stringify(createPayload)
            });

            const siteId = created?.site?.id;
            if (!siteId) {
                throw new Error('Site criado sem ID de retorno.');
            }

            const detailed = await apiRequest(`/api/sites?id=${siteId}&detailed=true`, { method: 'GET' });
            state.createdSite = {
                ...created.site,
                ...detailed
            };

            fillDelivery();
            setFeedback('site', 'Instalacao iniciada com sucesso. Dados de acesso gerados.', false);
            setStep(4);
        } catch (error) {
            setFeedback('site', error.message, true);
        } finally {
            setButtonLoading(button, '', false);
        }
    }

    function fillDelivery() {
        const site = state.createdSite || {};
        const tempUrl = site.tempUrl || `http://${state.provisionInput.domain}`;

        const urlEl = document.getElementById('deliveryUrl');
        urlEl.href = tempUrl;
        urlEl.textContent = tempUrl;

        document.getElementById('deliveryDomain').textContent = state.provisionInput.domain || '-';
        document.getElementById('deliverySystemUser').textContent = site.system_user || '-';
        document.getElementById('deliverySystemPass').textContent = site.system_password || '-';
        document.getElementById('deliveryWpUser').textContent = state.provisionInput.platform === 'wordpress' ? state.provisionInput.wpAdminUser : 'Nao se aplica';
        document.getElementById('deliveryWpPass').textContent = state.provisionInput.platform === 'wordpress' ? state.provisionInput.wpAdminPass : 'Nao se aplica';
    }

    async function copyDeliveryData() {
        const site = state.createdSite || {};
        const lines = [
            `Link temporario: ${document.getElementById('deliveryUrl').textContent}`,
            `Dominio: ${state.provisionInput.domain || '-'}`,
            `Usuario sistema: ${site.system_user || '-'}`,
            `Senha sistema: ${site.system_password || '-'}`,
            `Usuario WordPress: ${state.provisionInput.platform === 'wordpress' ? state.provisionInput.wpAdminUser : 'Nao se aplica'}`,
            `Senha WordPress: ${state.provisionInput.platform === 'wordpress' ? state.provisionInput.wpAdminPass : 'Nao se aplica'}`
        ];

        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            setFeedback('delivery', 'Dados copiados para area de transferencia.', false);
        } catch (error) {
            setFeedback('delivery', 'Nao foi possivel copiar automaticamente. Copie manualmente os dados exibidos.', true);
        }
    }

    function resetWizard() {
        state.serverId = null;
        state.createdSite = null;
        domainEl.value = '';
        wpAdminUserEl.value = '';
        wpAdminPassEl.value = '';
        wpAdminEmailEl.value = '';
        setFeedback('delivery', '', false);
        setStep(1);
    }

    document.getElementById('btnConnectProvider').addEventListener('click', connectProvider);
    document.getElementById('btnSkipProvider').addEventListener('click', useExistingProvider);
    document.getElementById('btnRefreshServers').addEventListener('click', function () { loadServers(true).catch(function () {}); });
    document.getElementById('btnGoToSiteStep').addEventListener('click', continueToSiteStep);
    document.getElementById('btnInstallSite').addEventListener('click', installSite);
    document.getElementById('btnCopyDelivery').addEventListener('click', copyDeliveryData);
    document.getElementById('btnNewInstall').addEventListener('click', resetWizard);

    platformEl.addEventListener('change', updatePlatformFields);

    updatePlatformFields();
    setStep(1);
})();
