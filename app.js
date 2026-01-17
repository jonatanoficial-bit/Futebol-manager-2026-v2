(() => {
  "use strict";

  /* =========================================================
     VALE FUTEBOL MANAGER 2026
     app.js COMPLETO
     Partes: Core + Router + DLC + Slots + Carreira + Clube
     ========================================================= */

  const $ = (sel) => document.querySelector(sel);

  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }
  function nowIso() { return new Date().toISOString(); }

  /* =======================
     LOCAL STORAGE
     ======================= */
  const LS = {
    SETTINGS: "vfm26_settings",
    SLOT_PREFIX: "vfm26_slot_"
  };

  /* =======================
     ESTADO GLOBAL
     ======================= */
  const state = {
    settings: loadSettings(),
    packs: [],
    packData: null,
    ui: { loading: false, error: null }
  };

  function defaultSettings() {
    return {
      selectedPackId: null,
      activeSlotId: null,
      lastRoute: "#/home",
      slots: {}
    };
  }

  function loadSettings() {
    const raw = localStorage.getItem(LS.SETTINGS);
    const parsed = safeJsonParse(raw, null);
    return parsed && typeof parsed === "object"
      ? { ...defaultSettings(), ...parsed }
      : defaultSettings();
  }

  function saveSettings() {
    localStorage.setItem(LS.SETTINGS, JSON.stringify(state.settings));
  }

  function slotKey(id) {
    return `${LS.SLOT_PREFIX}${id}`;
  }

  function readSlot(id) {
    return safeJsonParse(localStorage.getItem(slotKey(id)), null);
  }

  function writeSlot(id, data) {
    localStorage.setItem(slotKey(id), JSON.stringify(data));
    state.settings.slots[String(id)] = {
      hasSave: true,
      updatedAt: data.meta.updatedAt,
      summary: data.meta.summary
    };
    saveSettings();
  }

  function clearSlot(id) {
    localStorage.removeItem(slotKey(id));
    state.settings.slots[String(id)] = {
      hasSave: false,
      updatedAt: nowIso(),
      summary: "Vazio"
    };
    saveSettings();
  }

  function ensureSlots() {
    ["1","2"].forEach(id => {
      if (!state.settings.slots[id]) {
        const has = !!readSlot(id);
        state.settings.slots[id] = {
          hasSave: has,
          updatedAt: nowIso(),
          summary: has ? "Carreira salva" : "Vazio"
        };
      }
    });
    saveSettings();
  }

  /* =======================
     DLC
     ======================= */
  async function loadPacks() {
    try {
      const res = await fetch("./data/packs.json", { cache: "no-store" });
      const json = await res.json();
      state.packs = json.packs || [];
    } catch {
      state.packs = [];
      state.ui.error = "Erro ao carregar packs.";
    }
  }

  async function loadPackData() {
    if (!state.settings.selectedPackId) return;

    const pack = state.packs.find(p => p.id === state.settings.selectedPackId);
    if (!pack) return;

    try {
      const manifest = await fetch(pack.path).then(r => r.json());
      const files = manifest.files;

      const load = async (p, fb) => {
        try { return await fetch(p).then(r => r.json()); }
        catch { return fb; }
      };

      state.packData = {
        manifest,
        clubs: await load(files.clubs, { clubs: [] }),
        competitions: await load(files.competitions, { leagues: [], cups: [] }),
        rules: await load(files.rules, {}),
        seasons: await load(files.seasons, {}),
        players: await load(files.players, { players: [] })
      };
    } catch {
      state.packData = null;
    }
  }

  /* =======================
     ROUTER
     ======================= */
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

  function go(path) {
    location.hash = "#" + path;
  }

  function route() {
    ensureSlots();
    const hash = location.hash.replace("#", "") || "/home";
    const view = routes[hash] || viewHome;
    $("#view").innerHTML = view();
    bindEvents();
  }

  window.addEventListener("hashchange", route);

  /* =======================
     HELPERS
     ======================= */
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  function activeSave() {
    if (!state.settings.activeSlotId) return null;
    return readSlot(state.settings.activeSlotId);
  }

  function requireSave(cb) {
    const save = activeSave();
    if (!save) {
      return `
        <div class="card">
          <div class="card-body">
            <div class="notice">Crie ou carregue uma carreira primeiro.</div>
            <button class="btn btn-primary" data-go="/slots">Ir para Slots</button>
          </div>
        </div>`;
    }
    return cb(save);
  }

  function getClub(id) {
    return state.packData?.clubs?.clubs.find(c => c.id === id) || null;
  }

  /* =======================
     VIEWS BÁSICAS
     ======================= */
  function viewHome() {
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Vale Futebol Manager 2026</div>
        </div>
        <div class="card-body">
          <button class="btn btn-primary" data-go="/dlc">Iniciar Carreira</button>
          <button class="btn" data-go="/admin">Admin</button>
        </div>
      </div>`;
  }

  function viewDlc() {
    const items = state.packs.map(p => `
      <div class="item">
        <div>
          <div class="item-title">${esc(p.name)}</div>
        </div>
        <button class="btn btn-primary" data-pack="${esc(p.id)}">Selecionar</button>
      </div>
    `).join("");

    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Pacote de Dados</div></div>
        <div class="card-body">${items}</div>
      </div>`;
  }

  function viewSlots() {
    const render = (id) => {
      const s = state.settings.slots[id];
      return `
        <div class="item">
          <div>Slot ${id} — ${s.summary}</div>
          <button class="btn btn-primary" data-slot="${id}">
            ${s.hasSave ? "Continuar" : "Novo"}
          </button>
          <button class="btn btn-danger" data-del="${id}">Apagar</button>
        </div>`;
    };

    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Slots</div></div>
        <div class="card-body">
          ${render("1")}
          ${render("2")}
        </div>
      </div>`;
  }

  function viewCareerCreate() {
    return requireSave(save => `
      <div class="card">
        <div class="card-header"><div class="card-title">Criar Carreira</div></div>
        <div class="card-body">
          <input class="input" placeholder="Nome do treinador" value="${esc(save.career.coachName||"")}" data-field="coachName">
          <input class="input" placeholder="Nacionalidade" value="${esc(save.career.nationality||"Brasil")}" data-field="nationality">
          <button class="btn btn-primary" data-go="/club-pick">Continuar</button>
        </div>
      </div>`);
  }

  function viewClubPick() {
    return requireSave(save => {
      const clubs = state.packData?.clubs?.clubs || [];
      const list = clubs.map(c => `
        <div class="item">
          <div>${esc(c.name)}</div>
          <button class="btn btn-primary" data-club="${esc(c.id)}">Escolher</button>
        </div>`).join("");

      return `
        <div class="card">
          <div class="card-header"><div class="card-title">Escolha o Clube</div></div>
          <div class="card-body">${list}</div>
        </div>`;
    });
  }
function viewTutorial() {
    return requireSave(save => {
      const club = getClub(save.career.clubId);
      return `
        <div class="card">
          <div class="card-header"><div class="card-title">Tutorial</div></div>
          <div class="card-body">
            <div class="notice">
              Bem-vindo, <b>${esc(save.career.coachName)}</b>!<br>
              Você comandará: <b>${esc(club?.name || "Clube")}</b>
            </div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Ir para o HUB</button>
          </div>
        </div>`;
    });
  }

  function viewHub() {
    return requireSave(save => {
      const club = getClub(save.career.clubId);
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">HUB do Treinador</div>
              <div class="card-subtitle">${esc(club?.name || "")} • ${esc(save.career.coachName)}</div>
            </div>
          </div>
          <div class="card-body">
            <div class="grid">
              <div class="col-4"><button class="btn btn-primary" data-go="/squad">Elenco</button></div>
              <div class="col-4"><button class="btn btn-primary" data-go="/tactics">Tática</button></div>
              <div class="col-4"><button class="btn btn-primary" data-go="/training">Treinos</button></div>
              <div class="col-4"><button class="btn" data-go="/save">Salvar Progresso</button></div>
              <div class="col-4"><button class="btn btn-ghost" data-go="/home">Menu</button></div>
              <div class="col-4"><button class="btn btn-danger" data-go="/slots">Trocar Slot</button></div>
            </div>
          </div>
        </div>`;
    });
  }

  /* =======================
     PARTE 4: SISTEMAS
     ======================= */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function generateSquadForClub(clubId) {
    const club = getClub(clubId);
    const base = club?.leagueId === "BRA_SERIE_A" ? 66 : 62;

    const pos = [
      ...Array.from({ length: 3 }, () => "GK"),
      ...Array.from({ length: 9 }, () => "DEF"),
      ...Array.from({ length: 9 }, () => "MID"),
      ...Array.from({ length: 6 }, () => "ATT")
    ];

    const first = ["João","Pedro","Lucas","Mateus","Gabriel","Rafael","Bruno","Diego","Vitor","Caio","Renan","André","Thiago","Henrique"];
    const last  = ["Silva","Souza","Santos","Oliveira","Pereira","Lima","Costa","Ribeiro","Carvalho","Almeida","Gomes","Rocha","Martins","Ferreira"];

    return pos.map((p, i) => {
      const age = randInt(17, 35);
      const overall = Math.min(85, Math.max(55, base + randInt(-3, 12)));
      return {
        id: `${clubId}_p${i+1}`,
        name: `${choose(first)} ${choose(last)}`,
        pos: p,
        age,
        overall,
        form: randInt(-2, 2)
      };
    });
  }

  function buildDefaultXI(players, formation) {
    const by = {
      GK: players.filter(x => x.pos==="GK").sort((a,b)=>b.overall-a.overall),
      DEF: players.filter(x => x.pos==="DEF").sort((a,b)=>b.overall-a.overall),
      MID: players.filter(x => x.pos==="MID").sort((a,b)=>b.overall-a.overall),
      ATT: players.filter(x => x.pos==="ATT").sort((a,b)=>b.overall-a.overall)
    };

    const need = formation==="4-4-2"
      ? { GK:1, DEF:4, MID:4, ATT:2 }
      : { GK:1, DEF:4, MID:3, ATT:3 };

    const xi = [];
    ["GK","DEF","MID","ATT"].forEach(k => {
      for (let i=0;i<need[k];i++) if (by[k][i]) xi.push(by[k][i].id);
    });
    return xi;
  }

  function ensureSystems(save) {
    save.squad = save.squad || {};
    save.tactics = save.tactics || {};
    save.training = save.training || {};

    if (!Array.isArray(save.squad.players) || save.squad.players.length===0) {
      save.squad.players = generateSquadForClub(save.career.clubId);
    }
    if (!save.tactics.formation) save.tactics.formation = "4-3-3";
    if (!Array.isArray(save.tactics.startingXI) || save.tactics.startingXI.length===0) {
      save.tactics.startingXI = buildDefaultXI(save.squad.players, save.tactics.formation);
    }

    if (!save.training.weekPlan) save.training.weekPlan = "Equilibrado";
    return save;
  }

  function teamOverall(players, xiIds) {
    const set = new Set(xiIds||[]);
    const xi = players.filter(p => set.has(p.id));
    if (!xi.length) return 0;
    return Math.round(xi.reduce((s,p)=>s+p.overall,0)/xi.length);
  }

  /* =======================
     VIEWS PARTE 4
     ======================= */
  function viewSquad() {
    return requireSave(save => {
      ensureSystems(save);
      const club = getClub(save.career.clubId);
      const players = save.squad.players;

      const rows = players
        .sort((a,b)=>b.overall-a.overall)
        .map(p => `
          <tr>
            <td>${esc(p.name)}</td>
            <td class="center">${esc(p.pos)}</td>
            <td class="center">${esc(p.age)}</td>
            <td class="center"><b>${esc(p.overall)}</b></td>
            <td class="center">${p.form>0?`+${p.form}`:p.form}</td>
          </tr>
        `).join("");

      writeSlot(state.settings.activeSlotId, save);

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Elenco</div>
              <div class="card-subtitle">${esc(club?.name || "")} • OVR XI: ${teamOverall(players, save.tactics.startingXI)}</div>
            </div>
          </div>
          <div class="card-body">
            <table class="table">
              <thead>
                <tr>
                  <th>Jogador</th><th class="center">Pos</th><th class="center">Idade</th><th class="center">OVR</th><th class="center">Forma</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Voltar</button>
          </div>
        </div>`;
    });
  }

  function viewTactics() {
    return requireSave(save => {
      ensureSystems(save);
      const players = save.squad.players;

      const formation = save.tactics.formation;
      const ovr = teamOverall(players, save.tactics.startingXI);

      writeSlot(state.settings.activeSlotId, save);

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Tática</div>
              <div class="card-subtitle">Formação: ${esc(formation)} • OVR XI: ${ovr}</div>
            </div>
          </div>
          <div class="card-body">
            <div class="row">
              <select class="input" data-formation>
                <option value="4-3-3" ${formation==="4-3-3"?"selected":""}>4-3-3</option>
                <option value="4-4-2" ${formation==="4-4-2"?"selected":""}>4-4-2</option>
              </select>
              <button class="btn btn-primary" data-autoxi>Auto-escalar</button>
            </div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Voltar</button>
          </div>
        </div>`;
    });
  }

  function viewTraining() {
    return requireSave(save => {
      ensureSystems(save);
      const plan = save.training.weekPlan;

      writeSlot(state.settings.activeSlotId, save);

      return `
        <div class="card">
          <div class="card-header"><div class="card-title">Treinos</div></div>
          <div class="card-body">
            <div class="row">
              <select class="input" data-plan>
                <option value="Leve" ${plan==="Leve"?"selected":""}>Leve</option>
                <option value="Equilibrado" ${plan==="Equilibrado"?"selected":""}>Equilibrado</option>
                <option value="Intenso" ${plan==="Intenso"?"selected":""}>Intenso</option>
              </select>
              <button class="btn btn-primary" data-apply>Aplicar treino</button>
            </div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Voltar</button>
          </div>
        </div>`;
    });
  }

  function viewSave() {
    return requireSave(save => {
      save.meta.updatedAt = nowIso();
      writeSlot(state.settings.activeSlotId, save);
      return `
        <div class="card">
          <div class="card-body">
            <div class="notice">Salvo com sucesso!</div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Voltar</button>
          </div>
        </div>`;
    });
  }

  function viewAdmin() {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Admin</div></div>
        <div class="card-body">
          <div class="notice">Painel Admin completo virá na Parte 6.</div>
          <button class="btn btn-primary" data-go="/home">Menu</button>
        </div>
      </div>`;
  }

  /* =======================
     EVENTS
     ======================= */
  function bindEvents() {
    document.querySelectorAll("[data-go]").forEach(b => {
      b.addEventListener("click", () => go(b.getAttribute("data-go")));
    });

    // DLC select
    document.querySelectorAll("[data-pack]").forEach(b => {
      b.addEventListener("click", async () => {
        state.settings.selectedPackId = b.getAttribute("data-pack");
        saveSettings();
        await loadPackData();
        go("/slots");
      });
    });

    // Slots
    document.querySelectorAll("[data-slot]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-slot");
        state.settings.activeSlotId = Number(id);
        saveSettings();

        let save = readSlot(id);
        if (!save) {
          save = {
            meta: { createdAt: nowIso(), updatedAt: nowIso(), summary: "Nova carreira" },
            career: { coachName: "", nationality: "Brasil", clubId: null }
          };
          writeSlot(id, save);
        }
        go("/career-create");
      });
    });

    document.querySelectorAll("[data-del]").forEach(b => {
      b.addEventListener("click", () => {
        clearSlot(b.getAttribute("data-del"));
        route();
      });
    });

    // Career fields
    document.querySelectorAll("[data-field]").forEach(inp => {
      inp.addEventListener("input", () => {
        const save = activeSave();
        if (!save) return;
        save.career[inp.getAttribute("data-field")] = inp.value;
        save.meta.updatedAt = nowIso();
        writeSlot(state.settings.activeSlotId, save);
      });
    });

    // Club pick
    document.querySelectorAll("[data-club]").forEach(b => {
      b.addEventListener("click", () => {
        const save = activeSave();
        if (!save) return;
        save.career.clubId = b.getAttribute("data-club");
        save.meta.summary = `Carreira • ${getClub(save.career.clubId)?.name || "Clube"}`;
        save.meta.updatedAt = nowIso();
        writeSlot(state.settings.activeSlotId, save);
        go("/tutorial");
      });
    });

    // Tactics
    const formationSel = document.querySelector("[data-formation]");
    const autoBtn = document.querySelector("[data-autoxi]");
    if (formationSel) {
      formationSel.addEventListener("change", () => {
        const save = activeSave();
        if (!save) return;
        ensureSystems(save);
        save.tactics.formation = formationSel.value;
        save.tactics.startingXI = buildDefaultXI(save.squad.players, save.tactics.formation);
        save.meta.updatedAt = nowIso();
        writeSlot(state.settings.activeSlotId, save);
        route();
      });
    }
    if (autoBtn) {
      autoBtn.addEventListener("click", () => {
        const save = activeSave();
        if (!save) return;
        ensureSystems(save);
        save.tactics.startingXI = buildDefaultXI(save.squad.players, save.tactics.formation);
        save.meta.updatedAt = nowIso();
        writeSlot(state.settings.activeSlotId, save);
        route();
      });
    }

    // Training
    const planSel = document.querySelector("[data-plan]");
    const applyBtn = document.querySelector("[data-apply]");
    if (planSel) {
      planSel.addEventListener("change", () => {
        const save = activeSave();
        if (!save) return;
        ensureSystems(save);
        save.training.weekPlan = planSel.value;
        save.meta.updatedAt = nowIso();
        writeSlot(state.settings.activeSlotId, save);
      });
    }
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        const save = activeSave();
        if (!save) return;
        ensureSystems(save);

        const boost = save.training.weekPlan==="Intenso" ? 1 : save.training.weekPlan==="Leve" ? 0.3 : 0.6;
        save.squad.players = save.squad.players.map(p => {
          const nf = Math.max(-5, Math.min(5, (p.form || 0) + (Math.random()*boost)));
          return { ...p, form: Math.round(nf*10)/10 };
        });

        save.meta.updatedAt = nowIso();
        writeSlot(state.settings.activeSlotId, save);
        alert("Treino aplicado!");
        route();
      });
    }
  }

  /* =======================
     BOOT
     ======================= */
  async function boot() {
    ensureSlots();
    await loadPacks();
    await loadPackData();
    if (!location.hash) location.hash = "#/home";
    route();
  }

  boot();
})();