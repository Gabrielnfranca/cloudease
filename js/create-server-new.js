document.addEventListener('DOMContentLoaded', () => {
    const state = {
        mode: '',
        provider: '',
        region: '',
        os: '',
        plan: '',
        app: 'base-stack',
        allPlans: [],
        allRegions: [],
        allOs: [],
        selectedPlanMeta: null,
        existingServers: [],
        selectedN8nServer: ''
    };

    const providerProfiles = {
        vultr: {
            label: 'Vultr',
            guidance: 'Boa opcao com preco previsivel e configuracao rapida.',
            minRamMB: 2048
        },
        digitalocean: {
            label: 'DigitalOcean',
            guidance: 'Opcao simples e amigavel para quem esta comecando.',
            minRamMB: 2048
        },
        linode: {
            label: 'Linode',
            guidance: 'Boa relacao custo-beneficio para uso geral.',
            minRamMB: 2048
        },
        aws: {
            label: 'AWS',
            guidance: 'Integracao AWS em preparacao.',
            minRamMB: 2048
        }
    };

    const appProfiles = {
        'base-stack': { label: 'Stack CloudEase', requirements: { minCpu: 1, minRamMB: 1024, minDiskGB: 20 } },
        'n8n-stack': { label: 'n8n 1-Clique', requirements: { minCpu: 1, minRamMB: 2048, minDiskGB: 25 } }
    };

    const providerCards = Array.from(document.querySelectorAll('.provider-card'));
    const modeCards = Array.from(document.querySelectorAll('.mode-card'));

    const providerInput = document.getElementById('providerInput');
    const regionInput = document.getElementById('regionInput');
    const osInput = document.getElementById('osInput');
    const planInput = document.getElementById('planInput');
    const appInput = document.getElementById('appInput');

    const regionSelect = document.getElementById('regionSelect');
    const osSelect = document.getElementById('osSelect');
    const planSelect = document.getElementById('planSelect');
    const providerGuidance = document.getElementById('providerGuidance');
    const planStatus = document.getElementById('planStatus');
    const planWarning = document.getElementById('planWarning');
    const createServerSection = document.getElementById('createServerSection');
    const createBasicSection = document.getElementById('createBasicSection');
    const createInstallSection = document.getElementById('createInstallSection');
    const installN8nSection = document.getElementById('installN8nSection');
    const createActions = document.getElementById('createActions');
    const n8nServerSelect = document.getElementById('n8nServerSelect');
    const installN8nBtn = document.getElementById('installN8nBtn');
    const n8nStatus = document.getElementById('n8nStatus');

    const summaryProvider = document.getElementById('summaryProvider');
    const summaryMode = document.getElementById('summaryMode');
    const summaryRegion = document.getElementById('summaryRegion');
    const summaryOs = document.getElementById('summaryOs');
    const summaryPlan = document.getElementById('summaryPlan');
    const summaryApp = document.getElementById('summaryApp');
    const summaryCost = document.getElementById('summaryCost');
    const summaryCompatibility = document.getElementById('summaryCompatibility');

    const form = document.getElementById('createServerFormNew');
    const createServerBtn = document.getElementById('createServerBtn');

    function setMode(mode) {
        state.mode = mode;
        modeCards.forEach((card) => card.classList.toggle('is-active', card.dataset.mode === mode));

        const createVisible = mode === 'create-server';
        const installVisible = mode === 'install-n8n';
        createServerSection.hidden = !createVisible;
        createBasicSection.hidden = !createVisible;
        createInstallSection.hidden = !createVisible;
        createActions.hidden = !createVisible;
        installN8nSection.hidden = !installVisible;

        if (createVisible) {
            summaryMode.textContent = 'Criar servidor';
            summaryApp.textContent = 'Servidor base';
        } else if (installVisible) {
            summaryMode.textContent = 'Instalar n8n';
            summaryApp.textContent = 'n8n';
            summaryProvider.textContent = '-';
            summaryRegion.textContent = '-';
            summaryOs.textContent = '-';
            summaryPlan.textContent = '-';
            summaryCost.textContent = 'Nao se aplica';
            summaryCompatibility.textContent = 'Nao se aplica';
        } else {
            summaryMode.textContent = 'Escolha acima';
            summaryProvider.textContent = '-';
            summaryRegion.textContent = '-';
            summaryOs.textContent = '-';
            summaryPlan.textContent = '-';
            summaryApp.textContent = '-';
            summaryCost.textContent = '-';
            summaryCompatibility.textContent = 'Aguardando';
        }
    }

    function getToken() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'index.html';
            return null;
        }
        return token;
    }

    async function authFetch(url, options) {
        const token = getToken();
        if (!token) throw new Error('Sessao invalida.');

        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options && options.headers ? options.headers : {})
            }
        });

        const isJson = (response.headers.get('content-type') || '').includes('application/json');
        const payload = isJson ? await response.json() : { error: await response.text() };

        if (!response.ok) throw new Error(payload.error || 'Falha na requisicao.');
        return payload;
    }

    function setActiveProvider(provider) {
        providerCards.forEach((card) => {
            card.classList.toggle('is-selected', card.dataset.provider === provider);
        });
    }

    function updateSummary() {
        summaryProvider.textContent = state.provider ? (providerProfiles[state.provider]?.label || state.provider) : '-';

        if (state.region) {
            const region = state.allRegions.find((item) => String(item.id) === String(state.region));
            summaryRegion.textContent = region ? (region.country ? `${region.name} (${region.country})` : (region.description || region.name)) : state.region;
        } else {
            summaryRegion.textContent = '-';
        }

        if (state.os) {
            const os = state.allOs.find((item) => String(item.id) === String(state.os));
            summaryOs.textContent = os ? os.name : state.os;
        } else {
            summaryOs.textContent = '-';
        }

        summaryPlan.textContent = state.selectedPlanMeta ? state.selectedPlanMeta.label : '-';
        summaryApp.textContent = 'Servidor base';
        summaryCost.textContent = state.selectedPlanMeta && state.selectedPlanMeta.price !== null
            ? `US$ ${state.selectedPlanMeta.price.toFixed(2)}/mes`
            : '-';
    }

    function evaluateCompatibility() {
        const app = appProfiles[state.app];
        if (!state.selectedPlanMeta) {
            summaryCompatibility.textContent = 'Aguardando';
            planWarning.hidden = true;
            planWarning.textContent = '';
            planStatus.textContent = state.provider
                ? 'Escolha regiao, sistema e tamanho para continuar.'
                : 'Escolha uma empresa para comecar.';
            return { ok: false, message: 'Selecione um plano.' };
        }

        const ok = state.selectedPlanMeta.cpu >= app.requirements.minCpu
            && state.selectedPlanMeta.ram >= app.requirements.minRamMB
            && state.selectedPlanMeta.disk >= app.requirements.minDiskGB;

        if (!ok) {
            const message = `Este tamanho nao atende os requisitos minimos. Recomendado: ${app.requirements.minCpu} vCPU, ${app.requirements.minRamMB}MB RAM e ${app.requirements.minDiskGB}GB disco.`;
            summaryCompatibility.textContent = 'Incompativel';
            planStatus.textContent = message;
            planWarning.hidden = false;
            planWarning.textContent = message;
            return { ok: false, message };
        }

        summaryCompatibility.textContent = 'Compativel';
        planStatus.textContent = 'Configuracao pronta para criar o servidor.';
        planWarning.hidden = true;
        planWarning.textContent = '';
        return { ok: true, message: '' };
    }

    function renderProviderGuidance() {
        if (!state.provider) {
            providerGuidance.hidden = true;
            providerGuidance.textContent = '';
            return;
        }

        const profile = providerProfiles[state.provider];
        providerGuidance.hidden = false;
        providerGuidance.innerHTML = `<strong>${profile.label}:</strong> ${profile.guidance}`;
    }

    function renderRegions() {
        regionSelect.innerHTML = '<option value="">Selecione uma regiao</option>';
        state.allRegions
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .forEach((region) => {
                const option = document.createElement('option');
                option.value = region.id;
                option.textContent = region.country ? `${region.name} (${region.country})` : (region.description || region.name || region.id);
                regionSelect.appendChild(option);
            });

        regionSelect.disabled = state.allRegions.length === 0;
        if (state.region) regionSelect.value = state.region;
        if (!regionSelect.value && regionSelect.options.length > 1) {
            regionSelect.value = regionSelect.options[1].value;
            state.region = regionSelect.value;
            regionInput.value = state.region;
        }
    }

    function renderOs() {
        osSelect.innerHTML = '<option value="">Selecione um sistema operacional</option>';
        const osList = state.allOs.length > 0 ? state.allOs : [
            { id: '1743', name: 'Ubuntu 22.04 x64' },
            { id: '477', name: 'Debian 11 x64' }
        ];

        osList.forEach((os) => {
            const option = document.createElement('option');
            option.value = os.id;
            option.textContent = os.name;
            osSelect.appendChild(option);
        });

        osSelect.disabled = false;
        if (state.os) osSelect.value = state.os;
        if (!osSelect.value && osSelect.options.length > 1) {
            const defaultOption = Array.from(osSelect.options).find((option) => option.textContent.toLowerCase().includes('ubuntu 22.04') || option.textContent.toLowerCase().includes('ubuntu 24.04'));
            osSelect.value = defaultOption ? defaultOption.value : osSelect.options[1].value;
            state.os = osSelect.value;
            osInput.value = state.os;
        }
    }

    function getFilteredPlans() {
        if (!state.region) return [];

        const plans = state.allPlans || [];
        const hasLocations = plans.some((plan) => Array.isArray(plan.locations) && plan.locations.length > 0);
        if (!hasLocations) return plans;

        const normalizedRegion = String(state.region).trim().toLowerCase();
        return plans.filter((plan) => Array.isArray(plan.locations) && plan.locations.some((location) => String(location).trim().toLowerCase() === normalizedRegion));
    }

    function renderPlans() {
        planSelect.innerHTML = '<option value="">Selecione um tamanho</option>';

        const plans = getFilteredPlans().slice().sort((a, b) => Number(a.price ?? Number.POSITIVE_INFINITY) - Number(b.price ?? Number.POSITIVE_INFINITY));
        if (!state.provider) {
            planSelect.disabled = true;
            planStatus.textContent = 'Escolha uma empresa para comecar.';
            state.selectedPlanMeta = null;
            evaluateCompatibility();
            updateSummary();
            return;
        }

        planSelect.disabled = false;

        if (plans.length === 0) {
            planStatus.textContent = state.region
                ? 'Nenhum tamanho encontrado nesta regiao.'
                : 'Escolha uma regiao para ver os tamanhos disponiveis.';
            state.selectedPlanMeta = null;
            evaluateCompatibility();
            updateSummary();
            return;
        }

        plans.forEach((plan) => {
            const option = document.createElement('option');
            option.value = plan.id;
            const hasPrice = plan.price !== null && plan.price !== undefined && Number.isFinite(Number(plan.price));
            const priceLabel = hasPrice ? `US$ ${Number(plan.price).toFixed(2)}/mês` : 'Preço indisponível';
            option.textContent = `${priceLabel} - ${plan.cpu} vCPU, ${plan.ram}MB RAM, ${plan.disk}GB SSD`;
            option.dataset.cpu = plan.cpu || '';
            option.dataset.ram = plan.ram || '';
            option.dataset.disk = plan.disk || '';
            option.dataset.price = hasPrice ? Number(plan.price).toFixed(2) : '';
            planSelect.appendChild(option);
        });

        if (state.plan && Array.from(planSelect.options).some((option) => option.value === state.plan)) {
            planSelect.value = state.plan;
        } else {
            planSelect.value = planSelect.options[1].value;
            state.plan = planSelect.value;
            planInput.value = state.plan;
        }

        updateSelectedPlanMeta();
    }

    function updateSelectedPlanMeta() {
        const selectedOption = planSelect.options[planSelect.selectedIndex];
        if (!selectedOption || !selectedOption.value) {
            state.selectedPlanMeta = null;
            evaluateCompatibility();
            updateSummary();
            return;
        }

        state.plan = selectedOption.value;
        planInput.value = state.plan;
        state.selectedPlanMeta = {
            cpu: Number(selectedOption.dataset.cpu || 0),
            ram: Number(selectedOption.dataset.ram || 0),
            disk: Number(selectedOption.dataset.disk || 0),
            price: selectedOption.dataset.price ? Number(selectedOption.dataset.price) : null,
            label: selectedOption.textContent.split(' - ').pop() || selectedOption.value
        };
        evaluateCompatibility();
        updateSummary();
    }

    async function loadProviderOptions(provider) {
        const response = await authFetch('/api/cloud-options', {
            method: 'POST',
            body: JSON.stringify({ provider })
        });

        state.allPlans = Array.isArray(response.plans) ? response.plans : [];
        state.allRegions = Array.isArray(response.regions) ? response.regions : [];
        state.allOs = Array.isArray(response.os) ? response.os : [];

        state.region = '';
        state.os = '';
        state.plan = '';
        state.selectedPlanMeta = null;
        regionInput.value = '';
        osInput.value = '';
        planInput.value = '';

        renderRegions();
        renderOs();
        renderPlans();
        renderProviderGuidance();
        updateSummary();
    }

    async function selectProvider(provider) {
        if (provider === 'aws') {
            alert('AWS em breve neste fluxo.');
            return;
        }

        state.provider = provider;
        providerInput.value = provider;
        setActiveProvider(provider);
        renderProviderGuidance();
        planStatus.textContent = 'Carregando opcoes...';

        try {
            await loadProviderOptions(provider);
        } catch (error) {
            alert('Nao foi possivel carregar as opcoes: ' + error.message);
        }
    }

    function createServerPayload() {
        return {
            provider: state.provider,
            region: state.region,
            plan: state.plan,
            os_id: state.os,
            app: 'base-stack',
            name: (document.getElementById('serverName').value || '').trim() || 'Novo Servidor'
        };
    }

    async function loadExistingServers() {
        n8nServerSelect.innerHTML = '<option value="">Carregando servidores...</option>';
        n8nServerSelect.disabled = true;
        try {
            const servers = await authFetch('/api/servers', { method: 'GET' });
            state.existingServers = Array.isArray(servers) ? servers : [];
            const existingWithIp = state.existingServers.filter((server) => server.ip_address && server.ip_address !== '0.0.0.0');

            n8nServerSelect.innerHTML = '<option value="">Selecione um servidor</option>';
            existingWithIp.forEach((server) => {
                const option = document.createElement('option');
                option.value = server.id;
                const status = String(server.status || 'desconhecido').toLowerCase();
                option.textContent = `${server.name} (${server.ip_address}) - ${status}`;
                n8nServerSelect.appendChild(option);
            });

            n8nServerSelect.disabled = existingWithIp.length === 0;
            n8nStatus.textContent = existingWithIp.length > 0
                ? 'Selecione um servidor da sua lista para iniciar a instalacao do n8n.'
                : 'Nenhum servidor encontrado. Crie um servidor primeiro.';
        } catch (error) {
            n8nServerSelect.innerHTML = '<option value="">Erro ao carregar</option>';
            n8nServerSelect.disabled = true;
            n8nStatus.textContent = 'Nao foi possivel carregar seus servidores.';
        }
    }

    async function installN8nOnExistingServer() {
        if (!state.selectedN8nServer) {
            alert('Selecione um servidor para continuar.');
            return;
        }

        const target = state.existingServers.find((server) => String(server.id) === String(state.selectedN8nServer));
        if (!target) {
            alert('Servidor selecionado invalido. Atualize a lista e tente novamente.');
            return;
        }

        const status = String(target.status || '').toLowerCase();
        const activeStatuses = ['active', 'running', 'online', 'ready'];
        if (!activeStatuses.includes(status)) {
            alert('Esse servidor nao esta ativo ainda. Aguarde ficar ativo para instalar o n8n.');
            return;
        }

        const originalHtml = installN8nBtn.innerHTML;
        installN8nBtn.disabled = true;
        installN8nBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Instalando...';
        n8nStatus.textContent = `Instalando n8n em ${target.name}...`;

        try {
            const result = await authFetch('/api/servers', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'install_n8n_existing',
                    server_id: target.id
                })
            });

            const access = result.access || {};
            n8nStatus.textContent = 'n8n instalado com sucesso. Acesso pronto para uso.';

            if (access.url && access.user && access.password) {
                alert(
                    'n8n instalado com sucesso!\n\n' +
                    'URL: ' + access.url + '\n' +
                    'Usuario: ' + access.user + '\n' +
                    'Senha: ' + access.password
                );
            } else {
                alert('n8n instalado com sucesso.');
            }
        } catch (error) {
            n8nStatus.textContent = 'Falha na instalacao do n8n.';
            alert('Erro ao instalar n8n: ' + error.message);
        } finally {
            installN8nBtn.disabled = false;
            installN8nBtn.innerHTML = originalHtml;
        }
    }

    async function createServer() {
        if (!state.provider || !state.region || !state.os || !state.plan) {
            alert('Preencha empresa, regiao, sistema e tamanho do servidor.');
            return;
        }

        const compatibility = evaluateCompatibility();
        if (!compatibility.ok) {
            alert(compatibility.message);
            return;
        }

        const originalHtml = createServerBtn.innerHTML;
        createServerBtn.disabled = true;
        createServerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

        try {
            const result = await authFetch('/api/servers', {
                method: 'POST',
                body: JSON.stringify(createServerPayload())
            });

            if (result && result.access && result.access.service === 'n8n') {
                alert(
                    'Servidor n8n criado!\n\n' +
                    'Usuario: ' + result.access.user + '\n' +
                    'Senha: ' + result.access.password + '\n\n' +
                    'Acesse em: http://IP_DO_SERVIDOR:5678\n' +
                    'Aguarde alguns minutos para finalizar.'
                );
            } else {
                alert('Servidor criado com sucesso! A instalacao pode levar alguns minutos.');
            }

            window.location.href = 'servers.html';
        } catch (error) {
            alert('Erro ao criar servidor: ' + error.message);
        } finally {
            createServerBtn.disabled = false;
            createServerBtn.innerHTML = originalHtml;
        }
    }

    providerCards.forEach((card) => {
        const button = card.querySelector('[data-select-provider]');
        if (!button) return;
        button.addEventListener('click', () => selectProvider(card.dataset.provider));
    });

    modeCards.forEach((card) => {
        const button = card.querySelector('[data-select-mode]');
        const activateMode = async () => {
            setMode(card.dataset.mode);
            if (card.dataset.mode === 'install-n8n') {
                await loadExistingServers();
            }
            if (card.dataset.mode === 'create-server') {
                updateSummary();
            }
        };

        card.addEventListener('click', activateMode);
        if (button) {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                activateMode();
            });
        }
    });

    n8nServerSelect.addEventListener('change', () => {
        state.selectedN8nServer = n8nServerSelect.value;
        const target = state.existingServers.find((server) => String(server.id) === String(state.selectedN8nServer));
        summaryPlan.textContent = target ? target.name : '-';
        summaryProvider.textContent = target ? (target.provider || '-') : '-';
    });

    installN8nBtn.addEventListener('click', () => {
        installN8nOnExistingServer();
    });

    regionSelect.addEventListener('change', () => {
        state.region = regionSelect.value;
        regionInput.value = state.region;
        renderPlans();
        updateSummary();
    });

    osSelect.addEventListener('change', () => {
        state.os = osSelect.value;
        osInput.value = state.os;
        updateSummary();
    });

    planSelect.addEventListener('change', () => {
        updateSelectedPlanMeta();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        createServer();
    });

    setMode(state.mode);
    updateSummary();
});
