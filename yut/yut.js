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
const AFK_MS = 2600;      // 자리비움이면 이만큼만 기다렸다 자동 진행 (윷 연출이 보이도록)
const AFK_AFTER = 3;      // 시간초과 자동 진행이 연속 3번이면 자리비움
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
// 방(가운데)에 멈춘 말은 출발점(참먹이) 쪽 지름길로 가도록 B 길로 바꿔 둠
const C_A = ROUTE.A.indexOf('C'), C_B = ROUTE.B.indexOf('C');
const norm = q => {
  if (!q) return q;
  if (q.r === 'A' && q.i === C_A) return { r: 'B', i: C_B };
  if (q.r === 'A' && q.i === 0) return { r: 'main', i: 4 };   // R5
  if (q.r === 'B' && q.i === 0) return { r: 'main', i: 9 };   // R10
  return q;
};
// 앞으로 s칸 (route: 'main' | 'A' | 'B') — 멈춘 칸 기준으로 정리된 상태를 돌려줌
function forward(p, s, route) { return norm(forwardRaw(p, s, route)); }
function forwardRaw(p, s, route) {
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
// 지나간 칸 목록 (애니메이션용)
function pathOf(p, s, route) {
  const out = [nodeOf(p)];
  let cur = p;
  for (let k = 1; k <= s; k++) {
    cur = forwardRaw(cur, 1, k === 1 ? route : cur.r);
    if (!cur) break;
    out.push(nodeOf(cur));
    if (isDone(cur)) break;
  }
  return out;
}
// 뒤로 1칸 (뒷도) — 첫 칸(도 자리)에서 뒷도면 도착칸(참먹이)으로
function backward(p) {
  if (isDone(p) || isStart(p)) return null;
  if (p.i - 1 < 0) {
    if (p.r === 'main') return { r: 'main', i: 19 };
    return { r: 'main', i: p.r === 'A' ? 4 : 9 };
  }
  return norm({ r: p.r, i: p.i - 1 });
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
    const key = nodeOf(p);   // 같은 칸의 말은 업혀서 함께 움직이므로 선택지 하나
    if (seen.has(key)) return;
    seen.add(key);
    if (s < 0) {
      const to = backward(p);
      if (to) out.push({ id: out.length, pi, route: 'back', from: nodeOf(p), to: nodeOf(to), state: to, path: [nodeOf(p), nodeOf(to)] });
      return;
    }
    // 모서리(첫 모·둘째 모)에 멈춰 있으면 무조건 지름길
    const routes = (p.r === 'main' && DIAG_AT[p.i]) ? [DIAG_AT[p.i]] : ['main'];
    for (const route of routes) {
      const to = forward(p, s, route);
      if (!to) continue;
      out.push({ id: out.length, pi, route, from: nodeOf(p), to: nodeOf(to), state: to, path: pathOf(p, s, route) });
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
      afk: !!(g.afk && g.afk[id]), miss: (g.miss && g.miss[id]) || 0,
    })),
    phase: g.status === 'play' ? g.phase : null,
    canThrow: canAct && g.phase === 'throw',
    canMove: canAct && g.phase === 'move',
    options: canAct && g.phase === 'move' ? g.options.map(o => ({ id: o.id, label: `${labelOf(o.from)} → ${labelOf(o.to)}`, from: o.from, to: o.to, route: o.route, path: o.path })) : [],
    last: g.last || null,
    chat: g.chat.slice(-60),
    seq: g.seq || 0,
    again: g.status === 'play' && !!g.repeat, bonusLeft: g.bonus || 0,
    move: g.move || null,
  };
}
// 직접 행동하면 시간초과 횟수 초기화, 자리비움 해제
function markActive(g, id) {
  g.miss = g.miss || {}; g.afk = g.afk || {};
  g.miss[id] = 0;
  if (g.afk[id]) { g.afk[id] = false; g.chat.push({ name: '📢', text: `${g.names[id]} 님이 돌아왔어요` }); }
}
function backFromAfk(g, id) {
  const was = g.afk && g.afk[id];
  markActive(g, id);
  if (was && g.players[g.turn] === id) armTimer(g);   // 내 차례면 다시 20초
  push(g);
  return { ok: true };
}
function push(g) { for (const id of g.players) notifyFn(id, 'yutState', view(g, id)); saveFn(); }
function pushList() { notifyFn(null, 'yuts', lobbyList()); }
function clearT(g) { clearTimeout(g.timer); g.timer = null; }
function armTimer(g) {
  clearT(g);
  g.afk = g.afk || {}; g.miss = g.miss || {};
  const cur = g.players[g.turn];
  const wait = g.afk[cur] ? AFK_MS : TURN_MS;
  g.deadline = Date.now() + wait;
  g.timer = setTimeout(() => {
    if (g.status !== 'play') return;
    const id = g.players[g.turn];
    if (!g.afk[id]) {
      g.miss[id] = (g.miss[id] || 0) + 1;
      if (g.miss[id] >= AFK_AFTER) {
        g.afk[id] = true;
        g.chat.push({ name: '📢', text: `${g.names[id]} 님이 자리비움 상태가 됐어요 (자동으로 진행해요)` });
      }
    }
    if (g.phase === 'throw') throwAct(g);
    else if (g.options.length) applyOption(g, g.options[0].id);
  }, wait);
}
function finish(g, winner) {
  clearT(g);
  g.status = 'done'; g.winner = winner; g.deadline = 0;
  const pot = g.bet * g.players.length;
  for (const id of g.players) {
    const u = getUser(id); if (!u) continue;
    const pay = id === winner ? pot : 0;
    release(u, g.bet, pay);
    const st = stats(u); st.games++; st.net += pay - g.bet; if (id === winner) { st.win++; u.trophy = (u.trophy || 0) + 1; }
  }
  g.chat.push({ name: '📢', text: `${g.names[winner]} 님 우승! 판돈 ${pot.toLocaleString('ko-KR')}원과 🏆 1개 획득` });
  saveFn();
  for (const id of g.players) { userGame.delete(id); notifyFn(id, 'me'); }
  setTimeout(() => games.delete(g.code), 60000);
  push(g); pushList();
}
// 추가로 던질 횟수: 윷·모 +1, 잡으면 +1 (윷·모로 잡으면 두 번 더)
function endTurn(g, captured = false) {
  g.bonus = (g.bonus || 0) + (g.last && g.last.extra ? 1 : 0) + (captured ? 1 : 0);
  if (g.bonus > 0) { g.bonus--; g.repeat = true; }
  else { g.turn = (g.turn + 1) % g.players.length; g.repeat = false; }
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
  const startP = g.pos[id][o.pi];
  const path = o.path || (o.route === 'back' ? [nodeOf(startP), nodeOf(o.state)] : pathOf(startP, g.last.steps, o.route));
  for (const qi of group) g.pos[id][qi] = { ...o.state };
  const node = nodeOf(o.state);
  const stackedBefore = node !== 'goal' && g.pos[id].some((q, qi) => !group.includes(qi) && nodeOf(q) === node);
  if (node !== 'goal' && node !== 'start') {
    const here = g.pos[id].filter(q => nodeOf(q) === node).length;
    if (here > group.length) g.chat.push({ name: '📢', text: `${g.names[id]} 님이 말을 업었어요 (${here}동)` });
  }
  let captured = false; const capturedAt = [];
  if (node !== 'goal' && node !== 'start') {
    for (const other of g.players) {
      if (other === id) continue;
      g.pos[other] = g.pos[other].map(q => {
        if (!isDone(q) && !isStart(q) && nodeOf(q) === node) {
          if (!captured || captured !== other) g.chat.push({ name: '📢', text: `${g.names[id]} 님이 ${g.names[other]} 님의 말을 잡았어요 — 한 번 더!` });
          captured = other; if (!capturedAt.some(c => c.id === other)) capturedAt.push({ id: other, node });
          return START_P();
        }
        return q;
      });
    }
  }
  g.move = { n: (g.move ? g.move.n : 0) + 1, by: id, path, to: node, count: group.length,
    captured: captured ? capturedAt.slice() : [], stacked: stackedBefore, goal: node === 'goal' };
  if (g.pos[id].every(isDone)) { finish(g, id); return { ok: true }; }
  endTurn(g, !!captured);
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
    g.status = 'play'; g.turn = 0; g.phase = 'throw'; g.last = null; g.options = []; g.winner = null; g.afk = {}; g.miss = {}; g.bonus = 0; g.repeat = false; g.move = null;
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
  if (op === 'back') return backFromAfk(g, u.id);
  if (g.players[g.turn] !== u.id) return { error: '내 차례가 아니에요' };
  if (g.players[g.turn] === u.id) markActive(g, u.id);
  if (op === 'throw') return throwAct(g);
  if (op === 'move') return applyOption(g, Number(arg));
  return { error: '알 수 없는 행동이에요' };
}

// 서버가 다시 켜져도 판이 이어지도록 저장·복원
function dump() {
  return [...games.values()].filter(g => g.status !== 'done').map(g => { const { timer, ...rest } = g; return rest; });
}
function restore(list) {
  for (const g of list || []) {
    if (!g || !g.code || games.has(g.code)) continue;
    g.timer = null;
    games.set(g.code, g);
    for (const id of g.players) userGame.set(id, g.code);
    if (g.status === 'play') armTimer(g);   // 차례 시간은 처음부터 다시
  }
  return [...games.values()].flatMap(g => g.players);
}
module.exports = { pathOf, backward, norm, dump, restore, init, skinOf, yutAct, view, lobbyList, throwYut, optionsFor, forward, backward, START_P, nodeOf, ROUTE, MIN_BET, MAX_BET, _games: games };
