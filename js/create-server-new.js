document.addEventListener('DOMContentLoaded', () => {
    const state = {
        provider: '',
        region: '',
        os: '',
        plan: '',
        app: 'base-stack',
        allPlans: [],
        allRegions: [],
        allOs: [],
        selectedPlanMeta: null
    };

    const providerProfiles = {
        vultr: {
            label: 'Vultr',
            guidance: 'Boa escolha para custo previsivel e deploy rapido.',
            minRamMB: 2048
        },
        digitalocean: {
            label: 'DigitalOcean',
            guidance: 'Opção simples e amigavel para times pequenos.',
            minRamMB: 2048
        },
        linode: {
            label: 'Linode',
            guidance: 'Boa relacao custo-beneficio em workloads Linux.',
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
    const appCards = Array.from(document.querySelectorAll('.app-card'));

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

    const summaryProvider = document.getElementById('summaryProvider');
    const summaryRegion = document.getElementById('summaryRegion');
    const summaryOs = document.getElementById('summaryOs');
    const summaryPlan = document.getElementById('summaryPlan');
    const summaryApp = document.getElementById('summaryApp');
    const summaryCost = document.getElementById('summaryCost');
    const summaryCompatibility = document.getElementById('summaryCompatibility');

    const form = document.getElementById('createServerFormNew');
    const createServerBtn = document.getElementById('createServerBtn');

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

    function setActiveApp(app) {
        appCards.forEach((card) => {
            card.classList.toggle('is-active', card.dataset.app === app);
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
        summaryApp.textContent = appProfiles[state.app]?.label || 'Stack CloudEase';
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
                ? 'Selecione regiao, sistema e plano para validar o servidor.'
                : 'Selecione um provedor para começar.';
            return { ok: false, message: 'Selecione um plano.' };
        }

        const ok = state.selectedPlanMeta.cpu >= app.requirements.minCpu
            && state.selectedPlanMeta.ram >= app.requirements.minRamMB
            && state.selectedPlanMeta.disk >= app.requirements.minDiskGB;

        if (!ok) {
            const message = `Plano incompativel para ${app.label}. Minimo: ${app.requirements.minCpu} vCPU, ${app.requirements.minRamMB}MB RAM e ${app.requirements.minDiskGB}GB disco.`;
            summaryCompatibility.textContent = 'Incompativel';
            planStatus.textContent = message;
            planWarning.hidden = false;
            planWarning.textContent = message;
            return { ok: false, message };
        }

        summaryCompatibility.textContent = 'Compativel';
        planStatus.textContent = `Plano pronto para ${app.label}.`;
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
        osSelect.innerHTML = '<option value="">Selecione um sistema</option>';
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
        planSelect.innerHTML = '<option value="">Selecione um plano</option>';

        const plans = getFilteredPlans().slice().sort((a, b) => Number(a.price ?? Number.POSITIVE_INFINITY) - Number(b.price ?? Number.POSITIVE_INFINITY));
        if (!state.provider) {
            planSelect.disabled = true;
            planStatus.textContent = 'Selecione um provedor para começar.';
            state.selectedPlanMeta = null;
            evaluateCompatibility();
            updateSummary();
            return;
        }

        planSelect.disabled = false;

        if (plans.length === 0) {
            planStatus.textContent = state.region
                ? 'Nenhum plano encontrado nesta regiao.'
                : 'Selecione uma regiao para ver os planos disponíveis.';
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
        planStatus.textContent = 'Carregando opcoes do provedor...';

        try {
            await loadProviderOptions(provider);
        } catch (error) {
            alert('Erro ao carregar opcoes: ' + error.message);
        }
    }

    function createServerPayload() {
        return {
            provider: state.provider,
            region: state.region,
            plan: state.plan,
            os_id: state.os,
            app: state.app,
            name: (document.getElementById('serverName').value || '').trim() || 'Novo Servidor'
        };
    }

    async function createServer() {
        if (!state.provider || !state.region || !state.os || !state.plan) {
            alert('Complete provedor, regiao, sistema e plano.');
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

    appCards.forEach((card) => {
        const button = card.querySelector('[data-select-app]');
        const activate = () => {
            state.app = card.dataset.app;
            appInput.value = state.app;
            setActiveApp(state.app);
            evaluateCompatibility();
            updateSummary();
        };

        card.addEventListener('click', activate);
        if (button) {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                activate();
            });
        }
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

    setActiveApp(state.app);
    updateSummary();
});
