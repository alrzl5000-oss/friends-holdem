// FRIENDS 윷놀이 — 화면 구조는 홀덤과 같음 (로그인 · 로비[게임/랭킹/상점/프로필] · 게임)
const socket = io();
const $ = id => document.getElementById(id);
const BETS = [1e6, 5e6, 1e7, 5e7, 1e8];
const TURN_MS = 20000;
const MIN_START = 2;
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let token = null; try { token = localStorage.getItem('fy_token'); } catch (e) {}
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
// 충전 딱지 (최근 24시간 충전 횟수)
const SHAME = ['', '좃밥', '좃좃밥', '걍접으셈'];
const shameTag = lv => lv > 0 ? ` <i class="shame lv${lv}">${SHAME[lv]}</i>` : '';
const artOf = id => { const it = ITEM(id); return it ? it.art : null; };
const pieceArt = id => artOf(id || 'p_basic') || { pat: 'dot', c1: '#5c3b1e', c2: '#e9d3a1', c3: '#8a5a2b' };
const skinPiece = skin => pieceArt(skin && skin.piece);
const woodOf = skin => ((artOf((skin && skin.stick) || 's_basic') || {}).wood) || '#b9824a';
const themeOf = skin => ((artOf((skin && skin.board) || 'b_hanji') || {}).theme) || 'hanji';
const EQ0 = { piece: 'p_basic', stick: 's_basic', board: 'b_hanji', trail: 'tr_none', pet: 'pet_none', frame: 'fr_none', card: 'nc_none' };
const eqOf = e => Object.assign({}, EQ0, e || {});
// 펫(말 옆에 따라다님) · 말 테두리 · 이름표
const petHTML = id => { const a = artOf(id) || {}; return a.em ? `<i class="pet pm-${a.move || 'hop'}${a.glow ? ' pet-glow' : ''}">${a.em}</i>` : ''; };
const frameHTML = id => { const a = artOf(id) || {}; return a.fr ? Art.frameSVG(a.fr) : ''; };
const cardCls = id => { const a = artOf(id) || {}; return a.nc ? ` nc nc-${a.nc}` : ''; };
const ncDeco = id => { const a = artOf(id) || {}; return a.nc ? `<span class="ncw">${Array.from({ length: 5 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span>` : ''; };
const colorVars = c => `--c:${c};--cl:${Art.light(c, .45)};--cd:${Art.dark(c, .45)}`;

