// 윷놀이 클라이언트
// 화면: 로그인 · 마당(홈) · 상점 · 판(방). 판 화면은 뼈대를 한 번 만들고 부분만 갱신한다
// (윷이 떨어지는 연출과 채팅 입력이 갱신 때문에 끊기지 않도록).
const socket = io();
const $app = document.getElementById('app');
const CHIPS = [1e6, 5e6, 1e7, 5e7, 1e8];
const MIN_START = 2;
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let me = null, room = null, lobby = [], bet = 1e7, err = '', tick = null, screen = 'home', shopTab = 'piece', ITEMS = [];
let codeDraft = '', matSeq = -1;

const ITEM = id => ITEMS.find(x => x.id === id);
const artOf = id => { const it = ITEM(id); return it ? it.art : null; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function won(n) {
  n = Number(n) || 0; const neg = n < 0; n = Math.abs(n);
  let s;
  if (n >= 1e8) { const e = Math.floor(n / 1e8), m = Math.round((n % 1e8) / 1e4); s = e + '억' + (m ? ' ' + m.toLocaleString('ko-KR') + '만' : ''); }
  else if (n >= 1e4) s = Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
  else s = n + '';
  return (neg ? '-' : '') + s + '원';
}
const pieceArt = skin => artOf((skin && skin.piece) || 'p_basic') || { pat: 'dot', c1: '#5c3b1e', c2: '#e9d3a1', c3: '#8a5a2b' };
const woodOf = skin => ((artOf((skin && skin.stick) || 's_basic') || {}).wood) || '#b9824a';
const themeOf = skin => ((artOf((skin && skin.board) || 'b_hanji') || {}).theme) || 'hanji';
const pieceSVG = (skin, px) => Art.pieceSVG(pieceArt(skin), px);
const $ = id => document.getElementById(id);
const view = v => { if ($app.dataset.view !== v) { $app.dataset.view = v; return true; } return false; };

// 결정적 난수 (같은 던지기는 모두에게 같은 자리로 떨어짐)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 부채꼴로 놓인 윷가락 네 개 (장식·상점 미리보기)
function fanSticks(wood, cls = '') {
  const set = [[true, -21, -30], [false, -7, -10], [true, 7, 10], [false, 21, 30]];
  return `<div class="fan ${cls}" aria-hidden="true">${set.map(([flat, rot, dx], i) =>
    `<div class="sp" style="left:calc(50% + ${dx}px);top:54%;transform:translate(-50%,-50%) rotate(${rot}deg)">${Art.stickEl(wood, i === 0).replace('class="stick"', `class="stick" style="transform:rotateY(${flat ? 0 : 180}deg)"`)}</div>`).join('')}</div>`;
}

// ---------------- 로그인 ----------------
function renderAuth() {
  view('auth');
  $app.innerHTML = `<main class="page narrow">
    <header class="mast">${fanSticks('#b9824a', 'mast-fan')}<h1 class="logo">윷놀이</h1><p class="lede">친구끼리 판돈 걸고 던지는 윷</p></header>
    <section class="sheet">
      <label class="field"><span>닉네임</span><input id="nick" maxlength="12" autocomplete="username" /></label>
      <label class="field"><span>비밀번호</span><input id="pw" type="password" maxlength="30" autocomplete="current-password" placeholder="4자 이상" /></label>
      <div class="err" role="alert">${esc(err)}</div>
      <div class="btns"><button class="btn primary" id="loginBtn">들어가기</button><button class="btn" id="regBtn">처음이에요, 가입하기</button></div>
      <p class="note">가입하면 현금 10억원으로 시작해요.</p>
    </section></main>`;
  const send = ev => socket.emit(ev, { username: $('nick').value, password: $('pw').value }, res => {
    if (res.error) { err = res.error; renderAuth(); }
  });
  $('loginBtn').onclick = () => send('login');
  $('regBtn').onclick = () => send('register');
  $('pw').onkeydown = e => { if (e.key === 'Enter') send('login'); };
}

// ---------------- 마당(홈) ----------------
function renderHome() {
  view('home');
  const y = me.yut || {};
  const rate = y.games ? Math.round((y.win || 0) / y.games * 100) : 0;
  const eq = me.equip || {};
  const title = y.win >= 5 ? '윷판의 왕' : y.win >= 1 ? '승부사' : '새내기';
  $app.innerHTML = `<main class="page">
    <header class="mast small">${fanSticks(woodOf(eq), 'mast-fan')}<h1 class="logo">윷놀이</h1></header>
    <section class="me">
      <div class="me-av">${pieceSVG({ piece: eq.piece }, 56)}</div>
      <div class="me-id"><div class="me-name">${esc(me.username)}<span class="seal">${title}</span></div><div class="me-cash">${won(me.assets)}</div></div>
      <button class="btn small" id="shop">꾸미기</button>
      <dl class="me-rec"><div><dt>판수</dt><dd>${y.games || 0}</dd></div><div><dt>승률</dt><dd>${rate}%</dd></div>
        <div><dt>손익</dt><dd class="${(y.net || 0) >= 0 ? 'up' : 'down'}">${(y.net || 0) > 0 ? '+' : ''}${won(y.net || 0)}</dd></div></dl>
    </section>
    <section class="sheet">
      <h2>판 열기</h2>
      <p class="note">모두 같은 판돈을 내고, 말 네 개를 먼저 다 내보낸 사람이 전부 가져가요. 2~4명.</p>
      <div class="chips" role="radiogroup" aria-label="판돈">${CHIPS.map(c => `<button role="radio" aria-checked="${c === bet}" class="chip${c === bet ? ' on' : ''}" data-bet="${c}" ${me.assets < c ? 'disabled' : ''}>${won(c)}</button>`).join('')}</div>
      <button class="btn primary wide" id="create">${won(bet)} 걸고 판 열기</button>
      <div class="err" role="alert">${esc(err)}</div>
    </section>
    <section class="sheet">
      <h2>열린 판</h2>
      ${lobby.length ? `<ul class="lobby">${lobby.map(r => `<li><div class="lb-who"><b>${esc(r.host)}</b>님의 판<span class="lb-bet">${won(r.bet)}</span></div>
          <div class="pips" aria-label="${r.n}명 / 4명">${[0, 1, 2, 3].map(i => `<i class="${i < r.n ? 'on' : ''}"></i>`).join('')}</div>
          <button class="btn small" data-join="${r.code}">들어가기</button></li>`).join('')}</ul>`
        : '<p class="empty">아직 열린 판이 없어요. 위에서 먼저 열어 보세요.</p>'}
      <div class="code-row"><input id="code" maxlength="4" placeholder="판 코드 4자리" value="${esc(codeDraft)}" autocapitalize="characters" /><button class="btn" id="join">코드로 들어가기</button></div>
    </section></main>`;
  document.querySelectorAll('[data-bet]').forEach(b => b.onclick = () => { bet = +b.dataset.bet; renderHome(); });
  $('create').onclick = () => act('create', bet);
  $('code').oninput = e => { codeDraft = e.target.value.toUpperCase(); };
  $('join').onclick = () => act('join', codeDraft.trim());
  $('shop').onclick = () => { screen = 'shop'; err = ''; render(); };
  document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => act('join', b.dataset.join));
}

