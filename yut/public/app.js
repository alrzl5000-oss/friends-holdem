// FRIENDS 윷놀이 — 화면 구조는 홀덤과 같음 (로그인 · 로비[게임/랭킹/상점/프로필] · 게임)
const socket = io();
const $ = id => document.getElementById(id);
const BETS = [1e6, 5e6, 1e7, 5e7, 1e8];
const TURN_MS = 20000;
const MIN_START = 2;
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let me = null, room = null, lobby = [], ITEMS = [], tab = 'rooms', authMode = 'login', bet = 1e7;
let inGame = false;               // 판 화면을 보고 있는지 (진행 중에 로비로 나갈 수 있음)
let shownSeq = null, playTimer = null, playAt = 0, bannerFor = null, chatSeen = 0, peekTimer = null;
const tokEls = new Map();         // `${pid}:${i}` → 말 요소
const tokNode = new Map();        // 마지막으로 그린 칸

// ---------- 공통 ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function won(n) {
  n = Number(n) || 0; const neg = n < 0; n = Math.abs(n);
  let s;
  if (n >= 1e8) { const e = Math.floor(n / 1e8), m = Math.round((n % 1e8) / 1e4); s = e + '억' + (m ? ' ' + m.toLocaleString('ko-KR') + '만' : ''); }
  else if (n >= 1e4) s = Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
  else s = n.toLocaleString('ko-KR');
  return (neg ? '-' : '') + s + '원';
}
const ITEM = id => ITEMS.find(x => x.id === id);
const artOf = id => { const it = ITEM(id); return it ? it.art : null; };
const pieceArt = id => artOf(id || 'p_basic') || { pat: 'dot', c1: '#5c3b1e', c2: '#e9d3a1', c3: '#8a5a2b' };
const skinPiece = skin => pieceArt(skin && skin.piece);
const woodOf = skin => ((artOf((skin && skin.stick) || 's_basic') || {}).wood) || '#b9824a';
const themeOf = skin => ((artOf((skin && skin.board) || 'b_hanji') || {}).theme) || 'hanji';
const colorVars = c => `--c:${c};--cl:${Art.light(c, .45)};--cd:${Art.dark(c, .45)}`;
const avHTML = (art, extra = '', style = '') => `<div class="av ${extra}" style="${style}">${Art.pieceSVG(art, 40)}</div>`;
function fan(wood) {
  const set = [[true, -21, -30], [false, -7, -10], [true, 7, 10], [false, 21, 30]];
  return `<div class="fan" aria-hidden="true">${set.map(([flat, rot, dx], i) =>
    `<div class="sp" style="left:calc(50% + ${dx}%);top:50%;transform:translate(-50%,-50%) rotate(${rot}deg)">${Art.stickEl(wood, i === 0).replace('class="stick"', `class="stick" style="transform:rotateY(${flat ? 0 : 180}deg)"`)}</div>`).join('')}</div>`;
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function show(id) { ['auth', 'lobby', 'game'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
let toastT;
function toast(msg, ok) { const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (ok ? ' ok' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast' + (ok ? ' ok' : ''), 2200); }
function modal(html) { $('modalPanel').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }
document.querySelectorAll('#modal [data-close]').forEach(el => el.onclick = closeModal);

// ---------- 로그인 ----------
$('heroSticks').innerHTML = fan('#b9824a');
$('authSeg').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  authMode = b.dataset.m;
  document.querySelectorAll('#authSeg button').forEach(x => x.classList.toggle('on', x === b));
  $('authBtn').textContent = authMode === 'login' ? '로그인' : '회원가입';
  $('authErr').textContent = '';
};
function doAuth() {
  socket.emit(authMode, { username: $('authName').value, password: $('authPw').value }, res => {
    if (res.error) { $('authErr').textContent = res.error; return; }
    if (authMode === 'register') toast('가입 완료! 10억원이 지급됐어요', true);
  });
}
$('authBtn').onclick = doAuth;
$('authPw').onkeydown = e => { if (e.key === 'Enter') doAuth(); };

// ---------- 로비 ----------
$('lobbyTabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.t;
  document.querySelectorAll('#lobbyTabs button').forEach(x => x.classList.toggle('on', x === b));
  ['rooms', 'rank', 'shop', 'profile'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== tab));
  if (tab === 'rank') loadRank();
  renderLobby();
};
$('logoutBtn').onclick = () => location.reload();
$('rulesBtn').onclick = $('gRulesBtn').onclick = showRules;
$('newRoomBtn').onclick = () => {
  const draw = () => modal(`<h3>판 만들기</h3>
    <p class="hint" style="text-align:left">모두 같은 판돈을 내고, 말 네 개를 먼저 다 내보낸 사람이 판돈을 전부 가져가요. 이기면 🏆 1개.</p>
    <div class="bet-grid">${BETS.map(b => `<button class="bet-opt${b === bet ? ' on' : ''}" data-b="${b}" ${me.assets < b ? 'disabled' : ''}>${won(b)}<small>4명이면 ${won(b * 4)}</small></button>`).join('')}</div>
    <div class="row2"><button class="btn" data-close>취소</button><button class="btn green" id="mkGo">${won(bet)}로 만들기</button></div>`);
  draw();
  const bind = () => {
    document.querySelectorAll('.bet-opt').forEach(b => b.onclick = () => { bet = +b.dataset.b; draw(); bind(); });
    document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
    $('mkGo').onclick = () => { closeModal(); act('create', bet); };
  };
  bind();
};
$('quickBtn').onclick = () => {
  const r = lobby.find(x => x.n < 4 && me.assets >= x.bet);
  if (!r) return toast('들어갈 수 있는 판이 없어요. 직접 만들어 보세요');
  act('join', r.code);
};
$('joinCodeBtn').onclick = () => act('join', $('joinCode').value.trim().toUpperCase());
$('joinCode').onkeydown = e => { if (e.key === 'Enter') $('joinCodeBtn').click(); };

function showRules() {
  modal(`<h3>윷놀이 규칙</h3>
    <div class="yut-chart"><div><b>도</b>한 칸</div><div><b>개</b>두 칸</div><div><b>걸</b>세 칸</div><div><b>윷</b>네 칸 · 한 번 더</div><div><b>모</b>다섯 칸 · 한 번 더</div><div><b>뒷도</b>한 칸 뒤로</div></div>
    <ul class="rules">
      <li>오른쪽 아래 <b>출발</b>에서 시작해 판을 한 바퀴 돌아 다시 나가면 <b>났다</b>.</li>
      <li>모서리(첫 모·둘째 모)나 가운데(방)에 멈추면 <b>지름길</b>로 갈 수 있어요.</li>
      <li>상대 말이 있는 칸에 서면 <b>잡아서</b> 출발로 돌려보내요.</li>
      <li>내 말끼리 같은 칸에 서면 <b>업혀서</b> 함께 움직여요.</li>
      <li>말 네 개를 먼저 다 내보낸 사람이 <b>판돈 전부 + 🏆 1개</b>.</li>
      <li>한 차례는 20초. 시간이 지나면 자동으로 던지고 움직여요.</li>
    </ul><button class="btn gold" data-close>알겠어요</button>`);
  document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
}

function loadRank() {
  socket.emit('rank', res => {
    const list = (res && res.list) || [];
    $('rankList').innerHTML = list.length ? list.map((r, i) => `<div class="rank-row${me && r.name === me.username ? ' me' : ''}">
        <div class="no${i < 3 ? ' top' : ''}">${['🥇', '🥈', '🥉'][i] || i + 1}</div>${avHTML(pieceArt(r.piece))}
        <div class="nm"><b>${esc(r.name)}</b><span>${r.games}판 · 승률 ${Math.round(r.win / r.games * 100)}% · 🏆 ${r.trophy}</span></div>
        <div class="amt">${r.win}승</div></div>`).join('')
      : '<p class="empty-note">아직 랭킹이 없어요. 첫 판을 이겨 보세요!</p>';
  });
}

function renderLobby() {
  if (!me) return;
  const y = me.yut || {};
  $('meChip').innerHTML = `${avHTML(pieceArt(me.equip && me.equip.piece))}<div><b>${esc(me.username)}</b><span>우승 ${y.win || 0}회 · <i class="tro">🏆 ${me.trophy || 0}</i></span></div>`;
  $('wTotal').textContent = won(me.assets + (me.yutHold || 0));
  $('wCash').textContent = won(me.assets).replace('원', '');
  $('wHold').textContent = won(me.yutHold || 0).replace('원', '');
  $('wTrophy').textContent = '🏆 ' + (me.trophy || 0);

  if (tab === 'rooms') {
    $('backToRoom').innerHTML = room && !inGame ? `<button class="btn gold big back-room" id="backBtn">진행 중인 판으로 돌아가기</button>` : '';
    if ($('backBtn')) $('backBtn').onclick = () => { inGame = true; renderAll(); };
    $('roomList').innerHTML = lobby.length ? lobby.map(r => `<button class="room" data-join="${r.code}">
        <span class="tag bet">${won(r.bet).replace('원', '')}</span>
        <div class="info"><b>${esc(r.host)}님의 판</b><span>코드 ${r.code} · 판돈 합계 ${won(r.bet * r.n)}</span></div>
        <div class="pips">${[0, 1, 2, 3].map(i => `<i class="${i < r.n ? 'on' : ''}"></i>`).join('')}</div>
        <span class="cnt">${r.n}/4</span></button>`).join('')
      : '<p class="empty-note">열린 판이 없어요.<br>판을 만들고 친구를 불러 보세요!</p>';
    document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => act('join', b.dataset.join));
  }
  if (tab === 'shop') renderShop();
  if (tab === 'profile') renderProfile();
}

function renderShop() {
  const cats = [['piece', '말', '판 위에서 움직이는 내 말'], ['stick', '윷가락', '던질 때 보이는 윷'], ['board', '말판', '내 화면에 깔리는 판']];
  $('tab-shop').innerHTML = `<div class="shop-head glass"><div><span>보유 트로피</span><b>🏆 ${me.trophy || 0}</b></div>
      <p class="hint">판에서 우승할 때마다 🏆 1개를 받아요. 꾸미기는 트로피로만 살 수 있어요.</p></div>
    ${cats.map(([cat, name, sub]) => `<div class="shop-cat">${name} <small>${sub}</small></div>
      <div class="shop-grid">${ITEMS.filter(i => i.cat === cat).map(it => {
        const owned = (me.owned || []).includes(it.id), on = Object.values(me.equip || {}).includes(it.id);
        const pv = cat === 'piece' ? Art.pieceSVG(it.art, 44) : cat === 'stick' ? fan(it.art.wood) : `<div class="pv-bd">${Art.boardSVG({ theme: it.art.theme })}</div>`;
        const btn = on ? `<button class="btn small" disabled>장착 중</button>`
          : owned ? `<button class="btn small" data-equip="${it.id}">장착</button>`
          : `<button class="btn small gold" data-buy="${it.id}" ${(me.trophy || 0) < it.price ? 'disabled' : ''}>🏆 ${it.price}</button>`;
        return `<div class="shop-item${on ? ' on' : ''}"><div class="pv">${pv}</div><b>${esc(it.name)}</b><span>${esc(it.desc)}</span>${btn}</div>`;
      }).join('')}</div>`).join('')}`;
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => socket.emit('shop', { op: 'buy', id: b.dataset.buy }, r => r.error ? toast(r.error) : toast('구매했어요! 바로 장착해 보세요', true)));
  document.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => socket.emit('shop', { op: 'equip', id: b.dataset.equip }, r => r.error ? toast(r.error) : toast('장착했어요', true)));
}