// ---------- 설정 (테마: 기본 / 엑셀) ----------
const settings = (() => { let v = {}; try { v = JSON.parse(localStorage.getItem('fy_settings') || '{}'); } catch (e) {} return Object.assign({ theme: 'default', uiOp: 100, boardOp: 100 }, v); })();
const saveSettings = () => { try { localStorage.setItem('fy_settings', JSON.stringify(settings)); } catch (e) {} };
const isExcel = () => settings.theme === 'excel';
const XL_COLORS = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000'];
// 엑셀 모드에선 차트 계열 색으로
const SERVER_COLORS = ['#c43a4a', '#3f6fb8', '#d9a21f', '#2f8f78'];
// 엑셀 모드에선 서버 색과 1:1로 짝지은 차트 계열 색 (순서가 바뀌어도 그대로)
const colorOf = p => { if (!isExcel()) return p.color; const i = SERVER_COLORS.indexOf(p.color); return XL_COLORS[(i < 0 ? 0 : i) % 4]; };
function applyOpacity() {
  document.body.style.setProperty('--ui-op', Math.max(20, Math.min(100, +settings.uiOp || 100)) / 100);
  document.body.style.setProperty('--bd-op', Math.max(10, Math.min(100, +settings.boardOp || 100)) / 100);
}
function applyTheme() {
  applyOpacity();
  document.body.classList.toggle('excel', isExcel());
  document.title = isExcel() ? '2026_4분기_매출분석.xlsx - Excel' : 'FRIENDS 윷놀이';
  let icon = document.querySelector('link[rel=icon]');
  if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
  icon.href = 'data:image/svg+xml,' + encodeURIComponent(isExcel()
    ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#217346"/><text x="16" y="23" font-size="20" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">X</text></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0d3f29"/><g fill="#e9c46a"><rect x="7" y="6" width="4" height="20" rx="2"/><rect x="14" y="6" width="4" height="20" rx="2"/><rect x="21" y="6" width="4" height="20" rx="2"/></g></svg>');
  const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = isExcel() ? '#217346' : '#07100c';
}
applyTheme();
function openSettings() {
  const opt = (val, label, sub) => `<button data-v="${val}" class="${settings.theme === val ? 'on' : ''}">${label}<small>${sub}</small></button>`;
  modal(`<h3>설정</h3><div class="field-label">화면 테마</div>
    <div class="opt-group theme-opts">${opt('default', '🎴 기본', '전통 윷판')}${opt('excel', '📊 엑셀', '회사에서 몰래')}</div>
    <div class="op-row"><div class="field-label">화면 투명도 <b id="uiOpV">${settings.uiOp}%</b></div>
      <input type="range" class="op-range" id="uiOp" min="20" max="100" step="5" value="${settings.uiOp}" /><span class="hint">로비·게임 화면 전체가 흐려져요</span></div>
    <div class="op-row"><div class="field-label">말판·말 투명도 <b id="bdOpV">${settings.boardOp}%</b></div>
      <input type="range" class="op-range" id="bdOp" min="10" max="100" step="5" value="${settings.boardOp}" /><span class="hint">윷판(엑셀에선 차트)과 말만 흐려져요</span></div>
    <button class="btn" id="opReset">투명도 원래대로</button>
    <button class="btn gold" data-close>닫기</button>`);
  const bindRange = (id, key, lab) => { const r = $(id); r.oninput = () => { settings[key] = +r.value; $(lab).textContent = r.value + '%'; applyOpacity(); saveSettings(); }; };
  bindRange('uiOp', 'uiOp', 'uiOpV'); bindRange('bdOp', 'boardOp', 'bdOpV');
  $('opReset').onclick = () => { settings.uiOp = 100; settings.boardOp = 100; saveSettings(); applyOpacity(); openSettings(); };
  document.querySelectorAll('.theme-opts button').forEach(b => b.onclick = () => {
    settings.theme = b.dataset.v; saveSettings();
    applyTheme(); resetBoard(); renderAll(); openSettings();
  });
  document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
}
document.querySelectorAll('[data-settings]').forEach(b => b.onclick = openSettings);
// 엑셀 수식줄·상태줄을 상황에 맞게
function xlUpdate() {
  if (!isExcel()) return;
  if (room && inGame) {
    const ti = room.players.findIndex(p => p.turn);
    $('xlCell').textContent = ti >= 0 ? 'C' + (ti + 2) : 'D10';
    $('xlFormula').textContent = room.last ? `=COUNTIF(B2:B21,"${room.last.name}")` : '=SUM(C2:C5)';
    const done = room.players.reduce((a, p) => a + p.done, 0);
    $('xlStatus').textContent = `평균: ${Math.round(room.pot / room.players.length).toLocaleString()}   개수: ${room.players.length}   합계: ${room.pot.toLocaleString()}   완료: ${done}`;
  } else if (me) {
    $('xlCell').textContent = 'B3'; $('xlFormula').textContent = '=SUM(B5:D5)';
    $('xlStatus').textContent = `합계: ${Math.round(me.assets + (me.yutHold || 0)).toLocaleString()}`;
  } else { $('xlCell').textContent = 'A1'; $('xlFormula').textContent = ''; $('xlStatus').textContent = ''; }
}
const avHTML = (art, extra = '', style = '') => `<div class="av ${extra}${art && art.fx ? ' avfx-' + art.fx : ''}" style="${style}">${Art.pieceSVG(art, 40)}</div>`;
// 말 효과 장식: 효과마다 작은 조각(i) 몇 개 — 모양·움직임은 CSS (.fxw.fx-이름)
const FX_PARTS = { heart: 4, snow: 6, ghost: 3, disco: 6, orbit: 3, sandbag: 2, glitch: 0, zzz: 3, void: 3, bloom: 0, sunray: 0, moonglow: 3, float: 2, leaf: 3, ripple: 2, roar: 4, lightning: 3, fire: 6, rainbow: 2, gold: 4 };
const fxDeco = fx => (fx ? `<span class="fxw fx-${fx}">${Array.from({ length: FX_PARTS[fx] || 0 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span>` : '');
// 윷 효과 미리보기용 조각
const SFX_PARTS = { bubble: 5, snow: 6, ink: 3, confetti: 6, disco: 4, rocket: 3, meteor: 4, chips: 4, leaf: 4, jade: 3, flame: 6, thunder: 2, petals: 6, gold: 5 };
const sfxDeco = fx => (fx ? `<span class="sfxw sfx-${fx}">${Array.from({ length: SFX_PARTS[fx] || 0 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span>` : '');
// 상점 등급
const tierOf = price => price == null ? ['ach', '업적'] : price >= 50 ? ['legend', '전설'] : price >= 25 ? ['hero', '영웅'] : price >= 10 ? ['rare', '희귀'] : price > 0 ? ['normal', '일반'] : ['basic', '기본'];
function fan(wood) {
  const set = [[true, -21, -30], [false, -7, -10], [true, 7, 10], [false, 21, 30]];
  return `<div class="fan" aria-hidden="true">${set.map(([flat, rot, dx], i) =>
    `<div class="sp" style="left:calc(50% + ${dx}%);top:50%;transform:translate(-50%,-50%) rotate(${rot}deg)">${Art.stickEl(wood, i === 0).replace('class="stick"', `class="stick" style="transform:rotateY(${flat ? 0 : 180}deg)"`)}</div>`).join('')}</div>`;
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function show(id) { ['auth', 'lobby', 'game', 'mini'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
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
    if (res.token) { token = res.token; try { localStorage.setItem('fy_token', token); } catch (e) {} }
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
$('logoutBtn').onclick = () => {
  socket.emit('logout', { token }, () => { try { localStorage.removeItem('fy_token'); } catch (e) {} location.reload(); });
};
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
  const r = lobby.find(x => x.status === 'open' && x.n < 4 && me.assets >= x.bet);
  if (!r) return toast('들어갈 수 있는 판이 없어요. 직접 만들어 보세요');
  act('join', r.code);
};
// 판 코드로 들어가기: 윷놀이 판인지 미니게임 판인지 서버에 물어봄
$('joinCodeBtn').onclick = () => {
  const code = $('joinCode').value.trim().toUpperCase(); if (!code) return;
  socket.emit('whichCode', code, r => {
    if (r && r.kind === 'mini') { $('joinCode').value = ''; return window.Mini && Mini.join(code); }
    act('join', code);
  });
};
$('joinCode').onkeydown = e => { if (e.key === 'Enter') $('joinCodeBtn').click(); };

function showRules() {
  modal(`<h3>윷놀이 규칙</h3>
    <div class="yut-chart"><div><b>도</b>한 칸</div><div><b>개</b>두 칸</div><div><b>걸</b>세 칸</div><div><b>윷</b>네 칸 · 한 번 더</div><div><b>모</b>다섯 칸 · 한 번 더</div><div><b>뒷도</b>한 칸 뒤로</div><div><b>낙</b>판 밖 · 무효</div><div><b>&nbsp;</b>&nbsp;</div><div><b>&nbsp;</b>&nbsp;</div></div>
    <ul class="rules">
      <li>오른쪽 아래 <b>출발</b>에서 시작해 판을 한 바퀴 돌아 다시 나가면 <b>났다</b>.</li>
      <li>모서리(첫 모·둘째 모)나 가운데(방)에 멈추면 <b>지름길</b>로 갈 수 있어요.</li>
      <li>상대 말이 있는 칸에 서면 <b>잡아서</b> 출발로 돌려보내요.</li>
      <li>내 말끼리 같은 칸에 서면 <b>업혀서</b> 함께 움직여요.</li>
      <li>말 네 개를 먼저 다 내보낸 사람이 <b>판돈 전부 + 🏆 1개</b>.</li>
      <li><b>낙</b>(윷이 판 밖으로, 3%)이면 그 던지기는 무효고 차례가 넘어가요. 그리고 다 같이 놀려요.</li>
      <li>한 차례는 20초. 시간이 지나면 자동으로 던지고 움직여요.</li>
    </ul><div class="row2"><button class="btn" id="tallyBtn">📊 던지기 기록</button><button class="btn gold" data-close>알겠어요</button></div>`);
  $('tallyBtn').onclick = showTally;
  document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
}

// 던지기 기록 (이번 판 · 내 누적 · 전체 누적) — 이론 확률과 나란히
const NAMES = ['낙', '뒷도', '도', '개', '걸', '윷', '모'];
const THEORY = { '낙': 3, '뒷도': 4.2, '도': 12.6, '개': 34.6, '걸': 31.7, '윷': 10.9, '모': 3 };  // 낙 3% 먼저, 나머지 97%를 실측 기반 표로
function tallyRow(label, t) {
  const tot = NAMES.reduce((a, k) => a + (t[k] || 0), 0);
  return `<tr><th>${esc(label)}</th>${NAMES.map(k => `<td>${t[k] || 0}<small>${tot ? Math.round((t[k] || 0) / tot * 1000) / 10 + '%' : '-'}</small></td>`).join('')}<td>${tot}</td></tr>`;
}
function showTally() {
  socket.emit('throwStats', res => {
    const rows = [];
    if (room && room.tally) for (const p of room.players) rows.push(tallyRow(p.id === room.you ? `나 (이번 판)` : `${p.name} (이번 판)`, room.tally[p.id] || {}));
    rows.push(tallyRow('내 전체 기록', (res && res.mine) || {}));
    rows.push(tallyRow('모든 사람 합계', (res && res.all) || {}));
    modal(`<h3>던지기 기록</h3><p class="hint" style="text-align:left">서버가 실제로 던진 결과를 그대로 센 기록이에요.</p>
      <div class="tally-wrap"><table class="tally"><tr><th></th>${NAMES.map(k => `<th>${k}</th>`).join('')}<th>합계</th></tr>${rows.join('')}
      <tr class="theory"><th>이론 확률</th>${NAMES.map(k => `<td>${THEORY[k]}%</td>`).join('')}<td></td></tr></table></div>
      <button class="btn gold" data-close>닫기</button>`);
    document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
  });
}

function loadRank() {
  socket.emit('rank', res => {
    const list = (res && res.list) || [];
    $('rankList').innerHTML = list.length ? list.map((r, i) => `<div class="rank-row${me && r.name === me.username ? ' me' : ''}">
        <div class="no${i < 3 ? ' top' : ''}">${['🥇', '🥈', '🥉'][i] || i + 1}</div>${avHTML(pieceArt(r.piece))}
        <div class="nm"><b>${esc(r.name)}${shameTag(r.shame)}</b><span>${r.games}판 · 승률 ${Math.round(r.win / r.games * 100)}% · 🏆 ${r.trophy}</span></div>
        <div class="amt">${r.win}승</div></div>`).join('')
      : '<p class="empty-note">아직 랭킹이 없어요. 첫 판을 이겨 보세요!</p>';
  });
}

function renderLobby() {
  if (!me) return;
  setTimeout(xlUpdate);
  const y = me.yut || {};
  $('meChip').innerHTML = `${avHTML(pieceArt(me.equip && me.equip.piece))}<div><b>${esc(me.username)}${shameTag(me.shame)}</b><span>우승 ${y.win || 0}회 · <i class="tro">🏆 ${me.trophy || 0}</i></span></div>`;
  $('wTotal').textContent = won(me.assets + (me.yutHold || 0));
  $('wCash').textContent = won(me.assets).replace('원', '');
  $('wHold').textContent = won(me.yutHold || 0).replace('원', '');
  $('wTrophy').textContent = '🏆 ' + (me.trophy || 0);
  renderBailout();

  if (tab === 'rooms') {
    $('backToRoom').innerHTML = room && !inGame ? `<button class="btn gold big back-room" id="backBtn">${room.spectating ? '관전하던 판으로 돌아가기' : '진행 중인 판으로 돌아가기'}</button>` : '';
    if ($('backBtn')) $('backBtn').onclick = () => { inGame = true; renderAll(); };
    const list = lobby.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1));
    $('roomList').innerHTML = list.length ? list.map(r => {
      const open = r.status === 'open', canJoin = open && r.n < 4;
      return `<div class="room">
        <span class="tag ${open ? 'bet' : 'live'}">${open ? won(r.bet).replace('원', '') : '진행 중'}</span>
        <div class="info"><b>${esc(r.host)}님의 판</b><span>${open ? `코드 ${r.code} · ` : `판돈 ${won(r.bet).replace('원', '')} · `}합계 ${won(r.bet * r.n)}${r.watchers ? ` · 👀 ${r.watchers}` : ''}</span></div>
        <span class="cnt">${r.n}/4</span>
        ${canJoin ? `<button class="btn small green" data-join="${r.code}">입장</button>` : ''}
        <button class="watch-btn" data-watch="${r.code}">관전</button></div>`;
    }).join('') : '<p class="empty-note">열린 판이 없어요.<br>판을 만들고 친구를 불러 보세요!</p>';
    document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => act('join', b.dataset.join));
    document.querySelectorAll('[data-watch]').forEach(b => b.onclick = () => act('watch', b.dataset.watch));
    if (window.Mini) Mini.renderLobby();
  }
  if (tab === 'shop') renderShop();
  if (tab === 'profile') renderProfile();
}

