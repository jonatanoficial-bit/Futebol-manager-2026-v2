/*
 * Vale Futebol Manager 2026
 *
 * Este arquivo contém toda a lógica de front‑end do jogo.
 * É um jogo puramente em JavaScript que utiliza LocalStorage
 * para salvar o progresso e arquivos JSON estáticos para dados
 * de clubes, jogadores e competições. O objetivo é fornecer um
 * MVP funcional de um jogo de gerenciamento de futebol, com
 * possibilidade de expansão futura através do painel Admin.
 */

(() => {
  // Estado global do jogo
  const state = {
    screen: 'home', // tela atual
    saves: [], // array de saves carregados do localStorage
    currentSlot: null, // índice do slot selecionado
    currentSave: null, // save carregado na memória ao iniciar carreira
    dataPackage: '2025/2026', // pacote de dados (por ora fixo)
    selectedClubId: null // clube escolhido ao criar carreira
  };

  // Banco de dados carregado dos arquivos JSON
  const DATA = {
    clubs: [],
    players: [],
    competitions: [],
    seasons: [],
    rules: {}
  };

  // Função de utilitário para criar elementos DOM com classes
  function el(tag, className, innerHTML) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (innerHTML !== undefined) element.innerHTML = innerHTML;
    return element;
  }

  // Carregar dados JSON do diretório data
  async function loadData() {
    const files = ['clubs', 'players', 'competitions', 'seasons', 'rules'];
    for (const f of files) {
      try {
        const res = await fetch(`data/${f}.json`);
        if (!res.ok) throw new Error(`Erro ao carregar ${f}.json`);
        const json = await res.json();
        // alguns arquivos usam plural no campo raiz, outros singular
        DATA[f] = json[f] || json[`${f}`] || json;
      } catch (err) {
        console.error(err);
      }
    }
    // Carregar clubes personalizados do localStorage (Admin)
    const customClubs = JSON.parse(localStorage.getItem('vfm_custom_clubs') || '[]');
    if (Array.isArray(customClubs) && customClubs.length) {
      DATA.clubs = DATA.clubs.concat(customClubs);
    }

    // Caso algum arquivo não tenha sido carregado (por exemplo, em acesso via file://), gerar dados de fallback.
    if (!DATA.clubs || DATA.clubs.length === 0) {
      console.warn('Dados JSON não puderam ser carregados, usando fallback embutido.');
      const fallback = buildFallbackData();
      DATA.clubs = fallback.clubs;
      DATA.players = fallback.players;
      DATA.competitions = fallback.competitions;
      DATA.seasons = fallback.seasons;
      DATA.rules = fallback.rules;
    }
  }

  // Carregar saves do localStorage
  function loadSaves() {
    try {
      const saved = JSON.parse(localStorage.getItem('vfm2026_saves') || '[]');
      state.saves = Array.isArray(saved) ? saved : [];
    } catch (e) {
      console.error('Erro ao carregar saves:', e);
      state.saves = [];
    }
  }

  // Salvar array de saves no localStorage
  function persistSaves() {
    localStorage.setItem('vfm2026_saves', JSON.stringify(state.saves));
  }

  // Função de navegação entre telas
  function navigate(screen) {
    state.screen = screen;
    render();
  }

  // Função principal de renderização, redireciona para a tela atual
  function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    switch (state.screen) {
      case 'home':
        renderHome(app);
        break;
      case 'slotSelect':
        renderSlotSelect(app);
        break;
      case 'careerForm':
        renderCareerForm(app);
        break;
      case 'clubSelect':
        renderClubSelect(app);
        break;
      case 'tutorial':
        renderTutorial(app);
        break;
      case 'hub':
        renderHub(app);
        break;
      case 'squad':
        renderSquad(app);
        break;
      case 'tactics':
        renderTactics(app);
        break;
      case 'training':
        renderTraining(app);
        break;
      case 'matches':
        renderMatches(app);
        break;
      case 'competitions':
        renderCompetitions(app);
        break;
      case 'transfers':
        renderTransfers(app);
        break;
      case 'finances':
        renderFinances(app);
        break;
      case 'admin':
        renderAdmin(app);
        break;
      case 'admin-clubs':
        renderAdminClubs(app);
        break;
      default:
        // fallback
        renderHome(app);
    }
  }

  // ===== Renderização das telas =====
  function renderHome(container) {
    const screen = el('div', 'screen');
    const logo = el('img');
    logo.src = 'assets/logos/1.png';
    logo.alt = 'Logo';
    logo.style.width = '80px';
    logo.style.display = 'block';
    logo.style.margin = '0 auto 10px';
    screen.appendChild(logo);
    screen.appendChild(el('h1', '', 'Vale Futebol Manager 2026'));
    const btnStart = el('button', '', 'Iniciar Carreira');
    btnStart.addEventListener('click', () => navigate('slotSelect'));
    const btnAdmin = el('button', '', 'Admin');
    btnAdmin.addEventListener('click', () => navigate('admin'));
    screen.appendChild(btnStart);
    screen.appendChild(btnAdmin);
    container.appendChild(screen);
  }

  function renderSlotSelect(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Selecione um slot de salvamento'));
    state.saves.forEach((save, idx) => {
      const slotDiv = el('div', 'save-slot');
      const title = `Slot ${idx + 1}`;
      slotDiv.appendChild(el('h3', '', title));
      if (save && save.career) {
        slotDiv.appendChild(el('p', '', `Treinador: ${save.career.name}`));
        slotDiv.appendChild(el('p', '', `Clube: ${save.career.clubName}`));
        const btnContinue = el('button', '', 'Continuar');
        btnContinue.addEventListener('click', () => {
          state.currentSlot = idx;
          state.currentSave = JSON.parse(JSON.stringify(save));
          navigate('hub');
        });
        slotDiv.appendChild(btnContinue);
      } else {
        const btnNew = el('button', '', 'Novo Jogo');
        btnNew.addEventListener('click', () => {
          state.currentSlot = idx;
          // inicializa objeto de save vazio
          state.currentSave = null;
          navigate('careerForm');
        });
        slotDiv.appendChild(btnNew);
      }
      screen.appendChild(slotDiv);
    });
    // Caso haja menos de 2 slots, preencher o resto
    for (let i = state.saves.length; i < 2; i++) {
      const slotDiv = el('div', 'save-slot');
      slotDiv.appendChild(el('h3', '', `Slot ${i + 1}`));
      const btnNew = el('button', '', 'Novo Jogo');
      btnNew.addEventListener('click', () => {
        state.currentSlot = i;
        state.currentSave = null;
        navigate('careerForm');
      });
      slotDiv.appendChild(btnNew);
      screen.appendChild(slotDiv);
    }
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('home'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderCareerForm(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Criar Carreira'));
    const form = el('div');
    // nome
    const nameGroup = el('div', 'form-group');
    nameGroup.appendChild(el('label', '', 'Nome do Treinador'));
    const inputName = el('input');
    inputName.type = 'text';
    inputName.placeholder = 'Seu nome';
    nameGroup.appendChild(inputName);
    form.appendChild(nameGroup);
    // nacionalidade
    const natGroup = el('div', 'form-group');
    natGroup.appendChild(el('label', '', 'Nacionalidade'));
    const inputNat = el('input');
    inputNat.type = 'text';
    inputNat.placeholder = 'Ex.: Brasil';
    natGroup.appendChild(inputNat);
    form.appendChild(natGroup);
    // avatar (placeholder: campo de texto de URL ou arquivo)
    const avatarGroup = el('div', 'form-group');
    avatarGroup.appendChild(el('label', '', 'Avatar (URL opcional)'));
    const inputAvatar = el('input');
    inputAvatar.type = 'text';
    inputAvatar.placeholder = 'Deixe em branco para padrão';
    avatarGroup.appendChild(inputAvatar);
    form.appendChild(avatarGroup);
    screen.appendChild(form);
    const btnNext = el('button', '', 'Próximo: Escolher Clube');
    btnNext.addEventListener('click', () => {
      if (!inputName.value.trim()) {
        alert('Digite um nome para o treinador.');
        return;
      }
      state.currentSave = {
        career: {
          name: inputName.value.trim(),
          nationality: inputNat.value.trim() || 'Desconhecido',
          avatar: inputAvatar.value.trim() || '',
          season: state.dataPackage,
          clubId: null,
          clubName: null,
          formation: '4-4-2',
          trainingIntensity: 0.5,
          finances: { balance: 1000000 }
        },
        competitions: {},
        timestamp: Date.now()
      };
      navigate('clubSelect');
    });
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('slotSelect'));
    screen.appendChild(btnNext);
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderClubSelect(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Escolher Clube'));
    const searchInput = el('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Buscar clube...';
    searchInput.style.marginBottom = '10px';
    screen.appendChild(searchInput);
    const listDiv = el('div', 'list');
    // função auxiliar para listar clubes de acordo com filtro
    function populateList(filter = '') {
      listDiv.innerHTML = '';
      const clubs = DATA.clubs.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
      clubs.forEach(c => {
        const card = el('div', 'club-card');
        card.dataset.id = c.id;
        if (state.selectedClubId === c.id) card.classList.add('selected');
        const img = el('img');
        img.src = `assets/logos/${c.logo}`;
        img.alt = c.name;
        card.appendChild(img);
        card.appendChild(el('span', '', c.name));
        card.addEventListener('click', () => {
          state.selectedClubId = c.id;
          populateList(searchInput.value);
        });
        listDiv.appendChild(card);
      });
    }
    populateList('');
    searchInput.addEventListener('input', () => populateList(searchInput.value));
    screen.appendChild(listDiv);
    const btnConfirm = el('button', '', 'Confirmar');
    btnConfirm.addEventListener('click', () => {
      if (!state.selectedClubId) {
        alert('Selecione um clube.');
        return;
      }
      const club = DATA.clubs.find(c => c.id === state.selectedClubId);
      state.currentSave.career.clubId = club.id;
      state.currentSave.career.clubName = club.name;
      // iniciar competições e calendário
      initCompetitionsForSave();
      // armazenar no array de saves e persistir
      state.saves[state.currentSlot] = JSON.parse(JSON.stringify(state.currentSave));
      persistSaves();
      navigate('tutorial');
    });
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => {
      state.selectedClubId = null;
      navigate('careerForm');
    });
    screen.appendChild(btnConfirm);
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderTutorial(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Bem‑vindo ao Vale Futebol Manager 2026!'));
    screen.appendChild(el('p', '', 'Você é o treinador do clube escolhido. Gerencie seu elenco, defina a tática, realize treinos, participe de competições e leve seu time à glória!'));
    const btnGoHub = el('button', '', 'Ir para o Hub');
    btnGoHub.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnGoHub);
    container.appendChild(screen);
  }

  function renderHub(container) {
    const screen = el('div', 'screen');
    const title = el('h2', '', `Hub do Treinador – ${state.currentSave.career.clubName}`);
    screen.appendChild(title);
    const info = el('p', '', `Treinador: ${state.currentSave.career.name} | Nacionalidade: ${state.currentSave.career.nationality}`);
    screen.appendChild(info);
    const nav = el('div', 'navbar');
    const buttons = [
      { id: 'squad', label: 'Elenco' },
      { id: 'tactics', label: 'Tática' },
      { id: 'training', label: 'Treinos' },
      { id: 'matches', label: 'Jogos' },
      { id: 'competitions', label: 'Competições' },
      { id: 'transfers', label: 'Transferências' },
      { id: 'finances', label: 'Finanças' }
    ];
    buttons.forEach(btn => {
      const b = el('button', '', btn.label);
      b.addEventListener('click', () => navigate(btn.id));
      nav.appendChild(b);
    });
    screen.appendChild(nav);
    const btnSave = el('button', '', 'Salvar Progresso');
    btnSave.addEventListener('click', () => {
      state.saves[state.currentSlot] = JSON.parse(JSON.stringify(state.currentSave));
      persistSaves();
      alert('Progresso salvo!');
    });
    const btnMenu = el('button', '', 'Voltar ao Menu');
    btnMenu.addEventListener('click', () => navigate('home'));
    screen.appendChild(btnSave);
    screen.appendChild(btnMenu);
    container.appendChild(screen);
  }

  function renderSquad(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Elenco'));
    const players = DATA.players.filter(p => p.clubId === state.currentSave.career.clubId);
    const table = el('table');
    const thead = el('thead');
    thead.innerHTML = '<tr><th>Nome</th><th>Posição</th><th>Overall</th><th>Idade</th></tr>';
    table.appendChild(thead);
    const tbody = el('tbody');
    players.forEach(p => {
      const tr = el('tr');
      tr.appendChild(el('td', '', p.name));
      tr.appendChild(el('td', '', p.position));
      tr.appendChild(el('td', '', p.overall.toString())) ;
      tr.appendChild(el('td', '', p.age.toString()));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    screen.appendChild(table);
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderTactics(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Tática'));
    const form = el('div');
    const formationLabel = el('label', '', 'Formação');
    const formationSelect = el('select');
    ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1'].forEach(f => {
      const opt = el('option');
      opt.value = f;
      opt.textContent = f;
      if (state.currentSave.career.formation === f) opt.selected = true;
      formationSelect.appendChild(opt);
    });
    formationSelect.addEventListener('change', () => {
      state.currentSave.career.formation = formationSelect.value;
    });
    form.appendChild(formationLabel);
    form.appendChild(formationSelect);
    screen.appendChild(form);
    screen.appendChild(el('p', '', 'Selecione a formação preferida. (Escalação automática baseada no overall dos jogadores)'));
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderTraining(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Treinos'));
    screen.appendChild(el('p', '', 'Ajuste a intensidade do treino semanal. Valores mais altos aumentam o desempenho, mas também o risco de lesões (não implementado).'));
    const inputRange = el('input');
    inputRange.type = 'range';
    inputRange.min = '0';
    inputRange.max = '1';
    inputRange.step = '0.1';
    inputRange.value = state.currentSave.career.trainingIntensity;
    inputRange.addEventListener('input', () => {
      state.currentSave.career.trainingIntensity = parseFloat(inputRange.value);
    });
    screen.appendChild(inputRange);
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderMatches(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Jogos – Campeonato Brasileiro'));
    const comp = state.currentSave.competitions.brasileirao;
    if (!comp) {
      screen.appendChild(el('p', '', 'Calendário não encontrado.')); 
    } else {
      const round = comp.currentRound;
      const totalRounds = comp.fixtures.reduce((max, f) => Math.max(max, f.round), 0);
      screen.appendChild(el('p', '', `Rodada Atual: ${round + 1} de ${totalRounds}`));
      // listar jogos da rodada atual
      const games = comp.fixtures.filter(f => f.round === round);
      const ul = el('ul');
      games.forEach(g => {
        const li = el('li');
        const home = DATA.clubs.find(c => c.id === g.home);
        const away = DATA.clubs.find(c => c.id === g.away);
        const res = g.result ? `${g.result.homeGoals} x ${g.result.awayGoals}` : 'vs';
        li.textContent = `${home.name} ${res} ${away.name}`;
        ul.appendChild(li);
      });
      screen.appendChild(ul);
      if (round < totalRounds) {
        const btnPlay = el('button', '', 'Simular Rodada');
        btnPlay.addEventListener('click', () => {
          simulateRound(comp, round);
          comp.currentRound++;
          // atualizar save e persistir
          state.currentSave.competitions.brasileirao = comp;
          state.saves[state.currentSlot] = JSON.parse(JSON.stringify(state.currentSave));
          persistSaves();
          render();
        });
        screen.appendChild(btnPlay);
      } else {
        screen.appendChild(el('p', '', 'Temporada concluída!'));
      }
    }
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderCompetitions(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Classificação – Campeonato Brasileiro'));
    const comp = state.currentSave.competitions.brasileirao;
    if (!comp) {
      screen.appendChild(el('p', '', 'Sem dados.'));
    } else {
      const table = el('table');
      const thead = el('thead');
      thead.innerHTML = '<tr><th>Pos</th><th>Clube</th><th>Pts</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr>';
      table.appendChild(thead);
      const standings = Object.entries(comp.table).map(([id, stats]) => {
        return { id: parseInt(id), ...stats, club: DATA.clubs.find(c => c.id === parseInt(id)).name };
      });
      standings.sort((a,b) => b.pts - a.pts || b.sg - a.sg || b.gf - a.gf);
      const tbody = el('tbody');
      standings.forEach((item, idx) => {
        const tr = el('tr');
        tr.appendChild(el('td', '', (idx + 1).toString()));
        tr.appendChild(el('td', '', item.club));
        tr.appendChild(el('td', '', item.pts.toString()));
        tr.appendChild(el('td', '', item.p.toString()));
        tr.appendChild(el('td', '', item.w.toString()));
        tr.appendChild(el('td', '', item.d.toString()));
        tr.appendChild(el('td', '', item.l.toString()));
        tr.appendChild(el('td', '', item.gf.toString()));
        tr.appendChild(el('td', '', item.ga.toString()));
        tr.appendChild(el('td', '', item.sg.toString()));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      screen.appendChild(table);
    }
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderTransfers(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Transferências'));
    screen.appendChild(el('p', '', 'Sistema de transferências simples. Selecione jogadores livres para contratar.'));
    // jogadores que não pertencem a nenhum dos clubes da competição e não estão no clube atual
    const myClubId = state.currentSave.career.clubId;
    const available = DATA.players.filter(p => p.clubId !== myClubId);
    const list = el('div');
    available.slice(0, 10).forEach(p => {
      const row = el('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.borderBottom = '1px solid #eee';
      row.style.padding = '5px 0';
      row.appendChild(el('span', '', `${p.name} (${p.position}) - ${p.overall}`));
      const btnBuy = el('button', '', 'Contratar');
      btnBuy.addEventListener('click', () => {
        if (state.currentSave.career.finances.balance < 50000) {
          alert('Saldo insuficiente.');
          return;
        }
        state.currentSave.career.finances.balance -= 50000;
        p.clubId = myClubId;
        alert(`${p.name} contratado por 50.000!`);
        render();
      });
      row.appendChild(btnBuy);
      list.appendChild(row);
    });
    screen.appendChild(list);
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderFinances(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Finanças'));
    const bal = state.currentSave.career.finances.balance;
    screen.appendChild(el('p', '', `Saldo: ${bal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`));
    screen.appendChild(el('p', '', 'Por enquanto as finanças são simplificadas. Ganhe prêmios competindo e evite gastar demais!'));
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('hub'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  // ===== Painel Admin =====
  function renderAdmin(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Painel Admin'));
    screen.appendChild(el('p', '', 'Use o admin para adicionar clubes personalizados sem alterar o código. Os dados adicionados serão armazenados no navegador.'));
    const btnClubs = el('button', '', 'Gerenciar Clubes');
    btnClubs.addEventListener('click', () => navigate('admin-clubs'));
    screen.appendChild(btnClubs);
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('home'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  function renderAdminClubs(container) {
    const screen = el('div', 'screen');
    screen.appendChild(el('h2', '', 'Clubes'));
    // Lista de clubes existentes (inclui personalizados)
    const list = el('ul');
    DATA.clubs.forEach(c => {
      const li = el('li');
      li.textContent = `${c.id} – ${c.name}`;
      list.appendChild(li);
    });
    screen.appendChild(list);
    // Form para adicionar novo clube
    screen.appendChild(el('h3', '', 'Adicionar Novo Clube'));
    const nameInput = el('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Nome do clube';
    const btnAdd = el('button', '', 'Adicionar');
    btnAdd.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        alert('Digite um nome válido.');
        return;
      }
      const nextId = DATA.clubs.reduce((max, c) => Math.max(max, c.id), 0) + 1;
      const newClub = {
        id: nextId,
        name: name,
        league: 'Serie A',
        logo: '1.png',
        country: 'Brazil'
      };
      DATA.clubs.push(newClub);
      // salvar nos personalizados
      let customClubs = JSON.parse(localStorage.getItem('vfm_custom_clubs') || '[]');
      customClubs.push(newClub);
      localStorage.setItem('vfm_custom_clubs', JSON.stringify(customClubs));
      nameInput.value = '';
      render();
    });
    screen.appendChild(nameInput);
    screen.appendChild(btnAdd);
    const btnBack = el('button', '', 'Voltar');
    btnBack.addEventListener('click', () => navigate('admin'));
    screen.appendChild(btnBack);
    container.appendChild(screen);
  }

  // ===== Lógica de competições =====
  function initCompetitionsForSave() {
    // apenas o Campeonato Brasileiro (liga) é implementado
    const league = DATA.competitions.find(c => c.id === 'brasileirao');
    if (!league) return;
    const teams = league.teams;
    const fixtures = generateLeagueFixtures(teams);
    // criar tabela inicial
    const table = {};
    teams.forEach(id => {
      table[id] = { pts: 0, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, sg: 0 };
    });
    state.currentSave.competitions['brasileirao'] = {
      fixtures: fixtures,
      table: table,
      currentRound: 0
    };
  }

  // Gerar tabela de confrontos em dupla rodada (ida e volta)
  function generateLeagueFixtures(teamIds) {
    const n = teamIds.length;
    const teams = [...teamIds];
    const rounds = (n - 1) * 2;
    const fixtures = [];
    // Algoritmo de circle method para todos contra todos
    const firstHalf = [];
    let list = teams.slice();
    if (n % 2 === 1) list.push(null); // se número ímpar, adiciona bye
    const totalRounds = list.length - 1;
    for (let round = 0; round < totalRounds; round++) {
      for (let i = 0; i < list.length / 2; i++) {
        const home = list[i];
        const away = list[list.length - 1 - i];
        if (home != null && away != null) {
          firstHalf.push({ round: round, home: home, away: away, result: null });
        }
      }
      // rotate array
      list = [list[0]].concat(list.slice(-1)).concat(list.slice(1, -1));
    }
    // segunda metade com mandos invertidos
    const secondHalf = firstHalf.map(f => ({ round: f.round + totalRounds, home: f.away, away: f.home, result: null }));
    return firstHalf.concat(secondHalf);
  }

  // Simular todos os jogos de uma rodada
  function simulateRound(comp, round) {
    const games = comp.fixtures.filter(f => f.round === round);
    games.forEach(game => {
      if (game.result) return; // já jogado
      // calcula força dos times pela média de overall
      const homePlayers = DATA.players.filter(p => p.clubId === game.home);
      const awayPlayers = DATA.players.filter(p => p.clubId === game.away);
      const homeRating = homePlayers.reduce((sum, p) => sum + p.overall, 0) / homePlayers.length;
      const awayRating = awayPlayers.reduce((sum, p) => sum + p.overall, 0) / awayPlayers.length;
      // fator aleatório
      const homeGoals = Math.max(0, Math.round((homeRating / 20) + Math.random() * 2));
      const awayGoals = Math.max(0, Math.round((awayRating / 20) + Math.random() * 2));
      game.result = { homeGoals, awayGoals };
      updateTable(comp.table, game.home, game.away, homeGoals, awayGoals);
    });
  }

  // Atualizar tabela de classificação com resultado
  function updateTable(table, homeId, awayId, hg, ag) {
    const home = table[homeId];
    const away = table[awayId];
    home.p++;
    away.p++;
    home.gf += hg;
    home.ga += ag;
    away.gf += ag;
    away.ga += hg;
    home.sg = home.gf - home.ga;
    away.sg = away.gf - away.ga;
    if (hg > ag) {
      home.w++;
      home.pts += 3;
      away.l++;
    } else if (hg < ag) {
      away.w++;
      away.pts += 3;
      home.l++;
    } else {
      home.d++;
      away.d++;
      home.pts += 1;
      away.pts += 1;
    }
  }

  /**
   * Caso os arquivos JSON não possam ser carregados (por exemplo,
   * ao abrir o jogo diretamente via file://), geramos um conjunto
   * mínimo de dados em tempo de execução. Estes dados são os
   * mesmos do pacote padrão (times e jogadores fictícios) para
   * garantir que o jogo funcione em qualquer ambiente.
   */
  function buildFallbackData() {
    // definições de times de exemplo
    const teamDefs = [
      { id: 1, name: 'Palmeiras' },
      { id: 2, name: 'Flamengo' },
      { id: 3, name: 'Internacional' },
      { id: 4, name: 'Grêmio' },
      { id: 5, name: 'Corinthians' },
      { id: 6, name: 'São Paulo' },
      { id: 7, name: 'Atlético Mineiro' },
      { id: 8, name: 'Santos' }
    ];
    const clubs = teamDefs.map(t => ({ id: t.id, name: t.name, league: 'Serie A', logo: `${t.id}.png`, country: 'Brazil' }));
    const players = [];
    let pid = 1;
    teamDefs.forEach(team => {
      // gerar 18 jogadores por time: 2 goleiros, 6 defensores, 6 meio‑campistas e 4 atacantes
      const positions = ['GK','GK','DF','DF','DF','DF','DF','DF','MF','MF','MF','MF','MF','MF','FW','FW','FW','FW'];
      // embaralhar
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      positions.forEach((pos, idx) => {
        players.push({
          id: pid++,
          clubId: team.id,
          name: `Jogador ${team.id}-${idx + 1}`,
          position: pos,
          overall: Math.floor(Math.random() * 26) + 60, // 60-85
          age: Math.floor(Math.random() * 18) + 18, // 18-35
          nationality: 'Brazil'
        });
      });
    });
    const competitions = [
      {
        id: 'brasileirao',
        name: 'Campeonato Brasileiro',
        type: 'league',
        teams: teamDefs.map(t => t.id),
        rounds: (teamDefs.length - 1) * 2,
        rules: {
          pointsWin: 3,
          pointsDraw: 1,
          pointsLoss: 0,
          relegation: 2,
          qualification: { libertadores: 2, sulamericana: 4 }
        }
      },
      {
        id: 'copa_do_brasil',
        name: 'Copa do Brasil',
        type: 'cup',
        teams: teamDefs.map(t => t.id),
        rounds: 3
      }
    ];
    const seasons = [ { year: '2025/2026', competitions: ['brasileirao','copa_do_brasil'] } ];
    const rules = { general: 'Regras padrão' };
    return { clubs, players, competitions, seasons, rules };
  }

  // Inicializar o app
  async function init() {
    await loadData();
    loadSaves();
    // garantir pelo menos dois slots vazios
    while (state.saves.length < 2) state.saves.push(null);
    render();
  }
  // Quando o DOM estiver pronto
  document.addEventListener('DOMContentLoaded', init);
})();