function renderProfile() {
  const y = me.yut || {}, eq = me.equip || {};
  const rate = y.games ? Math.round((y.win || 0) / y.games * 100) : 0;
  const title = y.win >= 10 ? '윷판의 신' : y.win >= 5 ? '윷판의 왕' : y.win >= 1 ? '승부사' : '새내기';
  const it = id => ITEM(id) || {};
  $('tab-profile').innerHTML = `<div class="profile-card glass"><div class="av big-av">${Art.pieceSVG(pieceArt(eq.piece), 96)}</div>
      <b>${esc(me.username)}</b><span class="hint">칭호 <b>${title}</b></span></div>
    <div class="stats glass"><div><span>판수</span><b>${y.games || 0}판</b></div><div><span>우승</span><b>${y.win || 0}회</b></div>
      <div><span>승률</span><b>${rate}%</b></div><div><span>손익</span><b style="color:${(y.net || 0) >= 0 ? '#6ee7a8' : '#ff8f8f'}">${(y.net || 0) > 0 ? '+' : ''}${won(y.net || 0)}</b></div></div>
    <div class="equip-row glass"><div><div class="pv">${Art.pieceSVG(pieceArt(eq.piece), 44)}</div><span>${esc(it(eq.piece).name || '')}</span></div>
      <div><div class="pv">${fan(woodOf(eq))}</div><span>${esc(it(eq.stick).name || '')}</span></div>
      <div><div class="pv"><div class="pv-bd" style="width:56px;height:56px;border-radius:6px;overflow:hidden">${Art.boardSVG({ theme: themeOf(eq) })}</div></div><span>${esc(it(eq.board).name || '')}</span></div></div>`;
}

