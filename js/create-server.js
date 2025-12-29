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
        const select = document.getElementById('regionInput');
        if (!select) {
            console.error('Elemento regionInput não encontrado no DOM');
            return;
        }
        select.innerHTML = '<option value="">Selecione uma região...</option>';
        
        // Ordena por nome
        regions.sort((a, b) => a.name.localeCompare(b.name));

        regions.forEach(region => {
            const option = document.createElement('option');
            option.value = region.id;
            option.textContent = `${region.name} (${region.country})`;
            select.appendChild(option);
        });
    }

    function renderPlans(plans) {
        const select = document.getElementById('planInput');
        if (!select) {
            console.error('Elemento planInput não encontrado no DOM');
            return;
        }
        select.innerHTML = '<option value="">Selecione um plano...</option>';

        // Ordena por preço
        plans.sort((a, b) => a.price - b.price);

        plans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = `$${plan.price}/mês - ${plan.cpu} CPU, ${plan.ram}MB RAM`;
            select.appendChild(option);
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
        if (step === 2) {
            const region = document.getElementById('regionInput').value;
            if (!region) {
                alert('Por favor, selecione uma região.');
                return false;
            }
        }
        if (step === 3) {
            const plan = document.getElementById('planInput').value;
            if (!plan) {
                alert('Por favor, selecione um plano.');
                return false;
            }
        }
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


});