// 충전 (현금+판돈 1억 미만일 때, 하루 3번)
function renderBailout() {
  const box = $('bailout'); if (!box) return;
  const poor = me.assets + (me.yutHold || 0) < 1e8, left = (me.bailoutLimit || 3) - (me.bailoutsToday || 0);
  const hrs = me.shameUntil ? Math.max(1, Math.ceil((me.shameUntil - Date.now()) / 3600000)) : 0;
  let h = '';
  if (poor && left > 0) h += `<button class="btn red big" id="bailBtn">💸 충전하기 <small>+${won(me.bailoutAmount || 3e8)} · 오늘 ${left}번 남음</small></button>`;
  else if (poor) h += `<p class="hint">오늘 충전 횟수를 다 썼어요. 내일 다시 충전할 수 있어요.</p>`;
  if (me.shame > 0) h += `<p class="hint shame-line">${shameTag(me.shame)} 딱지 중 · ${hrs}시간 뒤 해제 · 오늘 충전 ${me.bailoutsToday}/${me.bailoutLimit}번</p>`;
  box.innerHTML = h;
  const b = $('bailBtn');
  if (b) b.onclick = () => {
    const next = SHAME[Math.min(3, (me.shame || 0) + 1)];
    modal(`<h3>충전할까요?</h3><p class="hint" style="text-align:left">현금 <b>${won(me.bailoutAmount || 3e8)}</b>을 받는 대신 <b>24시간 동안 내 말에 「${next}」 딱지</b>가 붙어요. 다들 볼 수 있어요.<br>오늘 남은 충전: ${left}번</p>
      <div class="row2"><button class="btn" data-close>그만두기</button><button class="btn red" id="bailGo">충전</button></div>`);
    document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
    $('bailGo').onclick = () => { closeModal(); socket.emit('bailout', r => r.error ? toast(r.error) : toast(`+${won(r.amount)} 충전 · 이제 「${SHAME[r.level]}」`, true)); };
  };
}