// ---------- 게임 ----------
$('exitBtn').onclick = () => {
  if (!room) return;
  if (room.status === 'open') {
    const host = room.host === me.username;
    modal(`<h3>${host ? '판을 닫을까요?' : '판에서 나갈까요?'}</h3><p class="hint" style="text-align:left">${host ? '모든 사람에게 판돈을 돌려주고 판이 사라져요.' : '낸 판돈은 돌려받아요.'}</p>
      <div class="row2"><button class="btn" data-close>취소</button><button class="btn red" id="exGo">${host ? '판 닫기' : '나가기'}</button></div>`);
    document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
    $('exGo').onclick = () => { closeModal(); act(host ? 'cancel' : 'leave'); };
  } else if (room.status === 'play') { inGame = false; renderAll(); toast('판은 계속 진행돼요. 로비에서 돌아올 수 있어요', true); }
  else { room = null; inGame = false; act('list'); }
};
$('chatBtn').onclick = () => { $('chatSheet').classList.remove('hidden'); chatSeen = room ? room.chat.length : 0; $('chatBadge').classList.add('hidden'); renderChat(); setTimeout(() => $('chatInput').focus(), 50); };
document.querySelectorAll('#chatSheet [data-close]').forEach(el => el.onclick = () => $('chatSheet').classList.add('hidden'));
$('chatForm').onsubmit = e => { e.preventDefault(); const t = $('chatInput').value; $('chatInput').value = ''; if (t.trim()) act('chat', t); };
$('boardSvg').onclick = e => { const g = e.target.closest('.tg'); if (g) act('move', +g.dataset.opt); };

