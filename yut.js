// 윷놀이 (3~4인): 판돈을 걸고 시작, 먼저 말 4개를 모두 골인한 사람이 판돈 전부를 가져감
// 서버가 윷을 던지고 판을 관리함. 베팅금은 시작할 때 자산에서 빼서 u.yutHold 에 보관 (서버가 꺼져도 db.js 가 환불)
const crypto = require('crypto');

const MIN_BET = 1e6;     // 100만
const MAX_BET = 1e8;     // 1억
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;
const GOAL = 30;         // 0 = 출발 전, 1~29 = 판 위 칸, 30 = 골인
const TURN_MS = 20000;   // 차례마다 20초 — 넘기면 자동으로 던지고 자동으로 움직임
const NAMES = { 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' };
const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b'];

let db, notify;
function init(opts) { db = opts.db; notify = opts.notify; }

const games = new Map(); // code -> game
const userGame = new Map(); // uid -> code
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (games.has(c));
  return c;
}
function hold(u, amt) { u.assets -= amt; u.yutHold = (u.yutHold || 0) + amt; }
function release(u, amt, pay) { u.yutHold = Math.max(0, (u.yutHold || 0) - amt); u.assets += pay; }
function stats(u) { return (u.yut = u.yut || { games: 0, win: 0, net: 0 }); }

// 윷 던지기: 막대 4개 (앞면 개수로 결과). 0개=모, 1개=도, 2개=개, 3개=걸, 4개=윷 (확률 1/16,4/16,6/16,4/16,1/16)
function throwYut() {
  const flat = [0, 0, 0, 0].reduce((n) => n + (crypto.randomInt(2) ? 1 : 0), 0);
  const steps = [5, 1, 2, 3, 4][flat];
  return { steps, name: NAMES[steps], extra: steps >= 4 };
}

function lobbyList() {
  return [...games.values()].filter(g => g.status === 'open')
    .map(g => ({ code: g.code, host: g.names[g.host], bet: g.bet, n: g.players.length }));
}
function opts(g, id) {
  return [...new Set(g.pos[id].filter(p => p < GOAL))].sort((a, b) => a - b);
}
function view(g, uid) {
  const turnId = g.players[g.turn];
  const me = g.players.includes(uid);
  const canAct = g.status === 'play' && turnId === uid;
  return {
    code: g.code, bet: g.bet, status: g.status, host: g.names[g.host], pot: g.bet * g.players.length,
    deadline: g.deadline || 0, winner: g.winner ? g.names[g.winner] : null,
    you: uid, colors: COLORS,
    players: g.players.map((id, i) => ({
      id, name: g.names[id], color: COLORS[i], pos: (g.pos && g.pos[id]) || [0, 0, 0, 0],
      done: g.pos && g.pos[id] ? g.pos[id].filter(p => p === GOAL).length : 0,
      turn: g.status === 'play' && id === turnId, host: id === g.host,
    })),
    phase: g.status === 'play' ? g.phase : null,
    canThrow: canAct && g.phase === 'throw',
    canMove: canAct && g.phase === 'move',
    options: canAct && g.phase === 'move' ? opts(g, uid) : [],
    last: g.last || null,
    chat: g.chat.slice(-50),
    me,
  };
}
function push(g) { for (const id of g.players) notify(id, 'yutState', view(g, id)); }
function pushList() { notify(null, 'yuts', lobbyList()); }
function clearT(g) { clearTimeout(g.timer); g.timer = null; }
function armTimer(g) {
  clearT(g);
  g.deadline = Date.now() + TURN_MS;
  g.timer = setTimeout(() => { if (g.status !== 'play') return; if (g.phase === 'throw') throwAct(g); else moveAct(g, opts(g, g.players[g.turn])[0]); }, TURN_MS);
}
function finish(g, winner) {
  clearT(g);
  g.status = 'done'; g.winner = winner; g.deadline = 0;
  const pot = g.bet * g.players.length;
  for (const id of g.players) {
    const u = db.byId(id); if (!u) continue;
    const pay = id === winner ? pot : 0;
    release(u, g.bet, pay);
    const st = stats(u); st.games++; st.net += pay - g.bet; if (id === winner) st.win++;
  }
  g.chat.push({ name: '📢', text: `${g.names[winner]} 님이 우승! 판돈 ${pot.toLocaleString('ko-KR')}원 획득` });
  db.save();
  for (const id of g.players) { userGame.delete(id); notify(id, 'me'); }
  setTimeout(() => games.delete(g.code), 60000);
  push(g); pushList();
}
function nextTurn(g) {
  if (!(g.last && g.last.extra)) g.turn = (g.turn + 1) % g.players.length; // 윷·모면 한 번 더
  g.phase = 'throw';
}
// 말 한 개 움직이기 (p = 움직일 말이 있는 칸)
function moveAct(g, p) {
  const id = g.players[g.turn];
  if (g.phase !== 'move') return { error: '지금은 윷을 던질 차례예요' };
  const legal = opts(g, id);
  if (!legal.includes(p)) p = legal[0];
  const i = g.pos[id].indexOf(p);
  const np = Math.min(GOAL, p + g.last.steps);
  g.pos[id][i] = np;
  if (np < GOAL) {
    for (const other of g.players) {
      if (other === id) continue;
      g.pos[other] = g.pos[other].map(q => {
        if (q === np) { g.chat.push({ name: '📢', text: `${g.names[id]} 님이 ${g.names[other]} 님의 말을 잡았어요` }); return 0; }
        return q;
      });
    }
  }
  if (g.pos[id].every(q => q === GOAL)) { finish(g, id); return { ok: true }; }
  nextTurn(g);
  armTimer(g);
  push(g);
  return { ok: true };
}
// 윷 던지기 → 옵션이 하나면 바로 움직이고, 여럿이면 말을 고르게 함
function throwAct(g) {
  if (g.phase !== 'throw') return { error: '던질 차례가 아니에요' };
  g.last = throwYut();
  g.phase = 'move';
  const legal = opts(g, g.players[g.turn]);
  if (legal.length === 1) { g.chat.push({ name: '🎲', text: `${g.names[g.players[g.turn]]} : ${g.last.name}` }); return moveAct(g, legal[0]); }
  g.chat.push({ name: '🎲', text: `${g.names[g.players[g.turn]]} : ${g.last.name}` });
  armTimer(g);
  push(g);
  return { ok: true };
}