// ---------------- 상점 ----------------
function renderShop() {
  view('shop:' + shopTab);
  const tabs = [['piece', '말'], ['stick', '윷가락'], ['board', '말판']];
  const list = ITEMS.filter(i => i.cat === shopTab);
  $app.innerHTML = `<main class="page">
    <header class="bar"><button class="btn small" id="back">마당으로</button><h1 class="h-title">꾸미기</h1><span class="bar-cash">${won(me.assets)}</span></header>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${shopTab === k}" class="tab${shopTab === k ? ' on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="err" role="alert">${esc(err)}</div>
    <div class="goods">${list.map(it => {
      const owned = (me.owned || []).includes(it.id);
      const equipped = Object.values(me.equip || {}).includes(it.id);
      let pv = '';
      if (it.cat === 'piece') pv = `<div class="pv-piece">${Art.pieceSVG(it.art, 72)}</div>`;
      if (it.cat === 'stick') pv = fanSticks(it.art.wood, 'pv-fan');
      if (it.cat === 'board') pv = `<div class="pv-board">${Art.boardSVG({ theme: it.art.theme, pieceArt })}</div>`;
      const btn = equipped ? `<button class="btn small" disabled>쓰는 중</button>`
        : owned ? `<button class="btn small" data-equip="${it.id}">쓰기</button>`
        : `<button class="btn small primary" data-buy="${it.id}" ${me.assets < it.price ? 'disabled' : ''}>${won(it.price)}에 사기</button>`;
      return `<article class="good${equipped ? ' eq' : ''}"><div class="pv">${pv}</div><h3>${esc(it.name)}</h3><p>${esc(it.desc)}</p>${btn}</article>`;
    }).join('')}</div></main>`;
  $('back').onclick = () => { screen = 'home'; err = ''; render(); };
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; err = ''; renderShop(); });
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => shopAct('buy', b.dataset.buy));
  document.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => shopAct('equip', b.dataset.equip));
}

