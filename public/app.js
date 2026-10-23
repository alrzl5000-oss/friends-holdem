const socket = io();
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let me = null;
let token = localStorage.getItem('fh_token');
let state = null;
let current = null;
let clockOffset = 0;
let unread = 0;
let leftRoom = null;

// ================= 금액 표기 =================
function won(n) {
  n = Math.round(n || 0);
  const neg = n < 0; n = Math.abs(n);
  const e = Math.floor(n / 1e8), m = Math.floor((n % 1e8) / 1e4), r = n % 1e4;
  const parts = [];
  if (e) parts.push(e.toLocaleString() + '억');
  if (m) parts.push(m.toLocaleString() + '만');
  if (r || !parts.length) parts.push(r.toLocaleString());
  return (neg ? '-' : '') + parts.join(' ') + '원';
}
function short(n) {
  n = Math.round(n || 0);
  const a = Math.abs(n);
  let s;
  if (a >= 1e8) s = (Math.floor(a / 1e6) / 100).toFixed(2).replace(/\.?0+$/, '') + '억';
  else if (a >= 1e4) s = Math.floor(a / 1e4).toLocaleString() + '만';
  else s = a.toLocaleString();
  return (n < 0 ? '-' : '') + s;
}

// ================= 공용 =================
function show(id) {
  current = id;
  ['auth', 'lobby', 'game'].forEach(s => $(s).classList.toggle('hidden', s !== id));
}
let toastTimer;
function toast(t, ok) {
  const el = $('toast');
  el.textContent = t;
  el.classList.toggle('ok', !!ok);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
function modal(html) {
  $('modalPanel').innerHTML = html;
  $('modal').classList.remove('hidden');
  return $('modalPanel');
}
function closeModal() { $('modal').classList.add('hidden'); }
document.querySelectorAll('#modal [data-close]').forEach(e => e.onclick = closeModal);
function avImg(str) { return `<div class="av"><img src="${avatarURL(str)}" alt=""></div>`; }
function confirmBox(title, text, okText, cb, danger) {
  const p = modal(`<h3>${title}</h3><p class="hint" style="text-align:left">${text}</p>
    <div class="row2"><button class="btn" data-x>취소</button><button class="btn ${danger ? 'red' : 'gold'}" data-ok>${okText}</button></div>`);
  p.querySelector('[data-x]').onclick = closeModal;
  p.querySelector('[data-ok]').onclick = () => { closeModal(); cb(); };
}

// 금액 고르기 모달
function amountModal({ title, min, max, def, step, note, okText }, cb) {
  step = step || 1;
  const p = modal(`<h3>${title}</h3>
    <div class="big-amt" data-v></div>
    <input type="range" data-r min="${min}" max="${max}" step="${step}" value="${def}" style="padding:0">
    <div class="hint" style="display:flex;justify-content:space-between"><span>${short(min)}</span><span>${short(max)}</span></div>
    ${note ? `<p class="hint">${note}</p>` : ''}
    <div class="row2"><button class="btn" data-x>취소</button><button class="btn gold" data-ok>${okText || '확인'}</button></div>`);
  const r = p.querySelector('[data-r]');
  const v = p.querySelector('[data-v]');
  const upd = () => { v.textContent = won(Number(r.value)); };
  r.oninput = upd; upd();
  p.querySelector('[data-x]').onclick = closeModal;
  p.querySelector('[data-ok]').onclick = () => { closeModal(); cb(Number(r.value)); };
}

// ================= 로그인 =================
let authMode = 'login';
$('authSeg').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  authMode = b.dataset.m;
  $('authSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('authBtn').textContent = authMode === 'login' ? '로그인' : '회원가입';
  $('authPw').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
  $('authErr').textContent = '';
};
$('authBtn').onclick = () => {
  const username = $('authName').value.trim();
  const password = $('authPw').value;
  if (!username || !password) { $('authErr').textContent = '닉네임과 비밀번호를 입력해주세요'; return; }
  socket.emit(authMode, { username, password }, res => {
    if (res.error) { $('authErr').textContent = res.error; return; }
    token = res.token;
    localStorage.setItem('fh_token', token);
    me = res.user;
    if (authMode === 'register') toast('가입 완료! 10억원이 지급됐어요', true);
    afterLogin();
  });
};
['authName', 'authPw'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) $('authBtn').click(); }));

socket.on('connect', () => {
  if (!token) { show('auth'); return; }
  socket.emit('auth', { token }, res => {
    if (res.error) { token = null; localStorage.removeItem('fh_token'); show('auth'); return; }
    me = res.user;
    afterLogin();
  });
});
socket.on('me', u => { me = u; if (current === 'lobby') renderWallet(); });
socket.on('kicked', msg => { toast(msg); token = null; localStorage.removeItem('fh_token'); show('auth'); });

function afterLogin() {
  if (me.room) {
    socket.emit('joinRoom', { code: me.room }, res => {
      if (res.ok) enterGame();
      else goLobby();
    });
  } else goLobby();
}

