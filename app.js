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
return parsed && typeof parsed === "object"
? { ...defaultSettings(), ...parsed }
: defaultSettings();
}

function saveSettings() {
localStorage.setItem(LS.SETTINGS, JSON.stringify(state.settings));
}

function slotKey(slotId) { return ${LS.SLOT_PREFIX}${slotId}; }

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
// DLC loading
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
return {
manifest: { id: packId, name: "Pack", version: "0.0.0", files: {} },
clubs: { clubs: [] },
competitions: { leagues: [], cups: [] },
rules: { leagueRules: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tieBreakers: ["points"] } },
seasons: { seasons: [{ id: "2025_2026", name: "Temporada 2025/2026", default: true, competitions: [] }] },
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
"/career-create": viewCareerCreate,
"/club-pick": viewClubPick,
"/tutorial": viewTutorial,
"/hub": viewHub,

// Hub sections (MVP funcional)  
"/squad": () => viewHubSection("Elenco", "Aqui vai a lista completa de jogadores (Parte 4)."),  
"/tactics": () => viewHubSection("Tática", "Formação e escalação (Parte 4)."),  
"/training": () => viewHubSection("Treinos", "Treino semanal com efeito leve (Parte 4)."),  
"/matches": () => viewHubSection("Jogos", "Calendário + simulação (Parte 5)."),  
"/competitions": () => viewHubSection("Competições", "Brasileirão + Copa do Brasil (Parte 5)."),  
"/transfers": () => viewHubSection("Transferências", "Comprar/vender (Parte 6)."),  
"/finance": () => viewHubSection("Finanças", "Saldo, gastos e premiações (Parte 6)."),  
"/save": viewSaveProgress,  

"/admin": viewAdmin,  
"/not-found": viewNotFound

};

function getRoutePath() {
const hash = location.hash || "#/home";
const cleaned = hash.replace("#", "");
return cleaned.startsWith("/") ? cleaned : "/home";
}