// ---------------- 판(방) ----------------
const RESULT_SUB = { '도': '한 칸', '개': '두 칸', '걸': '세 칸', '윷': '네 칸, 한 번 더', '모': '다섯 칸, 한 번 더', '뒷도': '한 칸 뒤로' };
function optLabel(o) {
  if (o.from === 'start') return '새 말 놓기';
  if (o.to === 'goal') return '말 내보내기';
  if (o.route === 'back') return '한 칸 뒤로';
  if (o.route === 'A' || o.route === 'B') return '지름길로';
  return '말 옮기기';
}
function renderRoom() {
  const v = room;
  if (view('room:' + v.code)) {
    matSeq = -1;
    $app.innerHTML = `<main class="room">
      <header class="room-head" id="rHead"></header>
      <section class="seats" id="rSeats" aria-label="참가자"></section>
      <section class="board-box" id="rBoard"></section>
      <section class="side">
        <div class="mat" id="rMat" aria-live="polite"><div class="mat-sticks" id="rSticks"></div><div class="mat-result" id="rResult"></div></div>
        <div class="ctrl" id="rCtrl"></div>
        <div class="chat"><div class="log" id="rLog"></div>
          <form class="chat-form" id="rForm"><input id="rIn" maxlength="100" placeholder="한마디" autocomplete="off" aria-label="채팅" /><button class="btn small">보내기</button></form></div>
      </section></main>`;
    $('rForm').onsubmit = e => { e.preventDefault(); const t = $('rIn').value; $('rIn').value = ''; if (t.trim()) act('chat', t); };
    $('rBoard').onclick = e => { const g = e.target.closest('.tg'); if (g) act('move', +g.dataset.opt); };
    $('rBoard').onkeydown = e => { const g = e.target.closest('.tg'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); act('move', +g.dataset.opt); } };
  }
  const mine = v.players.find(p => p.id === v.you);
  const turn = v.players.find(p => p.turn);
  const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) : 0;

  $('rHead').innerHTML = `<div class="pot"><span>판돈</span><b>${won(v.pot)}</b></div>
    <div class="head-meta"><span class="code">코드 <b>${v.code}</b></span><span class="each">한 사람 ${won(v.bet)}</span></div>`;

  $('rSeats').style.setProperty('--n', Math.max(2, v.players.length));
  $('rSeats').innerHTML = v.players.map(p => {
    const wait = p.nodes.filter(n => n === 'start').length;
    const pips = [...Array(p.done).fill('done'), ...Array(Math.max(0, 4 - p.done - wait)).fill('on'), ...Array(wait).fill('')];
    return `<div class="seat${p.turn ? ' turn' : ''}${p.id === v.you ? ' me' : ''}" style="--c:${p.color}">
      <div class="seat-av">${pieceSVG(p.skin, 26)}</div>
      <div class="seat-txt"><div class="seat-name">${esc(p.name)}</div>
        <div class="seat-sub">${p.turn ? `차례 <b id="cd">${left}</b>초` : v.status === 'open' ? (p.host ? '방장' : '준비') : `${p.done}개 났음`}</div></div>
      <div class="pips" aria-label="말 4개 중 ${p.done}개 났음, ${wait}개 대기">${pips.map(k => `<i class="${k}"></i>`).join('')}</div></div>`;
  }).join('');

  $('rBoard').innerHTML = Art.boardSVG({
    theme: themeOf(mine ? mine.skin : null), players: v.players,
    options: v.canMove ? v.options : [], pieceArt,
  });

  if (v.seq !== matSeq) { const fresh = matSeq !== -1; matSeq = v.seq; renderMat(fresh); }

  let ctrl = '';
  const isHost = mine && mine.host;
  if (v.status === 'open') {
    ctrl = isHost
      ? `<p class="hint">${v.players.length < MIN_START ? `친구가 들어오면 시작할 수 있어요. 코드 <b>${v.code}</b>를 알려 주세요.` : `${v.players.length}명이 모였어요. 4명까지 더 들어올 수 있어요.`}</p>
         <div class="btns"><button class="btn primary big" id="start" ${v.players.length < MIN_START ? 'disabled' : ''}>시작하기</button><button class="btn" id="cancel">판 닫기</button></div>`
      : `<p class="hint">방장이 시작하길 기다리는 중이에요.</p><div class="btns"><button class="btn" id="leave">나가기</button></div>`;
  } else if (v.status === 'play') {
    if (v.canThrow) ctrl = `<button class="btn primary big throw" id="throw">윷 던지기</button>`;
    else if (v.canMove) ctrl = `<p class="hint">말판에서 표시된 자리를 누르거나 아래에서 고르세요.</p>
      <div class="opts">${v.options.map((o, i) => `<button class="btn" data-opt="${o.id}">${v.options.length > 1 ? `<span class="num">${i + 1}</span>` : ''}${optLabel(o)}</button>`).join('')}</div>`;
    else ctrl = `<p class="hint">${esc(turn ? turn.name : '')}님 차례예요.</p>`;
  } else {
    ctrl = `<p class="win"><b>${esc(v.winner)}</b>님이 ${won(v.pot)}을 가져갔어요.</p><div class="btns"><button class="btn primary" id="home">마당으로</button></div>`;
  }
  $('rCtrl').innerHTML = ctrl + `<div class="err" role="alert">${esc(err)}</div>`;
  document.querySelectorAll('#rCtrl [data-opt]').forEach(b => b.onclick = () => act('move', +b.dataset.opt));
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  on('throw', () => act('throw')); on('start', () => act('start')); on('cancel', () => act('cancel')); on('leave', () => act('leave'));
  on('home', () => { room = null; screen = 'home'; act('list'); });

  const log = $('rLog');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = v.chat.map(m => m.name === '📢' || m.name === '🎲'
    ? `<p class="sys">${esc(m.text)}</p>` : `<p><b>${esc(m.name)}</b>${esc(m.text)}</p>`).join('');
  if (atBottom || !log.dataset.init) { log.scrollTop = log.scrollHeight; log.dataset.init = '1'; }

  clearInterval(tick);
  if (v.status === 'play') tick = setInterval(() => { const el = $('cd'); if (el && room && room.deadline) el.textContent = Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)); }, 500);
}

