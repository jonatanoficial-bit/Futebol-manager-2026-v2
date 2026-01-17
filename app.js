(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }
  function nowIso() { return new Date().toISOString(); }

  const LS = {
    SETTINGS: "vfm26_settings",
    SLOT_PREFIX: "vfm26_slot_",
  };

  const state = {
    settings: loadSettings(),
    packs: [],
    packData: null, // { manifest, clubs, competitions, rules, seasons, players }
    ui: { loading: false, error: null }
  };

  function defaultSettings() {
    return {
      selectedPackId: null,
      lastRoute: "#/home",
      activeSlotId: null,
      slots: {}
    };
  }
  function loadSettings() {
    const raw = localStorage.getItem(LS.SETTINGS);
    const parsed = safeJsonParse(raw, null);
    return parsed && typeof parsed === "object" ? { ...defaultSettings(), ...parsed } : defaultSettings();
  }
  function saveSettings() {
    localStorage.setItem(LS.SETTINGS, JSON.stringify(state.settings));
  }

  function slotKey(slotId) { return `${LS.SLOT_PREFIX}${slotId}`; }
  function readSlot(slotId) {
    const raw = localStorage.getItem(slotKey(slotId));
    return safeJsonParse(raw, null);
  }
  function writeSlot(slotId, data) {
    localStorage.setItem(slotKey(slotId), JSON.stringify(data));
    state.settings.slots[String(slotId)] = {
      updatedAt: data?.meta?.updatedAt || nowIso(),
      hasSave: true,
      summary: data?.meta?.summary || "Carreira salva"
    };
    saveSettings();
  }
  function clearSlot(slotId) {
    localStorage.removeItem(slotKey(slotId));
    state.settings.slots[String(slotId)] = {
      updatedAt: nowIso(),
      hasSave: false,
      summary: "Vazio"
    };
    saveSettings();
  }
  function ensureSlotsMin2() {
    for (const id of ["1", "2"]) {
      if (!state.settings.slots[id]) {
        const hasSave = !!readSlot(id);
        state.settings.slots[id] = {
          updatedAt: hasSave ? (readSlot(id)?.meta?.updatedAt || nowIso()) : nowIso(),
          hasSave,
          summary: hasSave ? (readSlot(id)?.meta?.summary || "Carreira salva") : "Vazio"
        };
      }
    }
    saveSettings();
  }

  // -----------------------------
  // Data Loading
  // -----------------------------
  async function loadPacks() {
    state.ui.loading = true;
    state.ui.error = null;
    render();

    try {
      const res = await fetch("./data/packs.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar /data/packs.json");
      const json = await res.json();
      state.packs = Array.isArray(json?.packs) ? json.packs : [];

      if (state.settings.selectedPackId) {
        const pack = state.packs.find(p => p.id === state.settings.selectedPackId);
        if (!pack) state.settings.selectedPackId = null;
      }
      saveSettings();
    } catch (e) {
      state.ui.error = e?.message || String(e);
      state.packs = [];
    } finally {
      state.ui.loading = false;
      render();
    }
  }

  async function fetchJsonOrNull(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function fallbackPackData(packId) {
    // fallback mínimo caso falte arquivo: evita travar o app
    return {
      manifest: { id: packId, name: "Pack", version: "0.0.0", files: {} },
      clubs: { clubs: [] },
      competitions: { leagues: [], cups: [] },
      rules: { leagueRules: { pointsWin:3, pointsDraw:1, pointsLoss:0, tieBreakers:["points"] } },
      seasons: { seasons: [{ id:"2025_2026", name:"Temporada 2025/2026", default:true, competitions:[] }] },
      players: { players: [] }
    };
  }

  async function loadSelectedPackData() {
    const packId = state.settings.selectedPackId;
    if (!packId) { state.packData = null; return; }

    const pack = state.packs.find(p => p.id === packId);
    if (!pack) { state.packData = null; return; }

    state.ui.loading = true;
    state.ui.error = null;
    render();

    try {
      const manifest = await fetchJsonOrNull(pack.path);
      if (!manifest) throw new Error("Manifest do pack não encontrado.");

      const files = manifest.files || {};
      const clubs = await fetchJsonOrNull(files.clubs) || { clubs: [] };
      const competitions = await fetchJsonOrNull(files.competitions) || { leagues: [], cups: [] };
      const rules = await fetchJsonOrNull(files.rules) || fallbackPackData(packId).rules;
      const seasons = await fetchJsonOrNull(files.seasons) || fallbackPackData(packId).seasons;
      const players = await fetchJsonOrNull(files.players) || { players: [] };

      state.packData = { manifest, clubs, competitions, rules, seasons, players };
    } catch (e) {
      state.ui.error = e?.message || String(e);
      state.packData = fallbackPackData(packId);
    } finally {
      state.ui.loading = false;
      render();
    }
  }

  // -----------------------------
  // Router
  // -----------------------------
  const routes = {
    "/home": viewHome,
    "/dlc": viewDlc,
    "/slots": viewSlots,
    "/club-pick": viewClubPick,
    "/admin": viewAdmin,
    "/not-found": viewNotFound,
  };

  function getRoutePath() {
    const hash = location.hash || "#/home";
    const cleaned = hash.replace("#", "");
    return cleaned.startsWith("/") ? cleaned : "/home";
  }
  function go(path) { location.hash = `#${path}`; }

  window.addEventListener("hashchange", () => {
    state.settings.lastRoute = location.hash || "#/home";
    saveSettings();
    render();
  });

  document.addEventListener("click", (ev) => {
    if (ev.target && ev.target.id === "btnGoHome") go("/home");
  });

  function setView(html) {
    $("#view").innerHTML = html;
    bindViewEvents();
  }

  function render() {
    ensureSlotsMin2();
    const path = getRoutePath();
    const handler = routes[path] || routes["/not-found"];
    setView(handler());
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -----------------------------
  // Views
  // -----------------------------
  function viewHome() {
    const packLabel = state.settings.selectedPackId
      ? (state.packs.find(p => p.id === state.settings.selectedPackId)?.name || state.settings.selectedPackId)
      : "Nenhum pacote selecionado";

    const slotLabel = state.settings.activeSlotId ? `Slot ${state.settings.activeSlotId}` : "Nenhum slot ativo";

    return `
      <div class="grid">
        <div class="col-12 card">
          <div class="card-header">
            <div>
              <div class="card-title">Menu Principal</div>
              <div class="card-subtitle">Fluxo: DLC → Slots → Clube → (Parte 3+ carreira completa)</div>
            </div>
            <span class="badge">VFM 2026</span>
          </div>
          <div class="card-body">
            ${state.ui.error ? `<div class="notice">⚠️ ${esc(state.ui.error)}</div><div class="sep"></div>` : ""}

            <div class="kv"><span class="small">Pacote</span><b>${esc(packLabel)}</b></div>
            <div style="height:10px"></div>
            <div class="kv"><span class="small">Progresso</span><b>${esc(slotLabel)}</b></div>

            <div class="sep"></div>

            <div class="row">
              <button class="btn btn-primary" data-go="/dlc" type="button">Iniciar Carreira</button>
              <button class="btn" data-go="/admin" type="button">Admin</button>
              <button class="btn btn-ghost" data-action="reloadPacks" type="button">Recarregar Dados</button>
            </div>

            <div class="sep"></div>

            <div class="notice">
              ✅ Parte 2 adicionou: clubes Série A/B (40) + tela de escolha de clube com busca/filtro.<br/>
              Próximo: Parte 3 = criação do treinador/avatar/nacionalidade + tutorial + hub.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function viewDlc() {
    const loading = state.ui.loading;
    const packs = state.packs;

    const list = packs.length
      ? packs.map(p => {
        const selected = p.id === state.settings.selectedPackId;
        return `
          <div class="item">
            <div class="item-left">
              <div class="item-title">${esc(p.name)} ${selected ? "✅" : ""}</div>
              <div class="item-sub">v${esc(p.version)} • ${esc(p.description || "")}</div>
            </div>
            <div class="item-right">
              <button class="btn ${selected ? "btn-ghost" : "btn-primary"}" data-action="selectPack" data-pack="${esc(p.id)}" type="button">
                ${selected ? "Selecionado" : "Selecionar"}
              </button>
            </div>
          </div>
        `;
      }).join("")
      : `<div class="notice">Nenhum pack encontrado. Clique em “Recarregar Dados”.</div>`;

    const selectedOk = !!state.settings.selectedPackId;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Escolher Pacote de Dados (DLC)</div>
            <div class="card-subtitle">Dados vêm de <b>/data/*.json</b> (DLC). Carregamento robusto (sem quebrar).</div>
          </div>
          <span class="badge">${loading ? "Carregando..." : "Pronto"}</span>
        </div>
        <div class="card-body">
          ${state.ui.error ? `<div class="notice">⚠️ ${esc(state.ui.error)}</div><div class="sep"></div>` : ""}
          <div class="list">${list}</div>

          <div class="sep"></div>

          <div class="row">
            <button class="btn" data-go="/home" type="button">Voltar</button>
            <button class="btn btn-primary" data-action="goSlots" type="button" ${selectedOk ? "" : "disabled"}>
              Continuar (Slots)
            </button>
            <button class="btn btn-ghost" data-action="reloadPacks" type="button">Recarregar Packs</button>
          </div>

          ${!selectedOk ? `<div class="sep"></div><div class="notice">Selecione um pacote para continuar.</div>` : ""}
        </div>
      </div>
    `;
  }

  function viewSlots() {
    const pack = state.packs.find(p => p.id === state.settings.selectedPackId) || null;
    return `
      <div class="grid">
        <div class="col-12 card">
          <div class="card-header">
            <div>
              <div class="card-title">Slots de Salvamento</div>
              <div class="card-subtitle">Mínimo 2 slots • Tudo salvo no LocalStorage</div>
            </div>
            <span class="badge">Pack: ${esc(pack?.name || "Nenhum")}</span>
          </div>

          <div class="card-body">
            ${!pack ? `
              <div class="notice">⚠️ Nenhum pacote selecionado. Volte e escolha um DLC.</div>
              <div class="sep"></div>
              <button class="btn btn-primary" data-go="/dlc" type="button">Escolher DLC</button>
            ` : `
              <div class="list">
                ${renderSlotCard(1)}
                ${renderSlotCard(2)}
                ${renderSlotCard(3)}
              </div>

              <div class="sep"></div>

              <div class="row">
                <button class="btn" data-go="/dlc" type="button">Voltar</button>
                <button class="btn btn-ghost" data-go="/home" type="button">Menu</button>
              </div>

              <div class="sep"></div>
              <div class="notice">
                Parte 2: “Novo/Continuar” leva para <b>Escolha de Clube</b> (com busca + filtro).
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function renderSlotCard(slotId) {
    const meta = state.settings.slots[String(slotId)];
    const hasSave = !!readSlot(slotId);

    const title = `Slot ${slotId}`;
    const sub = hasSave ? (meta?.summary || "Carreira salva") : "Vazio";
    const updated = meta?.updatedAt ? new Date(meta.updatedAt).toLocaleString("pt-BR") : "-";

    return `
      <div class="item">
        <div class="item-left">
          <div class="item-title">${esc(title)} ${hasSave ? "💾" : "🆕"}</div>
          <div class="item-sub">${esc(sub)} • Atualizado: ${esc(updated)}</div>
        </div>
        <div class="item-right">
          <button class="btn btn-primary" data-action="${hasSave ? "continueSlot" : "newSlot"}" data-slot="${slotId}" type="button">
            ${hasSave ? "Continuar" : "Novo"}
          </button>
          <button class="btn btn-danger" data-action="deleteSlot" data-slot="${slotId}" type="button">Apagar</button>
        </div>
      </div>
    `;
  }

  function viewClubPick() {
    const pack = state.packs.find(p => p.id === state.settings.selectedPackId) || null;
    const slotId = state.settings.activeSlotId;
    const save = slotId ? readSlot(slotId) : null;

    const pd = state.packData;
    const clubs = pd?.clubs?.clubs || [];
    const leagues = pd?.competitions?.leagues || [];

    const currentLeague = save?.career?.leagueFilter || "BRA_SERIE_A";
    const q = save?.career?.clubSearch || "";

    const leagueOptions = leagues
      .filter(l => l.id === "BRA_SERIE_A" || l.id === "BRA_SERIE_B") // Parte 2: foco Brasil (pedido)
      .map(l => `<option value="${esc(l.id)}" ${l.id === currentLeague ? "selected" : ""}>${esc(l.name)}</option>`)
      .join("");

    const filtered = clubs
      .filter(c => c.leagueId === currentLeague)
      .filter(c => {
        if (!q.trim()) return true;
        const s = q.trim().toLowerCase();
        return (c.name || "").toLowerCase().includes(s) || (c.short || "").toLowerCase().includes(s);
      });

    const listHtml = filtered.length
      ? filtered.map(c => {
        const initials = (c.short || c.name || "CLB").slice(0, 3).toUpperCase();
        return `
          <div class="item">
            <div class="item-left" style="display:flex; gap:12px; align-items:center;">
              <div class="club-logo">
                <img src="./assets/logos/${esc(c.id)}.png" alt="${esc(c.name)}"
                     onerror="this.remove(); this.parentElement.innerHTML='<div class=&quot;club-fallback&quot;>${esc(initials)}</div>';">
              </div>
              <div style="min-width:0;">
                <div class="item-title">${esc(c.name)}</div>
                <div class="item-sub">${esc(c.short)} • Overall ${esc(c.overall)} • Orçamento ${esc(Math.round((c.budget||0)/1000000))}M</div>
              </div>
            </div>
            <div class="item-right">
              <button class="btn btn-primary" data-action="pickClub" data-club="${esc(c.id)}" type="button">Escolher</button>
            </div>
          </div>
        `;
      }).join("")
      : `<div class="notice">Nenhum clube encontrado com esse filtro.</div>`;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Escolha de Clube</div>
            <div class="card-subtitle">Busca + filtro • Logos em <b>/assets/logos/{id}.png</b> (fallback automático)</div>
          </div>
          <span class="badge">Slot: ${esc(slotId || "-")} • Pack: ${esc(pack?.name || "-")}</span>
        </div>

        <div class="card-body">
          ${(!pack || !slotId) ? `
            <div class="notice">⚠️ Selecione um pack e um slot antes.</div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/dlc" type="button">Ir para DLC</button>
            <button class="btn" data-go="/slots" type="button">Ir para Slots</button>
          ` : `
            <div class="grid">
              <div class="col-6">
                <div class="label">Liga (Brasil)</div>
                <select class="input" data-action="setLeagueFilter">
                  ${leagueOptions}
                </select>
              </div>
              <div class="col-6">
                <div class="label">Buscar clube</div>
                <input class="input" value="${esc(q)}" placeholder="Ex: Flamengo, PAL, Santos..." data-action="clubSearchInput" />
              </div>
            </div>

            <div class="sep"></div>

            <div class="list">
              ${listHtml}
            </div>

            <div class="sep"></div>

            <div class="row">
              <button class="btn" data-go="/slots" type="button">Voltar</button>
              <button class="btn btn-ghost" data-go="/home" type="button">Menu</button>
            </div>

            <div class="sep"></div>
            <div class="notice">
              ✅ Série A (20) + Série B (20) já estão no JSON do pack base. 2<br/>
              Na Parte 3: criar treinador (nome/nacionalidade/avatar) + tutorial + hub.
            </div>
          `}
        </div>
      </div>
    `;
  }

  function viewAdmin() {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Admin (placeholder funcional)</div>
            <div class="card-subtitle">Parte 6: CRUD completo + export JSON sem quebrar saves</div>
          </div>
          <span class="badge">Offline</span>
        </div>
        <div class="card-body">
          <div class="notice">
            Parte 2 preparou ligas principais SA/EU no <b>competitions.json</b> (estrutura pronta).<br/>
            Parte 6 será o painel completo.
          </div>
          <div class="sep"></div>
          <div class="row">
            <button class="btn btn-primary" data-action="adminTestWrite" type="button">Testar gravação Admin</button>
            <button class="btn" data-go="/home" type="button">Voltar</button>
          </div>
        </div>
      </div>
    `;
  }

  function viewNotFound() {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Rota não encontrada</div>
            <div class="card-subtitle">Sem tela vazia — volte com um clique</div>
          </div>
        </div>
        <div class="card-body">
          <div class="notice">A rota <b>${esc(getRoutePath())}</b> não existe.</div>
          <div class="sep"></div>
          <button class="btn btn-primary" data-go="/home" type="button">Voltar ao Menu</button>
        </div>
      </div>
    `;
  }

  // -----------------------------
  // Events
  // -----------------------------
  function bindViewEvents() {
    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.addEventListener("click", () => go(btn.getAttribute("data-go")));
    });

    document.querySelectorAll("[data-action]").forEach(el => {
      const action = el.getAttribute("data-action");

      if (action === "clubSearchInput") {
        el.addEventListener("input", () => {
          const slotId = state.settings.activeSlotId;
          if (!slotId) return;
          const save = readSlot(slotId);
          if (!save) return;
          save.career = save.career || {};
          save.career.clubSearch = el.value || "";
          save.meta.updatedAt = nowIso();
          writeSlot(slotId, save);
          render();
        });
        return;
      }

      if (action === "setLeagueFilter") {
        el.addEventListener("change", () => {
          const slotId = state.settings.activeSlotId;
          if (!slotId) return;
          const save = readSlot(slotId);
          if (!save) return;
          save.career = save.career || {};
          save.career.leagueFilter = el.value;
          save.career.clubSearch = "";
          save.meta.updatedAt = nowIso();
          writeSlot(slotId, save);
          render();
        });
        return;
      }

      el.addEventListener("click", async () => {
        const slot = el.getAttribute("data-slot");
        const packId = el.getAttribute("data-pack");
        const clubId = el.getAttribute("data-club");

        try {
          if (action === "reloadPacks") {
            await loadPacks();
            await loadSelectedPackData();
            return;
          }

          if (action === "selectPack") {
            state.settings.selectedPackId = packId;
            saveSettings();
            await loadSelectedPackData();
            render();
            return;
          }

          if (action === "goSlots") {
            if (!state.settings.selectedPackId) {
              state.ui.error = "Selecione um pacote antes de continuar.";
              render();
              return;
            }
            await loadSelectedPackData();
            go("/slots");
            return;
          }

          if (action === "newSlot") {
            const slotId = Number(slot);
            state.settings.activeSlotId = slotId;
            saveSettings();

            const pack = state.packs.find(p => p.id === state.settings.selectedPackId);
            const saveObj = {
              meta: {
                createdAt: nowIso(),
                updatedAt: nowIso(),
                slotId,
                packId: state.settings.selectedPackId,
                summary: `Carreira • ${pack?.name || state.settings.selectedPackId}`
              },
              career: {
                coachName: "Treinador(a)",
                nationality: "Brasil",
                avatarId: "default",
                role: "Treinador",
                clubId: null,
                leagueFilter: "BRA_SERIE_A",
                clubSearch: ""
              },
              progress: { step: "club_pick" }
            };

            writeSlot(slotId, saveObj);
            state.ui.error = null;
            await loadSelectedPackData();
            go("/club-pick");
            return;
          }

          if (action === "continueSlot") {
            const slotId = Number(slot);
            const data = readSlot(slotId);
            if (!data) {
              state.ui.error = "Slot não encontrado. Tente criar um novo.";
              render();
              return;
            }
            state.settings.activeSlotId = slotId;
            saveSettings();
            await loadSelectedPackData();
            go("/club-pick");
            return;
          }

          if (action === "deleteSlot") {
            clearSlot(Number(slot));
            state.ui.error = null;
            render();
            return;
          }

          if (action === "pickClub") {
            const slotId = state.settings.activeSlotId;
            const save = slotId ? readSlot(slotId) : null;
            if (!save) { state.ui.error = "Slot inválido."; render(); return; }

            const clubs = state.packData?.clubs?.clubs || [];
            const club = clubs.find(c => c.id === clubId);
            if (!club) { state.ui.error = "Clube não encontrado."; render(); return; }

            save.career.clubId = club.id;
            save.progress.step = "club_selected_part2";
            save.meta.updatedAt = nowIso();
            save.meta.summary = `Carreira • ${club.name} • Pack ${save.meta.packId}`;

            writeSlot(slotId, save);

            alert(`Clube escolhido: ${club.name}\n\n(Parte 3: vamos criar o treinador completo + tutorial + HUB.)`);
            go("/home");
            return;
          }

          if (action === "adminTestWrite") {
            localStorage.setItem("vfm26_admin_test", JSON.stringify({ ok: true, at: nowIso() }));
            alert("Admin teste: gravou no LocalStorage com sucesso.");
            return;
          }

        } catch (e) {
          state.ui.error = e?.message || String(e);
          render();
        }
      });
    });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot() {
    ensureSlotsMin2();
    if (!location.hash) location.hash = "#/home";
    await loadPacks();
    await loadSelectedPackData();
    render();
  }

  boot();
})();