// ================= 로비 =================
function goLobby() {
  state = null;
  fxEl.innerHTML = '';
  fxStatus = null;
  show('lobby');
  renderWallet();
  loadRooms();
  history.replaceState(null, '', '/');
}
function renderWallet() {
  if (!me) return;
  $('meChip').innerHTML = `${avImg(me.avatar)}<div><b>${esc(me.username)}</b><span>토너먼트 우승 ${me.stats.tWins}회</span></div>`;
  $('wTotal').textContent = won(me.total);
  $('wCash').textContent = short(me.assets);
  $('wTable').textContent = short(me.inPlay);
  $('wTickets').textContent = avgText(me.stats);
  const broke = me.assets < 1e8 && !me.inPlay && !me.room;
  $('bailout').innerHTML = broke ? `<button class="btn red big">🆘 파산 신청 — 구제금 받기</button><p class="hint">보유 현금이 ${won(1e9)}으로 채워지는 대신, 3판 동안 프로필에 <b>좃밥</b>이 붙고 게임 시작 때 자동으로 "저는 개좃밥 입니다"를 외쳐요</p>` : (me.shame > 0 ? `<p class="hint">🐣 좃밥 남은 판: <b>${me.shame}</b></p>` : '');
  const bb2 = $('bailout').querySelector('button');
  if (bb2) bb2.onclick = () => confirmBox('파산 신청', `구제금을 받으면 현금이 <b>${won(1e9)}</b>이 돼요.<br>대신 <b>3판 동안 좃밥</b> 표시가 붙고, 게임에 들어갈 때마다 자동으로 "저는 개좃밥 입니다"가 채팅에 올라가요.`, '받기', () =>
    socket.emit('bailout', res => res.error ? toast(res.error) : (fxBanner('좃밥 등극', `+${won(res.amount)}`, 'lose'), toast('구제금 지급 완료', true))), true);
  $('backToRoom').innerHTML = me.room && me.room !== leftRoom ? `<button class="btn gold back-room">참여 중인 방으로 돌아가기 (${me.room})</button>` : '';
  const bb = $('backToRoom').querySelector('button');
  if (bb) bb.onclick = () => joinRoom(me.room);
  $('myStats').innerHTML = `<div><span>총 자산</span><b>${short(me.total)}</b></div><div><span>토너 우승</span><b>${me.stats.tWins}회</b></div><div><span>토너 참가</span><b>${me.stats.tPlayed}회</b></div>`;
}
$('logoutBtn').onclick = () => confirmBox('로그아웃', '로그아웃할까요?', '로그아웃', () => {
  socket.emit('logout', () => {});
  token = null; me = null;
  localStorage.removeItem('fh_token');
  show('auth');
});

$('lobbyTabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  $('lobbyTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  ['rooms', 'rank', 'profile'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== b.dataset.t));
  if (b.dataset.t === 'rank') socket.emit('ranking', renderRank);
  if (b.dataset.t === 'profile') renderProfile();
  if (b.dataset.t === 'rooms') loadRooms();
};

function loadRooms() { socket.emit('rooms', list => { if (Array.isArray(list)) renderRooms(list); }); }
socket.on('rooms', list => { if (current === 'lobby') renderRooms(list); });
function renderRooms(list) {
  const el = $('roomList');
  if (!list.length) { el.innerHTML = '<div class="empty-note">열린 방이 없어요.<br>방을 만들고 친구를 초대해보세요!</div>'; return; }
  el.innerHTML = list.map(r => {
    const tag = r.mode === 'cash' ? '<span class="tag cash">일반</span>' : '<span class="tag tourney">토너</span>';
    const sub = r.mode === 'cash'
      ? `블라인드 ${r.blinds} · 바이인 ${r.buyIn}`
      : (r.status === 'registering' ? `참가 접수 중 · 레벨 ${r.levelMin}분 · 상금 ${short(r.prize)}` : `진행 중 · 레벨 ${r.level} · 상금 ${short(r.prize)}`);
    return `<button class="room" data-code="${r.code}">${tag}<div class="info"><b>${esc(r.name)}</b><span>${sub}</span></div><span class="cnt">${r.players}/${r.max}</span></button>`;
  }).join('');
  el.querySelectorAll('.room').forEach(b => b.onclick = () => joinRoom(b.dataset.code));
}

function avgText(st) { return st && st.tPlayed ? (st.placeSum / st.tPlayed).toFixed(2).replace(/\.?0+$/, '') + '위' : '-'; }
let rankData = null, rankMode = 'assets';
function renderRank(data) {
  if (data) rankData = data;
  if (!rankData) return;
  const list = rankData[rankMode];
  const seg = `<div class="seg" id="rankSeg"><button data-m="assets" class="${rankMode === 'assets' ? 'on' : ''}">💰 총 자산</button><button data-m="avg" class="${rankMode === 'avg' ? 'on' : ''}">🏆 토너 평균 순위</button></div>`;
  $('rankList').innerHTML = seg + (list.map((r, i) => {
    const medal = ['🥇', '🥈', '🥉'][i];
    const right = rankMode === 'assets' ? short(r.total) : avgText({ tPlayed: r.tPlayed, placeSum: r.avgPlace * r.tPlayed });
    return `<div class="rank-row ${me && r.username === me.username ? 'me' : ''}">
      <div class="no ${medal ? 'top' : ''}">${medal || i + 1}</div>${avImg(r.avatar)}
      <div class="nm"><b>${esc(r.username)}</b><span>토너 우승 ${r.tWins}회 · 참가 ${r.tPlayed}회</span></div>
      <div class="amt">${right}</div></div>`;
  }).join('') || `<div class="empty-note">${rankMode === 'avg' ? '아직 토너먼트를 끝까지 한 사람이 없어요' : '아직 랭킹이 없어요'}</div>`);
  $('rankSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; rankMode = b.dataset.m; renderRank(); };
}

// 방 만들기
$('newCashBtn').onclick = () => {
  let tier = 'mid';
  const tiers = { low: [10e4, 20e4], mid: [50e4, 100e4], high: [250e4, 500e4] };
  const p = modal(`<h3>일반모드 방 만들기</h3>
    <div class="field-label">방 이름</div><input data-name maxlength="16" placeholder="${esc(me.username)}의 방">
    <div class="field-label">블라인드</div>
    <div class="opt-group" data-t>${Object.entries(tiers).map(([k, [s, b]]) => `<button data-k="${k}" class="${k === tier ? 'on' : ''}">${short(s)}/${short(b)}<small>바이인 ${short(b * 40)}~${short(b * 200)}</small></button>`).join('')}</div>
    <div class="row2"><button class="btn" data-x>취소</button><button class="btn green" data-ok>다음</button></div>`);
  p.querySelector('[data-t]').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    tier = b.dataset.k;
    p.querySelectorAll('[data-t] button').forEach(x => x.classList.toggle('on', x === b));
  };
  p.querySelector('[data-x]').onclick = closeModal;
  p.querySelector('[data-ok]').onclick = () => {
    const name = p.querySelector('[data-name]').value;
    const bb = tiers[tier][1];
    closeModal();
    pickBuyIn({ min: bb * 40, max: bb * 200, def: bb * 100, bb }, buyIn => {
      socket.emit('createRoom', { mode: 'cash', name, tier, buyIn }, handleEnter);
    });
  };
};
$('newTourBtn').onclick = () => {
  let lv = 5;
  const p = modal(`<h3>🏆 토너먼트 열기</h3>
    <div class="field-label">대회 이름</div><input data-name maxlength="16" placeholder="${esc(me.username)}의 토너먼트">
    <div class="field-label">블라인드 상승 간격</div>
    <div class="opt-group" data-l>${[3, 5, 7, 10].map(k => `<button data-k="${k}" class="${k === lv ? 'on' : ''}">${k}분</button>`).join('')}</div>
    <p class="hint" style="text-align:left;line-height:1.6">
    · 참가비 <b>1억</b> (대회 시작 때 차감) · 시작 금액 <b>1억</b><br>
    · 블라인드 50만/100만 → 레벨마다 상승<br>
    · 리바이 최대 2회 (레벨 6까지, 1회 1억)<br>
    · 상금: 참가비+리바이 합계 · 2~4명 우승 독식 / 5~6명 70·30% / 7~8명 50·30·20%<br>
    · 보유 현금: <b>${won(me.assets)}</b></p>
    <div class="row2"><button class="btn" data-x>취소</button><button class="btn gold" data-ok>대회 열기</button></div>`);
  p.querySelector('[data-l]').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    lv = Number(b.dataset.k);
    p.querySelectorAll('[data-l] button').forEach(x => x.classList.toggle('on', x === b));
  };
  p.querySelector('[data-x]').onclick = closeModal;
  p.querySelector('[data-ok]').onclick = () => {
    const name = p.querySelector('[data-name]').value;
    const go = () => socket.emit('createRoom', { mode: 'tourney', name, levelMin: lv }, handleEnter);
    closeModal();
    if (me.assets < 1e8) return toast('참가비 1억원이 필요해요');
    go();
  };
};
function pickBuyIn(info, cb) {
  if (me.assets < info.min) return toast(`최소 바이인 ${won(info.min)}이 필요해요`);
  const max = Math.min(info.max, Math.floor(me.assets / info.bb) * info.bb);
  amountModal({
    title: '바이인 금액', min: info.min, max, def: Math.min(info.def, max), step: info.bb,
    note: `보유 현금 ${won(me.assets)} · 나갈 때 남은 금액은 자산으로 정산돼요`, okText: '앉기',
  }, cb);
}
function joinRoom(code) {
  leftRoom = null;
  socket.emit('joinRoom', { code }, res => handleEnter(res, code));
}
function handleEnter(res, code) {
  if (res.needBuyIn) {
    return pickBuyIn(res.needBuyIn, buyIn => {
      if (code) socket.emit('joinRoom', { code, buyIn }, r => handleEnter(r, code));
    });
  }
  if (res.error) return toast(res.error);
  enterGame();
}
$('joinCodeBtn').onclick = () => {
  const c = $('joinCode').value.trim().toUpperCase();
  if (c.length !== 4) return toast('4자리 방 코드를 입력해주세요');
  joinRoom(c);
};