// 잔상 미리보기: 말이 좌우로 오가며 효과를 흘림
function trailPrev(a) {
  if (!a || !a.kind) return `<div class="trail-prev none">—</div>`;
  const parts = Array.from({ length: 6 }, (_, k) => {
    const inner = a.kind === 'emoji' ? a.em : a.kind === 'ghost' ? Art.pieceSVG(pieceArt(eqOf(me.equip).piece), 18) : '';
    return `<i class="trl-p trl-${a.kind}" style="--k:${k};--h:${k * 50}">${inner}</i>`;
  }).join('');
  return `<div class="trail-prev">${parts}<div class="tp-tok" style="${colorVars('#7a5230')}">${Art.pieceSVG(pieceArt(eqOf(me.equip).piece), 22)}</div></div>`;
}
// 상점: 종류 탭 + 보유 중만 보기 (내 브라우저에 기억)
let shopCat = 'piece', shopOwned = false;
try { shopCat = localStorage.getItem('fy_shopCat') || 'piece'; shopOwned = localStorage.getItem('fy_shopOwned') === '1'; } catch (e) {}
function renderShop() {
  const cats = [['piece', '말', '판 위에서 움직이는 내 말'], ['stick', '윷가락', '던질 때 보이는 윷'], ['board', '말판', '내 화면에 깔리는 판'],
    ['trail', '이동 잔상', '말이 지나간 자리에 남는 효과'], ['pet', '펫', '내 말 옆에 따라다님'], ['frame', '말 테두리', '판 위 내 말 둘레'], ['card', '네임 카드', '게임 화면의 내 이름표']];
  const eqv = eqOf(me.equip);
  if (!cats.some(c => c[0] === shopCat)) shopCat = 'piece';
  const isOwned = it => it.price === 0 || (me.owned || []).includes(it.id);
  const cnt = cat => { const all = ITEMS.filter(i => i.cat === cat); return `${all.filter(isOwned).length}/${all.length}`; };
  const [cat, cname, csub] = cats.find(c => c[0] === shopCat);
  const list = ITEMS.filter(i => i.cat === cat && (!shopOwned || isOwned(i)));
  $('tab-shop').innerHTML = `<div class="shop-head glass"><div><span>보유 트로피</span><b>🏆 ${me.trophy || 0}</b></div>
      <p class="hint">판에서 우승할 때마다 🏆 1개를 받아요. 꾸미기는 트로피로만 살 수 있어요.</p></div>
    <div class="shop-tabs">${cats.map(([c, n]) => `<button data-scat="${c}" class="${c === cat ? 'on' : ''}">${n}<small>${cnt(c)}</small></button>`).join('')}</div>
    <div class="shop-bar"><div class="shop-cat">${cname} <small>${csub}</small></div>
      <button class="own-toggle${shopOwned ? ' on' : ''}" id="shopOwned" aria-pressed="${shopOwned}">${shopOwned ? '☑' : '☐'} 보유 중만</button></div>
    ${list.length ? '' : `<p class="hint shop-empty">아직 가진 ${esc(cname)}이(가) 없어요. 필터를 끄면 전체를 볼 수 있어요.</p>`}
    <div class="shop-grid">${list.map(it => {
        const owned = isOwned(it), on = eqv[it.cat] === it.id;
        const fx = it.art && it.art.fx;
        const pv = cat === 'piece' ? `<div class="tok-prev${fx ? ' tfx-' + fx : ''}" style="${colorVars('#7a5230')}">${Art.pieceSVG(it.art, 44)}${fxDeco(fx)}</div>`
          : cat === 'stick' ? `<div class="stick-prev">${fan(it.art.wood)}${sfxDeco(fx)}</div>`
          : cat === 'board' ? `<div class="pv-bd">${Art.boardSVG({ theme: it.art.theme })}</div>`
          : cat === 'trail' ? trailPrev(it.art)
          : cat === 'pet' ? `<div class="tok-prev pet-prev" style="${colorVars('#7a5230')}">${Art.pieceSVG(pieceArt(eqv.piece), 44)}${petHTML(it.id)}</div>`
          : cat === 'frame' ? `<div class="tok-prev frame-prev" style="${colorVars('#7a5230')}">${frameHTML(it.id)}${Art.pieceSVG(pieceArt(eqv.piece), 44)}</div>`
          : `<div class="nc-prev opp${cardCls(it.id)}" style="${colorVars('#c0303f')}">${ncDeco(it.id)}<div class="who"><b>${esc(me.username)}</b><span>던지는 중</span></div></div>`;
        const [tc, tn] = tierOf(it.price);
        const taunt = cat === 'piece' && it.taunts && it.taunts.length && it.price > 0 ? `<i class="taunt-prev">😈 "${esc(it.taunts[0].replace(/\{n\}/g, '상대'))}"</i>` : '';
        const achName = it.ach ? ((me.ach || []).find(a => a.id === it.ach) || {}).name || '업적' : '';
        const btn = on ? `<button class="btn small" disabled>장착 중</button>`
          : owned ? `<button class="btn small" data-equip="${it.id}">장착</button>`
          : it.ach ? `<button class="btn small" disabled>🔒 업적「${esc(achName)}」</button>`
          : `<button class="btn small gold" data-buy="${it.id}" ${(me.trophy || 0) < it.price ? 'disabled' : ''}>🏆 ${it.price}</button>`;
        return `<div class="shop-item tier-${tc}${on ? ' on' : ''}"><em class="tier">${tn}</em><div class="pv">${pv}</div><b>${esc(it.name)}</b><span>${esc(it.desc)}</span>${taunt}${btn}</div>`;
      }).join('')}</div>`;
  { const tb = document.querySelector('.shop-tabs'), on = tb && tb.querySelector('button.on'); if (on) tb.scrollLeft = Math.max(0, on.offsetLeft - tb.offsetLeft - 40); }
  document.querySelectorAll('[data-scat]').forEach(b => b.onclick = () => { shopCat = b.dataset.scat; try { localStorage.setItem('fy_shopCat', shopCat); } catch (e) {} renderShop(); });
  $('shopOwned').onclick = () => { shopOwned = !shopOwned; try { localStorage.setItem('fy_shopOwned', shopOwned ? '1' : '0'); } catch (e) {} renderShop(); };
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
    <button class="btn line" id="profTally">📊 내 던지기 기록 보기</button>
    <div class="stats glass"><div><span>판수</span><b>${y.games || 0}판</b></div><div><span>우승</span><b>${y.win || 0}회</b></div>
      <div><span>승률</span><b>${rate}%</b></div><div><span>손익</span><b style="color:${(y.net || 0) >= 0 ? '#6ee7a8' : '#ff8f8f'}">${(y.net || 0) > 0 ? '+' : ''}${won(y.net || 0)}</b></div></div>
    <div class="equip-row glass"><div><div class="pv">${Art.pieceSVG(pieceArt(eq.piece), 44)}</div><span>${esc(it(eq.piece).name || '')}</span></div>
      <div><div class="pv">${fan(woodOf(eq))}</div><span>${esc(it(eq.stick).name || '')}</span></div>
      <div><div class="pv"><div class="pv-bd" style="width:56px;height:56px;border-radius:6px;overflow:hidden">${Art.boardSVG({ theme: themeOf(eq) })}</div></div><span>${esc(it(eq.board).name || '')}</span></div></div>`;
  $('profTally').onclick = showTally;
  // 업적
  const list = me.ach || [], doneN = list.filter(a => a.done).length;
  const rw = r => [r.trophy ? `🏆 ${r.trophy}` : '', r.item ? `🎁 ${esc((ITEM(r.item) || {}).name || r.item)}` : ''].filter(Boolean).join(' + ');
  const fmt = (v, g) => g >= 1e8 ? `${won(v).replace('원', '')} / ${won(g).replace('원', '')}` : `${v.toLocaleString('ko-KR')} / ${g.toLocaleString('ko-KR')}`;
  const section = (title, arr) => `<div class="ach-head">${title} <b>${arr.filter(a => a.done).length}</b> / ${arr.length}</div>
    <div class="ach-list">${arr.slice().sort((a, b) => (a.done === b.done ? b.value / b.goal - a.value / a.goal : a.done ? 1 : -1)).map(a => `
      <div class="ach${a.done ? ' done' : ''}${a.reward.item ? ' has-item' : ''}${a.fun ? ' fun' : ''}">
        <div class="ach-ic">${a.done ? (a.fun ? '🤡' : '🏅') : a.reward.item ? '🎁' : '🔒'}</div>
        <div class="ach-body"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>
          <div class="ach-bar"><i style="width:${Math.min(100, a.value / a.goal * 100)}%"></i></div>
          <small>${a.done ? '달성 완료' : fmt(a.value, a.goal)} · 보상 ${rw(a.reward)}</small></div></div>`).join('')}</div>`;
  $('tab-profile').insertAdjacentHTML('beforeend', section('🏅 업적', list.filter(a => !a.fun)) + section('🤡 예능 업적', list.filter(a => a.fun)));
}

// ---------- 게임 ----------
$('exitBtn').onclick = () => {
  if (!room) return;
  if (room.spectating) { act('unwatch'); return; }
  if (room.status === 'open') {
    const host = room.host === me.username;
    modal(`<h3>${host ? '판을 닫을까요?' : '판에서 나갈까요?'}</h3><p class="hint" style="text-align:left">${host ? '모든 사람에게 판돈을 돌려주고 판이 사라져요.' : '낸 판돈은 돌려받아요.'}</p>
      <div class="row2"><button class="btn" data-close>취소</button><button class="btn red" id="exGo">${host ? '판 닫기' : '나가기'}</button></div>`);
    document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
    $('exGo').onclick = () => { closeModal(); act(host ? 'cancel' : 'leave'); };
  } else if (room.status === 'play') { inGame = false; renderAll(); toast('판은 계속 진행돼요. 로비에서 돌아올 수 있어요', true); }
  else { room = null; inGame = false; act('list'); }
};
$('chatBtn').onclick = () => { $('chatSheet').classList.remove('hidden'); seenN = chatN; $('chatBadge').classList.add('hidden'); renderChat(); setTimeout(() => $('chatInput').focus(), 50); };
document.querySelectorAll('#chatSheet [data-close]').forEach(el => el.onclick = () => $('chatSheet').classList.add('hidden'));
$('chatForm').onsubmit = e => { e.preventDefault(); const t = $('chatInput').value; $('chatInput').value = ''; if (t.trim()) act('chat', t); };
// 판에서 고르기: 도착 자리를 누르거나(같은 자리로 가는 말이 여럿이면 말을 고르라고 안내), 움직일 말을 직접 누름
$('boardSvg').onclick = e => {
  const g = e.target.closest('.tg'); if (!g) return;
  if (g.dataset.opt != null) return act('move', +g.dataset.opt);
  toast('같은 자리로 가는 말이 여러 개예요. 번호 붙은 말이나 아래 단추로 골라 주세요');
  const ids = g.dataset.multi.split(',');
  document.querySelectorAll('.tok.can').forEach(t => { if (ids.includes(t.dataset.opt)) { t.classList.remove('pick'); void t.offsetWidth; t.classList.add('pick'); } });
};
// 말을 눌렀을 때: 그 칸이 다른 말의 도착 자리면 '그 자리로 가는 말'을 움직임 (자리 우선)
// 도착 자리가 아닐 때만 누른 말 자신을 움직임
$('tokLayer').onclick = e => {
  const t = e.target.closest('.tok.can'); if (!t || !room) return;
  const into = (room.options || []).filter(o => o.to === t.dataset.node);
  if (into.length === 1) return act('move', into[0].id);
  if (into.length > 1) {
    toast('이 자리로 가는 말이 여러 개예요. 아래 단추에서 골라 주세요');
    const ids = into.map(o => String(o.id));
    document.querySelectorAll('.tok.can').forEach(x => { if (ids.includes(x.dataset.opt)) { x.classList.remove('pick'); void x.offsetWidth; x.classList.add('pick'); } });
    return;
  }
  if (t.dataset.opt != null) act('move', +t.dataset.opt);
};
// 단추에 손을 올리면 그 선택지 길만 진하게
function highlightOpt(i) {
  document.querySelectorAll('#boardSvg .route').forEach(r => r.classList.toggle('dim', i != null && r.dataset.i !== String(i)));
  document.querySelectorAll('#boardSvg .tg').forEach(t => t.classList.toggle('dim', i != null && !t.dataset.i.split(',').includes(String(i))));
  document.querySelectorAll('.tok.can').forEach(t => t.classList.toggle('hl', i != null && t.dataset.oi === String(i)));
}

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
  setTimeout(xlUpdate);
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
    return `<div class="opp${p.turn ? ' turn' : ''}${p.afk ? ' afk' : ''}${cardCls(p.skin && p.skin.card)}" data-name="${esc(p.name)}" style="${colorVars(colorOf(p))}">${ncDeco(p.skin && p.skin.card)}${avHTML(skinPiece(p.skin))}
      <div class="who"><b>${esc(p.name)}${p.host ? ' 👑' : ''}${shameTag(p.shame)}</b><span>${stTxt}</span>
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
  drawBubbles();
}