// 멍석: 윷가락이 떨어진 자리를 그대로 보여 준다
function renderMat(animate) {
  const v = room, box = $('rSticks'), res = $('rResult');
  if (!box) return;
  const last = v.last;
  const thrower = v.players.find(p => last && p.id === last.by) || v.players.find(p => p.turn);
  const wood = woodOf(thrower ? thrower.skin : (me && me.equip));
  const bits = last ? last.bits : [0, 0, 0, 0];
  const r = rng(last ? v.seq * 7919 + 17 : 3);
  // 겹치지 않게 자리 뽑기 (멍석 가로세로 비율 반영)
  const spots = [];
  for (let i = 0; i < 4; i++) {
    let best = null, bestD = -1;
    for (let t = 0; t < 60; t++) {
      const c = last ? { x: 37 + r() * 46, y: 30 + r() * 40 } : { x: 38 + i * 8 + r() * 3, y: 46 + r() * 8 };
      const d = spots.length ? Math.min(...spots.map(s => Math.hypot((s.x - c.x) * 2.3, s.y - c.y))) : 99;
      if (d > bestD) { best = c; bestD = d; }
      if (d > 30) break;
    }
    const base = last ? (r() < .5 ? 90 : -90) + (r() - .5) * 100 : 78 + r() * 10;
    spots.push({ ...best, rot: base });
  }
  box.innerHTML = spots.map((s, i) => `<div class="sp" style="left:${s.x}%;top:${s.y}%;transform:translate(-50%,-50%) rotate(${s.rot}deg)">${Art.stickEl(wood, i === 0)}</div>`).join('');
  box.querySelectorAll('.sp').forEach((el, i) => {
    const ry = bits[i] ? 0 : 180;
    const st = el.querySelector('.stick');
    st.style.transform = `rotateY(${ry}deg)`;
    if (!animate || REDUCED || !el.animate) return;
    const s = spots[i], delay = i * 70 + r() * 60, spin = 720 + Math.round(r() * 2) * 360;
    const from = `translate(-50%,-50%) translate(${(50 - s.x) * 2}px, 150px) rotate(${s.rot - 160 - r() * 120}deg) scale(1.35)`;
    const peak = `translate(-50%,-50%) translate(${(50 - s.x) * .6}px, -46px) rotate(${s.rot - 50}deg) scale(1.18)`;
    const land = `translate(-50%,-50%) rotate(${s.rot + (r() - .5) * 14}deg) scale(1)`;
    const rest = `translate(-50%,-50%) rotate(${s.rot}deg) scale(1)`;
    el.animate([{ transform: from, opacity: 0 }, { opacity: 1, offset: .12 }, { transform: peak, offset: .5 }, { transform: land, offset: .82 }, { transform: rest }],
      { duration: 1050, delay, easing: 'cubic-bezier(.3,.6,.35,1)', fill: 'backwards' });
    st.animate([{ transform: `rotateY(${ry + spin}deg) rotateX(${20 + r() * 30}deg)` }, { transform: `rotateY(${ry + 40}deg) rotateX(6deg)`, offset: .78 }, { transform: `rotateY(${ry}deg)` }],
      { duration: 1050, delay, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'backwards' });
  });
  if (!last) { res.className = 'mat-result shown'; res.innerHTML = `<span class="res-sub">${v.status === 'play' ? '윷을 던지면 여기 떨어져요' : ''}</span>`; return; }
  res.innerHTML = `<span class="res-name">${esc(last.name)}</span><span class="res-sub">${RESULT_SUB[last.name] || ''}</span>`;
  res.className = 'mat-result' + (animate && !REDUCED ? ' pop' : ' shown');
}

