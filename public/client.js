const socket = io();
const $ = id => document.getElementById(id);

// 브라우저마다 고유 ID (새로고침해도 같은 자리로 복귀)
let playerId = localStorage.getItem('holdem_pid');
if (!playerId) {
  playerId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  localStorage.setItem('holdem_pid', playerId);
}

let state = null;
let room = null;
let clockOffset = 0;

// ---------- 로비 ----------
$('nameInput').value = localStorage.getItem('holdem_name') || '';
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('codeInput').value = urlRoom.toUpperCase();

function getName() {
  const n = $('nameInput').value.trim();
  if (!n) { $('lobbyErr').textContent = '닉네임을 입력해주세요'; $('nameInput').focus(); return null; }
  localStorage.setItem('holdem_name', n);
  return n;
}

function enterRoom(res) {
  if (res.error) { $('lobbyErr').textContent = res.error; return; }
  room = res.code;
  sessionStorage.setItem('holdem_room', room);
  history.replaceState(null, '', '/?room=' + room);
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('roomCode').textContent = room;
}

$('createBtn').onclick = () => {
  const name = getName(); if (!name) return;
  socket.emit('create', { name, playerId }, enterRoom);
};
$('joinBtn').onclick = () => {
  const name = getName(); if (!name) return;
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) { $('lobbyErr').textContent = '4자리 방 코드를 입력해주세요'; return; }
  socket.emit('join', { room: code, name, playerId }, enterRoom);
};
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) $('joinBtn').click(); });
$('nameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) ($('codeInput').value.trim() ? $('joinBtn') : $('createBtn')).click();
});

// 재접속 시 자동 복귀
socket.on('connect', () => {
  const saved = room || sessionStorage.getItem('holdem_room');
  const name = localStorage.getItem('holdem_name');
  if (saved && name) {
    socket.emit('join', { room: saved, name, playerId }, res => {
      if (res.error) { sessionStorage.removeItem('holdem_room'); room = null; showLobby(); }
      else enterRoom(res);
    });
  }
});

function showLobby() {
  $('game').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  history.replaceState(null, '', '/');
}

$('leaveBtn').onclick = () => {
  if (!confirm('방에서 나갈까요?')) return;
  socket.emit('leave');
  room = null; state = null;
  sessionStorage.removeItem('holdem_room');
  $('chatLog').innerHTML = '';
  showLobby();
};

$('copyBtn').onclick = async () => {
  const link = location.origin + '/?room=' + room;
  try { await navigator.clipboard.writeText(link); toast('초대 링크를 복사했어요'); }
  catch { prompt('이 링크를 친구에게 보내세요', link); }
};

// ---------- 카드 그리기 ----------
const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
function cardEl(c, small) {
  const d = document.createElement('div');
  d.className = 'card' + (small ? ' sm' : '');
  if (!c) { d.classList.add('back'); return d; }
  if (c.s === 'h' || c.s === 'd') d.classList.add('red');
  d.innerHTML = `<span class="r">${RANK[c.r] || c.r}</span><span class="s">${SUIT[c.s]}</span>`;
  return d;
}

