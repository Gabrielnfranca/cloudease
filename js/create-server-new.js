document.addEventListener('DOMContentLoaded', function () {
    const state = {
        step: 1,
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
        vultr: { label: 'Vultr', guidance: 'Ideal para deploy rapido e previsivel. Em producao prefira 2 GB RAM ou mais.', minRamMB: 2048 },
        digitalocean: { label: 'DigitalOcean', guidance: 'Muito amigavel para onboarding. Prefira 2 GB RAM para projetos ativos.', minRamMB: 2048 },
        linode: { label: 'Linode', guidance: 'Boa relacao custo-beneficio em workloads Linux.', minRamMB: 2048 },
        aws: { label: 'AWS', guidance: 'Integracao automatica em preparacao.', minRamMB: 2048 }
    };

    const appProfiles = {
        'base-stack': { label: 'Stack CloudEase', requirements: { minCpu: 1, minRamMB: 1024, minDiskGB: 20 } },
        'n8n-stack': { label: 'n8n 1-Clique', requirements: { minCpu: 1, minRamMB: 2048, minDiskGB: 25 } }
    };

    const panels = Array.from(document.querySelectorAll('[data-step-panel]'));
    const chips = Array.from(document.querySelectorAll('[data-step-chip]'));
    const providerCards = Array.from(document.querySelectorAll('.provider-card'));

    const providerInput = document.getElementById('providerInput');
    const regionInput = document.getElementById('regionInput');
    const osInput = document.getElementById('osInput');
    const planInput = document.getElementById('planInput');
    const appInput = document.getElementById('appInput');

    const providerGuidance = document.getElementById('providerGuidance');
    const regionCards = document.getElementById('regionCards');
    const osCards = document.getElementById('osCards');
    const planCards = document.getElementById('planCards');

    const planCostInfo = document.getElementById('planCostInfo');
    const planWarning = document.getElementById('planWarning');
    const compatibilityInfo = document.getElementById('compatibilityInfo');

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('createServerFormNew');

    const summaryProvider = document.getElementById('summaryProvider');
    const summaryRegion = document.getElementById('summaryRegion');
    const summaryOs = document.getElementById('summaryOs');
    const summaryPlan = document.getElementById('summaryPlan');
    const summaryApp = document.getElementById('summaryApp');
    const summaryCost = document.getElementById('summaryCost');
    const summaryCompatibility = document.getElementById('summaryCompatibility');

    function setStep(step) {
        state.step = step;
        panels.forEach((panel) => panel.classList.toggle('is-active', Number(panel.dataset.stepPanel) === step));
        chips.forEach((chip) => chip.classList.toggle('is-active', Number(chip.dataset.stepChip) === step));
    }

    function setLoadingButton(button, isLoading, loadingText) {
        if (!button) return;
        if (!button.dataset.defaultText) button.dataset.defaultText = button.innerHTML;
        button.disabled = isLoading;
        button.innerHTML = isLoading ? loadingText : button.dataset.defaultText;
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

    function renderProviderGuidance() {
        if (!state.provider) {
            providerGuidance.hidden = true;
            providerGuidance.textContent = '';
            return;
        }

        const profile = providerProfiles[state.provider];
        if (!profile) return;

        providerGuidance.hidden = false;
        providerGuidance.innerHTML = `<strong>${profile.label}:</strong> ${profile.guidance}`;
    }

    async function selectProvider(provider) {
        if (provider === 'aws') {
            alert('AWS em breve neste fluxo.');
            return;
        }

        state.provider = provider;
        providerInput.value = provider;

        providerCards.forEach((card) => {
            card.classList.toggle('is-selected', card.dataset.provider === provider);
        });

        renderProviderGuidance();

        setLoadingButton(nextBtn, true, '<i class="fas fa-spinner fa-spin"></i> Carregando...');
        try {
            const data = await authFetch('/api/cloud-options', {
                method: 'POST',
                body: JSON.stringify({ provider })
            });

            state.allPlans = Array.isArray(data.plans) ? data.plans : [];
            state.allRegions = Array.isArray(data.regions) ? data.regions : [];
            state.allOs = Array.isArray(data.os) ? data.os : [];

            state.region = '';
            state.os = '';
            state.plan = '';
            regionInput.value = '';
            osInput.value = '';
            planInput.value = '';
            state.selectedPlanMeta = null;

            renderRegions();
            renderOs();
            renderPlans();
            updateSummary();
            setStep(2);
        } catch (error) {
            alert('Erro ao carregar opcoes: ' + error.message);
        } finally {
            setLoadingButton(nextBtn, false, '');
        }
    }

    function renderRegions() {
        regionCards.innerHTML = '';

        const regions = [...state.allRegions].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        regions.forEach((region) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mini-card';
            button.innerHTML = `<strong>${region.name || region.id}</strong><br><small>${region.country || region.description || region.id}</small><br><span class="inline-select">Selecionar</span>`;
            button.addEventListener('click', function () {
                state.region = region.id;
                regionInput.value = region.id;
                regionCards.querySelectorAll('.mini-card').forEach((c) => c.classList.remove('is-selected'));
                button.classList.add('is-selected');
                state.plan = '';
                planInput.value = '';
                state.selectedPlanMeta = null;
                renderPlans();
                updateSummary();
            });
            regionCards.appendChild(button);
        });
    }

    function renderOs() {
        osCards.innerHTML = '';

        let osList = [...state.allOs];
        if (osList.length === 0) {
            osList = [
                { id: '1743', name: 'Ubuntu 22.04 x64', family: 'linux' },
                { id: '477', name: 'Debian 11 x64', family: 'linux' }
            ];
        }

        osList.forEach((os) => {
            const isDefault = String(os.name || '').toLowerCase().includes('ubuntu 22.04') || String(os.name || '').toLowerCase().includes('ubuntu 24.04');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mini-card' + (isDefault && !state.os ? ' is-selected' : '');
            button.innerHTML = `<strong>${os.name}</strong><br><small>${os.family || 'linux'}</small><br><span class="inline-select">Selecionar</span>`;

            if (isDefault && !state.os) {
                state.os = os.id;
                osInput.value = os.id;
            }

            button.addEventListener('click', function () {
                state.os = os.id;
                osInput.value = os.id;
                osCards.querySelectorAll('.mini-card').forEach((c) => c.classList.remove('is-selected'));
                button.classList.add('is-selected');
                updateSummary();
            });

            osCards.appendChild(button);
        });
    }

    function getFilteredPlans() {
        if (!state.region) return [];
        const plans = state.allPlans || [];
        const hasLocations = plans.some((p) => Array.isArray(p.locations) && p.locations.length > 0);

        if (!hasLocations) return plans;

        const normalizedRegion = String(state.region).trim().toLowerCase();
        return plans.filter((plan) => {
            if (!Array.isArray(plan.locations)) return false;
            return plan.locations.some((loc) => String(loc).trim().toLowerCase() === normalizedRegion);
        });
    }

    function planBadge(plan) {
        const app = appProfiles[state.app] || appProfiles['base-stack'];
        const provider = providerProfiles[state.provider];

        const cpu = Number(plan.cpu || 0);
        const ram = Number(plan.ram || 0);
        const disk = Number(plan.disk || 0);

        const appCompatible = cpu >= app.requirements.minCpu && ram >= app.requirements.minRamMB && disk >= app.requirements.minDiskGB;
        const providerRecommended = provider ? ram >= provider.minRamMB : false;

        if (appCompatible && providerRecommended) return { cls: 'good', label: 'Recomendado' };
        if (appCompatible) return { cls: 'warn', label: 'Aceitavel' };
        return { cls: 'bad', label: 'Nao recomendado' };
    }

    function renderPlans() {
        planCards.innerHTML = '';

        const plans = getFilteredPlans().sort((a, b) => Number(a.price ?? Number.POSITIVE_INFINITY) - Number(b.price ?? Number.POSITIVE_INFINITY));

        const compatiblePriced = plans.filter((plan) => {
            const app = appProfiles[state.app];
            const cpu = Number(plan.cpu || 0);
            const ram = Number(plan.ram || 0);
            const disk = Number(plan.disk || 0);
            const hasPrice = plan.price !== null && plan.price !== undefined && Number.isFinite(Number(plan.price));
            return hasPrice && cpu >= app.requirements.minCpu && ram >= app.requirements.minRamMB && disk >= app.requirements.minDiskGB;
        });

        const bestId = compatiblePriced.length > 0
            ? String(compatiblePriced.reduce((acc, cur) => Number(cur.price) < Number(acc.price) ? cur : acc).id)
            : null;

        if (plans.length === 0) {
            planCostInfo.textContent = state.region
                ? 'Nenhum plano encontrado nesta regiao.'
                : 'Selecione uma regiao para ver os planos e o valor minimo.';
            planWarning.hidden = true;
            planWarning.textContent = '';
            return;
        }

        const priced = plans.filter((p) => p.price !== null && p.price !== undefined && Number.isFinite(Number(p.price)));
        if (state.plan) {
            const chosen = plans.find((p) => String(p.id) === String(state.plan));
            if (chosen) {
                const priceText = chosen.price !== null && chosen.price !== undefined ? `US$ ${Number(chosen.price).toFixed(2)}/mes` : 'Preco indisponivel';
                planCostInfo.textContent = `Plano selecionado: ${priceText}. Recursos: ${chosen.cpu} vCPU, ${chosen.ram}MB RAM, ${chosen.disk}GB SSD.`;
            }
        } else if (priced.length > 0) {
            const min = priced.reduce((acc, cur) => Number(cur.price) < acc ? Number(cur.price) : acc, Number.POSITIVE_INFINITY);
            planCostInfo.innerHTML = `Valor minimo nesta regiao: <strong>US$ ${min.toFixed(2)}/mes</strong>.`;
        } else {
            planCostInfo.textContent = 'Planos encontrados sem preco publico.';
        }

        plans.forEach((plan) => {
            const hasPrice = plan.price !== null && plan.price !== undefined && Number.isFinite(Number(plan.price));
            const badge = planBadge(plan);
            const isBest = bestId && String(plan.id) === bestId;
            const isSelected = String(state.plan) === String(plan.id);

            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'plan-card' + (isSelected ? ' is-selected' : '');
            card.innerHTML = `
                <div class="plan-price">${hasPrice ? `US$ ${Number(plan.price).toFixed(2)}` : '--'}</div>
                <strong>${plan.id}</strong>
                <br>
                <small>${plan.cpu || '-'} vCPU | ${plan.ram || '-'}MB RAM | ${plan.disk || '-'}GB SSD</small>
                <br>
                <span class="plan-badge ${isBest ? 'best' : badge.cls}">${isBest ? 'Melhor custo-beneficio' : badge.label}</span>
                <br>
                <span class="inline-select">Selecionar</span>
            `;

            card.addEventListener('click', function () {
                state.plan = String(plan.id);
                planInput.value = String(plan.id);
                state.selectedPlanMeta = {
                    cpu: Number(plan.cpu || 0),
                    ram: Number(plan.ram || 0),
                    disk: Number(plan.disk || 0),
                    price: hasPrice ? Number(plan.price) : null,
                    label: String(plan.id)
                };
                renderPlans();
                evaluateCompatibility();
                updateSummary();
                if (state.region && state.os && state.plan) {
                    setStep(3);
                }
            });

            planCards.appendChild(card);
        });

        evaluateCompatibility();
    }

    function evaluateCompatibility() {
        const app = appProfiles[state.app];
        if (!state.selectedPlanMeta) {
            compatibilityInfo.hidden = false;
            compatibilityInfo.innerHTML = '<strong>Compatibilidade:</strong> selecione um plano para validar requisitos.';
            summaryCompatibility.textContent = 'Aguardando plano';
            return { ok: false, message: 'Selecione um plano.' };
        }

        const req = app.requirements;
        const ok = state.selectedPlanMeta.cpu >= req.minCpu
            && state.selectedPlanMeta.ram >= req.minRamMB
            && state.selectedPlanMeta.disk >= req.minDiskGB;

        if (!ok) {
            const msg = `Plano incompativel para ${app.label}. Minimo: ${req.minCpu} vCPU, ${req.minRamMB}MB RAM e ${req.minDiskGB}GB disco.`;
            compatibilityInfo.hidden = false;
            compatibilityInfo.innerHTML = `<strong>Plano incompativel:</strong> ${msg}`;
            summaryCompatibility.textContent = 'Incompativel';
            planWarning.hidden = false;
            planWarning.textContent = msg;
            return { ok: false, message: msg };
        }

        compatibilityInfo.hidden = false;
        compatibilityInfo.innerHTML = `<strong>Plano compativel:</strong> pronto para ${app.label}.`;
        summaryCompatibility.textContent = 'Compativel';
        planWarning.hidden = true;
        planWarning.textContent = '';
        return { ok: true, message: '' };
    }

    function updateSummary() {
        summaryProvider.textContent = state.provider ? (providerProfiles[state.provider]?.label || state.provider) : '-';

        if (state.region) {
            const region = state.allRegions.find((r) => String(r.id) === String(state.region));
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

    function canAdvance(step) {
        if (step === 1) {
            if (!state.provider) {
                alert('Selecione um provedor para continuar.');
                return false;
            }
        }

        if (step === 2) {
            if (!state.region || !state.os || !state.plan) {
                alert('Selecione regiao, sistema e plano para continuar.');
                return false;
            }
            const compatibility = evaluateCompatibility();
            if (!compatibility.ok) {
                alert(compatibility.message);
                return false;
            }
        }

        return true;
    }

    async function createServer() {
        if (!state.provider || !state.region || !state.os || !state.plan) {
            alert('Complete os campos obrigatorios.');
            return;
        }

        const compatibility = evaluateCompatibility();
        if (!compatibility.ok) {
            alert(compatibility.message);
            return;
        }

        const submitActionBtn = document.querySelector(`.app-action-btn[data-select-app="${state.app}"]`) || document.querySelector('.app-action-btn');
        setLoadingButton(submitActionBtn, true, '<i class="fas fa-spinner fa-spin"></i> Criando...');

        try {
            const payload = {
                provider: state.provider,
                region: state.region,
                plan: state.plan,
                os_id: state.os,
                app: state.app,
                name: (document.getElementById('serverName').value || '').trim() || 'Novo Servidor'
            };

            const result = await authFetch('/api/servers', {
                method: 'POST',
                body: JSON.stringify(payload)
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
            setLoadingButton(submitActionBtn, false, '');
        }
    }

    chips.forEach((chip) => {
        chip.addEventListener('click', function () {
            const target = Number(chip.dataset.stepChip);
            if (target <= state.step) {
                setStep(target);
            }
        });
    });

    document.querySelectorAll('[data-select-provider]').forEach((button) => {
        button.addEventListener('click', function () {
            selectProvider(button.dataset.selectProvider);
        });
    });

    document.querySelectorAll('.app-card').forEach((card) => {
        card.addEventListener('click', function () {
            document.querySelectorAll('.app-card').forEach((x) => x.classList.remove('is-active'));
            card.classList.add('is-active');
            state.app = card.dataset.app;
            appInput.value = state.app;
            renderPlans();
            updateSummary();
        });
    });

    document.querySelectorAll('[data-select-app]').forEach((button) => {
        button.addEventListener('click', async function (event) {
            event.stopPropagation();
            const app = button.dataset.selectApp;
            state.app = app;
            appInput.value = app;
            document.querySelectorAll('.app-card').forEach((card) => {
                card.classList.toggle('is-active', card.dataset.app === app);
            });
            renderPlans();
            updateSummary();
            await createServer();
        });
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
    });

    setStep(1);
    updateSummary();
});