function renderPlay() {
  const v = room; if (!v) return;
  const mine = v.players.find(p => p.id === v.you) || { color: '#888', nodes: [], done: 0 };
  const steps = v.last ? v.last.steps : 1;
  $('boardSvg').innerHTML = Art.boardSVG({ theme: isExcel() ? 'excel' : themeOf(mine.skin), options: v.canMove ? v.options : [], steps });
  placeTokens(v);

  // 내 자리
  const wait = mine.nodes.filter(n => n === 'start').length;
  const st = mine.nodes.map(n => n === 'goal' ? 'done' : n === 'start' ? '' : 'on');
  const by = v.last && v.players.find(p => p.id === v.last.by);
  $('myPanel').className = 'my-panel' + (mine.turn ? ' turn' : '') + cardCls(mine.skin && mine.skin.card);
  $('myPanel').style.cssText = colorVars(colorOf(mine));
  $('myPanel').innerHTML = `${ncDeco(mine.skin && mine.skin.card)}${avHTML(skinPiece(mine.skin))}<div class="my-info">${mine.shame ? `<span class="mi-label">${shameTag(mine.shame)}</span>` : ''}<span class="mi-label">내 말 · 대기 ${wait} · 판 위 ${st.filter(s => s === 'on').length} · 났음 ${mine.done}</span>
    <div class="my-slots">${st.map(s => `<div class="my-slot ${s}">${Art.pieceSVG(skinPiece(mine.skin), 20)}</div>`).join('')}</div></div>
    ${v.last ? `<div class="last-chip" id="lastChip" title="던지기 기록">${by ? esc(by.id === v.you ? '나' : by.name) : ''}<b>${esc(v.last.name)}</b></div>` : ''}`;

  if (v.spectating) $('myPanel').innerHTML = `<div class="my-info"><span class="mi-label">관전 모드</span><span class="mi-name">👀 ${v.watchers}명 관전 중</span><span class="mi-label">관전자 채팅은 30자, 3초에 한 번</span></div>
    ${v.last ? `<div class="last-chip" id="lastChip">${(() => { const b = v.players.find(p => p.id === v.last.by); return b ? esc(b.name) : ''; })()}<b>${esc(v.last.name)}</b></div>` : ''}`;
  // 컨트롤
  const turn = v.players.find(p => p.turn);
  let h = '';
  if (v.spectating && v.status !== 'done') {
    h = `<div class="wait">👀 관전 중 · ${v.status === 'open' ? '시작 전이에요' : `${esc(turn ? turn.name : '')}님 차례`}<div class="row"><button class="btn" id="unwatchBtn">관전 그만하기</button></div></div>`
      + (v.status === 'play' ? `<div class="turn-bar"><i id="myBar"></i></div>` : '');
  } else if (v.status === 'open') {
    const host = v.host === me.username;
    h = host ? `<div class="wait">${v.players.length < MIN_START ? `친구가 들어오면 시작할 수 있어요 · 코드 <b>${v.code}</b>` : `${v.players.length}명 모였어요 (최대 4명)`}
        <div class="row"><button class="btn" id="cancelBtn">판 닫기</button><button class="btn green" id="startBtn" ${v.players.length < MIN_START ? 'disabled' : ''}>시작하기</button></div></div>`
      : `<div class="wait">방장이 시작하길 기다리는 중…<div class="row"><button class="btn" id="leaveBtn">나가기</button></div></div>`;
  } else if (v.status === 'play') {
    if (v.canThrow) h = (v.again ? `<p class="hint"><b>한 번 더!</b>${v.bonusLeft ? ` 이번 다음에도 ${v.bonusLeft}번 더 던져요` : ''}</p>` : '')
      + `<button class="btn gold big throw-btn" id="throwBtn">${v.again ? '한 번 더 던지기' : '윷 던지기'}</button>`;
    else if (v.canMove) h = `<p class="hint">판에서 빛나는 자리를 누르거나 아래에서 고르세요</p><div class="opt-grid">${v.options.map((o, i) =>
      `<button class="btn" data-opt="${o.id}" data-oi="${i}" style="--oc:${Art.optColor(i)}">${v.options.length > 1 ? `<span class="num">${i + 1}</span>` : ''}${optLabel(o)}</button>`).join('')}</div>`;
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
  on('toLobby', () => { if (room && room.spectating) act('unwatch'); room = null; inGame = false; act('list'); });
  on('unwatchBtn', () => act('unwatch'));
  { const lc = $('lastChip'); if (lc) lc.onclick = showTally; }
  document.querySelectorAll('#controls [data-opt]').forEach(b => {
    b.onclick = () => act('move', +b.dataset.opt);
    b.onmouseenter = b.onfocus = () => highlightOpt(+b.dataset.oi);
    b.onmouseleave = b.onblur = () => highlightOpt(null);
  });

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
// 말 이동·이펙트는 서버가 보내 주는 이동 기록(v.move)을 그대로 따름
let lastMoveN = null;
function placeTokens(v) {
  const layer = $('tokLayer');
  const movable = new Set(v.canMove ? v.options.map(o => o.from) : []);
  const mv = v.move;
  const fresh = !!(mv && mv.n !== lastMoveN && lastMoveN !== null);
  if (lastMoveN === null || (mv && mv.n !== lastMoveN)) lastMoveN = mv ? mv.n : 0;
  v.players.forEach(p => {
    const art = skinPiece(p.skin);
    const groups = {};
    p.nodes.forEach((n, i) => { if (n !== 'start' && n !== 'goal') (groups[n] = groups[n] || []).push(i); });
    p.nodes.forEach((n, i) => {
      const key = p.id + ':' + i;
      let el = tokEls.get(key);
      if (!el) {
        el = document.createElement('div'); el.className = 'tok hid'; el.dataset.p = p.id; el.dataset.i = i;
        el.innerHTML = frameHTML(p.skin && p.skin.frame) + Art.pieceSVG(art, 20) + fxDeco(art.fx) + petHTML(p.skin && p.skin.pet) + '<span class="cnt" hidden></span><span class="xl-lab"></span><b class="sh-tag" hidden></b>';
        if (art.fx) el.classList.add('tfx-' + art.fx);   // 말 전체용 효과(둥실·무지개·광택). 'fx-' 는 장식 전용이라 말에 붙이면 안 됨
        { const c = colorOf(p); el.style.setProperty('--c', c); el.style.setProperty('--cl', Art.light(c, .45)); el.style.setProperty('--cd', Art.dark(c, .45)); }
        el.querySelector('.xl-lab').textContent = (p.name || '?').slice(0, 1);
        const [x, y] = pct(n); el.style.left = x + '%'; el.style.top = y + '%';
        layer.appendChild(el); tokEls.set(key, el); tokNode.set(key, n);
      }
      { const c = colorOf(p); if (el.dataset.c !== c) { el.dataset.c = c; el.style.setProperty('--c', c); el.style.setProperty('--cl', Art.light(c, .45)); el.style.setProperty('--cd', Art.dark(c, .45)); } }
      const prev = tokNode.get(key);
      const onBoard = n !== 'start' && n !== 'goal';
      const g = onBoard ? groups[n] : null;
      const primary = !!(g && g[0] === i);
      el.dataset.node = n;
      const canMove = primary && p.id === v.you && movable.has(n);
      el.classList.toggle('can', canMove);
      // 움직일 수 있는 말엔 선택지 번호(색) — 눌러서 바로 이동
      let ob = el.querySelector('.opt-no'); if (!ob) { ob = document.createElement('span'); ob.className = 'opt-no'; el.appendChild(ob); }
      if (canMove) {
        const oi = v.options.findIndex(o => o.from === n);
        el.dataset.opt = v.options[oi].id; el.dataset.oi = oi;
        ob.hidden = v.options.length < 2; ob.textContent = oi + 1; ob.style.background = Art.optColor(oi);
      } else { delete el.dataset.opt; delete el.dataset.oi; ob.hidden = true; }
      const cnt = el.querySelector('.cnt');
      if (primary && g.length > 1) { cnt.hidden = false; cnt.textContent = g.length; } else cnt.hidden = true;
      const sh = el.querySelector('.sh-tag');   // 충전 딱지는 말 위에
      if (p.shame > 0) { sh.hidden = false; sh.textContent = SHAME[p.shame]; sh.className = 'sh-tag lv' + p.shame; } else sh.hidden = true;
      if (prev === n) { el.classList.toggle('hid', !primary); return; }
      tokNode.set(key, n);
      if (!onBoard && n === 'start') {   // 잡혀서 출발로 돌아감 (이펙트는 아래에서 이동 기록으로)
        const [x, y] = pct('start'); el.classList.add('hid'); el.style.left = x + '%'; el.style.top = y + '%'; return;
      }
      const path = fresh && mv.by === p.id && mv.path[0] === prev ? mv.path : [prev, n];
      el.classList.toggle('hid', onBoard && !primary);
      hopAlong(el, path, () => { if (!onBoard || !primary) el.classList.add('hid'); }, fresh && mv.by === p.id && path.length > 1 ? artOf(p.skin && p.skin.trail) : null);
      if (primary) {
        document.querySelectorAll('.tok.last').forEach(t => t !== el && t.classList.remove('last'));
        el.classList.add('last'); clearTimeout(el._lt); el._lt = setTimeout(() => el.classList.remove('last'), 2600);
      }
    });
  });
  if (fresh) {
    const mover = v.players.find(p => p.id === mv.by);
    const at = hopTime(mv.path.length - 1), color = mover ? mover.color : '#fff';
    mv.captured.forEach(c => setTimeout(() => burst('catch', c.node, color, '잡았다! 한 번 더'), at));
    if (mv.taunt && mv.captured.length) setTimeout(() => tauntFx(mv.taunt), at + 350);
    if (mv.stacked) setTimeout(() => burst('stack', mv.to, color, '업었다!'), at);
    if (mv.goal) setTimeout(() => burst('goal', 'R20', color, mv.count > 1 ? `${mv.count}동 났다!` : '났다!'), at);
  }
}
const hopTime = n => REDUCED ? 0 : Math.max(1, n) * 230;
function hopAlong(el, path, done, trail) {
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
  trailFx(el, trail, (pts.length - 1) * 230);
  el.style.left = fx + '%'; el.style.top = fy + '%';
  a.onfinish = () => { el.style.zIndex = ''; done && done(); };
}
// 이동 잔상: 말이 지나가는 동안 그 자리에 효과를 떨어뜨림
function trailFx(el, trail, dur) {
  if (!trail || !trail.kind || REDUCED) return;
  const layer = $('tokLayer'), t0 = performance.now(); let k = 0;
  const gap = { comet: 22, rainbow: 22, ghost: 65, ink: 90 }[trail.kind] || 80;
  const tick = () => {
    if (performance.now() - t0 > dur + 40) return;
    const cs = getComputedStyle(el);
    const d = document.createElement('i'); d.className = 'trl trl-' + trail.kind;
    d.style.left = cs.left; d.style.top = cs.top;
    if (trail.kind === 'emoji') { d.textContent = trail.em; d.style.setProperty('--dx', (Math.random() * 2 - 1) * 16 + 'px'); d.style.setProperty('--rot', (Math.random() * 90 - 45) + 'deg'); }
    else if (trail.kind === 'ghost') { const pc = el.querySelector('.pc'); if (pc) d.innerHTML = pc.outerHTML; d.style.cssText += ';' + ['--c', '--cl', '--cd'].map(v => v + ':' + el.style.getPropertyValue(v)).join(';'); }
    else if (trail.kind === 'rainbow') d.style.setProperty('--h', (k * 23) % 360);
    layer.insertBefore(d, layer.firstChild); k++;
    setTimeout(() => d.remove(), trail.kind === 'ink' ? 2200 : 1200);
    setTimeout(tick, gap);
  };
  tick();
}
// 잡은 사람 말에 딸린 조롱 한 줄을 판 가운데 크게
function tauntFx(text) {
  const layer = $('fxLayer'); if (!layer) return;
  const el = document.createElement('div'); el.className = 'taunt-fx'; el.textContent = text;
  layer.appendChild(el); setTimeout(() => el.remove(), 2800);
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
  const nak = !!last.nak;
  if (nak) { const k = Math.floor(r() * 4); spots[k] = { x: r() < .5 ? -18 : 118, y: 20 + r() * 50, rot: r() * 180, out: true }; }
  const big = last.name === '윷' || last.name === '모';
  const sfx = ((artOf((thrower && thrower.skin && thrower.skin.stick) || 's_basic') || {}).fx) || '';
  t.className = 'toss' + (big ? ' big' : '') + (last.name === '뒷도' ? ' back' : '') + (nak ? ' nak' : '') + (sfx ? ' sfx-' + sfx : '');
  t.innerHTML = `${big || sfx === 'gold' ? '<div class="rays"></div>' : ''}${sfx ? tossAmbient(sfx) : ''}${spots.map((s, i) =>
      `<div class="sp" style="left:${s.x}%;top:${s.y}%;transform:translate(-50%,-50%) rotate(${s.rot}deg)">${Art.stickEl(wood, i === 0)}</div>`).join('')}
    <div class="toss-name"><div class="xl-bits">${last.bits.map(b => `<i>${b ? 1 : 0}</i>`).join('')}</div><b>${nak ? '낙!' : esc(last.name)}</b><span>${nak ? esc(last.taunt || '판 밖으로 날아갔어요') : ({ '도': '한 칸', '개': '두 칸', '걸': '세 칸', '윷': '네 칸 · 한 번 더!', '모': '다섯 칸 · 한 번 더!', '뒷도': '한 칸 뒤로' }[last.name] || '')}</span></div>
    ${nak ? Array.from({ length: 22 }, (_, i) => `<i class="lol" style="left:${(i * 47) % 96}%;animation-delay:${.9 + (i % 8) * .09}s;animation-duration:${1.1 + (i % 5) * .15}s">${['🤣', '😂', '🫵', '🤡', '👎', '😆'][i % 6]}</i>`).join('') : ''}`;
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
    if (s.out) return;   // 낙: 판 밖으로 날아간 가락은 먼지 없음
    setTimeout(() => { const d = document.createElement('i'); d.className = 'dust'; d.style.left = s.x + '%'; d.style.top = (s.y + 4) + '%'; t.appendChild(d); if (sfx) landFx(t, sfx, s); }, delay + 700);
  });
  t.style.setProperty('--nd', REDUCED ? '0s' : '.95s');
  if (nak && !REDUCED) { const bw = $('boardWrap'); bw.classList.remove('shake'); void bw.offsetWidth; setTimeout(() => bw.classList.add('shake'), 850); }
  clearTimeout(showToss.t1); clearTimeout(showToss.t2);
  const stay = nak ? 1400 : 0;   // 낙은 놀리는 시간 조금 더
  showToss.t1 = setTimeout(() => t.classList.add('out'), (REDUCED ? 1200 : 1750) + stay);
  showToss.t2 = setTimeout(() => { t.classList.add('hidden'); t.innerHTML = ''; }, (REDUCED ? 1600 : 2200) + stay);
}