// 판 크기: 남는 공간 안에서 정사각형
const sizeTable = () => {
  const z = document.querySelector('.table-zone'), t = $('yutTable');
  if (!z || !t) return;
  const s = Math.max(200, Math.min(z.clientWidth - 20, z.clientHeight - 6, 560));
  t.style.width = t.style.height = s + 'px'; t.style.setProperty('--s', s + 'px');
};
if (window.ResizeObserver) new ResizeObserver(sizeTable).observe(document.querySelector('.table-zone'));
window.addEventListener('resize', sizeTable);

function renderGame() {
  const v = room;
  const mine = v.players.find(p => p.id === v.you);
  $('gName').textContent = `${v.host}님의 판`;
  $('gSub').textContent = `판돈 ${won(v.pot)} · 코드 ${v.code}`;

  // 상대 자리 (대기 중이면 빈 자리까지 4칸)
  const others = v.players.filter(p => p.id !== v.you);
  const empties = v.status === 'open' ? Math.max(0, 3 - others.length) : 0;
  $('oppRow').innerHTML = others.map(p => {
    const wait = p.nodes.filter(n => n === 'start').length;
    const slots = [...Array(p.done).fill('done'), ...Array(Math.max(0, 4 - p.done - wait)).fill('on'), ...Array(wait).fill('')];
    const stTxt = p.afk ? '💤 자리비움' : p.turn ? '던지는 중' : v.status === 'open' ? '준비 완료' : `${p.done}개 났음`;
    return `<div class="opp${p.turn ? ' turn' : ''}${p.afk ? ' afk' : ''}" style="${colorVars(p.color)}">${avHTML(skinPiece(p.skin))}
      <div class="who"><b>${esc(p.name)}${p.host ? ' 👑' : ''}</b><span>${stTxt}</span>
        <div class="slots">${slots.map(k => `<i class="${k}"></i>`).join('')}</div></div>${p.turn ? '<i class="tbar"></i>' : ''}</div>`;
  }).join('') + Array(empties).fill('<div class="opp empty">빈 자리</div>').join('');

  // 새로 던졌으면 판 위에 윷 연출 → 끝난 뒤 말 이동
  const fresh = shownSeq !== null && v.seq !== shownSeq && v.last;
  if (v.seq !== shownSeq) { if (fresh) showToss(v); shownSeq = v.seq; }
  if (fresh && !REDUCED) playAt = Date.now() + 1650;
  clearTimeout(playTimer);
  const wait = Math.max(0, playAt - Date.now());
  if (wait) playTimer = setTimeout(renderPlay, wait); else renderPlay();

  renderChat();
  sizeTable();
}