// 자리 위치: 나를 항상 아래 가운데, 시계방향
function pos(k, rx = 50, ry = 50) {
  const a = (90 + k * 45) * Math.PI / 180;
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

let lastBoardKey = '';
function render() {
  const s = state;
  if (!s) return;
  $('blindsInfo').textContent = `블라인드 ${s.sb}/${s.bb}`;
  $('stageName').textContent = s.stageName;

  // 보드
  const boardKey = JSON.stringify(s.community);
  if (boardKey !== lastBoardKey) {
    lastBoardKey = boardKey;
    const board = $('board');
    board.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      if (s.community[i]) board.appendChild(cardEl(s.community[i]));
      else if (s.stage !== 'waiting') { const e = document.createElement('div'); e.className = 'card slot'; board.appendChild(e); }
    }
  }
  $('pot').textContent = s.pot > 0 ? `팟 ${s.pot.toLocaleString()}` : '';
  $('result').innerHTML = s.stage === 'showdown' && s.result ? s.result.lines.map(l => `<div>🏆 ${esc(l)}</div>`).join('') : '';

  // 자리
  const wrap = $('seats');
  wrap.innerHTML = '';
  const base = s.me >= 0 ? s.me : 0;
  for (let k = 0; k < 8; k++) {
    const i = (base + k) % 8;
    const p = s.seats[i];
    const { x, y } = pos(k);
    const el = document.createElement('div');
    el.className = 'seat';
    el.style.left = x + '%';
    el.style.top = y + '%';

    if (!p) {
      el.classList.add('empty');
      el.innerHTML = `<div class="cards"></div><div class="plate">빈 자리</div>`;
      wrap.appendChild(el);
      continue;
    }
    if (i === s.me) el.classList.add('me');
    if (p.folded && p.inHand) el.classList.add('folded');
    if (!p.connected) el.classList.add('away');
    if (i === s.turn) el.classList.add('turn');
    if (p.won > 0) el.classList.add('winner');

    const cards = document.createElement('div');
    cards.className = 'cards';
    if (p.hasCards && (!p.folded || i === s.me)) {
      if (p.cards) p.cards.forEach(c => cards.appendChild(cardEl(c, i !== s.me)));
      else { cards.appendChild(cardEl(null, true)); cards.appendChild(cardEl(null, true)); }
    }
    el.appendChild(cards);

    const plate = document.createElement('div');
    plate.className = 'plate';
    const tagCls = { '폴드': 'fold', '올인': 'allin', '레이즈': 'raise', '벳': 'raise', '콜': 'call' }[p.lastAction] || '';
    plate.innerHTML =
      `<div class="name">${p.host ? '👑 ' : ''}${esc(p.name)}</div>` +
      `<div class="chips">${p.chips.toLocaleString()}</div>` +
      (i === s.turn ? `<div class="timer" data-timer></div>` : '');
    el.appendChild(plate);

    if (p.lastAction && !p.bestName) {
      const tag = document.createElement('div');
      tag.className = 'tag ' + tagCls;
      tag.textContent = p.lastAction;
      el.appendChild(tag);
    }
    if (p.bestName) {
      const hn = document.createElement('div');
      hn.className = 'hand-name';
      hn.textContent = p.bestName;
      el.appendChild(hn);
    }
    if (p.won > 0) {
      const w = document.createElement('div');
      w.className = 'won';
      w.textContent = `+${p.won.toLocaleString()}`;
      el.appendChild(w);
    }
    wrap.appendChild(el);

    if (p.bet > 0) {
      const b = pos(k, 30, 27);
      const bet = document.createElement('div');
      bet.className = 'bet';
      bet.style.left = b.x + '%';
      bet.style.top = b.y + '%';
      bet.textContent = p.bet.toLocaleString();
      wrap.appendChild(bet);
    }
    if (i === s.dealer && s.stage !== 'waiting') {
      const d = pos(k, 36, 34);
      const db = document.createElement('div');
      db.className = 'dealer';
      db.textContent = 'D';
      db.style.left = (d.x + 6) + '%';
      db.style.top = d.y + '%';
      wrap.appendChild(db);
    }
  }

  renderControls();
}

function renderControls() {
  const s = state;
  const me = s.seats[s.me];
  const wait = $('waitPanel');
  const myTurn = s.turn === s.me && s.me >= 0;
  $('actions').classList.toggle('hidden', !myTurn);
  wait.classList.toggle('hidden', myTurn);

  if (!myTurn) {
    wait.innerHTML = '';
    if (s.stage === 'waiting') {
      const n = s.seats.filter(Boolean).length;
      if (s.isHost) {
        const b = document.createElement('button');
        b.className = 'btn primary';
        b.textContent = s.running ? '다시 시작' : '게임 시작';
        b.disabled = s.readyCount < 2;
        b.onclick = () => socket.emit('start');
        wait.appendChild(b);
        wait.insertAdjacentHTML('beforeend', `<div>${s.readyCount < 2 ? '친구가 들어오면 시작할 수 있어요' : `${n}명 입장 · 시작 버튼을 눌러주세요`}</div>`);
      } else {
        wait.innerHTML = `<div>${s.running ? '플레이어를 기다리는 중…' : '방장이 게임을 시작하길 기다리는 중…'} (${n}명)</div>`;
      }
    } else if (s.stage === 'showdown') {
      wait.innerHTML = '<div>잠시 후 다음 핸드가 시작돼요</div>';
    } else if (me && me.inHand && !me.folded) {
      const cur = s.seats[s.turn];
      wait.innerHTML = `<div>${cur ? esc(cur.name) + '님 차례' : '카드 오픈 중…'}</div>`;
    } else if (me && !me.inHand) {
      wait.innerHTML = '<div>다음 핸드부터 참여해요</div>';
    } else {
      wait.innerHTML = '<div>폴드했어요 · 다음 핸드를 기다리는 중</div>';
    }
    if (me && me.chips === 0 && !(me.inHand && !me.folded && s.stage !== 'waiting' && s.stage !== 'showdown')) {
      const r = document.createElement('button');
      r.className = 'btn';
      r.textContent = `리바이 (+${s.startChips.toLocaleString()})`;
      r.onclick = () => socket.emit('rebuy');
      wait.appendChild(r);
    }
    return;
  }

  // 내 차례
  const toCall = Math.max(0, s.currentBet - me.bet);
  const maxTotal = me.bet + me.chips;
  const minTotal = Math.min(s.currentBet + s.minRaise, maxTotal);
  const callBtn = $('callBtn');
  if (toCall === 0) callBtn.textContent = '체크';
  else if (toCall >= me.chips) callBtn.textContent = `콜 ${me.chips.toLocaleString()} (올인)`;
  else callBtn.textContent = `콜 ${toCall.toLocaleString()}`;

  const canRaise = me.chips > toCall;
  $('raiseBtn').disabled = !canRaise || maxTotal <= s.currentBet;
  document.querySelector('.raise-box').classList.toggle('hidden', !canRaise || maxTotal <= minTotal);
  $('allinBtn').textContent = `올인 ${maxTotal.toLocaleString()}`;

  const range = $('raiseRange');
  const num = $('raiseNum');
  if (range.dataset.turnKey !== `${s.turn}-${s.currentBet}-${s.stage}`) {
    range.dataset.turnKey = `${s.turn}-${s.currentBet}-${s.stage}`;
    range.min = minTotal; range.max = maxTotal; range.step = s.sb;
    range.value = minTotal; num.value = minTotal;
  }
  updateRaiseLabel();
}