// 도트 에디터
const editor = new PixelEditor($('peCanvas'), $('palette'));
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
  if (b.dataset.tool === 'mirror') {
    editor.mirror = !editor.mirror;
    $('mirrorState').textContent = editor.mirror ? '켬' : '끔';
    b.classList.toggle('on', editor.mirror);
    editor.draw();
    return;
  }
  editor.tool = b.dataset.tool;
  document.querySelectorAll('[data-tool="pen"],[data-tool="fill"]').forEach(x => x.classList.toggle('on', x === b));
});
document.querySelector('[data-tool="pen"]').classList.add('on');
$('peUndo').onclick = () => editor.back();
$('peClear').onclick = () => editor.clear();
function renderProfile() {
  $('profilePreview').innerHTML = `<img src="${avatarURL(me.avatar)}" alt="">`;
  $('profileName').textContent = me.username;
}
$('peOpen').onclick = () => { editor.load(me.avatar); $('peOverlay').classList.remove('hidden'); };
$('peClose').onclick = () => {
  const close = () => $('peOverlay').classList.add('hidden');
  if (editor.value() === me.avatar) return close();
  confirmBox('그리기 취소', '저장하지 않은 그림은 사라져요. 닫을까요?', '닫기', close, true);
};
$('peSave').onclick = () => socket.emit('avatar', editor.value(), res => {
  if (res.error) return toast(res.error);
  me.avatar = editor.value();
  renderProfile(); renderWallet();
  $('peOverlay').classList.add('hidden');
  toast('프로필을 저장했어요', true);
});

// ================= 게임 =================
function enterGame() {
  closeModal();
  show('game');
  $('chatLog').innerHTML = '';
  unread = 0; updateBadge();
}
socket.on('state', s => {
  clockOffset = s.now - Date.now();
  const prev = state;
  state = s;
  if (current !== 'game') enterGame();
  renderGame();
  effects(prev, s);
});

$('exitBtn').onclick = () => {
  const r = state && state.room;
  const leave = () => { leftRoom = r ? r.code : null; socket.emit('leaveRoom', () => { state = null; goLobby(); }); };
  if (!r) return leave();
  if (r.mode === 'cash') {
    const my = state.seats[state.me];
    confirmBox('방 나가기', `테이블 금액 <b>${won(my ? my.chips : 0)}</b>이 자산으로 정산돼요.${my && my.inHand && !my.folded ? '<br>진행 중인 판은 폴드 처리돼요.' : ''}`, '나가기', leave);
  } else if (r.status === 'running' && (r.myStatus === 'alive' || r.myStatus === 'busted')) {
    confirmBox('기권하고 나가기', '기권하면 현재 금액은 사라지고 탈락 처리돼요. 순위에 따라 상금은 받을 수 있어요.', '기권', leave, true);
  } else leave();
};
$('rankBtn').onclick = openRankings;
$('chatBtn').onclick = () => { $('chatSheet').classList.remove('hidden'); unread = 0; updateBadge(); setTimeout(() => { const l = $('chatLog'); l.scrollTop = l.scrollHeight; }, 0); };
document.querySelectorAll('#chatSheet [data-close]').forEach(e => e.onclick = () => $('chatSheet').classList.add('hidden'));