// 윷 효과: 던지는 동안 깔리는 분위기(tossAmbient) + 가락이 떨어질 때 튀는 것(landFx)
function tossAmbient(fx) {
  const n = { bubble: 12, snow: 22, ink: 0, confetti: 0, disco: 0, rocket: 0, meteor: 9, petals: 18, flame: 10, leaf: 10, gold: 10, thunder: 0, jade: 8, chips: 0 }[fx] || 0;
  const pick = { bubble: ['🫧'], snow: ['❄', '❅', '❆'], meteor: ['☄️'], petals: ['🌸', '🌸', '💮'], leaf: ['🍃', '🌿'], gold: ['✦', '🪙'], flame: [''], jade: [''] }[fx] || [''];
  let h = Array.from({ length: n }, (_, i) => `<i class="amb amb-${fx}" style="left:${(i * 53 + 7) % 96}%;animation-delay:${(i % 7) * .12}s;animation-duration:${1.4 + (i % 5) * .25}s">${pick[i % pick.length]}</i>`).join('');
  if (fx === 'meteor') h += '<i class="flash meteor"></i>';
  if (fx === 'disco') h += '<i class="disco-floor"></i>' + [0, 1, 2, 3].map(i => `<i class="beam" style="--h:${i * 90}deg;animation-delay:${i * -.4}s"></i>`).join('');
  if (fx === 'rocket') h += '<i class="smoke-sky"></i>';
  if (fx === 'thunder') h += '<i class="flash"></i>' + [22, 50, 78].map((x, i) => `<svg class="bolt" style="left:${x}%;animation-delay:${.62 + i * .05}s" viewBox="0 0 20 100"><path d="M12 0 L4 44 L11 44 L3 100 L17 38 L10 38 L16 0Z"/></svg>`).join('');
  return h;
}
function landFx(t, fx, s) {
  const conf = { bubble: ['#bfefff', 6, '🫧'], snow: ['#e8f6ff', 9, '❄'], ink: ['#111', 7, '●'], confetti: ['', 16, ''], disco: ['#fff', 7, '✦'], rocket: ['#ff9a3c', 6, '💥'], meteor: ['#c49bff', 10, '✦'], chips: ['#8a5a32', 7, '▪'], leaf: ['#5fbf4a', 6, '🍃'], jade: ['#4fe3c8', 8, '✦'], flame: ['#ff7a1a', 9, '●'], thunder: ['#9fd3ff', 8, '⚡'], petals: ['#ff9ec4', 7, '🌸'], gold: ['#ffd36a', 9, '🪙'] }[fx];
  if (!conf) return;
  const [col, n, ch] = conf;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * .5, d = 18 + Math.random() * 26;
    const e = document.createElement('i'); e.className = 'land land-' + fx; e.textContent = ch;
    const c = fx === 'confetti' ? ['#ff4d6d', '#ffd23f', '#3ddc84', '#2f9bff', '#c86bff'][i % 5] : col;
    e.style.cssText = `left:${s.x}%;top:${s.y}%;color:${c};background:${fx === 'confetti' ? c : 'none'};--tx:${Math.cos(a) * d * (fx === 'confetti' ? 1.6 : 1)}px;--ty:${Math.sin(a) * d - (fx === 'confetti' ? 30 : 10)}px;--r:${Math.round(Math.random() * 720)}deg`;
    t.appendChild(e);
  }
  // 특수: 먹물 얼룩 · 로켓 연기
  if (fx === 'ink') { const sp = document.createElement('i'); sp.className = 'ink-splat'; sp.style.cssText = `left:${s.x}%;top:${s.y}%;--r:${Math.round(Math.random() * 360)}deg`; t.appendChild(sp); }
  if (fx === 'rocket') { const sm = document.createElement('i'); sm.className = 'smoke'; sm.style.cssText = `left:${s.x}%;top:${s.y}%`; t.appendChild(sm); }
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
// 채팅: 메시지 번호(n)로 새 것만 덧붙임 → 깜빡임 없음
let chatN = 0, seenN = 0, chatCode = null;
const msgHTML = m => (m.name === '📢' || m.name === '🎲')
  ? `<div class="msg sys">${m.name === '🎲' ? '🎲 ' : ''}${esc(m.text)}</div>`
  : `<div class="msg${m.name === me.username ? ' mine' : ''}"><b>${m.watcher ? '👀 ' : ''}${esc(m.name)}</b>${esc(m.text)}</div>`;