function renderPlay() {
  const v = room; if (!v) return;
  const mine = v.players.find(p => p.id === v.you) || { color: '#888', nodes: [], done: 0 };
  const steps = v.last ? v.last.steps : 1;
  $('boardSvg').innerHTML = Art.boardSVG({ theme: themeOf(mine.skin), options: v.canMove ? v.options : [], steps });
  placeTokens(v);

  // 내 자리
  const wait = mine.nodes.filter(n => n === 'start').length;
  const st = mine.nodes.map(n => n === 'goal' ? 'done' : n === 'start' ? '' : 'on');
  const by = v.last && v.players.find(p => p.id === v.last.by);
  $('myPanel').className = 'my-panel' + (mine.turn ? ' turn' : '');
  $('myPanel').style.cssText = colorVars(mine.color);
  $('myPanel').innerHTML = `${avHTML(skinPiece(mine.skin))}<div class="my-info"><span class="mi-label">내 말 · 대기 ${wait} · 판 위 ${st.filter(s => s === 'on').length} · 났음 ${mine.done}</span>
    <div class="my-slots">${st.map(s => `<div class="my-slot ${s}">${Art.pieceSVG(skinPiece(mine.skin), 20)}</div>`).join('')}</div></div>
    ${v.last ? `<div class="last-chip">${by ? esc(by.id === v.you ? '나' : by.name) : ''}<b>${esc(v.last.name)}</b></div>` : ''}`;

  // 컨트롤
  const turn = v.players.find(p => p.turn);
  let h = '';
  if (v.status === 'open') {
    const host = v.host === me.username;
    h = host ? `<div class="wait">${v.players.length < MIN_START ? `친구가 들어오면 시작할 수 있어요 · 코드 <b>${v.code}</b>` : `${v.players.length}명 모였어요 (최대 4명)`}
        <div class="row"><button class="btn" id="cancelBtn">판 닫기</button><button class="btn green" id="startBtn" ${v.players.length < MIN_START ? 'disabled' : ''}>시작하기</button></div></div>`
      : `<div class="wait">방장이 시작하길 기다리는 중…<div class="row"><button class="btn" id="leaveBtn">나가기</button></div></div>`;
  } else if (v.status === 'play') {
    if (v.canThrow) h = `<button class="btn gold big throw-btn" id="throwBtn">윷 던지기</button>`;
    else if (v.canMove) h = `<p class="hint">판에서 빛나는 자리를 누르거나 아래에서 고르세요</p><div class="opt-grid">${v.options.map((o, i) =>
      `<button class="btn" data-opt="${o.id}">${v.options.length > 1 ? `<span class="num">${o.to === 'goal' ? '났' : i + 1}</span>` : ''}${optLabel(o)}</button>`).join('')}</div>`;
    else h = `<div class="wait">${esc(turn ? turn.name : '')}님 차례예요</div>`;
    h += `<div class="turn-bar"><i id="myBar"></i></div>`;
  } else {
    h = `<button class="btn gold big" id="toLobby">로비로</button>`;
  }
  if (v.status === 'play' && mine.afk) h = `<div class="afk-note"><span>💤 자리비움 중이라 자동으로 진행돼요</span><button class="btn gold small" id="backAfk">돌아왔어요</button></div>` + h;
  else if (v.status === 'play' && mine.turn && mine.miss > 0) h = `<p class="hint">시간초과 ${mine.miss}/3 · 3번이면 자리비움으로 바뀌어요</p>` + h;
  $('controls').innerHTML = h;
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  on('backAfk', () => act('back'));
  on('throwBtn', () => { $('throwBtn').disabled = true; act('throw'); });
  on('startBtn', () => act('start')); on('cancelBtn', () => $('exitBtn').click()); on('leaveBtn', () => act('leave'));
  on('toLobby', () => { room = null; inGame = false; act('list'); });
  document.querySelectorAll('#controls [data-opt]').forEach(b => b.onclick = () => act('move', +b.dataset.opt));

  if (v.status === 'done' && bannerFor !== v.code + v.seq) { bannerFor = v.code + v.seq; showBanner(v); }
  if (v.status !== 'done') $('banner').classList.add('hidden');
  tickTimer();
}

function optLabel(o) {
  if (o.from === 'start') return '새 말 놓기';
  if (o.to === 'goal') return '말 내보내기';
  if (o.route === 'back') return '한 칸 뒤로';
  if (o.route === 'A' || o.route === 'B') return '지름길로';
  return '말 옮기기';
}