const RN = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
function cardHTML(c, cls = '') {
  if (!c) return `<div class="card back ${cls}"></div>`;
  const red = c.s === 'h' || c.s === 'd';
  return `<div class="card ${red ? 'red' : ''} ${cls}"><div class="ci"><span class="r">${RN[c.r] || c.r}</span><span class="s">${SUIT[c.s]}</span></div><div class="big">${SUIT[c.s]}</div></div>`;
}
const sameCard = (a, b) => a && b && a.r === b.r && a.s === b.s;

// 좌석 위치 (나 = 아래 가운데, 시계방향)
const POS = [[50, 90], [16, 76], [12, 49], [16, 22], [50, 9], [84, 22], [88, 49], [84, 76]];
const ACT_CLS = { '폴드': 'fold', '올인': 'allin', '레이즈': 'raise', '벳': 'raise', '콜': 'call', '체크': 'check', 'SB': 'bl', 'BB': 'bl' };

let lastBoardKey = '';
let lastBoardCards = [];
let oddsKey = '', oddsCache = null;

function renderGame() {
  const s = state;
  const r = s.room;
  const my = s.seats[s.me];
  $('gName').textContent = r.name;
  $('gSub').textContent = r.mode === 'cash'
    ? `일반모드 · ${short(s.sb)}/${short(s.bb)} · 코드 ${r.code}`
    : `토너먼트 · 코드 ${r.code}`;

  // 토너먼트 HUD
  const hud = $('tHud');
  hud.classList.toggle('hidden', r.mode !== 'tourney');
  if (r.mode === 'tourney') {
    if (r.status === 'finished') {
      const w = r.results.find(x => x.place === 1);
      hud.innerHTML = `<div><span>상태</span><b>종료</b></div><div><span>우승</span><b>${w ? esc(w.name) : '-'}</b></div><div><span>참가</span><b>${r.players}명</b></div><div><span>상금</span><b>${short(r.prizePool)}</b></div>`;
    } else if (r.status === 'registering') {
      hud.innerHTML = `<div><span>참가</span><b>${s.seats.filter(Boolean).length}명</b></div><div><span>시작 금액</span><b>${short(r.startStack)}</b></div><div><span>레벨</span><b>${r.levelMs / 60000}분</b></div><div><span>예상 상금</span><b>${short(r.prizePool)}</b></div>`;
    } else {
      hud.innerHTML = `<div><span>레벨 ${r.level}</span><b>${short(r.blinds[0])}/${short(r.blinds[1])}</b></div><div><span>다음 ${short(r.nextBlinds[1])}</span><b data-lvl>-</b></div><div><span>남은 인원</span><b>${r.alive}/${r.players}</b></div><div><span>상금</span><b>${short(r.prizePool)}</b></div>`;
    }
  }

  // 보드
  const boardKey = JSON.stringify(s.community) + (s.stage === 'waiting' ? 'w' : '');
  if (boardKey !== lastBoardKey) {
    const board = $('board');
    const prevCards = lastBoardCards;
    const extends_ = s.stage !== 'waiting' && prevCards.length <= s.community.length && prevCards.every((c, i) => sameCard(c, s.community[i])) && board.querySelector('.slot');
    lastBoardKey = boardKey;
    lastBoardCards = s.community.slice();
    if (extends_) {
      const slots = board.querySelectorAll('.card');
      for (let i = prevCards.length; i < s.community.length; i++) {
        const t = document.createElement('div');
        t.innerHTML = cardHTML(s.community[i]);
        const el = t.firstChild;
        el.style.animationDelay = ((i - prevCards.length) * 0.12) + 's';
        slots[i].replaceWith(el);
      }
    } else {
      let h = '';
      for (let i = 0; i < 5; i++) {
        if (s.community[i]) h += cardHTML(s.community[i]);
        else if (s.stage !== 'waiting') h += '<div class="card slot"></div>';
      }
      board.innerHTML = h;
    }
  }
  // 승자 패 강조
  if (s.stage === 'showdown') {
    const win = s.seats.find(p => p && p.won > 0 && p.bestCards);
    if (win) $('board').querySelectorAll('.card').forEach((el, i) => el.classList.toggle('hl', win.bestCards.some(c => sameCard(c, s.community[i]))));
  }
  $('stageName').textContent = s.stage === 'waiting' ? '' : s.stageName;
  $('boardInfo').textContent = s.community.length >= 3 ? `보드: ${Poker.handInfo(s.community).text}` : '';
  $('pot').innerHTML = s.pot > 0 ? `<i class="chip-ico"></i>${short(s.pot)}` : '';
  $('result').innerHTML = s.result ? s.result.lines.map(l =>
    `<div>${l.label ? l.label + ' · ' : ''}${esc(l.names)} <em>+${short(l.amount)}</em>${l.hand ? ' · ' + l.hand : ''}</div>`).join('') : '';

  renderSeats();
  renderMine();
  renderControls();
}

