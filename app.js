(() => {
  "use strict";

  /**
   * Vale Futebol Manager 2026 - Premium
   *
   * Este script implementa a lógica principal da aplicação. Ele gerencia o
   * carregamento de pacotes de dados (DLC), slots de salvamento, criação
   * de carreira, seleção de clube, tutorial, HUB do treinador e módulos
   * básicos (elenco, tática, treinos). Todas as interações são feitas
   * sem backend, utilizando LocalStorage para persistência.
   */

  // Oculta a tela de splash após a página carregar
  document.addEventListener("DOMContentLoaded", () => {
    const splash = document.getElementById("splash");
    if (splash) {
      // pequeno atraso para mostrar a animação
      setTimeout(() => {
        splash.classList.add("hidden");
      }, 1500);
    }
  });

  /** Seleciona um elemento no DOM */
  const $ = (sel) => document.querySelector(sel);

  /** Tenta fazer o parse de JSON, senão retorna fallback */
  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  /** Retorna data/hora atual em ISO */
  function nowIso() {
    return new Date().toISOString();
  }

  /** Chaves de LocalStorage */
  const LS = {
    SETTINGS: "vfm26_settings",
    SLOT_PREFIX: "vfm26_slot_"
  };

  /**
   * Estado global da aplicação
   * - settings: preferências e metadados do jogador
   * - packs: lista de pacotes carregados de /data/packs.json
   * - packData: dados completos do pacote selecionado
   * - ui: estado visual (erros/carregando)
   */
  const state = {
    settings: loadSettings(),
    packs: [],
    packData: null,
    ui: { loading: false, error: null }
  };

  /** Valores padrão para settings */
  function defaultSettings() {
    return {
      selectedPackId: null,
      activeSlotId: null,
      lastRoute: "#/home",
      slots: {}
    };
  }

  /** Carrega settings do LocalStorage, retornando os padrões se ausente */
  function loadSettings() {
    const raw = localStorage.getItem(LS.SETTINGS);
    const parsed = safeJsonParse(raw, null);
    return parsed && typeof parsed === "object"
      ? { ...defaultSettings(), ...parsed }
      : defaultSettings();
  }

  /** Salva as configurações no LocalStorage */
  function saveSettings() {
    localStorage.setItem(LS.SETTINGS, JSON.stringify(state.settings));
  }

  /** Retorna a chave de armazenamento de um slot */
  function slotKey(id) {
    return `${LS.SLOT_PREFIX}${id}`;
  }

  /** Lê um slot salvo */
  function readSlot(id) {
    return safeJsonParse(localStorage.getItem(slotKey(id)), null);
  }

  /** Escreve um slot e atualiza metadados */
  function writeSlot(id, data) {
    localStorage.setItem(slotKey(id), JSON.stringify(data));
    state.settings.slots[String(id)] = {
      hasSave: true,
      updatedAt: data.meta.updatedAt,
      summary: data.meta.summary
    };
    saveSettings();
  }

  /** Remove um slot e zera o metadado */
  function clearSlot(id) {
    localStorage.removeItem(slotKey(id));
    state.settings.slots[String(id)] = {
      hasSave: false,
      updatedAt: nowIso(),
      summary: "Vazio"
    };
    saveSettings();
  }

  /** Garante que existam pelo menos 2 slots predefinidos */
  function ensureSlots() {
    ["1", "2"].forEach((id) => {
      if (!state.settings.slots[id]) {
        const exists = !!readSlot(id);
        state.settings.slots[id] = {
          hasSave: exists,
          updatedAt: nowIso(),
          summary: exists ? "Carreira salva" : "Vazio"
        };
      }
    });
    saveSettings();
  }

  /** Carrega lista de pacotes de /data/packs.json */
  async function loadPacks() {
    try {
      const res = await fetch("./data/packs.json", { cache: "no-store" });
      const json = await res.json();
      state.packs = Array.isArray(json?.packs) ? json.packs : [];
    } catch {
      state.packs = [];
      state.ui.error = "Falha ao carregar pacotes.";
    }
  }

  /** Carrega os dados completos do pacote selecionado */
  async function loadPackData() {
    const pid = state.settings.selectedPackId;
    if (!pid) {
      state.packData = null;
      return;
    }
    const pack = state.packs.find((p) => p.id === pid);
    if (!pack) {
      state.packData = null;
      return;
    }
    try {
      const manifest = await fetch(pack.path, { cache: "no-store" }).then((r) => r.json());
      const files = manifest.files || {};
      // Carrega cada arquivo, caindo para fallback se falhar
      async function tryLoad(path, fb) {
        try {
          const r = await fetch(path, { cache: "no-store" });
          return await r.json();
        } catch {
          return fb;
        }
      }
      state.packData = {
        manifest,
        clubs: await tryLoad(files.clubs, { clubs: [] }),
        competitions: await tryLoad(files.competitions, { leagues: [], cups: [] }),
        rules: await tryLoad(files.rules, {}),
        seasons: await tryLoad(files.seasons, { seasons: [] }),
        players: await tryLoad(files.players, { players: [] })
      };
    } catch {
      state.packData = null;
      state.ui.error = "Falha ao carregar dados do pacote.";
    }
  }

  /** Router: mapeia rotas para funções de renderização */
  const routes = {
    "/home": viewHome,
    "/dlc": viewDlc,
    "/slots": viewSlots,
    "/career-create": viewCareerCreate,
    "/club-pick": viewClubPick,
    "/tutorial": viewTutorial,
    "/hub": viewHub,
    "/squad": viewSquad,
    "/tactics": viewTactics,
    "/training": viewTraining,
    "/save": viewSave,
    "/admin": viewAdmin
  };

  /** Navega para a rota atual conforme hash */
  function route() {
    ensureSlots();
    const hash = location.hash.replace("#", "");
    const path = hash || "/home";
    const view = routes[path] || viewHome;
    const html = view();
    // Renderiza no container e vincula eventos
    const viewEl = document.getElementById("view");
    if (viewEl) {
      viewEl.innerHTML = html;
    }
    bindEvents();
  }

  // Ouve mudança de hash para atualizar a rota
  window.addEventListener("hashchange", route);

  /** Codifica string em HTML seguro */
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /** Obtém o slot ativo ou null */
  function activeSave() {
    const id = state.settings.activeSlotId;
    if (!id) return null;
    return readSlot(id);
  }

  /** Exige um save válido; caso contrário, retorna mensagem de aviso */
  function requireSave(cb) {
    const save = activeSave();
    if (!state.settings.selectedPackId) {
      return `
        <div class="card">
          <div class="card-body">
            <div class="notice">Selecione um DLC primeiro.</div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/dlc">Escolher DLC</button>
            <button class="btn btn-ghost" data-go="/home">Menu</button>
          </div>
        </div>
      `;
    }
    if (!save) {
      return `
        <div class="card">
          <div class="card-body">
            <div class="notice">Crie ou continue um slot antes de prosseguir.</div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/slots">Ir para Slots</button>
            <button class="btn btn-ghost" data-go="/home">Menu</button>
          </div>
        </div>
      `;
    }
    return cb(save);
  }

  /** Obtém clube pelo id a partir do pacote carregado */
  function getClub(id) {
    return state.packData?.clubs?.clubs.find((c) => c.id === id) || null;
  }

  /** Gera aleatoriamente um elenco para um clube (MVP) */
  function generateSquadForClub(clubId) {
    // Define base de overall conforme a liga
    const club = getClub(clubId);
    let base = 65;
    if (club?.leagueId === "BRA_SERIE_A") base = 70;
    else if (club?.leagueId === "BRA_SERIE_B") base = 66;
    else if (club?.leagueId && club.leagueId.startsWith("ENG_")) base = 75;
    else if (club?.leagueId && club.leagueId.startsWith("ESP_")) base = 74;
    else if (club?.leagueId && club.leagueId.startsWith("ITA_")) base = 73;
    else if (club?.leagueId && club.leagueId.startsWith("GER_")) base = 73;
    else if (club?.leagueId && club.leagueId.startsWith("FRA_")) base = 72;

    const positions = [];
    positions.push(...Array.from({ length: 3 }, () => "GK"));
    positions.push(...Array.from({ length: 8 }, () => "DEF"));
    positions.push(...Array.from({ length: 9 }, () => "MID"));
    positions.push(...Array.from({ length: 5 }, () => "ATT"));

    const firstNames = ["Joao","Pedro","Lucas","Mateus","Gabriel","Rafael","Bruno","Diego","Vitor","Caio","Renan","Andre","Thiago","Henrique","Arthur","Marcos","Felipe","Danilo","Gustavo","Leo"];
    const lastNames  = ["Silva","Souza","Santos","Oliveira","Pereira","Lima","Costa","Ribeiro","Carvalho","Almeida","Gomes","Rocha","Martins","Barbosa","Ferreira","Mendes","Araujo","Cardoso","Teixeira","Moura"];

    return positions.map((pos, i) => {
      const age = Math.floor(Math.random() * (35 - 17 + 1)) + 17;
      const overall = Math.min(90, Math.max(50, base + Math.floor(Math.random() * 11) - 3));
      const value = Math.round((overall * 900000) * (age <= 23 ? 1.2 : 1.0));
      const form = Math.floor(Math.random() * 5) - 2; // -2..+2
      return {
        id: `${clubId}_p${i + 1}`,
        clubId,
        name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
        pos,
        age,
        overall,
        value,
        nationality: club?.country || null,
        form,
        source: "generated"
      };
    });
  }

  /** Cria o XI inicial com base na formação */
  function buildDefaultXI(players, formation) {
    const byPos = {
      GK: players.filter((p) => p.pos === "GK").sort((a, b) => b.overall - a.overall),
      DEF: players.filter((p) => p.pos === "DEF").sort((a, b) => b.overall - a.overall),
      MID: players.filter((p) => p.pos === "MID").sort((a, b) => b.overall - a.overall),
      ATT: players.filter((p) => p.pos === "ATT").sort((a, b) => b.overall - a.overall)
    };
    const need = formation === "4-4-2"
      ? { GK: 1, DEF: 4, MID: 4, ATT: 2 }
      : { GK: 1, DEF: 4, MID: 3, ATT: 3 };
    const xi = [];
    ["GK", "DEF", "MID", "ATT"].forEach((pos) => {
      for (let i = 0; i < need[pos]; i++) {
        if (byPos[pos][i]) xi.push(byPos[pos][i].id);
      }
    });
    return xi;
  }

  /** Garante que a carreira tenha sistemas de elenco, tática e treinos */
  function ensureSystems(save) {
    save.squad = save.squad || {};
    save.tactics = save.tactics || {};
    save.training = save.training || {};

    if (!Array.isArray(save.squad.players) || save.squad.players.length === 0) {
      save.squad.players = generateSquadForClub(save.career.clubId);
    }
    if (!save.tactics.formation) save.tactics.formation = "4-3-3";
    if (!Array.isArray(save.tactics.startingXI) || save.tactics.startingXI.length === 0) {
      save.tactics.startingXI = buildDefaultXI(save.squad.players, save.tactics.formation);
    }
    if (!save.training.weekPlan) save.training.weekPlan = "Equilibrado";
    if (typeof save.training.formBoost !== "number") save.training.formBoost = 0;
    return save;
  }

  /** Calcula o overall médio do XI */
  function teamOverall(players, xi) {
    const set = new Set(xi);
    const selected = players.filter((p) => set.has(p.id));
    if (selected.length === 0) return 0;
    const avg = selected.reduce((s, p) => s + p.overall, 0) / selected.length;
    return Math.round(avg);
  }

  /* ========== VIEWS ========== */

  /** Tela inicial */
  function viewHome() {
    const packName = state.settings.selectedPackId
      ? state.packs.find((p) => p.id === state.settings.selectedPackId)?.name || state.settings.selectedPackId
      : "Nenhum";
    const slotLabel = state.settings.activeSlotId ? `Slot ${state.settings.activeSlotId}` : "Nenhum";
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Menu Principal</div>
            <div class="card-subtitle">Inicie sua carreira e gerencie seu clube favorito</div>
          </div>
          <span class="badge">VFM Premium</span>
        </div>
        <div class="card-body">
          ${state.ui.error ? `<div class="notice">⚠️ ${esc(state.ui.error)}</div><div class="sep"></div>` : ""}
          <div class="kv">
            <span class="small">Pacote</span>
            <b>${esc(packName)}</b>
          </div>
          <div style="height: 10px;"></div>
          <div class="kv">
            <span class="small">Slot</span>
            <b>${esc(slotLabel)}</b>
          </div>
          <div class="sep"></div>
          <div class="row">
            <button class="btn btn-primary" data-go="/dlc">Iniciar Carreira</button>
            <button class="btn" data-go="/admin">Admin</button>
            <button class="btn" data-go="/hub">HUB</button>
          </div>
        </div>
      </div>
    `;
  }

  /** Seleção de pacotes de dados (DLC) */
  function viewDlc() {
    const list = state.packs.map((p) => {
      const selected = p.id === state.settings.selectedPackId;
      return `
        <div class="item">
          <div class="item-left">
            <div class="item-title">${esc(p.name)}</div>
            <div class="item-sub">v${esc(p.version || "1.0.0")} • ${esc(p.description || "")}</div>
          </div>
          <div class="item-right">
            <button class="btn ${selected ? 'btn-ghost' : 'btn-primary'}" data-action="selectPack" data-pack="${esc(p.id)}">
              ${selected ? 'Selecionado' : 'Selecionar'}
            </button>
          </div>
        </div>
      `;
    }).join("");
    const selectedOk = !!state.settings.selectedPackId;
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Escolher Pacote de Dados</div>
            <div class="card-subtitle">Os dados vêm de /data/*.json</div>
          </div>
          <span class="badge">${state.ui.loading ? 'Carregando...' : 'Pronto'}</span>
        </div>
        <div class="card-body">
          ${state.ui.error ? `<div class="notice">⚠️ ${esc(state.ui.error)}</div><div class="sep"></div>` : ''}
          <div class="list">${list}</div>
          <div class="sep"></div>
          <div class="row">
            <button class="btn" data-go="/home">Voltar</button>
            <button class="btn btn-primary" data-action="goSlots" ${selectedOk ? '' : 'disabled'}>Continuar</button>
          </div>
        </div>
      </div>
    `;
  }

  /** Seleção de slots de salvamento */
  function viewSlots() {
    const pack = state.packs.find((p) => p.id === state.settings.selectedPackId) || null;
    const renderSlot = (id) => {
      const meta = state.settings.slots[String(id)];
      const hasSave = !!readSlot(id);
      return `
        <div class="item">
          <div class="item-left">
            <div class="item-title">Slot ${id} ${hasSave ? '💾' : '🆕'}</div>
            <div class="item-sub">${esc(meta?.summary || (hasSave ? 'Carreira salva' : 'Vazio'))}</div>
          </div>
          <div class="item-right">
            <button class="btn btn-primary" data-action="${hasSave ? 'continueSlot' : 'newSlot'}" data-slot="${id}">
              ${hasSave ? 'Continuar' : 'Novo'}
            </button>
            <button class="btn btn-danger" data-action="deleteSlot" data-slot="${id}">Apagar</button>
          </div>
        </div>
      `;
    };
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Slots de Salvamento</div>
            <div class="card-subtitle">Gerencie suas carreiras</div>
          </div>
          <span class="badge">Pacote: ${esc(pack?.name || 'Nenhum')}</span>
        </div>
        <div class="card-body">
          ${!pack ? `
            <div class="notice">Selecione um pacote antes.</div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/dlc">Ir para DLC</button>
          ` : `
            <div class="list">
              ${renderSlot(1)}
              ${renderSlot(2)}
              ${renderSlot(3)}
            </div>
            <div class="sep"></div>
            <div class="row">
              <button class="btn" data-go="/dlc">Voltar</button>
              <button class="btn" data-go="/home">Menu</button>
            </div>
          `}
        </div>
      </div>
    `;
  }

  /** Criação de carreira: nome, nacionalidade, etc. */
  function viewCareerCreate() {
    return requireSave((save) => {
      const coachName = save.career?.coachName || "";
      const nationality = save.career?.nationality || "Brasil";
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Criar Carreira</div>
              <div class="card-subtitle">Defina seu treinador</div>
            </div>
            <span class="badge">Passo 1/3</span>
          </div>
          <div class="card-body">
            <div class="grid">
              <div class="col-6">
                <div class="label">Nome do treinador</div>
                <input class="input" data-field="coachName" value="${esc(coachName)}" placeholder="Ex: João Vale" />
              </div>
              <div class="col-6">
                <div class="label">Nacionalidade</div>
                <input class="input" data-field="nationality" value="${esc(nationality)}" placeholder="Ex: Brasil" />
              </div>
            </div>
            <div class="sep"></div>
            <div class="row">
              <button class="btn" data-go="/slots">Voltar</button>
              <button class="btn btn-primary" data-action="careerContinueToClub">Continuar</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  /** Escolha de clube */
  function viewClubPick() {
    return requireSave((save) => {
      const clubs = state.packData?.clubs?.clubs || [];
      // Filtra por ligas principais se existirem; por padrão lista todas
      const currentLeague = save.career?.leagueFilter || clubs[0]?.leagueId || "";
      const searchTerm = save.career?.clubSearch || "";
      const leagues = state.packData?.competitions?.leagues || [];
      const leagueOptions = leagues.map((l) => `<option value="${esc(l.id)}" ${l.id === currentLeague ? 'selected' : ''}>${esc(l.name)}</option>`).join("");
      const filtered = clubs
        .filter((c) => !currentLeague || c.leagueId === currentLeague)
        .filter((c) => {
          if (!searchTerm.trim()) return true;
          const s = searchTerm.trim().toLowerCase();
          return (c.name || "").toLowerCase().includes(s) || (c.short || "").toLowerCase().includes(s);
        });
      const list = filtered.map((c) => {
        const initials = (c.short || c.name || "CLB").slice(0, 3).toUpperCase();
        return `
          <div class="item">
            <div class="item-left" style="display:flex; gap:12px; align-items:center;">
              <div class="club-logo">
                <img src="./assets/logos/${esc(c.id)}.png" alt="${esc(c.name)}" onerror="this.remove(); this.parentElement.innerHTML='<div class=\'club-fallback\'>${esc(initials)}</div>'"> 
              </div>
              <div style="min-width:0;">
                <div class="item-title">${esc(c.name)}</div>
                <div class="item-sub">${esc(c.short)} • Overall ${esc(c.overall)} • Orçamento ${Math.round((c.budget || 0) / 1_000_000)}M</div>
              </div>
            </div>
            <div class="item-right">
              <button class="btn btn-primary" data-action="pickClub" data-club="${esc(c.id)}">Escolher</button>
            </div>
          </div>
        `;
      }).join("");
      const chosen = save.career?.clubId ? getClub(save.career.clubId) : null;
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Escolha de Clube</div>
              <div class="card-subtitle">Selecione o clube que você irá comandar</div>
            </div>
            <span class="badge">Passo 2/3</span>
          </div>
          <div class="card-body">
            <div class="grid">
              <div class="col-6">
                <div class="label">Liga</div>
                <select class="input" data-action="setLeagueFilter">${leagueOptions}</select>
              </div>
              <div class="col-6">
                <div class="label">Buscar clube</div>
                <input class="input" data-action="clubSearchInput" value="${esc(searchTerm)}" placeholder="Digite o nome do clube" />
              </div>
            </div>
            <div class="sep"></div>
            <div class="list">
              ${list || `<div class='notice'>Nenhum clube encontrado.</div>`}
            </div>
            ${chosen ? `<div class="sep"></div><div class="notice">Clube selecionado: <b>${esc(chosen.name)}</b></div>` : ''}
            <div class="sep"></div>
            <div class="row">
              <button class="btn" data-go="/career-create">Voltar</button>
              <button class="btn btn-primary" data-action="confirmClub" ${chosen ? '' : 'disabled'}>Continuar</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  /** Tutorial inicial */
  function viewTutorial() {
    return requireSave((save) => {
      const club = getClub(save.career.clubId);
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Bem-vindo(a) ao VFM</div>
              <div class="card-subtitle">Tutorial inicial</div>
            </div>
            <span class="badge">Passo 3/3</span>
          </div>
          <div class="card-body">
            <div class="notice">
              👋 Olá <b>${esc(save.career.coachName)}</b>!<br/><br/>
              Você foi contratado para comandar o <b>${esc(club?.name || 'clube')}</b>.<br/><br/>
              Aqui você irá gerenciar elenco e táticas, definir treinos, disputar
              competições nacionais e continentais, negociar jogadores e muito mais. Suas
              decisões influenciam o futuro do clube!
            </div>
            <div class="sep"></div>
            <div class="row">
              <button class="btn btn-primary" data-action="finishTutorial">Ir para o HUB</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  /** HUB do treinador */
  function viewHub() {
    return requireSave((save) => {
      const club = getClub(save.career.clubId);
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">HUB do Treinador</div>
              <div class="card-subtitle">${esc(club?.name || '')} • Treinador: ${esc(save.career.coachName)}</div>
            </div>
            <span class="badge">Temporada 2025/26</span>
          </div>
          <div class="card-body">
            <div class="grid">
              <div class="col-4"><button class="btn btn-primary" data-go="/squad">Elenco</button></div>
              <div class="col-4"><button class="btn btn-primary" data-go="/tactics">Tática</button></div>
              <div class="col-4"><button class="btn btn-primary" data-go="/training">Treinos</button></div>
              <div class="col-4"><button class="btn" data-go="/save">Salvar</button></div>
              <div class="col-4"><button class="btn" data-go="/home">Menu</button></div>
              <div class="col-4"><button class="btn btn-danger" data-go="/slots">Trocar Slot</button></div>
            </div>
            <div class="sep"></div>
            <div class="notice">
              Todas as seções já funcionam. Administre seu time e conquiste títulos!
            </div>
          </div>
        </div>
      `;
    });
  }

  /** Elenco */
  function viewSquad() {
    return requireSave((save) => {
      ensureSystems(save);
      const club = getClub(save.career.clubId);
      const players = save.squad.players;
      // Filtra por busca e posição se for implementado (por simplicidade não)
      const rows = players
        .sort((a, b) => b.overall - a.overall)
        .map((p) => `
          <tr>
            <td>${esc(p.name)}</td>
            <td class="center">${esc(p.pos)}</td>
            <td class="center">${esc(p.age)}</td>
            <td class="center"><b>${esc(p.overall)}</b></td>
            <td class="center">${p.form > 0 ? '+' + p.form : p.form}</td>
          </tr>
        `)
        .join("");
      writeSlot(state.settings.activeSlotId, save);
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Elenco</div>
              <div class="card-subtitle">${esc(club?.name || '')} • ${players.length} jogadores</div>
            </div>
            <span class="badge">OVR XI: ${teamOverall(players, save.tactics.startingXI)}</span>
          </div>
          <div class="card-body">
            <table class="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th class="center">Pos</th>
                  <th class="center">Idade</th>
                  <th class="center">OVR</th>
                  <th class="center">Forma</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Voltar</button>
          </div>
        </div>
      `;
    });
  }

  /** Tática */
  function viewTactics() {
    return requireSave((save) => {
      ensureSystems(save);
      const club = getClub(save.career.clubId);
      const players = save.squad.players;
      const formation = save.tactics.formation;
      const ovr = teamOverall(players, save.tactics.startingXI);
      // Monta XI
      const xiSet = new Set(save.tactics.startingXI || []);
      const xiPlayers = players.filter((p) => xiSet.has(p.id)).sort((a, b) => b.overall - a.overall);
      const xiRows = xiPlayers.map((p) => `
        <tr>
          <td>${esc(p.name)}</td>
          <td class="center">${esc(p.pos)}</td>
          <td class="center"><b>${esc(p.overall)}</b></td>
        </tr>
      `).join("");
      writeSlot(state.settings.activeSlotId, save);
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Tática</div>
              <div class="card-subtitle">${esc(club?.name || '')} • XI & Formação</div>
            </div>
            <span class="badge">OVR XI: ${ovr}</span>
          </div>
          <div class="card-body">
            <div class="grid">
              <div class="col-6">
                <div class="label">Formação</div>
                <select class="input" data-action="setFormation">
                  <option value="4-3-3" ${formation === '4-3-3' ? 'selected' : ''}>4-3-3</option>
                  <option value="4-4-2" ${formation === '4-4-2' ? 'selected' : ''}>4-4-2</option>
                </select>
              </div>
              <div class="col-6">
                <div class="label">Autoescalar</div>
                <button class="btn btn-primary" data-action="autoPickXI">Melhor XI</button>
              </div>
            </div>
            <div class="sep"></div>
            <div class="notice">Sua escalação é salva automaticamente. Selecione jogadores no Elenco para ajustar.</div>
            <div class="sep"></div>
            <table class="table">
              <thead><tr><th>Jogador</th><th class="center">Pos</th><th class="center">OVR</th></tr></thead>
              <tbody>${xiRows || `<tr><td colspan='3' class='mini'>XI vazio. Use autoescalar.</td></tr>`}</tbody>
            </table>
            <div class="sep"></div>
            <div class="row">
              <button class="btn btn-primary" data-go="/hub">Voltar</button>
              <button class="btn" data-go="/squad">Ir para Elenco</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  /** Treinos */
  function viewTraining() {
    return requireSave((save) => {
      ensureSystems(save);
      const club = getClub(save.career.clubId);
      const plan = save.training.weekPlan;
      writeSlot(state.settings.activeSlotId, save);
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Treinos</div>
              <div class="card-subtitle">${esc(club?.name || '')} • Planejamento Semanal</div>
            </div>
            <span class="badge">Bônus forma: ${save.training.formBoost.toFixed(1)}</span>
          </div>
          <div class="card-body">
            <div class="grid">
              <div class="col-6">
                <div class="label">Plano da semana</div>
                <select class="input" data-action="setTrainingPlan">
                  <option value="Leve" ${plan === 'Leve' ? 'selected' : ''}>Leve</option>
                  <option value="Equilibrado" ${plan === 'Equilibrado' ? 'selected' : ''}>Equilibrado</option>
                  <option value="Intenso" ${plan === 'Intenso' ? 'selected' : ''}>Intenso</option>
                </select>
              </div>
              <div class="col-6">
                <div class="label">Aplicar treino</div>
                <button class="btn btn-primary" data-action="applyTraining">Aplicar</button>
              </div>
            </div>
            <div class="sep"></div>
            <div class="notice">
              O treino melhora levemente a forma dos jogadores. Planos intensos dão bônus maior.
            </div>
            <div class="sep"></div>
            <div class="row">
              <button class="btn btn-primary" data-go="/hub">Voltar</button>
              <button class="btn" data-go="/squad">Ver Elenco</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  /** Salvar progresso */
  function viewSave() {
    return requireSave((save) => {
      save.meta.updatedAt = nowIso();
      writeSlot(state.settings.activeSlotId, save);
      return `
        <div class="card">
          <div class="card-body">
            <div class="notice">Jogo salvo com sucesso!</div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Voltar ao HUB</button>
          </div>
        </div>
      `;
    });
  }

  /** Admin placeholder */
  function viewAdmin() {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Admin</div></div>
        <div class="card-body">
          <div class="notice">Painel de administração será implementado em versões futuras.</div>
          <div class="sep"></div>
          <button class="btn btn-primary" data-go="/home">Menu</button>
        </div>
      </div>
    `;
  }

  /** Liga eventos interativos após renderização */
  function bindEvents() {
    // Navegação via data-go
    document.querySelectorAll('[data-go]').forEach((el) => {
      el.addEventListener('click', () => {
        const target = el.getAttribute('data-go');
        if (target) location.hash = target;
      });
    });
    // Ações
    document.querySelectorAll('[data-action]').forEach((el) => {
      const action = el.getAttribute('data-action');
      if (action === 'selectPack') {
        el.addEventListener('click', async () => {
          const packId = el.getAttribute('data-pack');
          state.settings.selectedPackId = packId;
          saveSettings();
          await loadPackData();
          route();
        });
      }
      if (action === 'goSlots') {
        el.addEventListener('click', () => {
          location.hash = '/slots';
        });
      }
      if (action === 'newSlot') {
        el.addEventListener('click', () => {
          const slotId = Number(el.getAttribute('data-slot'));
          state.settings.activeSlotId = slotId;
          saveSettings();
          const pack = state.packs.find((p) => p.id === state.settings.selectedPackId);
          const save = {
            meta: { createdAt: nowIso(), updatedAt: nowIso(), summary: `Carreira • ${pack?.name || state.settings.selectedPackId}` },
            career: { coachName: '', nationality: 'Brasil', clubId: null, leagueFilter: '', clubSearch: '' },
            squad: {}, tactics: {}, training: {},
            progress: {}
          };
          writeSlot(slotId, save);
          location.hash = '/career-create';
        });
      }
      if (action === 'continueSlot') {
        el.addEventListener('click', () => {
          const slotId = Number(el.getAttribute('data-slot'));
          const existing = readSlot(slotId);
          if (existing) {
            state.settings.activeSlotId = slotId;
            saveSettings();
            location.hash = existing.career?.clubId ? '/hub' : '/career-create';
          }
        });
      }
      if (action === 'deleteSlot') {
        el.addEventListener('click', () => {
          const slotId = Number(el.getAttribute('data-slot'));
          clearSlot(slotId);
          route();
        });
      }
      if (action === 'careerContinueToClub') {
        el.addEventListener('click', () => {
          location.hash = '/club-pick';
        });
      }
      if (action === 'setLeagueFilter') {
        el.addEventListener('change', () => {
          const save = activeSave();
          if (!save) return;
          save.career.leagueFilter = el.value;
          save.career.clubSearch = '';
          save.meta.updatedAt = nowIso();
          writeSlot(state.settings.activeSlotId, save);
          route();
        });
      }
      if (action === 'clubSearchInput') {
        el.addEventListener('input', () => {
          const save = activeSave();
          if (!save) return;
          save.career.clubSearch = el.value;
          save.meta.updatedAt = nowIso();
          writeSlot(state.settings.activeSlotId, save);
          route();
        });
      }
      if (action === 'pickClub') {
        el.addEventListener('click', () => {
          const clubId = el.getAttribute('data-club');
          const save = activeSave();
          if (!save) return;
          save.career.clubId = clubId;
          save.meta.updatedAt = nowIso();
          save.meta.summary = `Carreira • ${getClub(clubId)?.name || 'Clube'}`;
          writeSlot(state.settings.activeSlotId, save);
          route();
        });
      }
      if (action === 'confirmClub') {
        el.addEventListener('click', () => {
          location.hash = '/tutorial';
        });
      }
      if (action === 'finishTutorial') {
        el.addEventListener('click', () => {
          location.hash = '/hub';
        });
      }
      if (action === 'setFormation') {
        el.addEventListener('change', () => {
          const save = activeSave();
          if (!save) return;
          ensureSystems(save);
          save.tactics.formation = el.value;
          save.tactics.startingXI = buildDefaultXI(save.squad.players, save.tactics.formation);
          save.meta.updatedAt = nowIso();
          writeSlot(state.settings.activeSlotId, save);
          route();
        });
      }
      if (action === 'autoPickXI') {
        el.addEventListener('click', () => {
          const save = activeSave();
          if (!save) return;
          ensureSystems(save);
          save.tactics.startingXI = buildDefaultXI(save.squad.players, save.tactics.formation);
          save.meta.updatedAt = nowIso();
          writeSlot(state.settings.activeSlotId, save);
          route();
        });
      }
      if (action === 'setTrainingPlan') {
        el.addEventListener('change', () => {
          const save = activeSave();
          if (!save) return;
          ensureSystems(save);
          save.training.weekPlan = el.value;
          save.meta.updatedAt = nowIso();
          writeSlot(state.settings.activeSlotId, save);
        });
      }
      if (action === 'applyTraining') {
        el.addEventListener('click', () => {
          const save = activeSave();
          if (!save) return;
          ensureSystems(save);
          const plan = save.training.weekPlan;
          let boost = 0.5;
          if (plan === 'Leve') boost = 0.3;
          if (plan === 'Intenso') boost = 0.8;
          save.squad.players = save.squad.players.map((p) => {
            const delta = Math.random() * boost;
            const newForm = Math.max(-5, Math.min(5, (p.form || 0) + delta));
            return { ...p, form: Math.round(newForm * 10) / 10 };
          });
          save.training.formBoost = (save.training.formBoost || 0) + boost;
          save.meta.updatedAt = nowIso();
          writeSlot(state.settings.activeSlotId, save);
          alert(`Treino ${plan} aplicado!`);
          route();
        });
      }
    });
  }

  /** Inicializa a aplicação */
  async function boot() {
    ensureSlots();
    await loadPacks();
    await loadPackData();
    if (!location.hash) location.hash = '/home';
    route();
  }

  boot();
})();