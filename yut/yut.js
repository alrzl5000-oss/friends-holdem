// 윷놀이 (3~4인 · 판돈 내기) — 전통 룰
// - 2~4인 (2인부터 시작 가능)
// - 바깥길 20칸, 5번·10번 칸에서 대각선 지름길 (5→중앙→15, 10→중앙→20)
// - 윷 던지기: 도1 · 개2 · 걸3 · 윷4 · 모5 · 뒷도(-1), 윷·모는 한 번 더
// - 상대 말이 있는 칸에 도착하면 잡혀서 출발점으로
// - 말 4개를 모두 골인시킨 사람이 판돈 전부를 가져감 (게임 쪽 몫 없음)
const crypto = require('crypto');
const SHOP = require('./shop');

const MIN_BET = 1e6;
const MAX_BET = 1e8;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const TURN_MS = 20000;
const COLORS = ['#c43a4a', '#3f6fb8', '#d9a21f', '#2f8f78'];

// 길 정의 (노드 이름은 칸 이름)
const MAIN = Array.from({ length: 20 }, (_, k) => 'R' + (k + 1));
const ROUTE = {
  main: MAIN,
  A: ['R5', 'A1', 'A2', 'C', 'B1', 'B2', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20'],
  B: ['R10', 'D1', 'D2', 'C', 'E1', 'E2', 'R20'],
};
const END = { main: 20, A: 12, B: 7 };
const DIAG_AT = { 4: 'A', 9: 'B' }; // main 인덱스 4(R5), 9(R10) 에서 대각선 선택 가능

let getUser, notifyFn, saveFn;
function init(opts) { getUser = opts.getUser; notifyFn = opts.notify; saveFn = opts.save; }
const skinOf = id => { const u = getUser(id); const e = (u && u.equip) || SHOP.DEFAULT_EQUIP; return { piece: e.piece || 'p_basic', stick: e.stick || 's_basic', board: e.board || 'b_hanji' }; };

const games = new Map();
const userGame = new Map();
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (games.has(c));
  return c;
}
function hold(u, amt) { u.assets -= amt; u.yutHold = (u.yutHold || 0) + amt; }
function release(u, amt, pay) { u.yutHold = Math.max(0, (u.yutHold || 0) - amt); u.assets += pay; }
function stats(u) { return (u.yut = u.yut || { games: 0, win: 0, net: 0 }); }

// 윷: 막대 4개 중 앞면(flat) 개수로 결정. 뒷도는 첫 번째 막대만 앞면일 때.
function throwYut() {
  const bits = [0, 0, 0, 0].map(() => crypto.randomInt(2)); // 1 = 앞면(평평한 면)
  const flat = bits.reduce((a, b) => a + b, 0);
  if (flat === 0) return { bits, steps: 5, name: '모', extra: true };
  if (flat === 1) return bits[0] ? { bits, steps: -1, name: '뒷도', extra: false } : { bits, steps: 1, name: '도', extra: false };
  if (flat === 2) return { bits, steps: 2, name: '개', extra: false };
  if (flat === 3) return { bits, steps: 3, name: '걸', extra: false };
  return { bits, steps: 4, name: '윷', extra: true };
}

// 말 상태: { r: 'main'|'A'|'B'|'done', i } — i=-1 은 출발 전
const START_P = () => ({ r: 'main', i: -1 });
const isStart = p => p.r === 'main' && p.i < 0;
const isDone = p => p.r === 'done';
function nodeOf(p) {
  if (isDone(p)) return 'goal';
  if (isStart(p)) return 'start';
  return ROUTE[p.r][p.i];
}
function labelOf(node) {
  if (node === 'start') return '출발';
  if (node === 'goal') return '골인';
  if (node[0] === 'R') return node.slice(1) + '번';
  return node;
}
// 앞으로 s칸 (route: 'main' | 'A' | 'B')
function forward(p, s, route) {
  if (isDone(p)) return null;
  if (isStart(p)) return route === 'main' && s > 0 ? (s - 1 >= 20 ? { r: 'done', i: -1 } : { r: 'main', i: s - 1 }) : null;
  if (p.r === 'main' && route !== 'main') {
    // 대각선 진입: R5 는 A 의 0번, R10 은 B 의 0번
    if (DIAG_AT[p.i] !== route) return null;
    const j = s;
    return j >= END[route] ? { r: 'done', i: -1 } : { r: route, i: j };
  }
  const j = p.i + s;
  return j >= END[p.r] ? { r: 'done', i: -1 } : { r: p.r, i: j };
}
// 뒤로 1칸 (뒷도)
function backward(p) {
  if (isDone(p) || isStart(p)) return null;
  if (p.i - 1 < 0) {
    if (p.r === 'main') return START_P();
    return { r: 'main', i: p.r === 'A' ? 4 : 9 };
  }
  return { r: p.r, i: p.i - 1 };
}