function renderSeats() {
  const s = state;
  const base = s.me >= 0 ? s.me : 0;
  let h = '';
  for (let k = 0; k < 8; k++) {
    const i = (base + k) % 8;
    const p = s.seats[i];
    const [x, y] = POS[k];
    const side = x > 50 ? 'left' : '';
    if (!p) {
      h += `<div class="seat empty" style="left:${x}%;top:${y}%"><div class="ava-wrap"><div class="av"></div></div><div class="plate">빈 자리</div></div>`;
      continue;
    }
    const cls = ['seat', side];
    if (i === s.me) cls.push('me');
    if (p.folded && p.inHand) cls.push('folded');
    if (!p.connected) cls.push('away');
    if (i === s.turn) cls.push('turn');
    if (p.won > 0) cls.push('winner');
    if (p.tStatus === 'out') cls.push('out');

    let mini = '';
    if (i !== s.me && p.hasCards && !p.folded) {
      mini = `<div class="mini ${p.cards ? 'face' : ''}">${p.cards ? cardHTML(p.cards[0]) + cardHTML(p.cards[1]) : cardHTML(null) + cardHTML(null)}</div>`;
    }

    let act = p.lastAction ? `<span class="act ${ACT_CLS[p.lastAction] || ''}">${p.lastAction}</span>` : '';
    if (p.bestName) act = `<span class="act hn ${p.won > 0 ? 'win' : ''}">${p.bestName}</span>`;
    let stack = short(p.chips);
    if (p.won > 0) stack = `<span class="won">+${short(p.won)}</span>`;
    if (p.tStatus === 'out') { act = ''; stack = p.place ? `${p.place}위` : '탈락'; }
    else if (p.tStatus === 'busted') { act = '<span class="act allin">파산</span>'; stack = '리바이?'; }

    h += `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%">
      <div class="ava-wrap ${p.shame > 0 ? 'shame' : ''}">${avImg(p.avatar)}${i === s.turn ? '<div class="ring" data-ring></div>' : ''}${p.shame > 0 ? `<span class="shame-tag">좃밥 ${p.shame}</span>` : ''}${mini}</div>
      ${act}
      <div class="plate"><div class="nm">${esc(p.name)}</div><div class="st">${stack}</div></div>
    </div>`;

    if (p.bet > 0) {
      const bx = 50 + (x - 50) * .55, by = 50 + (y - 50) * .55;
      h += `<div class="bet" style="left:${bx}%;top:${by}%"><i class="chip-ico"></i>${short(p.bet)}</div>`;
    }
    // 딜러(D) / 스몰블라인드(SB) / 빅블라인드(BB) 버튼
    const marks = [];
    if (s.stage !== 'waiting') {
      if (i === s.dealer) marks.push(['D', 'dealer']);
      if (i === s.sbSeat) marks.push(['SB', 'dealer blind sb']);
      if (i === s.bbSeat) marks.push(['BB', 'dealer blind bb']);
    }
    marks.forEach(([t, c], n) => {
      const dx = 50 + (x - 50) * .72 + (x <= 50 ? 7 : -7) + n * (x <= 50 ? 6 : -6), dy = 50 + (y - 50) * .72;
      h += `<div class="${c}" style="left:${dx}%;top:${dy}%">${t}</div>`;
    });
  }
  $('seats').innerHTML = h;
}

function myCards() {
  const s = state;
  const my = s.seats[s.me];
  return my && my.cards && my.hasCards ? my.cards : null;
}

function renderMine() {
  const s = state;
  const my = s.seats[s.me];
  const cards = myCards();
  const hand = $('myHand');
  hand.classList.toggle('folded', !!(my && my.folded));
  const key = cards ? JSON.stringify(cards) : '';
  if (hand.dataset.k !== key) { hand.dataset.k = key; hand.innerHTML = cards ? cards.map(c => cardHTML(c)).join('') : ''; }
  if (cards && s.stage === 'showdown' && my.bestCards) {
    hand.querySelectorAll('.card').forEach((el, i) => el.classList.toggle('hl', my.won > 0 && my.bestCards.some(c => sameCard(c, cards[i]))));
  }

  const info = $('myInfo');
  if (!cards && s.room.mode === 'tourney' && s.room.status === 'finished') {
    const mine = s.room.results.find(x => my && x.name === my.name);
    info.innerHTML = mine ? `<span class="mi-label">내 순위 ${mine.place}위</span><span class="mi-hand made">상금 ${mine.prize ? '+' + won(mine.prize) : '없음'}</span>` : '';
    return;
  }
  if (!cards && s.room.mode === 'tourney' && s.room.status === 'registering') {
    info.innerHTML = `<span class="mi-label">대회 시작 시 지급</span><span class="mi-hand">${won(s.room.startStack)}</span>`;
    return;
  }
  if (!cards) {
    info.innerHTML = my ? `<span class="mi-label">내 금액</span><span class="mi-hand">${won(my.chips)}</span>` : '';
    return;
  }
  const all = cards.concat(s.community);
  const hi = Poker.handInfo(all);
  let odds = '';
  if (!my.folded && s.community.length < 5) {
    const k = key + JSON.stringify(s.community);
    if (k !== oddsKey) { oddsKey = k; oddsCache = Poker.makeOdds(cards, s.community); }
    const list = oddsCache.map((p, c) => ({ p, c })).filter(o => o.c > hi.cat && o.p >= 0.005).sort((a, b) => b.p - a.p).slice(0, 4).sort((a, b) => a.c - b.c);
    odds = list.length ? `<span class="mi-label">리버까지 메이드 확률</span><div class="mi-odds">${list.map(o => `<span>${Poker.HAND_NAMES[o.c]} <b>${pct(o.p)}</b></span>`).join('')}</div>` : '';
  }
  info.innerHTML = `<span class="mi-label">내 패 ${my.folded ? '· 폴드' : ''} · ${short(my.chips)}</span>
    <span class="mi-hand ${hi.cat >= 2 ? 'made' : ''}">${hi.text}</span>${odds}`;
}
function pct(p) { return p >= 0.995 ? '100%' : p < 0.01 ? '<1%' : Math.round(p * 100) + '%'; }