// ---------------- 공통 ----------------
function render() {
  if (!me) return renderAuth();
  if (room) return renderRoom();
  if (screen === 'shop') return renderShop();
  return renderHome();
}
function act(op, arg) {
  socket.emit('yut', { op, arg }, res => {
    if (res.error) { err = res.error; render(); return; }
    err = '';
    if (op === 'list') { lobby = res.list || []; if (res.mine) room = res.mine; }
    if (res.state) room = res.state;
    if (op === 'leave' || op === 'cancel') room = null;
    if (op === 'create' || op === 'join') { screen = 'home'; codeDraft = ''; }
    render();
  });
}
function shopAct(op, id) {
  socket.emit('shop', { op, id }, res => { err = res.error || ''; render(); });
}
socket.on('me', m => { const first = !me; me = m; if (first) act('list'); else if (!room) render(); });
socket.on('yuts', list => { lobby = list; if (me && !room && screen === 'home') render(); });
socket.on('yutState', v => { if (room && room.code === v.code) { room = v; render(); } });
socket.on('disconnect', () => { err = '연결이 끊겼어요. 새로고침해 주세요.'; render(); });
socket.on('connect', () => { if (me) act('list'); });

fetch('/api/shop').then(r => r.json()).then(list => { ITEMS = list; render(); });
render();