function lobbyList() {
  return [...games.values()].filter(g => g.status === 'open')
    .map(g => ({ code: g.code, host: g.names[g.host], bet: g.bet, n: g.players.length }));
}
// 현재 차례 선택지: 말 종류별로 한 개씩
function optionsFor(g, id) {
  const out = [];
  const seen = new Set();
  const ps = g.pos[id];
  const s = g.last.steps;
  ps.forEach((p, pi) => {
    if (isDone(p)) return;
    const key = p.r + ':' + p.i;
    if (seen.has(key)) return;
    seen.add(key);
    if (s < 0) {
      const to = backward(p);
      if (to) out.push({ id: out.length, pi, route: 'back', from: nodeOf(p), to: nodeOf(to), state: to });
      return;
    }
    const routes = ['main'];
    if (p.r === 'main' && DIAG_AT[p.i]) routes.push(DIAG_AT[p.i]);
    for (const route of routes) {
      const to = forward(p, s, route);
      if (!to) continue;
      out.push({ id: out.length, pi, route, from: nodeOf(p), to: nodeOf(to), state: to });
    }
  });
  return out;
}
function view(g, uid) {
  const turnId = g.players[g.turn];
  const canAct = g.status === 'play' && turnId === uid;
  return {
    code: g.code, bet: g.bet, status: g.status, host: g.names[g.host], pot: g.bet * g.players.length,
    deadline: g.deadline || 0, winner: g.winner ? g.names[g.winner] : null, you: uid,
    players: g.players.map((id, i) => ({
      id, name: g.names[id], color: COLORS[i], skin: skinOf(id),
      nodes: g.pos ? g.pos[id].map(nodeOf) : ['start', 'start', 'start', 'start'],
      done: g.pos ? g.pos[id].filter(isDone).length : 0,
      turn: g.status === 'play' && id === turnId, host: id === g.host,
    })),
    phase: g.status === 'play' ? g.phase : null,
    canThrow: canAct && g.phase === 'throw',
    canMove: canAct && g.phase === 'move',
    options: canAct && g.phase === 'move' ? g.options.map(o => ({ id: o.id, label: `${labelOf(o.from)} → ${labelOf(o.to)}`, from: o.from, to: o.to, route: o.route })) : [],
    last: g.last || null,
    chat: g.chat.slice(-60),
    seq: g.seq || 0,
  };
}
function push(g) { for (const id of g.players) notifyFn(id, 'yutState', view(g, id)); }
function pushList() { notifyFn(null, 'yuts', lobbyList()); }
function clearT(g) { clearTimeout(g.timer); g.timer = null; }
function armTimer(g) {
  clearT(g);
  g.deadline = Date.now() + TURN_MS;
  g.timer = setTimeout(() => {
    if (g.status !== 'play') return;
    if (g.phase === 'throw') throwAct(g);
    else if (g.options.length) applyOption(g, g.options[0].id);
  }, TURN_MS);
}
function finish(g, winner) {
  clearT(g);
  g.status = 'done'; g.winner = winner; g.deadline = 0;
  const pot = g.bet * g.players.length;
  for (const id of g.players) {
    const u = getUser(id); if (!u) continue;
    const pay = id === winner ? pot : 0;
    release(u, g.bet, pay);
    const st = stats(u); st.games++; st.net += pay - g.bet; if (id === winner) st.win++;
  }
  g.chat.push({ name: '📢', text: `${g.names[winner]} 님 우승! 판돈 ${pot.toLocaleString('ko-KR')}원 획득` });
  saveFn();
  for (const id of g.players) { userGame.delete(id); notifyFn(id, 'me'); }
  setTimeout(() => games.delete(g.code), 60000);
  push(g); pushList();
}
function endTurn(g) {
  if (!(g.last && g.last.extra)) g.turn = (g.turn + 1) % g.players.length;
  g.phase = 'throw';
  g.options = [];
}
function applyOption(g, optId) {
  const id = g.players[g.turn];
  const o = g.options.find(x => x.id === optId) || g.options[0];
  if (!o) return { error: '움직일 말이 없어요' };
  // 업기: 같은 칸에 있는 내 말은 함께 움직인다 (출발 전 말은 하나씩만 나감)
  const fromNode = nodeOf(g.pos[id][o.pi]);
  const group = fromNode === 'start' ? [o.pi]
    : g.pos[id].map((q, qi) => qi).filter(qi => nodeOf(g.pos[id][qi]) === fromNode);
  for (const qi of group) g.pos[id][qi] = { ...o.state };
  const node = nodeOf(o.state);
  if (node !== 'goal' && node !== 'start') {
    const here = g.pos[id].filter(q => nodeOf(q) === node).length;
    if (here > group.length) g.chat.push({ name: '📢', text: `${g.names[id]} 님이 말을 업었어요 (${here}동)` });
  }
  if (node !== 'goal' && node !== 'start') {
    for (const other of g.players) {
      if (other === id) continue;
      g.pos[other] = g.pos[other].map(q => {
        if (!isDone(q) && !isStart(q) && nodeOf(q) === node) {
          g.chat.push({ name: '📢', text: `${g.names[id]} 님이 ${g.names[other]} 님의 말을 잡았어요` });
          return START_P();
        }
        return q;
      });
    }
  }
  if (g.pos[id].every(isDone)) { finish(g, id); return { ok: true }; }
  endTurn(g);
  armTimer(g);
  push(g);
  return { ok: true };
}
function throwAct(g) {
  if (g.phase !== 'throw') return { error: '던질 차례가 아니에요' };
  const id = g.players[g.turn];
  g.last = { ...throwYut(), by: id };
  g.seq = (g.seq || 0) + 1;
  g.chat.push({ name: '🎲', text: `${g.names[id]} : ${g.last.name}` });
  g.options = optionsFor(g, id);
  if (g.options.length === 0) { // 뒷도인데 움직일 말이 없음 → 턴 넘김
    endTurn(g); armTimer(g); push(g); return { ok: true };
  }
  if (g.options.length === 1) return applyOption(g, g.options[0].id);
  g.phase = 'move';
  armTimer(g);
  push(g);
  return { ok: true };
}