function renderControls() {
  const s = state, r = s.room;
  const my = s.seats[s.me];
  const el = $('controls');
  const myTurn = s.turn === s.me && s.me >= 0;
  if (!myTurn) $('raiseSheet').classList.add('hidden');

  if (myTurn) {
    const toCall = Math.max(0, s.currentBet - my.bet);
    const maxTotal = my.bet + my.chips;
    const canRaise = my.chips > toCall && maxTotal > s.currentBet;
    const callTxt = toCall === 0 ? '체크' : (toCall >= my.chips ? `콜<small>올인 ${short(my.chips)}</small>` : `콜<small>${short(toCall)}</small>`);
    const raiseTxt = s.currentBet === 0 ? '벳' : '레이즈';
    const key = `turn-${s.handNo}-${s.stage}-${s.currentBet}-${my.chips}`;
    if (el.dataset.k !== key) {
      el.dataset.k = key;
      el.innerHTML = `<div class="turn-bar"><i data-tbar></i></div>
        <div class="act-grid">
          <button class="btn fold" data-a="fold">폴드</button>
          <button class="btn call" data-a="call">${callTxt}</button>
          <button class="btn gold" data-raise ${canRaise ? '' : 'disabled'}>${canRaise ? raiseTxt : '올인'}</button>
        </div>`;
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
      el.querySelector('[data-raise]').onclick = openRaise;
    }
    return;
  }

  el.dataset.k = '';
  let h = '';
  const turnName = s.turn >= 0 && s.seats[s.turn] ? s.seats[s.turn].name : '';
  if (r.mode === 'cash') {
    if (!my) h = '';
    else if (my.chips === 0 && !(my.inHand && !my.folded && s.stage !== 'showdown')) {
      h = `<div class="wait">금액을 다 잃었어요<div class="row"><button class="btn gold" data-topup>💰 충전하기</button></div></div>`;
    } else if (s.stage === 'waiting') {
      h = `<div class="wait">${s.seats.filter(Boolean).length < 2 ? '친구가 들어오면 자동으로 시작해요<div class="row"><button class="btn line" data-invite>초대 링크 복사</button></div>' : '곧 시작해요…'}</div>`;
    } else if (s.stage === 'showdown') h = '<div class="wait">잠시 후 다음 판이 시작돼요</div>';
    else if (my.inHand && !my.folded) h = `<div class="wait">${turnName ? esc(turnName) + '님 차례' : '카드 오픈 중…'}</div>`;
    else if (!my.inHand) h = '<div class="wait">다음 판부터 참여해요</div>';
    else h = '<div class="wait">폴드 · 다음 판을 기다리는 중</div>';
  } else {
    if (r.status === 'registering') {
      const n = s.seats.filter(Boolean).length;
      h = r.isHost
        ? `<div class="wait">${n}명 참가 · 2명 이상이면 시작할 수 있어요<div class="row"><button class="btn line" data-invite>초대 링크</button><button class="btn gold" data-start ${n < 2 ? 'disabled' : ''}>🏁 대회 시작</button></div></div>`
        : `<div class="wait">방장이 대회를 시작하길 기다리는 중 (${n}명)<div class="row"><button class="btn line" data-invite>초대 링크 복사</button></div></div>`;
    } else if (r.status === 'finished') {
      const mine = r.results.find(x => s.seats[s.me] && x.name === s.seats[s.me].name);
      h = `<div class="wait">대회 종료${mine ? ` · 내 순위 ${mine.place}위${mine.prize ? ` (+${short(mine.prize)})` : ''}` : ''}<div class="row"><button class="btn" data-results>결과 보기</button><button class="btn gold" data-lobby>로비로</button></div></div>`;
    } else if (r.myStatus === 'busted') {
      const left = r.pendingUntil ? Math.max(0, Math.ceil((r.pendingUntil - Date.now() - clockOffset) / 1000)) : 0;
      h = `<div class="wait">💥 파산! 리바이 ${r.myRebuys}/${r.rebuyMax}회 사용${left ? ` · <b data-pend>${left}</b>초 안에 결정` : ''}
        <div class="row"><button class="btn red" data-withdraw>기권</button><button class="btn gold" data-rebuy ${r.canRebuy ? '' : 'disabled'}>🔁 리바이 (1억)</button></div></div>`;
    } else if (r.myStatus === 'out') {
      h = `<div class="wait">탈락했어요 · ${my && my.place ? my.place + '위' : ''}<div class="row"><button class="btn gold" data-lobby>로비로</button></div></div>`;
    } else {
      let msg = '';
      if (s.stage === 'showdown') msg = '잠시 후 다음 판';
      else if (my && my.inHand && !my.folded) msg = turnName ? `${esc(turnName)}님 차례` : '카드 오픈 중…';
      else if (my && my.inHand) msg = '폴드 · 다음 판 대기';
      else msg = '다음 판 대기 중';
      h = `<div class="wait">${msg}<div class="row"><button class="btn small line" data-withdraw style="flex:none;margin:0 auto">🏳 기권</button></div></div>`;
    }
  }
  el.innerHTML = h;
  const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
  on('[data-start]', () => socket.emit('start', res => res.error && toast(res.error)));
  on('[data-invite]', copyInvite);
  on('[data-lobby]', () => { leftRoom = r.code; socket.emit('leaveRoom', () => { state = null; goLobby(); }); });
  on('[data-results]', showResults);
  on('[data-rebuy]', () => socket.emit('rebuy', res => res.error ? toast(res.error) : toast('리바이 완료! 1억 지급', true)));
  on('[data-withdraw]', () => confirmBox('기권', '기권하면 지금 순위로 탈락 처리돼요.', '기권', () => socket.emit('withdraw', res => res.error && toast(res.error)), true));
  on('[data-topup]', () => {
    const max = Math.min(r.buyMax - my.chips, Math.floor(r.assets / s.bb) * s.bb);
    if (max < s.bb) return toast('자산이 부족해요');
    amountModal({ title: '충전 금액', min: Math.min(s.bb * 20, max), max, def: Math.min(r.buyDef, max), step: s.bb, note: `보유 현금 ${won(r.assets)}`, okText: '충전' },
      v => socket.emit('topUp', v, res => res.error ? toast(res.error) : toast('충전 완료', true)));
  });
}

function copyInvite() {
  const link = location.origin + '/?room=' + state.room.code;
  navigator.clipboard.writeText(link).then(() => toast('초대 링크를 복사했어요', true)).catch(() => prompt('이 링크를 친구에게 보내세요', link));
}

function act(type, amount) {
  socket.emit('action', { type, amount }, res => res && res.error && toast(res.error));
  $('raiseSheet').classList.add('hidden');
}