function renderChat() {
  if (!room) return;
  const log = $('chatLog'), open = !$('chatSheet').classList.contains('hidden');
  const first = chatCode !== room.code;
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const fresh = first ? [] : room.chat.filter(m => (m.n || 0) > chatN);
  if (first) {
    chatCode = room.code; log.innerHTML = room.chat.map(msgHTML).join('');
    chatN = seenN = room.chat.reduce((a, m) => Math.max(a, m.n || 0), 0);
    log.scrollTop = log.scrollHeight;
    $('chatInput').maxLength = room.spectating ? 30 : 100;
    $('chatInput').placeholder = room.spectating ? '관전자는 30자까지 (3초에 한 번)' : '메시지 입력…';
  } else if (fresh.length) {
    log.insertAdjacentHTML('beforeend', fresh.map(msgHTML).join(''));
    while (log.children.length > 120) log.firstChild.remove();
    chatN = fresh[fresh.length - 1].n;
    if (nearBottom || fresh.some(m => m.name === me.username)) log.scrollTop = log.scrollHeight;
    for (const m of fresh) if (m.name !== '📢' && m.name !== '🎲') addBubble(m);
    const sysNew = fresh.filter(m => m.name === '📢').pop();
    if (!open && sysNew) {
      $('chatPeek').textContent = sysNew.text;
      $('chatPeek').classList.remove('hidden'); clearTimeout(peekTimer); peekTimer = setTimeout(() => $('chatPeek').classList.add('hidden'), 2800);
    }
  }
  if (open) seenN = chatN;
  const unread = room.chat.filter(m => (m.n || 0) > seenN && m.name !== '🎲').length;
  $('chatBadge').textContent = unread; $('chatBadge').classList.toggle('hidden', open || !unread);
}

