// 윷놀이 클라이언트 (전통 룰 · 3~4인 판돈 내기)
const socket = io();
const $app = document.getElementById('app');
const CHIPS = [1e6, 5e6, 1e7, 5e7, 1e8];
let me = null, room = null, lobby = [], bet = 1e7, err = '', tick = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function short(n) { n = Number(n) || 0; if (n >= 1e8) return (n / 1e8).toFixed(n % 1e8 ? 1 : 0).replace(/\.0$/, '') + '억'; if (n >= 1e4) return Math.round(n / 1e4) + '만'; return n + '원'; }

// ----- 보드 좌표 (0~100) -----
const TL = [10, 10], TR = [90, 10], BR = [90, 90], BL = [10, 90], CEN = [50, 50];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const XY = {};
for (let k = 1; k <= 4; k++) {
  XY['R' + k] = lerp(TL, TR, k / 5);
  XY['R' + (k + 5)] = lerp(TR, BR, k / 5);
  XY['R' + (k + 10)] = lerp(BR, BL, k / 5);
  XY['R' + (k + 15)] = lerp(BL, TL, k / 5);
}
XY.R5 = TR; XY.R10 = BR; XY.R15 = BL; XY.R20 = TL;
XY.A1 = lerp(TR, CEN, 1 / 3); XY.A2 = lerp(TR, CEN, 2 / 3);
XY.B1 = lerp(CEN, BL, 1 / 3); XY.B2 = lerp(CEN, BL, 2 / 3);
XY.D1 = lerp(BR, CEN, 1 / 3); XY.D2 = lerp(BR, CEN, 2 / 3);
XY.E1 = lerp(CEN, TL, 1 / 3); XY.E2 = lerp(CEN, TL, 2 / 3);
XY.C = CEN;
const pt = p => XY[p].map(v => v.toFixed(2));

function boardSVG(v) {
  const lines = `<polygon points="${[TL, TR, BR, BL].map(p => p.join(',')).join(' ')}" fill="none" stroke="#3d5a4c" stroke-width="1.2"/>
    <line x1="${TR[0]}" y1="${TR[1]}" x2="${BL[0]}" y2="${BL[1]}" stroke="#3d5a4c" stroke-width="1"/>
    <line x1="${TL[0]}" y1="${TL[1]}" x2="${BR[0]}" y2="${BR[1]}" stroke="#3d5a4c" stroke-width="1"/>`;
  const nodes = Object.keys(XY).map(n => {
    const [x, y] = XY[n];
    const lab = n[0] === 'R' ? n.slice(1) : '';
    const opt = v.options.some(o => o.from === n) ? 'opt' : '';
    return `<g class="nd ${opt}"><circle cx="${x}" cy="${y}" r="${n === 'C' || n[0] === 'R' ? 3.2 : 2.4}" fill="${n === 'R5' || n === 'R10' || n === 'R15' || n === 'R20' || n === 'C' ? '#24392f' : '#18281f'}" stroke="#4f7463" stroke-width=".6"/>${lab ? `<text x="${x}" y="${y + 1.1}" font-size="3" text-anchor="middle" fill="#9fb3a8">${lab}</text>` : ''}</g>`;
  }).join('');
  const byNode = {};
  v.players.forEach(pl => pl.nodes.forEach(n => { if (n !== 'start' && n !== 'goal') (byNode[n] = byNode[n] || []).push(pl); }));
  const toks = Object.keys(byNode).map(n => byNode[n].map((pl, i) => {
    const [x, y] = XY[n];
    const dx = (i % 2 ? 1 : -1) * 2.6 * Math.ceil(i / 2) * (byNode[n].length > 1 ? 1 : 0);
    return `<g><circle cx="${x + dx}" cy="${y - 2}" r="2.8" fill="${pl.color}" stroke="#0a0f0c" stroke-width=".4"/><text x="${x + dx}" y="${y - 1.1}" font-size="3" text-anchor="middle" fill="#111">${esc(pl.name.slice(0, 1))}</text></g>`;
  }).join('')).join('');
  return `<svg class="board" viewBox="0 0 100 100">${lines}${nodes}${toks}</svg>`;
}

