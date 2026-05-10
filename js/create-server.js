document.addEventListener('DOMContentLoaded', function() {
    let currentStep = 1;
    const totalSteps = 5;

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('createServerForm');
    
    let allPlans = []; // Armazena todos os planos carregados
    let visiblePlans = []; // Planos após filtro da região selecionada
    let selectedPlanMeta = null;

    const providerProfiles = {
        vultr: {
            label: 'Vultr',
            guidance: 'Ideal para deploy rápido com boa previsibilidade de custo. Para produção, prefira planos com pelo menos 2 GB de RAM.',
            minRamMB: 2048
        },
        digitalocean: {
            label: 'DigitalOcean',
            guidance: 'Ótimo equilíbrio entre simplicidade e performance. Prefira regiões próximas do público e planos com 2 GB de RAM ou mais para projetos ativos.',
            minRamMB: 2048
        },
        linode: {
            label: 'Linode',
            guidance: 'Boa opção para workloads Linux com custo competitivo. Em produção, recomendamos começar com no mínimo 2 GB de RAM.',
            minRamMB: 2048
        },
        aws: {
            label: 'AWS',
            guidance: 'Integração AWS em preparação. Em breve você poderá escolher EC2 com recomendações de custo por workload.',
            minRamMB: 2048
        }
    };

    const appProfiles = {
        'base-stack': {
            label: 'Stack CloudEase',
            requirements: { minCpu: 1, minRamMB: 1024, minDiskGB: 20 },
            message: 'Requer no minimo 1 vCPU, 1 GB de RAM e 20 GB de disco.'
        },
        'n8n-stack': {
            label: 'n8n 1-Clique',
            requirements: { minCpu: 1, minRamMB: 2048, minDiskGB: 25 },
            message: 'Requer no minimo 1 vCPU, 2 GB de RAM e 25 GB de disco para operar com estabilidade.'
        }
    };

    // Navegação do Wizard
    function updateWizard() {
        // Esconde todos os passos
        document.querySelectorAll('.wizard-step').forEach(el => el.style.display = 'none');
        // Mostra o atual
        document.getElementById(`step${currentStep}`).style.display = 'block';

        // Atualiza indicadores
        document.querySelectorAll('.step').forEach(el => {
            const stepNum = parseInt(el.dataset.step);
            if (stepNum <= currentStep) el.classList.add('active');
            else el.classList.remove('active');
        });

        // Botões
        prevBtn.style.display = currentStep === 1 ? 'none' : 'block';
        
        if (currentStep === totalSteps) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'block';
        } else {
            nextBtn.style.display = 'block';
            submitBtn.style.display = 'none';
        }
    }

    nextBtn.addEventListener('click', () => {
        if (validateStep(currentStep)) {
            currentStep++;
            updateWizard();
        }
    });

    prevBtn.addEventListener('click', () => {
        currentStep--;
        updateWizard();
    });

    // Seleção de Opções (Cards)
    window.selectOption = async function(element, inputId, value) {
        if (element.dataset.disabled === '1') {
            alert('Integração AWS em breve. Estamos finalizando validações para evitar configurações incorretas e custos inesperados.');
            return;
        }

        // Remove seleção dos irmãos
        const container = element.parentElement;
        container.querySelectorAll('.option-card').forEach(el => el.classList.remove('selected'));
        
        // Seleciona o atual
        element.classList.add('selected');
        
        // Atualiza input hidden
        document.getElementById(inputId + 'Input').value = value;

        // Se selecionou provedor, carrega opções
        if (inputId === 'provider') {
            renderProviderGuidance(value);
            await loadProviderOptions(value);
        }
    };

    function renderProviderGuidance(provider) {
        const panel = document.getElementById('providerGuidance');
        if (!panel) return;

        const profile = providerProfiles[provider];
        if (!profile) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            return;
        }

        panel.innerHTML = `<strong>${profile.label}:</strong> ${profile.guidance}`;
        panel.style.display = 'block';
    }

    async function loadProviderOptions(provider) {
        const nextBtn = document.getElementById('nextBtn');
        const originalText = nextBtn.innerHTML;
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/cloud-options', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ provider })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erro ao carregar opções');
            }

            const data = await response.json();
            allPlans = data.plans || []; // Salva os planos globalmente
            renderRegions(data.regions);
            renderOS(data.os);
            updatePlansList(); // Renderiza planos filtrados pela região atual (se houver)

        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao carregar opções do provedor: ' + error.message);
        } finally {
            nextBtn.disabled = false;
            nextBtn.innerHTML = originalText;
        }
    }

    function renderRegions(regions) {
        const select = document.getElementById('regionInput');
        const cards = document.getElementById('regionCards');
        if (!select) {
            console.error('Elemento regionInput não encontrado no DOM');
            return;
        }
        select.innerHTML = '<option value="">Selecione uma região...</option>';
        if (cards) cards.innerHTML = '';
        
        // Ordena por nome
        regions.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        regions.forEach(region => {
            const option = document.createElement('option');
            option.value = region.id;
            const regionLabel = region.country ? `${region.name} (${region.country})` : (region.description || region.name);
            option.textContent = regionLabel;
            select.appendChild(option);

            if (cards) {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'region-card';
                card.dataset.value = region.id;
                card.innerHTML = `
                    <div class="card-head">
                        <span class="card-icon"><i class="fas fa-location-dot"></i></span>
                        <span class="card-badge badge-info">Datacenter</span>
                    </div>
                    <div class="card-title">${region.name || region.id}</div>
                    <div class="card-subtitle">${region.country || region.description || region.id}</div>
                `;
                card.addEventListener('click', function () {
                    cards.querySelectorAll('.region-card').forEach(el => el.classList.remove('selected'));
                    card.classList.add('selected');
                    select.value = region.id;
                    if (typeof select.onchange === 'function') select.onchange();
                });
                cards.appendChild(card);
            }
        });
        
        // Atualiza filtros/summary ao trocar região
        select.onchange = function() {
            updatePlansList();
            updateSummary();
        };
    }

    function renderOS(osList) {
        const select = document.getElementById('osInput');
        const cards = document.getElementById('osCards');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione um sistema...</option>';
        if (cards) cards.innerHTML = '';
        
        if (!osList || osList.length === 0) {
            // Fallback se não vier nada
            const defaultOS = [
                { id: '1743', name: 'Ubuntu 22.04 x64' },
                { id: '477', name: 'Debian 11 x64' }
            ];
            osList = defaultOS;
        }

        osList.forEach(os => {
            const option = document.createElement('option');
            option.value = os.id;
            option.textContent = os.name;
            const osName = String(os.name || '').toLowerCase();
            const isDefault = osName.includes('ubuntu 22.04') || osName.includes('ubuntu 24.04');
            if (isDefault) option.selected = true;
            select.appendChild(option);

            if (cards) {
                const osLabel = String(os.name || '').toLowerCase();
                const osIcon = osLabel.includes('ubuntu') ? 'fa-ubuntu' : (osLabel.includes('debian') ? 'fa-linux' : 'fa-server');
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'os-card' + (isDefault ? ' selected' : '');
                card.dataset.value = os.id;
                card.innerHTML = `
                    <div class="card-head">
                        <span class="card-icon"><i class="fab ${osIcon}"></i></span>
                        ${isDefault ? '<span class="card-badge badge-good">Recomendado</span>' : '<span class="card-badge badge-info">Disponível</span>'}
                    </div>
                    <div class="card-title">${os.name}</div>
                    <div class="card-subtitle">${os.family || 'Linux'}</div>
                `;
                card.addEventListener('click', function () {
                    cards.querySelectorAll('.os-card').forEach(el => el.classList.remove('selected'));
                    card.classList.add('selected');
                    select.value = os.id;
                    if (typeof select.onchange === 'function') select.onchange();
                });
                cards.appendChild(card);
            }
        });

        select.onchange = updateSummary;
    }

    function updatePlansList() {
        const regionSelect = document.getElementById('regionInput');
        const selectedRegion = regionSelect ? regionSelect.value : '';
        
        let filteredPlans = allPlans;

        // Se houver região selecionada, filtra os planos
        if (selectedRegion && allPlans.length > 0) {
            // Verifica se os planos têm a propriedade 'locations' (Vultr tem)
            // Se não tiver locations, assume que está disponível em todas (ou não filtra)
            const hasLocations = allPlans.some(p => p.locations && Array.isArray(p.locations) && p.locations.length > 0);
            
            if (hasLocations) {
                const normalizedRegion = String(selectedRegion).trim().toLowerCase();
                filteredPlans = allPlans.filter(plan => {
                    if (!plan.locations || !Array.isArray(plan.locations)) return false;
                    return plan.locations.some((loc) => String(loc).trim().toLowerCase() === normalizedRegion);
                });
            }
        }

        visiblePlans = Array.isArray(filteredPlans) ? [...filteredPlans] : [];

        renderPlans(filteredPlans);
        updateSummary();
    }

    function renderPlans(plans) {
        const select = document.getElementById('planInput');
        const cards = document.getElementById('planCards');
        if (!select) {
            console.error('Elemento planInput não encontrado no DOM');
            return;
        }
        select.innerHTML = '<option value="">Selecione um plano...</option>';
        if (cards) cards.innerHTML = '';

        // Ordena por preço quando disponível
        plans.sort((a, b) => {
            const ap = Number(a.price ?? Number.POSITIVE_INFINITY);
            const bp = Number(b.price ?? Number.POSITIVE_INFINITY);
            return ap - bp;
        });

        const profile = getSelectedProviderProfile();
        const appProfile = getSelectedAppProfile();

        const compatiblePricedPlans = plans.filter((plan) => {
            const cpu = Number(plan.cpu || 0);
            const ram = Number(plan.ram || 0);
            const disk = Number(plan.disk || 0);
            const hasPrice = plan.price !== null && plan.price !== undefined && Number.isFinite(Number(plan.price));
            const req = appProfile.requirements;
            return hasPrice && cpu >= req.minCpu && ram >= req.minRamMB && disk >= req.minDiskGB;
        });

        let bestPlanId = null;
        if (compatiblePricedPlans.length > 0) {
            const best = compatiblePricedPlans.reduce((acc, item) => {
                return Number(item.price) < Number(acc.price) ? item : acc;
            });
            bestPlanId = String(best.id);
        }

        plans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan.id;
            const hasPrice = plan.price !== null && plan.price !== undefined && !Number.isNaN(Number(plan.price));
            const priceLabel = hasPrice ? `US$ ${Number(plan.price).toFixed(2)}/mês` : 'Preço indisponível';
            option.textContent = `${priceLabel} - ${plan.cpu} vCPU, ${plan.ram}MB RAM, ${plan.disk}GB SSD`;
            option.dataset.cpu = plan.cpu || '';
            option.dataset.ram = plan.ram || '';
            option.dataset.disk = plan.disk || '';
            option.dataset.price = hasPrice ? Number(plan.price).toFixed(2) : '';
            select.appendChild(option);

            if (cards) {
                const cpu = Number(plan.cpu || 0);
                const ram = Number(plan.ram || 0);
                const disk = Number(plan.disk || 0);
                const req = appProfile.requirements;
                const appCompatible = cpu >= req.minCpu && ram >= req.minRamMB && disk >= req.minDiskGB;
                const providerRecommended = !!(profile && ram >= profile.minRamMB);

                let badgeClass = 'badge-bad';
                let badgeLabel = 'Não recomendado';
                if (appCompatible && providerRecommended) {
                    badgeClass = 'badge-good';
                    badgeLabel = 'Recomendado';
                } else if (appCompatible) {
                    badgeClass = 'badge-warn';
                    badgeLabel = 'Aceitável';
                }

                const isBestValue = bestPlanId && String(plan.id) === bestPlanId;
                if (isBestValue) {
                    badgeClass = 'badge-best';
                    badgeLabel = 'Melhor custo-benefício';
                }

                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'plan-card' + (isBestValue ? ' best-value' : '');
                card.dataset.value = plan.id;
                card.innerHTML = `
                    <div class="card-head">
                        <span class="card-icon"><i class="fas fa-microchip"></i></span>
                        <span class="card-badge ${badgeClass}">${badgeLabel}</span>
                    </div>
                    <div class="card-price">${hasPrice ? `US$ ${Number(plan.price).toFixed(2)}` : '--'}</div>
                    <div class="card-title">${plan.id}</div>
                    <div class="card-meta">${plan.cpu || '-'} vCPU • ${plan.ram || '-'}MB RAM • ${plan.disk || '-'}GB SSD</div>
                `;
                card.addEventListener('click', function () {
                    cards.querySelectorAll('.plan-card').forEach(el => el.classList.remove('selected'));
                    card.classList.add('selected');
                    select.value = plan.id;
                    if (typeof select.onchange === 'function') select.onchange();
                });
                cards.appendChild(card);
            }
        });

        select.onchange = function() {
            updatePlanInsights();
            updateSummary();
        };
        selectedPlanMeta = null;
        updatePlanInsights();
    }

    function getSelectedProviderProfile() {
        const provider = document.getElementById('providerInput').value;
        return providerProfiles[provider] || null;
    }

    function getSelectedAppProfile() {
        const app = document.getElementById('appInput')?.value || 'base-stack';
        return appProfiles[app] || appProfiles['base-stack'];
    }

    function evaluateCompatibility() {
        const appProfile = getSelectedAppProfile();
        const infoEl = document.getElementById('compatibilityInfo');
        const summaryEl = document.getElementById('summaryCompatibility');

        if (!selectedPlanMeta || !selectedPlanMeta.cpu || !selectedPlanMeta.ram || !selectedPlanMeta.disk) {
            if (infoEl) {
                infoEl.style.display = 'block';
                infoEl.style.background = '#f8fbff';
                infoEl.style.borderColor = '#dbeafe';
                infoEl.style.color = '#1e3a8a';
                infoEl.innerHTML = '<strong>Compatibilidade:</strong> selecione um plano para validar os requisitos da instalação.';
            }
            if (summaryEl) summaryEl.textContent = 'Aguardando seleção de plano';
            return { compatible: false, reason: 'Plano não selecionado' };
        }

        const req = appProfile.requirements;
        const missing = [];

        if (selectedPlanMeta.cpu < req.minCpu) missing.push(`${req.minCpu} vCPU`);
        if (selectedPlanMeta.ram < req.minRamMB) missing.push(`${req.minRamMB}MB RAM`);
        if (selectedPlanMeta.disk < req.minDiskGB) missing.push(`${req.minDiskGB}GB disco`);

        if (missing.length > 0) {
            const message = `Incompatível para ${appProfile.label}. Necessário: ${appProfile.message}`;
            if (infoEl) {
                infoEl.style.display = 'block';
                infoEl.style.background = '#fff7ed';
                infoEl.style.borderColor = '#fdba74';
                infoEl.style.color = '#9a3412';
                infoEl.innerHTML = `<strong>Plano incompatível:</strong> este servidor não atende aos requisitos de ${appProfile.label}.`;
            }
            if (summaryEl) summaryEl.textContent = 'Incompatível';
            return { compatible: false, reason: message };
        }

        if (infoEl) {
            infoEl.style.display = 'block';
            infoEl.style.background = '#f0fdf4';
            infoEl.style.borderColor = '#86efac';
            infoEl.style.color = '#166534';
            infoEl.innerHTML = `<strong>Compatível:</strong> o plano atende aos requisitos de ${appProfile.label}.`;
        }
        if (summaryEl) summaryEl.textContent = 'Compatível';
        return { compatible: true, reason: '' };
    }

    function updatePlanInsights() {
        const planSelect = document.getElementById('planInput');
        const costEl = document.getElementById('planCostInfo');
        const warningEl = document.getElementById('planWarning');
        if (!planSelect || !costEl || !warningEl) return;

        const selected = planSelect.options[planSelect.selectedIndex];
        if (!selected || !selected.value) {
            selectedPlanMeta = null;
            const priced = (visiblePlans || []).filter((p) => p.price !== null && p.price !== undefined && Number.isFinite(Number(p.price)));
            if (priced.length > 0) {
                const min = priced.reduce((acc, item) => {
                    const value = Number(item.price);
                    return value < acc ? value : acc;
                }, Number.POSITIVE_INFINITY);
                costEl.innerHTML = `Valor mínimo nesta região: <strong>US$ ${min.toFixed(2)}/mês</strong>. Selecione um plano para ver recomendação detalhada.`;
            } else {
                costEl.textContent = 'Selecione um plano para ver estimativa de custo e recomendação.';
            }
            warningEl.style.display = 'none';
            warningEl.textContent = '';
            return;
        }

        const cpu = Number(selected.dataset.cpu || 0);
        const ram = Number(selected.dataset.ram || 0);
        const disk = Number(selected.dataset.disk || 0);
        const price = selected.dataset.price ? Number(selected.dataset.price) : null;
        const profile = getSelectedProviderProfile();
        const appProfile = getSelectedAppProfile();

        selectedPlanMeta = { cpu, ram, disk, price };

        const priceText = price !== null ? `US$ ${price.toFixed(2)}/mês` : 'Preço não informado pelo provedor';
        const req = appProfile.requirements;
        const appCompatible = cpu >= req.minCpu && ram >= req.minRamMB && disk >= req.minDiskGB;
        const providerRecommended = !!(profile && ram >= profile.minRamMB);

        let healthClass = 'health-bad';
        let healthLabel = 'Não recomendado';

        if (appCompatible && providerRecommended) {
            healthClass = 'health-good';
            healthLabel = 'Recomendado';
        } else if (appCompatible) {
            healthClass = 'health-warn';
            healthLabel = 'Aceitável';
        }

        costEl.innerHTML =
            `Estimativa: ${priceText}. Recursos: ${cpu} vCPU, ${ram}MB RAM, ${disk}GB SSD.` +
            `<br><span class="health-chip ${healthClass}"><span class="dot"></span>${healthLabel}</span>`;

        if (!appCompatible) {
            warningEl.style.display = 'block';
            warningEl.textContent = `Incompatível com ${appProfile.label}. Requisitos mínimos: ${req.minCpu} vCPU, ${req.minRamMB}MB RAM e ${req.minDiskGB}GB disco.`;
        } else if (profile && ram > 0 && ram < profile.minRamMB) {
            warningEl.style.display = 'block';
            warningEl.textContent = `Atenção: este plano tem ${ram}MB de RAM. Recomendamos pelo menos ${profile.minRamMB}MB para evitar lentidão e risco de indisponibilidade em produção.`;
        } else {
            warningEl.style.display = 'none';
            warningEl.textContent = '';
        }
    }

    function updateSummary() {
        const providerEl = document.getElementById('summaryProvider');
        const regionEl = document.getElementById('summaryRegion');
        const osEl = document.getElementById('summaryOs');
        const planEl = document.getElementById('summaryPlan');
        const appEl = document.getElementById('summaryApp');
        const costEl = document.getElementById('summaryCost');
        if (!providerEl || !regionEl || !osEl || !planEl || !costEl) return;

        const provider = document.getElementById('providerInput').value;
        const regionSelect = document.getElementById('regionInput');
        const osSelect = document.getElementById('osInput');
        const planSelect = document.getElementById('planInput');
        const app = document.getElementById('appInput').value;

        const profile = providerProfiles[provider];
        providerEl.textContent = profile ? profile.label : '-';

        const regionText = regionSelect && regionSelect.selectedIndex > 0 ? regionSelect.options[regionSelect.selectedIndex].text : '-';
        regionEl.textContent = regionText;

        const osText = osSelect && osSelect.selectedIndex > 0 ? osSelect.options[osSelect.selectedIndex].text : '-';
        osEl.textContent = osText;

        const planText = planSelect && planSelect.selectedIndex > 0 ? planSelect.options[planSelect.selectedIndex].text : '-';
        planEl.textContent = planText;

        if (appEl) {
            appEl.textContent = app === 'n8n-stack' ? 'n8n 1-Clique' : 'Stack CloudEase';
        }

        costEl.textContent = selectedPlanMeta && selectedPlanMeta.price !== null
            ? `US$ ${selectedPlanMeta.price.toFixed(2)}/mês`
            : '-';

        evaluateCompatibility();
    }

    function validateStep(step) {
        if (step === 1) {
            const provider = document.getElementById('providerInput').value;
            if (!provider) {
                alert('Por favor, selecione um provedor.');
                return false;
            }
        }
        if (step === 2) {
            const region = document.getElementById('regionInput').value;
            if (!region) {
                alert('Por favor, selecione uma região.');
                return false;
            }
        }
        if (step === 3) {
            const os = document.getElementById('osInput').value;
            if (!os) {
                alert('Por favor, selecione um sistema operacional.');
                return false;
            }
        }
        if (step === 4) {
            const plan = document.getElementById('planInput').value;
            if (!plan) {
                alert('Por favor, selecione um plano.');
                return false;
            }

            updatePlanInsights();

            const profile = getSelectedProviderProfile();
            if (profile && selectedPlanMeta && selectedPlanMeta.ram > 0 && selectedPlanMeta.ram < profile.minRamMB) {
                const proceed = confirm(`Este plano está abaixo do recomendado para produção (${selectedPlanMeta.ram}MB RAM). Deseja continuar mesmo assim?`);
                if (!proceed) return false;
            }
        }

        if (step === 5) {
            const compatibility = evaluateCompatibility();
            if (!compatibility.compatible) {
                alert('Não é possível criar este servidor para o perfil escolhido. ' + compatibility.reason);
                return false;
            }
        }
        return true;
    }

    // Envio do Formulário
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const compatibility = evaluateCompatibility();
        if (!compatibility.compatible) {
            alert('Configuração incompatível: ' + compatibility.reason);
            return;
        }
        
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando Servidor...';

        const formData = {
            provider: document.getElementById('providerInput').value,
            region: document.getElementById('regionInput').value,
            plan: document.getElementById('planInput').value,
            os_id: document.getElementById('osInput').value,
            app: document.getElementById('appInput').value || 'base-stack',
            name: document.getElementById('serverName').value || 'Novo Servidor'
        };

        if (!formData.provider || !formData.region || !formData.plan || !formData.os_id) {
            alert('Preencha provedor, região, sistema e plano antes de criar o servidor.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }

        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/servers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                if (data && data.access && data.access.service === 'n8n') {
                    alert(
                        'Servidor n8n criado!\n\n' +
                        'Usuario: ' + data.access.user + '\n' +
                        'Senha: ' + data.access.password + '\n\n' +
                        'Acesse em: http://IP_DO_SERVIDOR:5678\n' +
                        'Obs: aguarde alguns minutos para finalizacao da instalacao.'
                    );
                } else {
                    alert('Servidor criado com sucesso! A instalação pode levar alguns minutos.');
                }
                window.location.href = 'servers.html';
            } else {
                alert('Erro: ' + (data.error || 'Falha ao criar servidor'));
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro de conexão.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });

    // Estado inicial de apoio visual
    updateSummary();


});