function yutAct(u, op, arg) {
  const code = userGame.get(u.id);
  const g = code && games.get(code);
  if (op === 'list') return { ok: true, list: lobbyList(), mine: g ? view(g, u.id) : null };
  if (op === 'create') {
    if (g) return { error: '참여 중인 윷놀이가 있어요' };
    const bet = Math.floor(Number(arg));
    if (!(bet >= MIN_BET && bet <= MAX_BET)) return { error: `판돈은 ${MIN_BET / 1e4}만 ~ ${MAX_BET / 1e8}억이에요` };
    if (u.assets < bet) return { error: '보유 현금이 부족해요' };
    const ng = { code: newCode(), host: u.id, players: [u.id], names: { [u.id]: u.username }, bet, status: 'open', chat: [] };
    hold(u, bet);
    games.set(ng.code, ng); userGame.set(u.id, ng.code);
    db.save(); pushList(); notify(u.id, 'me');
    return { ok: true, state: view(ng, u.id) };
  }
  if (op === 'join') {
    if (g) return { error: '참여 중인 윷놀이가 있어요' };
    const j = games.get(String(arg || '').toUpperCase());
    if (!j || j.status !== 'open') return { error: '들어갈 수 없는 판이에요' };
    if (j.players.length >= MAX_PLAYERS) return { error: '자리가 다 찼어요' };
    if (u.assets < j.bet) return { error: '보유 현금이 부족해요' };
    hold(u, j.bet);
    j.players.push(u.id); j.names[u.id] = u.username; userGame.set(u.id, j.code);
    j.chat.push({ name: '📢', text: `${u.username} 님이 들어왔어요` });
    db.save(); pushList(); notify(u.id, 'me'); push(j);
    return { ok: true, state: view(j, u.id) };
  }
  if (!g) return { error: '참여 중인 윷놀이가 없어요' };
  if (op === 'leave' || op === 'cancel') {
    if (g.status !== 'open') return { error: '이미 시작했어요' };
    if (op === 'cancel' && g.host !== u.id) return { error: '방장만 닫을 수 있어요' };
    for (const id of g.players) {
      const p = db.byId(id); if (!p) continue;
      release(p, g.bet, g.bet);
      userGame.delete(id); notify(id, 'me');
    }
    games.delete(g.code);
    db.save(); pushList();
    return { ok: true };
  }
  if (op === 'start') {
    if (g.status !== 'open') return { error: '이미 시작했어요' };
    if (g.host !== u.id) return { error: '방장만 시작할 수 있어요' };
    if (g.players.length < MIN_PLAYERS) return { error: `${MIN_PLAYERS}명 이상 모여야 시작할 수 있어요` };
    g.status = 'play'; g.turn = 0; g.phase = 'throw'; g.last = null; g.winner = null;
    g.pos = {};
    for (const id of g.players) g.pos[id] = [0, 0, 0, 0];
    g.chat.push({ name: '📢', text: '게임 시작!' });
    armTimer(g); pushList(); push(g);
    return { ok: true };
  }
  if (g.status !== 'play' && op !== 'chat') return { error: '아직 시작 전이에요' };
  if (op === 'throw' || op === 'move') {
    if (g.players[g.turn] !== u.id) return { error: '내 차례가 아니에요' };
    return op === 'throw' ? throwAct(g) : moveAct(g, Number(arg));
  }
  if (op === 'chat') {
    const text = String(arg || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!text) return { ok: true };
    g.chat.push({ name: u.username, text });
    g.chat = g.chat.slice(-100);
    push(g);
    return { ok: true };
  }
  return { error: '알 수 없는 행동이에요' };
}

module.exports = { init, yutAct, view, lobbyList, throwYut, MIN_BET, MAX_BET, _games: games };