// ---------- 말 그리기와 이동 ----------
const pct = n => Art.XY[n] || Art.XY.start;
function placeTokens(v) {
  const layer = $('tokLayer');
  const movable = new Set(v.canMove ? v.options.map(o => o.from) : []);
  const mover = v.last && v.last.by;
  const before = new Map(tokNode);           // 이번 갱신 전 위치
  const fx = [];
  v.players.forEach(p => {
    const art = skinPiece(p.skin);
    const groups = {};
    p.nodes.forEach((n, i) => { if (n !== 'start' && n !== 'goal') (groups[n] = groups[n] || []).push(i); });
    const prevCount = n => p.nodes.filter((_, j) => before.get(p.id + ':' + j) === n).length;
    let goalFx = false;
    p.nodes.forEach((n, i) => {
      const key = p.id + ':' + i;
      let el = tokEls.get(key);
      if (!el) {
        el = document.createElement('div'); el.className = 'tok hid';
        el.innerHTML = Art.pieceSVG(art, 20) + '<span class="cnt" hidden></span>';
        el.style.setProperty('--c', p.color); el.style.setProperty('--cl', Art.light(p.color, .45)); el.style.setProperty('--cd', Art.dark(p.color, .45));
        const [x, y] = pct(n); el.style.left = x + '%'; el.style.top = y + '%';
        layer.appendChild(el); tokEls.set(key, el); tokNode.set(key, n);
      }
      const prev = tokNode.get(key);
      const onBoard = n !== 'start' && n !== 'goal';
      const g = onBoard ? groups[n] : null;
      const primary = !!(g && g[0] === i);
      el.classList.toggle('can', primary && p.id === v.you && movable.has(n));
      const cnt = el.querySelector('.cnt');
      if (primary && g.length > 1) { cnt.hidden = false; cnt.textContent = g.length; } else cnt.hidden = true;
      if (prev === n) { el.classList.toggle('hid', !primary); return; }
      tokNode.set(key, n);
      // 잡힘: 남의 말이 판 위에서 출발로 돌아감
      if (n === 'start' && prev !== 'start' && prev !== 'goal') {
        const [x, y] = pct('start'); el.classList.add('hid'); el.style.left = x + '%'; el.style.top = y + '%';
        fx.push({ kind: 'catch', node: prev, color: p.color, at: hopTime(guessLen(v)) }); return;
      }
      const path = p.id === mover && v.last ? Art.pathOf(prev, n, v.last.steps, guessRoute(prev, n, v.last.steps)) : [prev, n];
      el.classList.toggle('hid', onBoard && !primary);
      hopAlong(el, path, () => { if (!onBoard || !primary) el.classList.add('hid'); });
      if (n === 'goal' && !goalFx) { goalFx = true; fx.push({ kind: 'goal', node: 'R20', color: p.color, at: hopTime(path.length - 1) }); }
      if (primary) {
        document.querySelectorAll('.tok.last').forEach(t => t !== el && t.classList.remove('last'));
        el.classList.add('last'); clearTimeout(el._lt); el._lt = setTimeout(() => el.classList.remove('last'), 2600);
        if (p.id === mover && g.length > 1 && prevCount(n) > 0) fx.push({ kind: 'stack', node: n, color: p.color, at: hopTime(path.length - 1) });
      }
    });
  });
  const TXT = { catch: '잡았다!', goal: '났다!', stack: '업었다!' };
  fx.forEach(f => setTimeout(() => burst(f.kind, f.node, f.color, TXT[f.kind]), f.at));
}
function guessRoute(from, to, steps) {
  for (const r of ['main', 'A']) { const p = Art.pathOf(from, to, steps, r); if (p.length === steps + 1 || (to === 'goal' && p[p.length - 1] === 'goal')) return r; }
  return 'main';
}
const guessLen = v => Math.max(1, Math.abs(v.last ? v.last.steps : 1));
const hopTime = n => REDUCED ? 0 : Math.max(1, n) * 230;
function hopAlong(el, path, done) {
  const pts = path.map(pct);
  const [fx, fy] = pts[pts.length - 1];
  if (REDUCED || pts.length < 2 || !el.animate) { el.style.left = fx + '%'; el.style.top = fy + '%'; done && done(); return; }
  const frames = [];
  for (let k = 0; k < pts.length; k++) {
    const [x, y] = pts[k];
    if (k > 0) {
      const [px, py] = pts[k - 1];
      frames.push({ left: (px + x) / 2 + '%', top: (py + y) / 2 + '%', transform: 'translate(-50%,-50%) translateY(-38%) scale(1.18)' });
    }
    frames.push({ left: x + '%', top: y + '%', transform: 'translate(-50%,-50%) scale(1)' });
  }
  const offs = frames.map((_, k) => k / (frames.length - 1));
  frames.forEach((f, k) => f.offset = offs[k]);
  el.style.zIndex = 3;
  const a = el.animate(frames, { duration: (pts.length - 1) * 230, easing: 'linear' });
  el.style.left = fx + '%'; el.style.top = fy + '%';
  a.onfinish = () => { el.style.zIndex = ''; done && done(); };
}
function burst(kind, node, color, text) {
  const layer = $('fxLayer'); if (!layer) return;
  const [x, y] = kind === 'goal' ? [88, 88] : pct(node);
  const n = kind === 'catch' ? 16 : 12;
  const cols = kind === 'catch' ? ['#ff5a5f', '#ffd36a', '#fff'] : kind === 'goal' ? ['#ffd36a', '#fff3c4', '#ffb020'] : ['#7fe3ff', '#ffffff', color];
  let html = `<i class="ring-fx" style="left:${x}%;top:${y}%;--rc:${cols[0]}"></i>`;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * .4, d = 22 + Math.random() * 30;
    html += `<i class="spark" style="left:${x}%;top:${y}%;background:${cols[i % cols.length]};box-shadow:0 0 6px ${cols[i % cols.length]};--tx:${Math.cos(a) * d}px;--ty:${Math.sin(a) * d}px"></i>`;
  }
  html += `<b class="fx-txt" style="left:${Math.min(80, Math.max(20, x))}%;top:${y}%;--tc:${cols[0]}">${text}</b>`;
  const box = document.createElement('div'); box.innerHTML = html; layer.appendChild(box);
  setTimeout(() => box.remove(), 1400);
}

