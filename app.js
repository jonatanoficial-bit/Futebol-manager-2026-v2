/* Vale Futebol Manager 2026 - Parte 1
   - Router SPA hash (#/home etc)
   - Home + DLC + Slots
   - Save/Load LocalStorage (2+ slots)
   - Zero tela vazia: sempre renderiza algo, inclusive em erro
*/

(() => {
  "use strict";

  // -----------------------------
  // Utils
  // -----------------------------
  const $ = (sel) => document.querySelector(sel);

  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // -----------------------------
  // Storage Keys
  // -----------------------------
  const LS = {
    SETTINGS: "vfm26_settings",
    SLOT_PREFIX: "vfm26_slot_", // vfm26_slot_1 / 2 / 3...
  };

  // -----------------------------
  // App State (runtime)
  // -----------------------------
  const state = {
    settings: loadSettings(),
    packs: [],
    ui: {
      loading: false,
      error: null,
    }
  };

  function defaultSettings() {
    return {
      selectedPackId: null,
      lastRoute: "#/home",
      slots: {
        // Slot metadata cache (opcional)
        // "1": { updatedAt, hasSave, summary }
      }
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

  function slotKey(slotId) {
    return `${LS.SLOT_PREFIX}${slotId}`;
  }

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
    // garante ao menos 2 slots no cache de settings
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
  // Data Loading (packs.json + manifest)
  // - Parte 1: só lista pack(s) e valida manifest.
  // - Não quebra se arquivos finais ainda não existirem.
  // -----------------------------
  async function loadPacks() {
    state.ui.loading = true;
    state.ui.error = null;
    render(); // nunca fica vazio

    try {
      const res = await fetch("./data/packs.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar /data/packs.json");
      const json = await res.json();
      const packs = Array.isArray(json?.packs) ? json.packs : [];
      state.packs = packs;

      // tenta pré-validar manifest do pack selecionado (sem travar)
      if (state.settings.selectedPackId) {
        const pack = packs.find(p => p.id === state.settings.selectedPackId);
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

  async function loadPackManifest(pack) {
    // carrega manifest do pack escolhido (se falhar, mostra erro mas não quebra)
    const res = await fetch(pack.path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao carregar manifest do pack: ${pack.name}`);
    return await res.json();
  }

  // -----------------------------
  // Router (hash)
  // -----------------------------
  const routes = {
    "/home": viewHome,
    "/dlc": viewDlc,
    "/slots": viewSlots,
    "/admin": viewAdmin,
    "/not-found": viewNotFound,
  };

  function getRoutePath() {
    const hash = location.hash || "#/home";
    const cleaned = hash.replace("#", "");
    return cleaned.startsWith("/") ? cleaned : "/home";
  }

  function go(path) {
    location.hash = `#${path}`;
  }

  window.addEventListener("hashchange", () => {
    state.settings.lastRoute = location.hash || "#/home";
    saveSettings();
    render();
  });

  // Topbar button
  document.addEventListener("click", (ev) => {
    if (ev.target && ev.target.id === "btnGoHome") go("/home");
  });

  // -----------------------------
  // Render Engine
  // -----------------------------
  function setView(html) {
    $("#view").innerHTML = html;
    bindViewEvents();
  }

  function render() {
    ensureSlotsMin2();

    const path = getRoutePath();
    const handler = routes[path] || routes["/not-found"];

    // Sempre renderiza algo:
    const html = handler();
    setView(html);
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

    return `
      <div class="grid">
        <div class="col-12 card">
          <div class="card-header">
            <div>
              <div class="card-title">Menu Principal</div>
              <div class="card-subtitle">Escolha uma opção para começar. Nada aqui fica sem ação.</div>
            </div>
            <span class="badge">Roteamento: Hash SPA</span>
          </div>
          <div class="card-body">
            ${state.ui.error ? `<div class="notice">⚠️ ${esc(state.ui.error)}</div><div class="sep"></div>` : ""}

            <div class="kv">
              <span class="small">Pacote de Dados (DLC)</span>
              <b>${esc(packLabel)}</b>
            </div>

            <div class="sep"></div>

            <div class="row">
              <button class="btn btn-primary" data-go="/dlc" type="button">Iniciar Carreira</button>
              <button class="btn" data-go="/admin" type="button">Admin</button>
              <button class="btn btn-ghost" data-action="reloadPacks" type="button" title="Recarregar /data/packs.json">Recarregar Dados</button>
            </div>

            <div class="sep"></div>

            <div class="notice">
              ✅ Sem telas em branco • ✅ Sem dependências • ✅ GitHub Pages/Vercel friendly<br/>
              Próximo passo: selecionar DLC → escolher Slot → (Parte 2+) criação de carreira e escolha de clube.
            </div>
          </div>
        </div>

        <div class="col-12 card">
          <div class="card-header">
            <div>
              <div class="card-title">Status rápido</div>
              <div class="card-subtitle">Informações do sistema para evitar qualquer travamento.</div>
            </div>
          </div>
          <div class="card-body">
            <div class="list">
              <div class="item">
                <div class="item-left">
                  <div class="item-title">Packs carregados</div>
                  <div class="item-sub">${state.ui.loading ? "Carregando..." : `${state.packs.length} encontrado(s)`}</div>
                </div>
                <div class="item-right">
                  <span class="badge">/data/packs.json</span>
                </div>
              </div>

              <div class="item">
                <div class="item-left">
                  <div class="item-title">Slots mínimos</div>
                  <div class="item-sub">2 slots garantidos (LocalStorage)</div>
                </div>
                <div class="item-right">
                  <span class="badge">Slot 1</span>
                  <span class="badge">Slot 2</span>
                </div>
              </div>
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
      : `<div class="notice">Nenhum pack encontrado. Clique em “Recarregar Dados” no menu inicial.</div>`;

    const selectedOk = !!state.settings.selectedPackId;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Escolher Pacote de Dados (DLC)</div>
            <div class="card-subtitle">Os dados vêm de <b>/data/*.json</b>. Estrutura pronta para múltiplos pacotes.</div>
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
                Na Parte 2, “Novo” vai levar para: Criar Carreira → Escolher Clube (JSON) → Tutorial → Hub.
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
          <button class="btn btn-danger" data-action="deleteSlot" data-slot="${slotId}" type="button">
            Apagar
          </button>
        </div>
      </div>
    `;
  }

  function viewAdmin() {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Admin (Parte 1: placeholder funcional)</div>
            <div class="card-subtitle">Aqui vai o painel completo CRUD + export JSON na Parte 6.</div>
          </div>
          <span class="badge">Sem backend</span>
        </div>
        <div class="card-body">
          <div class="notice">
            ✅ Este botão funciona e não quebra nada.<br/>
            Na Parte 6: criar/editar clubes, ligas, competições e elencos, gerar JSON sem mexer no código principal.
          </div>

          <div class="sep"></div>

          <div class="row">
            <button class="btn btn-primary" data-action="adminTestWrite" type="button">Testar gravação Admin</button>
            <button class="btn" data-go="/home" type="button">Voltar</button>
          </div>

          <div class="sep"></div>

          <div class="kv">
            <span class="small">Chave de teste</span>
            <b>vfm26_admin_test</b>
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
            <div class="card-subtitle">Mas sem tela vazia: você pode voltar com um clique.</div>
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
  // Bind events (delegation)
  // -----------------------------
  function bindViewEvents() {
    // navegação
    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.addEventListener("click", () => go(btn.getAttribute("data-go")));
    });

    // ações
    document.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.getAttribute("data-action");
        const slot = btn.getAttribute("data-slot");
        const packId = btn.getAttribute("data-pack");

        try {
          if (action === "reloadPacks") {
            await loadPacks();
            return;
          }

          if (action === "selectPack") {
            state.settings.selectedPackId = packId;
            saveSettings();

            // tenta validar manifest (sem travar se falhar)
            const pack = state.packs.find(p => p.id === packId);
            if (pack) {
              try { await loadPackManifest(pack); }
              catch (e) { state.ui.error = e?.message || String(e); }
            }

            render();
            return;
          }

          if (action === "goSlots") {
            if (!state.settings.selectedPackId) {
              state.ui.error = "Selecione um pacote antes de continuar.";
              render();
              return;
            }
            go("/slots");
            return;
          }

          if (action === "newSlot") {
            // Parte 1: cria um save “dummy” só pra provar fluxo
            const slotId = Number(slot);
            const pack = state.packs.find(p => p.id === state.settings.selectedPackId);
            const saveObj = {
              meta: {
                createdAt: nowIso(),
                updatedAt: nowIso(),
                slotId,
                packId: state.settings.selectedPackId,
                summary: `Carreira (mock) • Pack ${pack?.name || state.settings.selectedPackId}`
              },
              career: {
                // na Parte 3 entra treinador/avatar etc
                coachName: "Treinador(a)",
                nationality: "Brasil",
                avatarId: "default",
                role: "Treinador"
              },
              progress: {
                // na Parte 3+ entra clube, temporada, etc
                step: "created_mock_save_part1"
              }
            };

            writeSlot(slotId, saveObj);
            state.ui.error = null;
            render();
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
            // Parte 1: apenas confirma que abriu sem quebrar
            alert(`Continuando Slot ${slotId}:\n${data?.meta?.summary || "Carreira"}`);
            return;
          }

          if (action === "deleteSlot") {
            const slotId = Number(slot);
            clearSlot(slotId);
            state.ui.error = null;
            render();
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

    // rota padrão
    if (!location.hash) location.hash = "#/home";

    await loadPacks();
    render();
  }

  boot();
})();