function updateRaiseLabel() {
  const v = Number($('raiseNum').value);
  const me = state.seats[state.me];
  const isAll = me && v >= me.bet + me.chips;
  $('raiseBtn').textContent = isAll ? '올인' : `${state.currentBet === 0 ? '벳' : '레이즈'} ${v.toLocaleString()}`;
}

function clampRaise(v) {
  const r = $('raiseRange');
  return Math.max(Number(r.min), Math.min(Number(r.max), Math.round(v)));
}
$('raiseRange').oninput = e => { $('raiseNum').value = e.target.value; updateRaiseLabel(); };
$('raiseNum').oninput = e => { $('raiseRange').value = e.target.value; updateRaiseLabel(); };
$('raiseNum').onchange = e => { e.target.value = clampRaise(Number(e.target.value)); $('raiseRange').value = e.target.value; updateRaiseLabel(); };
document.querySelectorAll('.chip-btn').forEach(b => b.onclick = () => {
  const s = state, me = s.seats[s.me];
  const toCall = Math.max(0, s.currentBet - me.bet);
  let v;
  if (b.dataset.q === 'min') v = s.currentBet + s.minRaise;
  else {
    const potAfterCall = s.pot + toCall;
    v = s.currentBet + (b.dataset.q === 'half' ? potAfterCall / 2 : potAfterCall);
  }
  v = clampRaise(v);
  $('raiseNum').value = v; $('raiseRange').value = v; updateRaiseLabel();
});

document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => socket.emit('action', { type: b.dataset.a }));
$('raiseBtn').onclick = () => socket.emit('action', { type: 'raise', amount: clampRaise(Number($('raiseNum').value)) });

// 남은 시간 바
setInterval(() => {
  const bar = document.querySelector('[data-timer]');
  if (!bar || !state) return;
  const left = state.turnDeadline - (Date.now() + clockOffset);
  const pct = Math.max(0, Math.min(100, left / 300));
  bar.style.width = pct + '%';
  bar.classList.toggle('low', left < 8000);
}, 200);

socket.on('state', s => {
  clockOffset = s.now - Date.now();
  state = s;
  render();
});

// ---------- 채팅 ----------
function addMsg(m) {
  const log = $('chatLog');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const d = document.createElement('div');
  if (m.system) { d.className = 'msg sys'; d.textContent = m.text; }
  else {
    const mine = state && m.seat === state.me;
    d.className = 'msg' + (mine ? ' mine' : '');
    d.innerHTML = `<b>${esc(m.name)}</b>${esc(m.text)}`;
  }
  log.appendChild(d);
  while (log.children.length > 200) log.firstChild.remove();
  if (atBottom || (!m.system)) log.scrollTop = log.scrollHeight;
}
socket.on('chat', addMsg);
socket.on('chatHistory', list => { $('chatLog').innerHTML = ''; list.forEach(addMsg); });

$('chatForm').onsubmit = e => {
  e.preventDefault();
  const v = $('chatInput').value.trim();
  if (!v) return;
  socket.emit('chat', v);
  $('chatInput').value = '';
};

// ---------- 기타 ----------
let toastTimer;
function toast(t) {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
socket.on('toast', toast);

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