// ---------- 윷 던지기 연출 (판 위에 떴다가 사라짐) ----------
function showToss(v) {
  const t = $('toss'), last = v.last;
  const thrower = v.players.find(p => p.id === last.by);
  const wood = woodOf(thrower ? thrower.skin : null);
  const r = rng(v.seq * 7919 + 17);
  const spots = [];
  for (let i = 0; i < 4; i++) {
    let best = null, bd = -1;
    for (let k = 0; k < 50; k++) {
      const c = { x: 22 + r() * 56, y: 28 + r() * 32 };
      const d = spots.length ? Math.min(...spots.map(s => Math.hypot(s.x - c.x, (s.y - c.y) * 1.4))) : 99;
      if (d > bd) { best = c; bd = d; } if (d > 22) break;
    }
    spots.push({ ...best, rot: (r() < .5 ? 0 : 90) + (r() - .5) * 70 });
  }
  const big = last.name === '윷' || last.name === '모';
  t.className = 'toss' + (big ? ' big' : '') + (last.name === '뒷도' ? ' back' : '');
  t.innerHTML = `${big ? '<div class="rays"></div>' : ''}${spots.map((s, i) =>
      `<div class="sp" style="left:${s.x}%;top:${s.y}%;transform:translate(-50%,-50%) rotate(${s.rot}deg)">${Art.stickEl(wood, i === 0)}</div>`).join('')}
    <div class="toss-name"><b>${esc(last.name)}</b><span>${{ '도': '한 칸', '개': '두 칸', '걸': '세 칸', '윷': '네 칸 · 한 번 더!', '모': '다섯 칸 · 한 번 더!', '뒷도': '한 칸 뒤로' }[last.name] || ''}</span></div>`;
  const sps = t.querySelectorAll('.sp');
  sps.forEach((el, i) => {
    const ry = last.bits[i] ? 0 : 180;
    const st = el.querySelector('.stick'); st.style.transform = `rotateY(${ry}deg)`;
    if (REDUCED || !el.animate) return;
    const s = spots[i], delay = i * 60 + r() * 70, spin = 1080 + Math.round(r() * 2) * 360;
    el.animate([
      { transform: `translate(-50%,-50%) translate(${(50 - s.x) * 1.5}%, -260%) rotate(${s.rot - 220}deg) scale(1.5)`, opacity: 0 },
      { opacity: 1, offset: .15 },
      { transform: `translate(-50%,-50%) translateY(-18%) rotate(${s.rot - 25}deg) scale(1.08)`, offset: .62 },
      { transform: `translate(-50%,-50%) rotate(${s.rot + 7}deg) scale(.97)`, offset: .78 },
      { transform: `translate(-50%,-50%) translateY(-6%) rotate(${s.rot - 2}deg) scale(1.01)`, offset: .9 },
      { transform: `translate(-50%,-50%) rotate(${s.rot}deg) scale(1)` },
    ], { duration: 900, delay, easing: 'cubic-bezier(.3,.55,.4,1)', fill: 'backwards' });
    st.animate([{ transform: `rotateY(${ry + spin}deg) rotateX(35deg)` }, { transform: `rotateY(${ry + 30}deg) rotateX(8deg)`, offset: .75 }, { transform: `rotateY(${ry}deg)` }],
      { duration: 900, delay, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'backwards' });
    setTimeout(() => { const d = document.createElement('i'); d.className = 'dust'; d.style.left = s.x + '%'; d.style.top = (s.y + 4) + '%'; t.appendChild(d); }, delay + 700);
  });
  t.style.setProperty('--nd', REDUCED ? '0s' : '.95s');
  clearTimeout(showToss.t1); clearTimeout(showToss.t2);
  showToss.t1 = setTimeout(() => t.classList.add('out'), REDUCED ? 1200 : 1750);
  showToss.t2 = setTimeout(() => { t.classList.add('hidden'); t.innerHTML = ''; }, REDUCED ? 1600 : 2200);
}