function renderHeader() {
  return `<div class="bar"><h1>🎲 윷놀이</h1><span class="hint">${me ? `${esc(me.username)} · 현금 ${short(me.assets)}` : ''}</span></div>`;
}
function renderAuth() {
  $app.innerHTML = `<div class="card">
    <h1 style="font-size:20px;margin:0">🎲 윷놀이</h1>
    <p class="hint">처음 쓰면 닉네임과 비밀번호로 가입돼요. 가입하면 현금 10억을 받아요.</p>
    <input id="nick" maxlength="12" placeholder="닉네임" autocomplete="username" />
    <input id="pw" type="password" maxlength="30" placeholder="비밀번호 (4자 이상)" autocomplete="current-password" />
    <div class="row"><button class="gold" id="loginBtn">로그인</button><button id="regBtn">가입</button></div>
    <div class="err" id="err">${esc(err)}</div>
  </div>`;
  const send = ev => {
    socket.emit(ev, { username: document.getElementById('nick').value, password: document.getElementById('pw').value }, res => {
      if (res.error) { err = res.error; renderAuth(); return; }
      err = ''; // 'me' 이벤트가 화면을 바꿈
    });
  };
  document.getElementById('loginBtn').onclick = () => send('login');
  document.getElementById('regBtn').onclick = () => send('register');
}
function renderLobby() {
  $app.innerHTML = `${renderHeader()}
    <div class="card">
      <div class="row chips">판돈 ${CHIPS.map(c => `<button class="${c === bet ? 'on' : ''}" data-bet="${c}" ${me && me.assets < c ? 'disabled' : ''}>${short(c)}</button>`).join('')}</div>
      <div class="row"><button class="gold" id="create">🎲 방 만들기 (3~4인)</button></div>
      <div class="row"><input id="code" maxlength="4" placeholder="방 코드 4자리" style="flex:1;text-transform:uppercase" /><button id="join">들어가기</button></div>
      <div class="err" id="err">${esc(err)}</div>
    </div>
    <div class="card list">
      ${lobby.length ? lobby.map(r => `<button data-join="${r.code}">${esc(r.host)} 방 · 판돈 ${short(r.bet)} · ${r.n}/4명 · 코드 ${r.code}</button>`).join('') : '<p class="hint">열린 방이 없어요. 직접 만들어 보세요.</p>'}
    </div>`;
  document.querySelectorAll('[data-bet]').forEach(b => b.onclick = () => { bet = +b.dataset.bet; renderLobby(); });
  document.getElementById('create').onclick = () => act('create', bet);
  document.getElementById('join').onclick = () => act('join', document.getElementById('code').value.trim().toUpperCase());
  document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => act('join', b.dataset.join));
}
function renderRoom() {
  const v = room;
  const turn = v.players.find(p => p.turn);
  const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) : 0;
  const status = v.status === 'open' ? `대기 중 · ${v.players.length}/4명 (3명부터 시작)`
    : v.status === 'play' ? `${esc(turn ? turn.name : '')} 차례 · <span id="cd">${left}</span>초`
    : `🏆 ${esc(v.winner)} 우승!`;
  const isHost = v.host === (me && me.username);
  const hostRow = v.status === 'open'
    ? (isHost ? `<button class="gold" id="start" ${v.players.length < 3 ? 'disabled' : ''}>시작</button><button id="cancel">방 닫기</button>` : `<button id="leave">나가기</button>`)
    : '';
  $app.innerHTML = `${renderHeader()}
    <div class="card">
      <div class="row"><b>판돈 ${short(v.pot)}</b><span class="hint">${short(v.bet)} × ${v.players.length}명 · 우승자가 전부 가져가요 · 방 코드 ${v.code}</span></div>
      <div class="players">${v.players.map(p => `<div class="pl ${p.turn ? 'turn' : ''}" style="--c:${p.color}"><b>${esc(p.name)}${p.host ? ' 👑' : ''}</b><span>골인 ${p.done}/4 · 출발 ${p.nodes.filter(n => n === 'start').length}</span></div>`).join('')}</div>
      <div class="status">${status}</div>
      ${boardSVG(v)}
      ${v.canThrow ? `<div class="row" style="justify-content:center"><button class="gold" id="throw" style="font-size:16px;padding:12px 26px">🎲 윷 던지기</button></div>` : ''}
      ${v.canMove ? `<p class="hint">움직일 말을 고르세요</p><div class="opts">${v.options.map(o => `<button data-opt="${o.id}">${esc(o.label)}</button>`).join('')}</div>` : ''}
      ${v.last ? `<p class="hint">마지막 던짐: <b>${esc(v.last.name)}</b>${v.last.extra ? ' (한 번 더)' : ''}</p>` : ''}
      <div class="row" style="justify-content:center">${hostRow}</div>
      <div class="err" id="err">${esc(err)}</div>
    </div>
    <div class="card">
      <div class="chat" id="log">${v.chat.map(m => `<div><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('')}</div>
      <form class="chatform" id="chatform"><input id="chatin" maxlength="100" placeholder="한마디…" autocomplete="off" /><button type="submit">전송</button></form>
    </div>`;
  document.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => act('move', +b.dataset.opt));
  if (document.getElementById('throw')) document.getElementById('throw').onclick = () => act('throw');
  if (document.getElementById('start')) document.getElementById('start').onclick = () => act('start');
  if (document.getElementById('cancel')) document.getElementById('cancel').onclick = () => act('cancel');
  if (document.getElementById('leave')) document.getElementById('leave').onclick = () => act('leave');
  document.getElementById('chatform').onsubmit = e => { e.preventDefault(); const t = document.getElementById('chatin').value; document.getElementById('chatin').value = ''; if (t.trim()) act('chat', t); };
  const log = document.getElementById('log'); if (log) log.scrollTop = log.scrollHeight;
  clearInterval(tick);
  if (v.status === 'play') tick = setInterval(() => {
    const el = document.getElementById('cd'); if (el && room && room.deadline) el.textContent = Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000));
  }, 500);
}
function render() {
  if (!me) return renderAuth();
  if (room) return renderRoom();
  return renderLobby();
}
function act(op, arg) {
  socket.emit('yut', { op, arg }, res => {
    if (res.error) { err = res.error; render(); return; }
    err = '';
    if (op === 'list') { lobby = res.list || []; if (res.mine) room = res.mine; }
    if (res.state) room = res.state;
    if (op === 'leave' || op === 'cancel') room = null;
    render();
  });
}
socket.on('me', m => { const first = !me; me = m; if (first) act('list'); else render(); });
socket.on('yuts', list => { lobby = list; if (me && !room) render(); });
socket.on('yutState', v => { if (room && room.code === v.code) { room = v; render(); } });
socket.on('disconnect', () => { err = '연결이 끊겼어요. 새로고침 해 주세요'; render(); });
socket.on('connect', () => { if (me) act('list'); });
render();