// ---------- 말풍선: 한 번 만든 말풍선은 위치만 갱신 (다시 만들지 않음) ----------
const bubbles = new Map();   // 키 → { name, text, watcher, until, el }
let bubbleT = null;
function addBubble(m) {
  const key = m.watcher ? '👀' : m.name;
  const old = bubbles.get(key); if (old && old.el) old.el.remove();
  bubbles.set(key, { name: m.name, text: m.text, watcher: !!m.watcher, until: Date.now() + 4000, el: null });
  drawBubbles();
}
function drawBubbles() {
  const layer = $('bubLayer'); if (!layer) return;
  if (!room || !inGame) { layer.innerHTML = ''; bubbles.clear(); return; }
  const base = $('game').getBoundingClientRect(), now = Date.now();
  for (const [key, b] of bubbles) {
    if (b.until < now) { if (b.el) b.el.remove(); bubbles.delete(key); continue; }
    if (!b.el) {
      b.el = document.createElement('div');
      if (b.watcher) { b.el.className = 'bubble watcher'; b.el.innerHTML = `<b>👀 ${esc(b.name)}</b> ${esc(b.text)}`; }
      else b.el.textContent = b.text;
      layer.appendChild(b.el);
    }
    const el = b.el;
    if (b.watcher) {
      const bd = $('boardWrap').getBoundingClientRect();
      el.style.left = (bd.left + bd.width / 2 - base.left) + 'px'; el.style.top = (bd.top - base.top + 8) + 'px';
      continue;
    }
    const meName = me && b.name === me.username && !room.spectating;
    const box = meName ? $('myPanel') : document.querySelector(`.opp[data-name="${CSS.escape(b.name)}"]`);
    if (!box) { el.style.display = 'none'; continue; }
    el.style.display = '';
    const av = box.querySelector('.av'), ar = av && av.getBoundingClientRect();
    const r = ar && ar.width ? ar : box.getBoundingClientRect();
    if (meName) { el.className = 'bubble up l'; el.style.left = (r.left - base.left + (ar && ar.width ? 0 : 12)) + 'px'; el.style.top = (r.top - base.top - 6) + 'px'; }
    else {
      const x = r.left + r.width / 2 - base.left, side = x < 70 ? ' l' : x > base.width - 70 ? ' r' : '';
      el.className = 'bubble down' + side;
      el.style.left = (side === ' l' ? r.left - base.left : side === ' r' ? r.right - base.left : x) + 'px'; el.style.top = (r.bottom - base.top + 10) + 'px';
    }
  }
  clearTimeout(bubbleT);
  if (bubbles.size) bubbleT = setTimeout(drawBubbles, 500);
}

// ---------- 서버 ----------
function renderAll() {
  if (me && window.Mini && Mini.active()) { show('mini'); Mini.render(); return; }
  if (!me) { if (!token) show('auth'); return; }
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
    if (op === 'create' || op === 'join' || op === 'watch') { inGame = true; resetBoard(); $('joinCode').value = ''; }
    if (op === 'leave' || op === 'cancel' || op === 'unwatch') { room = null; inGame = false; }
    renderAll();
  });
}
function resetBoard() { tokEls.forEach(el => el.remove()); tokEls.clear(); tokNode.clear(); lastMoveN = null; shownSeq = null; playAt = 0; chatCode = null; bubbles.forEach(b => b.el && b.el.remove()); bubbles.clear(); }
socket.on('me', m => { const first = !me; me = m; if (first) { act('list'); if (window.Mini) Mini.checkMine(); } else if (!inGame && !(window.Mini && Mini.active())) renderLobby(); });
socket.on('yuts', list => { lobby = list; if (!inGame) renderLobby(); });
socket.on('yutState', v => {
  if (!room || room.code !== v.code) return;
  room = v;
  if (inGame) renderGame(); else renderLobby();
});
// 업적 달성 축하
socket.on('achDone', list => {
  const rw = r => [r.trophy ? `🏆 ${r.trophy}개` : '', r.item ? `🎁 ${esc((ITEM(r.item) || {}).name || r.item)}` : ''].filter(Boolean).join(' + ');
  const late = list.every(a => a.late);
  modal(`<div class="ach-pop"><div class="ach-pop-ic">${late ? '🎁' : '🏅'}</div><h3>${late ? '업적 보상 추가 지급!' : '업적 달성!'}</h3>${late ? '<p class="hint">예전에 달성한 업적에 새 보상이 생겨서 드려요</p>' : ''}
    ${list.map(a => `<div class="ach-pop-row"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span><em>${a.late ? '추가 보상' : '보상'}: ${rw(a.reward)}</em></div>`).join('')}
    <button class="btn gold" data-close>받기</button></div>`);
  document.querySelectorAll('#modalPanel [data-close]').forEach(el => el.onclick = closeModal);
});
socket.on('yutGone', code => {
  if (!room || room.code !== code) return;
  room = null; inGame = false; closeModal(); $('chatSheet').classList.add('hidden');
  toast('방장이 판을 닫았어요. 판돈은 돌려받았어요'); act('list');
});
socket.on('disconnect', () => toast('연결이 끊겼어요. 다시 연결하는 중…'));
// 접속(새로고침·재접속 포함)할 때 저장된 토큰으로 자동 로그인 → 하던 판으로 복귀
socket.on('connect', () => {
  if (!token) { if (!me) show('auth'); return; }
  socket.emit('auth', { token }, res => {
    if (res && res.error) { token = null; try { localStorage.removeItem('fy_token'); } catch (e) {} me = null; show('auth'); return; }
    if (me) { act('list'); if (window.Mini) Mini.checkMine(); }   // 처음 접속이면 'me' 가 오면서 list 를 부름
  });
});

fetch('/api/shop').then(r => r.json()).then(list => { ITEMS = list; renderAll(); });
if (!token) show('auth');