function showBanner(v) {
  const b = $('banner'), mineWin = v.winner === me.username;
  const colors = ['#ffd36a', '#ff6b6f', '#6ee7a8', '#7fb2ff', '#fff'];
  b.innerHTML = `<div><div class="cup">🏆</div><b>${esc(v.winner)} 우승!</b><span>${mineWin ? `판돈 ${won(v.pot)} + 🏆 1개를 받았어요` : `판돈 ${won(v.pot)}을 가져갔어요`}</span></div>
    ${Array.from({ length: 36 }, (_, i) => `<i class="confetti" style="left:${(i * 37) % 100}%;background:${colors[i % 5]};animation-duration:${1.6 + (i % 7) * .25}s;animation-delay:${(i % 9) * .08}s"></i>`).join('')}`;
  b.classList.remove('hidden');
}

// ---------- 타이머 · 채팅 ----------
let tick = setInterval(tickTimer, 250);
function tickTimer() {
  if (!room || room.status !== 'play' || !room.deadline) return;
  const cur = room.players.find(p => p.turn);
  const left = Math.max(0, room.deadline - Date.now()), pctLeft = Math.min(100, left / (cur && cur.afk ? 2600 : TURN_MS) * 100);
  document.querySelectorAll('.opp .tbar, #myBar').forEach(el => { el.style.width = pctLeft + '%'; el.classList.toggle('low', left < 6000); });
}
function renderChat() {
  if (!room) return;
  const log = $('chatLog');
  log.innerHTML = room.chat.map(m => (m.name === '📢' || m.name === '🎲')
    ? `<div class="msg sys">${m.name === '🎲' ? '🎲 ' : ''}${esc(m.text)}</div>`
    : `<div class="msg${m.name === me.username ? ' mine' : ''}"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join('');
  log.scrollTop = log.scrollHeight;
  const open = !$('chatSheet').classList.contains('hidden');
  if (open) chatSeen = room.chat.length;
  const unread = room.chat.slice(chatSeen).filter(m => m.name !== '🎲').length;
  $('chatBadge').textContent = unread; $('chatBadge').classList.toggle('hidden', open || !unread);
  // 새 대화는 잠깐 위에 띄워 줌
  const lastMsg = room.chat[room.chat.length - 1];
  if (!open && lastMsg && renderChat.lastLen !== undefined && room.chat.length > renderChat.lastLen && lastMsg.name !== '🎲') {
    $('chatPeek').innerHTML = lastMsg.name === '📢' ? esc(lastMsg.text) : `<b>${esc(lastMsg.name)}</b>${esc(lastMsg.text)}`;
    $('chatPeek').classList.remove('hidden'); clearTimeout(peekTimer); peekTimer = setTimeout(() => $('chatPeek').classList.add('hidden'), 2600);
  }
  renderChat.lastLen = room.chat.length;
}

// ---------- 서버 ----------
function renderAll() {
  if (!me) return show('auth');
  if (room && inGame) { show('game'); renderGame(); }
  else { show('lobby'); renderLobby(); }
}
function act(op, arg) {
  socket.emit('yut', { op, arg }, res => {
    if (res.error) { toast(res.error); if (op === 'throw') renderPlay(); return; }
    if (op === 'list') {
      lobby = res.list || [];
      if (res.mine) { if (!room || room.code !== res.mine.code) { resetBoard(); inGame = true; } room = res.mine; }
    }
    if (res.state) room = res.state;
    if (op === 'create' || op === 'join') { inGame = true; resetBoard(); $('joinCode').value = ''; }
    if (op === 'leave' || op === 'cancel') { room = null; inGame = false; }
    renderAll();
  });
}
function resetBoard() { tokEls.forEach(el => el.remove()); tokEls.clear(); tokNode.clear(); shownSeq = null; playAt = 0; renderChat.lastLen = undefined; chatSeen = 0; }
socket.on('me', m => { const first = !me; me = m; if (first) { act('list'); } else if (!inGame) renderLobby(); });
socket.on('yuts', list => { lobby = list; if (!inGame) renderLobby(); });
socket.on('yutState', v => {
  if (!room || room.code !== v.code) return;
  room = v;
  if (inGame) renderGame(); else renderLobby();
});
socket.on('disconnect', () => toast('연결이 끊겼어요. 새로고침해 주세요'));
socket.on('connect', () => { if (me) act('list'); });

fetch('/api/shop').then(r => r.json()).then(list => { ITEMS = list; renderAll(); });
show('auth');