// 레이즈 시트
let rs = null;
function openRaise() {
  const s = state, my = s.seats[s.me];
  const max = my.bet + my.chips;
  const min = Math.min(s.currentBet + s.minRaise, max);
  const toCall = Math.max(0, s.currentBet - my.bet);
  const potAfter = s.pot + toCall;
  const snap = v => Math.max(min, Math.min(max, Math.round(v / s.sb) * s.sb));
  rs = { min, max, value: min, snap };
  const quick = [
    ['최소', min], ['½팟', snap(s.currentBet + potAfter / 2)], ['¾팟', snap(s.currentBet + potAfter * .75)],
    ['팟', snap(s.currentBet + potAfter)], ['올인', max],
  ];
  $('rsLabel').textContent = s.currentBet === 0 ? '벳' : '레이즈';
  $('rsQuick').innerHTML = quick.map(([t, v]) => `<button data-v="${v}">${t}</button>`).join('');
  $('rsQuick').querySelectorAll('button').forEach(b => b.onclick = () => setRaise(Number(b.dataset.v)));
  const range = $('rsRange');
  range.min = 0; range.max = 1000; range.step = 1;
  setRaise(min);
  $('raiseSheet').classList.remove('hidden');
}
function setRaise(v) {
  rs.value = v;
  const t = rs.max > rs.min ? Math.sqrt((v - rs.min) / (rs.max - rs.min)) : 1;
  $('rsRange').value = Math.round(t * 1000);
  updRaise();
}
function updRaise() {
  const t = Number($('rsRange').value) / 1000;
  $('rsRange').style.setProperty('--p', (t * 100) + '%');
  $('rsValue').textContent = rs.value >= rs.max ? `올인 ${won(rs.value)}` : won(rs.value);
}
$('rsRange').oninput = e => {
  const t = Number(e.target.value) / 1000;
  rs.value = t >= 1 ? rs.max : rs.snap(rs.min + (rs.max - rs.min) * t * t);
  updRaise();
};
$('rsCancel').onclick = () => $('raiseSheet').classList.add('hidden');
$('rsOk').onclick = () => act(rs.value >= rs.max ? 'allin' : 'raise', rs.value);

