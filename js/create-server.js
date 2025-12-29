document.addEventListener('DOMContentLoaded', function() {
    let currentStep = 1;
    const totalSteps = 4;

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('createServerForm');

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
        // Remove seleção dos irmãos
        const container = element.parentElement;
        container.querySelectorAll('.option-card').forEach(el => el.classList.remove('selected'));
        
        // Seleciona o atual
        element.classList.add('selected');
        
        // Atualiza input hidden
        document.getElementById(inputId + 'Input').value = value;

        // Se selecionou provedor, carrega opções
        if (inputId === 'provider') {
            await loadProviderOptions(value);
        }
    };

    async function loadProviderOptions(provider) {
        const nextBtn = document.getElementById('nextBtn');
        const originalText = nextBtn.innerHTML;
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

        try {
            const response = await fetch('/api/cloud-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erro ao carregar opções');
            }

            const data = await response.json();
            renderRegions(data.regions);
            renderPlans(data.plans);

        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao carregar opções do provedor: ' + error.message);
        } finally {
            nextBtn.disabled = false;
            nextBtn.innerHTML = originalText;
        }
    }

    function renderRegions(regions) {
        const container = document.querySelector('#step2 .options-grid');
        container.innerHTML = '';
        
        // Filtra regiões populares ou limita quantidade para não poluir
        const popularRegions = regions.slice(0, 12); 

        popularRegions.forEach(region => {
            const div = document.createElement('div');
            div.className = 'option-card';
            div.onclick = () => selectOption(div, 'region', region.id);
            div.innerHTML = `
                <i class="fas fa-globe-americas"></i>
                <h3>${region.name}</h3>
                <p style="font-size: 12px; color: #718096;">${region.country}</p>
            `;
            container.appendChild(div);
        });
    }

    function renderPlans(plans) {
        const container = document.querySelector('#step3 .options-grid');
        container.innerHTML = '';

        // Filtra planos básicos/baratos para começar
        const basicPlans = plans.filter(p => p.price <= 40).slice(0, 6);

        basicPlans.forEach(plan => {
            const div = document.createElement('div');
            div.className = 'option-card';
            div.onclick = () => selectOption(div, 'plan', plan.id);
            div.innerHTML = `
                <i class="fas fa-server"></i>
                <h3>$${plan.price}/mês</h3>
                <p style="font-size: 12px; color: #718096;">${plan.cpu} CPU • ${plan.ram}MB RAM</p>
            `;
            container.appendChild(div);
        });
    }

    function validateStep(step) {
        if (step === 1) {
            const provider = document.getElementById('providerInput').value;
            if (!provider) {
                alert('Por favor, selecione um provedor.');
                return false;
            }
        }
        // Adicionar validações para outros passos conforme necessário
        return true;
    }

    // Envio do Formulário
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando Servidor...';

        const formData = {
            provider: document.getElementById('providerInput').value,
            region: document.getElementById('regionInput').value || 'nyc1',
            plan: document.getElementById('planInput').value || 'basic-1gb',
            app: 'base-stack', // Sempre instala a base stack
            name: document.getElementById('serverName').value || 'Novo Servidor'
        };

        try {
            const response = await fetch('/api/servers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                alert('Servidor criado com sucesso! A instalação pode levar alguns minutos.');
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

    // Busca dinâmica de regiões e planos
    let cloudOptions = { regions: [], plans: [] };
    document.getElementById('providerOptions').addEventListener('click', async function(e) {
        const card = e.target.closest('.option-card');
        if (!card) return;
        const provider = card.querySelector('h3').textContent.toLowerCase();
        if (!provider) return;
        // Busca opções reais
        try {
            const res = await fetch('/api/cloud-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider })
            });
            const data = await res.json();
            if (data.regions && data.plans) {
                cloudOptions = data;
                renderRegions(data.regions);
                renderPlans(data.plans);
            }
        } catch (err) {
            console.error('Erro ao buscar opções da cloud:', err);
        }
    });

    function renderRegions(regions) {
        const regionGrid = document.querySelector('#step2 .options-grid');
        regionGrid.innerHTML = '';
        regions.forEach(region => {
            const div = document.createElement('div');
            div.className = 'option-card';
            div.onclick = function() { selectOption(this, 'region', region.id); };
            div.innerHTML = `<i class="fas fa-map-marker-alt"></i><h3>${region.name}</h3><small>${region.description || ''}</small>`;
            regionGrid.appendChild(div);
        });
    }

    function renderPlans(plans) {
        const planGrid = document.querySelector('#step3 .options-grid');
        planGrid.innerHTML = '';
        plans.forEach(plan => {
            const div = document.createElement('div');
            div.className = 'option-card';
            div.onclick = function() { selectOption(this, 'plan', plan.id); };
            div.innerHTML = `
                <i class="fas fa-microchip"></i>
                <h3>${plan.description}</h3>
                <p>${plan.cpu} vCPU / ${plan.ram} MB / ${plan.disk} GB</p>
                <small>${plan.price ? 'US$ ' + plan.price + '/mês' : ''}</small>
            `;
            planGrid.appendChild(div);
        });
    }
});
