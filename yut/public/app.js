// 윷놀이 클라이언트 — 민화풍 UI, 상점, 윷 던지기 연출
// 말(도트) 외의 판·윷·장식은 art.js 의 그림(SVG)으로 그린다.
const socket = io();
const $app = document.getElementById('app');
const $toss = document.getElementById('toss');
const CHIPS = [1e6, 5e6, 1e7, 5e7, 1e8];
const MIN_START = 2;
let me = null, room = null, lobby = [], bet = 1e7, err = '', tick = null, screen = 'home', shopTab = 'piece', ITEMS = [], shownSeq = 0;
const ITEM = id => ITEMS.find(x => x.id === id);
const artOf = id => { const it = ITEM(id); return it ? it.art : null; };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function short(n) { n = Number(n) || 0; if (n >= 1e8) return (n / 1e8).toFixed(n % 1e8 ? 1 : 0).replace(/\.0$/, '') + '억'; if (n >= 1e4) return Math.round(n / 1e4) + '만'; return n + '원'; }
const pieceArt = skin => artOf((skin && skin.piece) || 'p_basic') || { pat: 'dot', c1: '#5c3b1e', c2: '#e9d3a1', c3: '#8a5a2b' };
const woodOf = skin => ((artOf((skin && skin.stick) || 's_basic') || {}).wood) || '#b9824a';
const themeOf = skin => ((artOf((skin && skin.board) || 'b_hanji') || {}).theme) || 'hanji';
const pieceSVG = (skin, px) => Art.pieceSVG(pieceArt(skin), px);

// 판 전체 (그림 + 말). 장식 레이어는 Art.boardSVG 가 만든다.
function boardInner(theme, players = [], options = []) {
  const B = Art.boardSVG(players, options, theme);
  return `${B.defs ? `<defs>${B.defs}</defs>` : ''}${B.frame}${B.lines}${B.sun}${B.nodes}`;
}
function boardSVG(v, theme) {
  const byNode = {};
  v.players.forEach(pl => pl.nodes.forEach(n => { if (n !== 'start' && n !== 'goal') (byNode[n] = byNode[n] || []).push(pl); }));
  const toks = Object.keys(byNode).map(n => byNode[n].map((pl, i) => {
    const [x, y] = Art.XY[n];
    const off = byNode[n].length > 1 ? (i - (byNode[n].length - 1) / 2) * 4.2 : 0;
    return `<svg x="${(x - 3 + off).toFixed(2)}" y="${(y - 3.2).toFixed(2)}" width="6" height="6" viewBox="0 0 12 12" shape-rendering="crispEdges" class="tok">${Art.pieceCells(pieceArt(pl.skin)).map(([cx, cy, c]) => `<rect x="${cx}" y="${cy}" width="1" height="1" fill="${c}"/>`).join('')}</svg>`;
  }).join('')).join('');
  return `<svg class="board" viewBox="0 0 100 100">${boardInner(theme, v.players, v.options)}${toks}</svg>`;
}