function yutAct(u, op, arg) {
  const code = userGame.get(u.id);
  const g = code && games.get(code);
  if (op === 'list') return { ok: true, list: lobbyList(), mine: g ? view(g, u.id) : null };
  if (op === 'create') {
    if (g) return { error: '참여 중인 판이 있어요' };
    const bet = Math.floor(Number(arg));
    if (!(bet >= MIN_BET && bet <= MAX_BET)) return { error: `판돈은 ${MIN_BET / 1e4}만 ~ ${MAX_BET / 1e8}억이에요` };
    if (u.assets < bet) return { error: '보유 현금이 부족해요' };
    const ng = { code: newCode(), host: u.id, players: [u.id], names: { [u.id]: u.username }, bet, status: 'open', chat: [], pos: null, turn: 0, phase: 'throw', last: null, options: [], winner: null, deadline: 0 };
    hold(u, bet);
    games.set(ng.code, ng); userGame.set(u.id, ng.code);
    saveFn(); pushList(); notifyFn(u.id, 'me');
    return { ok: true, state: view(ng, u.id) };
  }
  if (op === 'join') {
    if (g) return { error: '참여 중인 판이 있어요' };
    const j = games.get(String(arg || '').toUpperCase());
    if (!j || j.status !== 'open') return { error: '들어갈 수 없는 판이에요' };
    if (j.players.length >= MAX_PLAYERS) return { error: '자리가 다 찼어요' };
    if (u.assets < j.bet) return { error: '보유 현금이 부족해요' };
    hold(u, j.bet);
    j.players.push(u.id); j.names[u.id] = u.username; userGame.set(u.id, j.code);
    j.chat.push({ name: '📢', text: `${u.username} 님이 들어왔어요` });
    saveFn(); pushList(); notifyFn(u.id, 'me'); push(j);
    return { ok: true, state: view(j, u.id) };
  }
  if (!g) return { error: '참여 중인 판이 없어요' };
  if (op === 'leave' || op === 'cancel') {
    if (g.status !== 'open') return { error: '이미 시작했어요' };
    if (op === 'cancel' && g.host !== u.id) return { error: '방장만 닫을 수 있어요' };
    for (const id of g.players) {
      const p = getUser(id); if (!p) continue;
      release(p, g.bet, g.bet);
      userGame.delete(id); notifyFn(id, 'me');
    }
    games.delete(g.code);
    saveFn(); pushList();
    return { ok: true };
  }
  if (op === 'start') {
    if (g.status !== 'open') return { error: '이미 시작했어요' };
    if (g.host !== u.id) return { error: '방장만 시작할 수 있어요' };
    if (g.players.length < MIN_PLAYERS) return { error: `${MIN_PLAYERS}명 이상 모여야 시작할 수 있어요` };
    g.status = 'play'; g.turn = 0; g.phase = 'throw'; g.last = null; g.options = []; g.winner = null;
    g.pos = {};
    for (const id of g.players) g.pos[id] = [START_P(), START_P(), START_P(), START_P()];
    g.chat.push({ name: '📢', text: '게임 시작!' });
    armTimer(g); pushList(); push(g);
    return { ok: true };
  }
  if (op === 'chat') {
    const text = String(arg || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!text) return { ok: true };
    g.chat.push({ name: u.username, text });
    g.chat = g.chat.slice(-100);
    push(g);
    return { ok: true };
  }
  if (g.status !== 'play') return { error: '아직 시작 전이에요' };
  if (g.players[g.turn] !== u.id) return { error: '내 차례가 아니에요' };
  if (op === 'throw') return throwAct(g);
  if (op === 'move') return applyOption(g, Number(arg));
  return { error: '알 수 없는 행동이에요' };
}

module.exports = { init, skinOf, yutAct, view, lobbyList, throwYut, optionsFor, forward, backward, START_P, nodeOf, ROUTE, MIN_BET, MAX_BET, _games: games };