function go(path) { location.hash = #${path}; }

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
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

// -----------------------------
// Helpers career/save
// -----------------------------
function getActiveSaveOrNull() {
const slotId = state.settings.activeSlotId;
if (!slotId) return null;
return readSlot(slotId);
}

function requireCareerGuard(nextViewHtml) {
const save = getActiveSaveOrNull();
const packOk = !!state.settings.selectedPackId;
if (!packOk) {
return   <div class="card">   <div class="card-header"><div><div class="card-title">Atenção</div><div class="card-subtitle">Você precisa selecionar um DLC primeiro.</div></div></div>   <div class="card-body">   <div class="notice">Vá para DLC e selecione um pacote para continuar.</div>   <div class="sep"></div>   <button class="btn btn-primary" data-go="/dlc" type="button">Ir para DLC</button>   <button class="btn" data-go="/home" type="button">Menu</button>   </div>   </div>  ;
}
if (!save) {
return   <div class="card">   <div class="card-header"><div><div class="card-title">Atenção</div><div class="card-subtitle">Você precisa selecionar um Slot.</div></div></div>   <div class="card-body">   <div class="notice">Vá para Slots e crie/continue uma carreira.</div>   <div class="sep"></div>   <button class="btn btn-primary" data-go="/slots" type="button">Ir para Slots</button>   <button class="btn" data-go="/home" type="button">Menu</button>   </div>   </div>  ;
}
return nextViewHtml(save);
}

function getClubById(clubId) {
const clubs = state.packData?.clubs?.clubs || [];
return clubs.find(c => c.id === clubId) || null;
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
          <div class="card-subtitle">Fluxo completo: DLC → Slots → Criar Carreira → Clube → Tutorial → HUB</div>  
        </div>  
        <span class="badge">VFM 2026</span>  
      </div>  
      <div class="card-body">  
        ${state.ui.error ? `<div class="notice">⚠️ ${esc(state.ui.error)}</div><div class="sep"></div>` : ""}  

        <div class="kv"><span class="small">Pacote (DLC)</span><b>${esc(packLabel)}</b></div>  
        <div style="height:10px"></div>  
        <div class="kv"><span class="small">Slot ativo</span><b>${esc(slotLabel)}</b></div>  

        <div class="sep"></div>  

        <div class="row">  
          <button class="btn btn-primary" data-go="/dlc" type="button">Iniciar Carreira</button>  
          <button class="btn" data-go="/admin" type="button">Admin</button>  
          <button class="btn btn-ghost" data-action="reloadPacks" type="button">Recarregar Dados</button>  
          <button class="btn" data-go="/hub" type="button" title="Se já tiver carreira pronta">Ir para HUB</button>  
        </div>  

        <div class="sep"></div>  

        <div class="notice">  
          ✅ Parte 3 adicionou: criação do treinador + tutorial + HUB com botões funcionando.<br/>  
          Próximo: Parte 4 = elenco/tática/treinos (persistência real).  
        </div>  
      </div>  
    </div>  
  </div>  
`;

}

function viewDlc() {
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
        <div class="card-subtitle">Carregamento robusto • Base pronta para expansão via JSON</div>  
      </div>  
      <span class="badge">${state.ui.loading ? "Carregando..." : "Pronto"}</span>  
    </div>  
    <div class="card-body">  
      ${state.ui.error ? `<div class="notice">⚠️ ${esc(state.ui.error)}</div><div class="sep"></div>` : ""}  
      <div class="list">${list}</div>  

      <div class="sep"></div>  

      <div class="row">  
        <button class="btn" data-go="/home" type="button">Voltar</button>  
        <button class="btn btn-primary" data-action="goSlots" type="button" ${selectedOk ? "" : "disabled"}>Continuar (Slots)</button>  
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
          <div class="card-subtitle">Crie novo ou continue existente</div>  
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
            Parte 3: Após escolher o slot, você vai para <b>Criar Carreira</b>.  
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

// ---- PART 3: Create Career
function viewCareerCreate() {
return requireCareerGuard((save) => {
const coachName = save.career?.coachName || "";
const nationality = save.career?.nationality || "Brasil";
const avatarId = save.career?.avatarId || "a1";

const avatars = [  
    { id: "a1", label: "Avatar 1" },  
    { id: "a2", label: "Avatar 2" },  
    { id: "a3", label: "Avatar 3" },  
    { id: "a4", label: "Avatar 4" }  
  ];  

  const avatarOptions = avatars.map(a =>  
    `<option value="${esc(a.id)}" ${a.id === avatarId ? "selected" : ""}>${esc(a.label)}</option>`  
  ).join("");  

  return `  
    <div class="card">  
      <div class="card-header">  
        <div>  
          <div class="card-title">Criar Carreira</div>  
          <div class="card-subtitle">Defina seu treinador(a). Cargo inicial: <b>Treinador</b></div>  
        </div>  
        <span class="badge">Passo 1/3</span>  
      </div>  

      <div class="card-body">  
        <div class="grid">  
          <div class="col-6">  
            <div class="label">Nome do treinador</div>  
            <input class="input" data-field="coachName" value="${esc(coachName)}" placeholder="Ex: Jonatan Vale" />  
          </div>  

          <div class="col-6">  
            <div class="label">Nacionalidade</div>  
            <input class="input" data-field="nationality" value="${esc(nationality)}" placeholder="Ex: Brasil" />  
          </div>  

          <div class="col-6">  
            <div class="label">Avatar</div>  
            <select class="input" data-field="avatarId">  
              ${avatarOptions}  
            </select>  
          </div>  

          <div class="col-6">  
            <div class="label">Cargo</div>  
            <input class="input" value="Treinador" disabled />  
          </div>  
        </div>  

        <div class="sep"></div>  

        <div class="row">  
          <button class="btn" data-go="/slots" type="button">Voltar</button>  
          <button class="btn btn-primary" data-action="careerContinueToClub" type="button">Continuar (Clube)</button>  
        </div>  

        <div class="sep"></div>  

        <div class="notice">  
          ✅ Tudo é salvo no slot automaticamente conforme você digita/seleciona.  
        </div>  
      </div>  
    </div>  
  `;  
});

}

// ---- Club Pick (from Part 2, now flows to Tutorial)
function viewClubPick() {
return requireCareerGuard((save) => {
const pack = state.packs.find(p => p.id === state.settings.selectedPackId) || null;

const pd = state.packData;  
  const clubs = pd?.clubs?.clubs || [];  
  const leagues = pd?.competitions?.leagues || [];  

  const currentLeague = save?.career?.leagueFilter || "BRA_SERIE_A";  
  const q = save?.career?.clubSearch || "";  

  const leagueOptions = leagues  
    .filter(l => l.id === "BRA_SERIE_A" || l.id === "BRA_SERIE_B")  
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

  const chosenClub = save?.career?.clubId ? getClubById(save.career.clubId) : null;  

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
                <select class="input" data-action="setLeagueFilter">
                  ${leagueOptions}
                </select>
              </div>
              <div class="col-6">
                <div class="label">Buscar clube</div>
                <input class="input" value="${esc(q)}" placeholder="Digite o nome do clube" data-action="clubSearchInput" />
              </div>
            </div>

            <div class="sep"></div>

            <div class="list">
              ${listHtml}
            </div>

            ${chosenClub ? `
              <div class="sep"></div>
              <div class="notice">
                Clube selecionado: <b>${esc(chosenClub.name)}</b>
              </div>
            ` : ""}

            <div class="sep"></div>

            <div class="row">
              <button class="btn" data-go="/career-create">Voltar</button>
              <button class="btn btn-primary" data-action="confirmClub" ${chosenClub ? "" : "disabled"}>
                Continuar (Tutorial)
              </button>
            </div>
          </div>
        </div>
      `;
    });
  }