// 타이머 (차례 링 + 바 + 레벨 시계)
setInterval(() => {
  if (!state || current !== 'game') return;
  const now = Date.now() + clockOffset;
  const left = state.turnDeadline - now;
  const p = Math.max(0, Math.min(1, left / state.turnMs));
  const ring = document.querySelector('[data-ring]');
  if (ring) ring.style.background = `conic-gradient(${left < 8000 ? '#e5484d' : '#e9c46a'} ${p * 360}deg, transparent 0)`;
  if (ring) ring.style.webkitMask = ring.style.mask = 'radial-gradient(circle, transparent 62%, #000 63%)';
  const bar = document.querySelector('[data-tbar]');
  if (bar) { bar.style.width = (p * 100) + '%'; bar.classList.toggle('low', left < 8000); }
  const r = state.room;
  const lv = document.querySelector('[data-lvl]');
  if (lv && r.status === 'running') {
    const sec = Math.max(0, Math.floor((r.levelEndsAt - now) / 1000));
    lv.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  const pend = document.querySelector('[data-pend]');
  if (pend) pend.textContent = Math.max(0, Math.ceil((r.pendingUntil - now) / 1000));
}, 200);

// 족보 + 확률
function openRankings() {
  const ex = {
    9: ['As', 'Ks', 'Qs', 'Js', 'Ts'], 8: ['9h', '8h', '7h', '6h', '5h'], 7: ['Kc', 'Kd', 'Kh', 'Ks', '3d'],
    6: ['Qs', 'Qh', 'Qd', '7c', '7h'], 5: ['Ad', 'Jd', '8d', '6d', '2d'], 4: ['Ts', '9h', '8d', '7c', '6s'],
    3: ['8s', '8h', '8c', 'Kd', '2s'], 2: ['Jh', 'Js', '4d', '4c', 'Ah'], 1: ['Ts', 'Th', 'Ad', '7c', '3s'], 0: ['As', 'Qd', '8h', '5c', '2s'],
  };
  const desc = {
    9: '같은 무늬 10-J-Q-K-A', 8: '같은 무늬 연속 5장', 7: '같은 숫자 4장', 6: '트리플 + 원페어', 5: '같은 무늬 5장',
    4: '연속된 숫자 5장', 3: '같은 숫자 3장', 2: '페어 2개', 1: '같은 숫자 2장', 0: '아무것도 없을 때',
  };
  const names = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시', '로열 플러시'];
  const toC = t => ({ r: '23456789TJQKA'.indexOf(t[0]) + 2, s: t[1] });
  const cards = state && myCards();
  let odds = null, cur = -1;
  if (cards) {
    const all = cards.concat(state.community);
    const hi = Poker.handInfo(all);
    cur = hi.score[0] === 8 && hi.score[1] === 14 ? 9 : hi.cat;
    odds = state.community.length < 5 ? Poker.makeOdds(cards, state.community) : null;
  }
  const rows = [];
  for (let k = 9; k >= 0; k--) {
    const cat = k === 9 ? 8 : k;
    let pc = '';
    if (odds && k !== 9) { const v = odds[cat]; pc = `<div class="pc ${v ? '' : 'zero'}">${v ? pct(v) : '-'}</div>`; }
    else if (odds) pc = '<div class="pc zero"></div>';
    rows.push(`<div class="hr-row ${k === cur ? 'cur' : ''}"><div class="nm"><b>${names[k]}</b><span>${desc[k]}</span></div>
      <div class="ex">${ex[k].map(t => cardHTML(toC(t))).join('')}</div>${pc}</div>`);
  }
  const p = modal(`<h3>족보 ${odds ? '<span class="hint" style="font-size:12px;font-weight:500">· 오른쪽 숫자 = 리버까지 내 메이드 확률</span>' : ''}</h3>
    <div>${rows.join('')}</div>
    <p class="hint">위에 있을수록 강해요. 같은 족보면 높은 숫자가 이겨요.</p>
    <button class="btn" data-x>닫기</button>`);
  p.querySelector('[data-x]').onclick = closeModal;
}

function showResults() {
  const r = state.room;
  const p = modal(`<h3>🏆 대회 결과</h3><p class="hint">총 상금 ${won(r.prizePool)} · 참가 ${r.players}명 · 엔트리 ${r.entries}</p>
    <div class="res-list">${r.results.map(x => `<div class="res-row"><div class="pl">${['🥇', '🥈', '🥉'][x.place - 1] || x.place}</div>${avImg(x.avatar)}<div class="nm">${esc(x.name)}</div><div class="pz">${x.prize ? '+' + short(x.prize) : ''}</div></div>`).join('')}</div>
    <button class="btn" data-x>닫기</button>`);
  p.querySelector('[data-x]').onclick = closeModal;
}

// ================= 이펙트 =================
const fxEl = $('fx');
function fxBanner(title, sub, cls) {
  const d = document.createElement('div');
  d.className = 'fx-banner ' + (cls || '');
  d.innerHTML = `<div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
  fxEl.appendChild(d);
  setTimeout(() => d.remove(), 2300);
}
function fxFlash(cls) {
  const d = document.createElement('div');
  d.className = 'fx-flash ' + cls;
  fxEl.appendChild(d);
  setTimeout(() => d.remove(), 800);
}
function fxRays() {
  const d = document.createElement('div');
  d.className = 'fx-rays';
  fxEl.appendChild(d);
  setTimeout(() => d.remove(), 2500);
}
function confetti(n) {
  const cols = ['#e9c46a', '#f6dd9a', '#2fb874', '#ffffff', '#e5484d', '#3b82f6'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + '%';
    d.style.background = cols[i % cols.length];
    d.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    d.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
    d.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
    d.style.animationDelay = Math.random() * .4 + 's';
    fxEl.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }
}
function vibrate(p) { if (navigator.vibrate) try { navigator.vibrate(p); } catch {} }

let fxHand = 0, fxCat = -1, fxBoardLen = 0, fxShown = 0, fxStatus = null, fxFinished = false;
function effects(prev, s) {
  const my = s.seats[s.me];
  const r = s.room;
  if (!my) return;

  // 메이드 이펙트
  if (s.handNo !== fxHand) { fxHand = s.handNo; fxCat = -1; fxBoardLen = 0; }
  const cards = myCards();
  if (cards && s.stage !== 'waiting') {
    const hi = Poker.handInfo(cards.concat(s.community));
    const boardLen = s.community.length;
    if (fxCat >= 0 && boardLen > fxBoardLen && hi.cat > fxCat && !my.folded) {
      const royal = hi.score[0] === 8 && hi.score[1] === 14;
      const name = royal ? '로열 플러시' : hi.name;
      if (hi.cat >= 4) { fxRays(); fxFlash('gold'); fxBanner(name + '!', hi.text, 'made'); confetti(30); vibrate([40, 40, 80]); }
      else if (hi.cat >= 2) { fxFlash('gold'); fxBanner(name + '!', hi.text, 'made'); vibrate(40); }
      else fxBanner(name, hi.text, 'small');
    }
    fxCat = hi.cat;
    fxBoardLen = boardLen;
  }

  // 올인 쇼다운 (패 오픈)
  if (s.runout && !(prev && prev.runout && prev.handNo === s.handNo)) {
    fxFlash('gold');
    fxBanner('올인!', '쇼다운 — 패 오픈', 'made');
    vibrate([30, 30, 30]);
  }

  // 승리 / 패배
  if (s.stage === 'showdown' && s.handNo !== fxShown) {
    fxShown = s.handNo;
    if (my.won > 0) {
      fxRays(); fxFlash('gold'); confetti(60);
      fxBanner('승리!', `+${won(my.won)}${my.bestName ? ' · ' + my.bestName : ''}`, 'win');
      vibrate([60, 40, 120]);
    } else if (my.inHand && !my.folded) {
      fxFlash('red');
      fxBanner('패배', my.bestName ? `내 패: ${my.bestName}` : '', 'lose');
      document.querySelector('.table').classList.add('shake');
      setTimeout(() => document.querySelector('.table') && document.querySelector('.table').classList.remove('shake'), 500);
      vibrate(120);
    }
  }

  // 토너먼트 상태
  if (r.mode === 'tourney') {
    if (fxStatus && fxStatus !== r.myStatus) {
      if (r.myStatus === 'busted') setTimeout(() => fxBanner('파산', '리바이하거나 기권할 수 있어요', 'lose small'), 1200);
      if (r.myStatus === 'out' && r.status !== 'finished') setTimeout(() => { fxFlash('red'); fxBanner('탈락', `${my.place}위`, 'lose'); }, 1200);
    }
    fxStatus = r.myStatus;
    if (r.status === 'finished' && !fxFinished) {
      fxFinished = true;
      const mine = r.results.find(x => x.name === my.name);
      setTimeout(() => {
        if (mine && mine.place === 1) { fxRays(); fxFlash('gold'); confetti(120); fxBanner('🏆 우승!', `상금 +${won(mine.prize)}`, 'win'); vibrate([80, 60, 80, 60, 200]); }
        else if (mine) fxBanner(`${mine.place}위`, mine.prize ? `상금 +${won(mine.prize)}` : '수고했어요!', mine.prize ? '' : 'small');
        setTimeout(showResults, 2400);
      }, 1500);
    }
    if (r.status !== 'finished') fxFinished = false;
  }
}

// ================= 채팅 =================
function updateBadge() {
  $('chatBadge').textContent = unread > 9 ? '9+' : unread;
  $('chatBadge').classList.toggle('hidden', unread === 0);
}
function addMsg(m, live) {
  const log = $('chatLog');
  const d = document.createElement('div');
  if (m.system) { d.className = 'msg sys'; d.textContent = m.text; }
  else {
    d.className = 'msg' + (me && m.uid === me.id ? ' mine' : '');
    d.innerHTML = `<b>${esc(m.name)}</b>${esc(m.text)}`;
  }
  log.appendChild(d);
  while (log.children.length > 200) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  const open = !$('chatSheet').classList.contains('hidden');
  if (live && !m.system && !open) {
    if (!(me && m.uid === me.id)) { unread++; updateBadge(); }
    peek(m);
  }
}
let peekTimer;
function peek(m) {
  let el = document.querySelector('.chat-peek');
  if (!el) { el = document.createElement('div'); el.className = 'chat-peek'; $('game').appendChild(el); }
  el.innerHTML = `<b>${esc(m.name)}</b>${esc(m.text)}`;
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => el.remove(), 3500);
}
socket.on('chat', m => addMsg(m, true));
socket.on('chatHistory', list => { $('chatLog').innerHTML = ''; list.forEach(m => addMsg(m, false)); });
$('chatForm').onsubmit = e => {
  e.preventDefault();
  const v = $('chatInput').value.trim();
  if (!v) return;
  socket.emit('chat', v, () => {});
  $('chatInput').value = '';
};

// 초대 링크로 들어온 경우 방 코드 기억
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) sessionStorage.setItem('fh_invite', urlRoom.toUpperCase());
const _goLobby = goLobby;
goLobby = function () {
  _goLobby();
  const inv = sessionStorage.getItem('fh_invite');
  if (inv && me && !me.room) { sessionStorage.removeItem('fh_invite'); joinRoom(inv); }
};