function renderTop() {
  return `<div class="bar"><span class="title">윷놀이</span><span class="hint">${me ? `${esc(me.username)} · 현금 ${short(me.assets)}` : ''}</span></div>`;
}
function renderAuth() {
  $app.innerHTML = `<div class="stack" style="margin-top:40px"><div class="frame" style="text-align:center">
      <div class="title">윷놀이</div>
      <p class="hint" style="margin:8px 0 14px">친구들과 판돈을 걸고 던지는 전통 윷놀이</p>
      <div class="stack" style="gap:8px;max-width:none;padding:0">
        <input id="nick" maxlength="12" placeholder="닉네임" autocomplete="username" />
        <input id="pw" type="password" maxlength="30" placeholder="비밀번호 (4자 이상)" autocomplete="current-password" />
        <div class="row center"><button class="hwang" id="loginBtn">입장</button><button id="regBtn">처음 왔어요 (가입)</button></div>
        <div class="err">${esc(err)}</div>
        <p class="hint">가입하면 현금 10억을 받아요.</p>
      </div></div></div>`;
  const send = ev => socket.emit(ev, { username: document.getElementById('nick').value, password: document.getElementById('pw').value }, res => {
    if (res.error) { err = res.error; renderAuth(); }
  });
  document.getElementById('loginBtn').onclick = () => send('login');
  document.getElementById('regBtn').onclick = () => send('register');
}
function renderHome() {
  const y = me.yut || {};
  const rate = y.games ? Math.round((y.win || 0) / y.games * 100) : 0;
  const eq = me.equip || {};
  $app.innerHTML = `${renderTop()}
    <div class="frame profile">
      <div class="av">${pieceSVG({ piece: eq.piece }, 70)}</div>
      <div class="stats">
        <div><span>칭호</span><b>${y.win >= 5 ? '<span class="seal">윷판의 왕</span>' : y.win >= 1 ? '<span class="seal">승부사</span>' : '<span class="seal" style="background:var(--nok)">새내기</span>'}</b></div>
        <div><span>판수</span><b>${y.games || 0}판</b></div>
        <div><span>승률</span><b>${rate}%</b></div>
        <div><span>손익</span><b style="color:${(y.net || 0) >= 0 ? 'var(--nok)' : 'var(--jeok)'}">${(y.net || 0) >= 0 ? '+' : ''}${short(y.net || 0)}</b></div>
      </div>
    </div>
    <div class="frame stack" style="gap:10px;padding:12px">
      <h2>판돈 정하기</h2>
      <div class="row chips">${CHIPS.map(c => `<button class="${c === bet ? 'on' : ''}" data-bet="${c}" ${me.assets < c ? 'disabled' : ''}>${short(c)}</button>`).join('')}</div>
      <div class="row center"><button class="jeok" id="create">판 열기 (2~4인)</button><button id="shop" class="cheong">상점</button></div>
      <div class="row"><input id="code" maxlength="4" placeholder="판 코드" style="flex:1;text-transform:uppercase" /><button id="join">들어가기</button></div>
      <div class="err">${esc(err)}</div>
    </div>
    <div class="frame stack" style="gap:8px;padding:12px">
      <h2>열린 판</h2>
      ${lobby.length ? lobby.map(r => `<button data-join="${r.code}" style="text-align:left">${esc(r.host)} 의 판 · 판돈 ${short(r.bet)} · ${r.n}/4명</button>`).join('') : '<p class="hint">지금 열린 판이 없어요. 직접 열어 보세요.</p>'}
    </div>`;
  document.querySelectorAll('[data-bet]').forEach(b => b.onclick = () => { bet = +b.dataset.bet; renderHome(); });
  document.getElementById('create').onclick = () => act('create', bet);
  document.getElementById('join').onclick = () => act('join', document.getElementById('code').value.trim().toUpperCase());
  document.getElementById('shop').onclick = () => { screen = 'shop'; render(); };
  document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => act('join', b.dataset.join));
}
function renderShop() {
  const tabs = [['piece', '말'], ['stick', '윷'], ['board', '판']];
  const list = ITEMS.filter(i => i.cat === shopTab);
  $app.innerHTML = `${renderTop()}
    <div class="frame stack" style="gap:10px;padding:12px">
      <div class="bar"><h2>상점</h2><button id="back">← 돌아가기</button></div>
      <div class="tabs">${tabs.map(([k, t]) => `<button class="${shopTab === k ? 'on jeok' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
      <p class="hint">가진 현금에서 구매해요. 장착하면 판에서 그 모양으로 보여요.</p>
      <div class="shop-grid">${list.map(it => {
        const owned = (me.owned || []).includes(it.id);
        const equipped = Object.values(me.equip || {}).includes(it.id);
        let pv = '';
        if (it.cat === 'piece') pv = Art.pieceSVG(it.art, 64);
        if (it.cat === 'stick') pv = `<div class="sticks-pv">${[1, 0, 1, 0].map((f, i) => `<span style="transform:rotate(${(i - 1.5) * 7}deg)">${Art.stickEl(it.art.wood, !!f)}</span>`).join('')}</div>`;
        if (it.cat === 'board') pv = `<svg class="mini-bd" viewBox="0 0 100 100">${boardInner(it.art.theme)}</svg>`;
        const btn = owned
          ? (equipped ? `<button disabled>장착 중</button>` : `<button class="cheong" data-equip="${it.id}">장착</button>`)
          : `<button class="hwang" data-buy="${it.id}" ${me.assets < it.price ? 'disabled' : ''}>${short(it.price)} 구매</button>`;
        return `<div class="frame item"><div class="pv">${pv}</div><div class="nm">${esc(it.name)}</div><div class="pr">${esc(it.desc)}</div>${owned ? '<span class="tag">보유</span>' : ''}${btn}</div>`;
      }).join('')}</div>
      <div class="err">${esc(err)}</div>
    </div>`;
  document.getElementById('back').onclick = () => { screen = 'home'; render(); };
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; renderShop(); });
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => shopAct('buy', b.dataset.buy));
  document.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => shopAct('equip', b.dataset.equip));
}
function renderRoom() {
  const v = room;
  const turn = v.players.find(p => p.turn);
  const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) : 0;
  const status = v.status === 'open' ? `대기 중 · ${v.players.length}/4명 (${MIN_START}명부터 시작)`
    : v.status === 'play' ? `${esc(turn ? turn.name : '')} 차례 · <span id="cd">${left}</span>초`
    : `🏆 ${esc(v.winner)} 우승!`;
  const isHost = v.host === (me && me.username);
  const hostRow = v.status === 'open'
    ? (isHost ? `<button class="hwang" id="start" ${v.players.length < MIN_START ? 'disabled' : ''}>시작</button><button id="cancel">판 닫기</button>` : `<button id="leave">나가기</button>`)
    : '';
  const mine = me && v.players.find(p => p.id === v.you);
  const theme = themeOf(mine ? mine.skin : null);
  const T = Art.THEMES[theme] || Art.THEMES.hanji;
  $app.innerHTML = `${renderTop()}
    <div class="frame stack" style="gap:10px;padding:12px">
      <div class="bar"><b>판돈 ${short(v.pot)}</b><span class="hint">${short(v.bet)} × ${v.players.length}명 · 코드 ${v.code}</span></div>
      <div class="players">${v.players.map(p => `<div class="pl ${p.turn ? 'turn' : ''}" style="--c:${p.color}"><div class="mini">${pieceSVG(p.skin, 30)}</div><div><b>${esc(p.name)}${p.host ? ' 👑' : ''}</b>골인 ${p.done}/4 · 대기 ${p.nodes.filter(n => n === 'start').length}</div></div>`).join('')}</div>
      <div class="status">${status}</div>
      <div class="boardwrap" style="background:${T.paper};border-color:${T.ink}">${boardSVG(v, theme)}</div>
      ${v.canThrow ? `<div class="row center"><button class="jeok throw" id="throw">윷 던지기</button></div>` : ''}
      ${v.canMove ? `<p class="hint">움직일 말을 고르세요</p><div class="opts">${v.options.map(o => `<button data-opt="${o.id}">${esc(o.label)}</button>`).join('')}</div>` : ''}
      ${v.last ? `<p class="hint">마지막 윷: <b>${esc(v.last.name)}</b>${v.last.extra ? ' · 한 번 더' : ''}</p>` : ''}
      <div class="row center">${hostRow}</div>
      <div class="err">${esc(err)}</div>
    </div>
    <div class="frame" style="padding:10px"><div class="chat" id="log">${v.chat.map(m => `<div><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('')}</div>
      <form class="chatform" id="chatform" style="margin-top:6px"><input id="chatin" maxlength="100" placeholder="한마디…" autocomplete="off" /><button type="submit">전송</button></form></div>`;
  document.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => act('move', +b.dataset.opt));
  if (document.getElementById('throw')) document.getElementById('throw').onclick = () => act('throw');
  if (document.getElementById('start')) document.getElementById('start').onclick = () => act('start');
  if (document.getElementById('cancel')) document.getElementById('cancel').onclick = () => act('cancel');
  if (document.getElementById('leave')) document.getElementById('leave').onclick = () => act('leave');
  document.getElementById('chatform').onsubmit = e => { e.preventDefault(); const t = document.getElementById('chatin').value; document.getElementById('chatin').value = ''; if (t.trim()) act('chat', t); };
  const log = document.getElementById('log'); if (log) log.scrollTop = log.scrollHeight;
  clearInterval(tick);
  if (v.status === 'play') tick = setInterval(() => { const el = document.getElementById('cd'); if (el && room && room.deadline) el.textContent = Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)); }, 500);
  if (v.last && v.seq && v.seq !== shownSeq) { shownSeq = v.seq; toss(v.last); }
}
function render() {
  if (!me) return renderAuth();
  if (room) return renderRoom();
  if (screen === 'shop') return renderShop();
  return renderHome();
}

