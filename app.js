
const app = document.getElementById('app');
let state = {
 screen:'menu',
 club:null,
 round:1,
 table:[]
};

async function loadClubs(){
 return fetch('data/clubs.json').then(r=>r.json());
}

function render(){
 if(state.screen==='menu') menu();
 if(state.screen==='clubs') pickClub();
 if(state.screen==='hub') hub();
}

function menu(){
 app.innerHTML = `
 <div class="card">
 <h2>Vale Futebol Manager 2026</h2>
 <button class="green" onclick="goClubs()">Iniciar Carreira</button>
 </div>`;
}

function goClubs(){
 state.screen='clubs';
 render();
}

async function pickClub(){
 const clubs = await loadClubs();
 app.innerHTML = `
 <div class="card">
 <h3>Escolha seu clube</h3>
 <div class="list">
 ${clubs.map(c=>`
 <button onclick="selectClub('${c.id}')">${c.name}</button>
 `).join('')}
 </div>
 </div>`;
}

async function selectClub(id){
 const clubs = await loadClubs();
 state.club = clubs.find(c=>c.id===id);
 state.table = clubs.map(c=>({...c,pts:0}));
 state.screen='hub';
 render();
}

function hub(){
 app.innerHTML = `
 <div class="card">
 <h3>HUB – ${state.club.name}</h3>
 <p>Rodada ${state.round}/38</p>
 <div class="row">
 <button class="green" onclick="playRound()">Jogar Rodada</button>
 </div>
 </div>
 <div class="card">
 <h4>Tabela</h4>
 ${state.table.sort((a,b)=>b.pts-a.pts).map((c,i)=>`
 <div>${i+1}º ${c.name} - ${c.pts} pts</div>
 `).join('')}
 </div>
 `;
}

function playRound(){
 state.table.forEach(t=>{
   t.pts += Math.random()>0.5?3:0;
 });
 state.round++;
 if(state.round>38){
   alert('Fim da temporada!');
   state.round=1;
 }
 render();
}

render();