function viewTutorial() {
    return requireCareerGuard((save) => {
      const club = getClubById(save.career.clubId);

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Bem-vindo ao Vale Futebol Manager 2026</div>
              <div class="card-subtitle">Tutorial inicial</div>
            </div>
            <span class="badge">Passo 3/3</span>
          </div>

          <div class="card-body">
            <div class="notice">
              👋 Olá <b>${esc(save.career.coachName)}</b>!<br><br>
              Você foi contratado para comandar o <b>${esc(club?.name || "clube")}</b>.<br><br>

              Aqui você irá:
              <ul>
                <li>Gerenciar elenco e táticas</li>
                <li>Definir treinos semanais</li>
                <li>Disputar campeonatos nacionais e continentais</li>
                <li>Comprar e vender jogadores</li>
              </ul>

              Todas as decisões influenciam seu futuro no clube.
            </div>

            <div class="sep"></div>

            <div class="row">
              <button class="btn btn-primary" data-action="finishTutorial">
                Ir para o HUB
              </button>
            </div>
          </div>
        </div>
      `;
    });
  }
function viewHub() {
    return requireCareerGuard((save) => {
      const club = getClubById(save.career.clubId);

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">HUB do Treinador</div>
              <div class="card-subtitle">
                ${esc(club?.name || "")} • Treinador: ${esc(save.career.coachName)}
              </div>
            </div>
            <span class="badge">Temporada 2025/26</span>
          </div>

          <div class="card-body">
            <div class="grid">
              <div class="col-4"><button class="btn btn-primary" data-go="/squad">Elenco</button></div>
              <div class="col-4"><button class="btn btn-primary" data-go="/tactics">Tática</button></div>
              <div class="col-4"><button class="btn btn-primary" data-go="/training">Treinos</button></div>

              <div class="col-4"><button class="btn" data-go="/matches">Jogos</button></div>
              <div class="col-4"><button class="btn" data-go="/competitions">Competições</button></div>
              <div class="col-4"><button class="btn" data-go="/transfers">Transferências</button></div>

              <div class="col-4"><button class="btn" data-go="/finance">Finanças</button></div>
              <div class="col-4"><button class="btn" data-go="/save">Salvar Progresso</button></div>
              <div class="col-4"><button class="btn btn-danger" data-go="/home">Sair</button></div>
            </div>

            <div class="sep"></div>

            <div class="notice">
              Todas as seções já funcionam (MVP).<br>
              Parte 4 irá aprofundar elenco, tática e treinos.
            </div>
          </div>
        </div>
      `;
    });
  }
function viewHubSection(title, text) {
    return requireCareerGuard(() => `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${esc(title)}</div>
            <div class="card-subtitle">Módulo em desenvolvimento</div>
          </div>
        </div>
        <div class="card-body">
          <div class="notice">${esc(text)}</div>
          <div class="sep"></div>
          <button class="btn btn-primary" data-go="/hub">Voltar ao HUB</button>
        </div>
      </div>
    `);
  }

  function viewSaveProgress() {
    return requireCareerGuard((save) => {
      save.meta.updatedAt = nowIso();
      writeSlot(state.settings.activeSlotId, save);

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Salvar Progresso</div>
            </div>
          </div>
          <div class="card-body">
            <div class="notice">Jogo salvo com sucesso!</div>
            <div class="sep"></div>
            <button class="btn btn-primary" data-go="/hub">Voltar ao HUB</button>
          </div>
        </div>
      `;
    });
  }

  function viewAdmin() {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Admin</div></div>
        </div>
        <div class="card-body">
          <div class="notice">Painel Admin completo será implementado na Parte 6.</div>
          <div class="sep"></div>
          <button class="btn btn-primary" data-go="/home">Voltar</button>
        </div>
      </div>
    `;
  }

  function viewNotFound() {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Rota não encontrada</div></div>
        <div class="card-body">
          <button class="btn btn-primary" data-go="/home">Menu</button>
        </div>
      </div>
    `;
  }

  // -----------------------------
  // EVENTS
  // -----------------------------
  function bindViewEvents() {
    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.addEventListener("click", () => go(btn.getAttribute("data-go")));
    });

    document.querySelectorAll("[data-action]").forEach(el => {
      const action = el.getAttribute("data-action");

      if (action === "careerContinueToClub") {
        el.addEventListener("click", () => go("/club-pick"));
      }

      if (action === "confirmClub") {
        el.addEventListener("click", () => go("/tutorial"));
      }

      if (action === "finishTutorial") {
        el.addEventListener("click", () => go("/hub"));
      }
    });
  }

  async function boot() {
    ensureSlotsMin2();
    if (!location.hash) location.hash = "#/home";
    await loadPacks();
    await loadSelectedPackData();
    render();
  }

  boot();
})();