// ----- 윷 던지기 연출: 막대 4개가 굴러가고, 결과 이름을 크게 보여줌 -----
function toss(last) {
  const wood = woodOf(me && me.equip);
  const sticks = last.bits.map((b, i) =>
    `<span class="sw" style="--d:${(i * 0.06).toFixed(2)}s;--rx:${b ? 0 : 180}deg">${Art.stickEl(wood, !!b, 'spin')}</span>`).join('');
  const sub = last.name === '뒷도' ? '한 칸 뒤로' : last.extra ? '한 번 더 던져요!' : '';
  $toss.innerHTML = `<div class="box"><div class="sticks">${sticks}</div><div class="name">${esc(last.name)}</div><div class="sub">${sub}</div></div>`;
  $toss.classList.remove('hidden');
  clearTimeout(toss.t);
  toss.t = setTimeout(() => $toss.classList.add('hidden'), 2100);
}
$toss.onclick = () => $toss.classList.add('hidden');

function act(op, arg) {
  socket.emit('yut', { op, arg }, res => {
    if (res.error) { err = res.error; render(); return; }
    err = '';
    if (op === 'list') { lobby = res.list || []; if (res.mine) room = res.mine; }
    if (res.state) room = res.state;
    if (op === 'leave' || op === 'cancel') room = null;
    if (op === 'create' || op === 'join') screen = 'home';
    render();
  });
}
function shopAct(op, id) {
  socket.emit('shop', { op, id }, res => { if (res.error) { err = res.error; } else err = ''; render(); });
}
socket.on('me', m => { const first = !me; me = m; if (first) { act('list'); } else render(); });
socket.on('yuts', list => { lobby = list; if (me && !room && screen === 'home') render(); });
socket.on('yutState', v => { if (room && room.code === v.code) { room = v; render(); } });
socket.on('disconnect', () => { err = '연결이 끊겼어요. 새로고침 해 주세요'; render(); });
socket.on('connect', () => { if (me) act('list'); });

fetch('/api/shop').then(r => r.json()).then(list => { ITEMS = list; render(); });
render();
