// 윷놀이 (3~4인 · 판돈 내기) — 전통 룰
// - 2~4인 (2인부터 시작 가능)
// - 바깥길 20칸, 5번·10번 칸에서 대각선 지름길 (5→중앙→15, 10→중앙→20)
// - 윷 던지기: 도1 · 개2 · 걸3 · 윷4 · 모5 · 뒷도(-1), 윷·모는 한 번 더
// - 상대 말이 있는 칸에 도착하면 잡혀서 출발점으로
// - 말 4개를 모두 골인시킨 사람이 판돈 전부를 가져감 (게임 쪽 몫 없음)
const crypto = require('crypto');
const SHOP = require('./shop');
// 업적용 기록 (u.st)
const ST = id => { const u = getUser(id); return u ? (u.st = u.st || {}) : {}; };
// 한 판 안의 기록 (예능 업적용) — 판이 끝나면 계정 기록으로 옮김
const GS = (g, id) => { g.gs = g.gs || {}; return (g.gs[id] = g.gs[id] || { caught: 0, caps: 0, back: 0, nak: 0, throws: 0, chats: 0, hitBy: {}, turns: 0 }); };
const inc = (S, k, n = 1) => { S[k] = (S[k] || 0) + n; };
const maxTo = (S, k, v) => { S[k] = Math.max(S[k] || 0, v); };

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
let shameFn = () => 0, otherBusyFn = () => false;
function init(opts) { getUser = opts.getUser; notifyFn = opts.notify; saveFn = opts.save; if (opts.shameOf) shameFn = opts.shameOf; if (opts.otherBusy) otherBusyFn = opts.otherBusy; }
const shameOfId = id => { const u = getUser(id); return u ? shameFn(u) : 0; };
const skinOf = id => { const u = getUser(id); const e = (u && u.equip) || SHOP.DEFAULT_EQUIP; return { piece: e.piece || 'p_basic', stick: e.stick || 's_basic', board: e.board || 'b_hanji' }; };

const games = new Map();
const userGame = new Map();
const userWatch = new Map();   // 관전 중인 판: uid → code
const watchersOf = g => (g.watchers = g.watchers || []);
// 색은 들어온 순간 사람마다 고정 (순서를 섞어도 안 바뀜). 예전 판은 그때 순서대로 채움
function colorOf(g, id) {
  g.colors = g.colors || {};
  if (!g.colors[id]) { const used = new Set(Object.values(g.colors)); g.colors[id] = COLORS.find(c => !used.has(c)) || COLORS[0]; }
  return g.colors[id];
}
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
const NAK_PCT = Number(process.env.YUT_NAK_PCT || 3);   // 테스트할 때만 환경변수로 바꿈
// 낙 나왔을 때 놀리는 말 ({n} = 던진 사람)
const NAK_TAUNTS = [
  '{n} 님, 윷을 판 밖으로 던지는 재능 있으시네요 🤦',
  '손에 참기름 바르고 오셨어요? {n} 님?',
  '{n} 님의 윷은 지금 옆 동네로 여행 중 ✈️',
  '국가대표급 헛손질, {n} 님 축하드려요 🏅',
  '멍석이 이렇게 넓은데 그걸 못 맞히네 ㅋㅋㅋ',
  '윷도 {n} 님이랑 놀기 싫대요',
  '{n} 님, 차례 하나 기부 감사합니다 🙏',
  '역사에 남을 낙. 박물관에 기증해야 함 🏛️',
  '{n} 님 던지기 전에 기도라도 하세요 🙏🙏',
  '방금 그거 연습이죠? 아 실전이었어요? ㅋㅋ',
  '{n} 님 팔에 힘 조절 기능 고장남 🔧',
  '윷이 {n} 님 손을 탈출했습니다 🏃‍♂️💨',
  '이 정도면 일부러 한 거 아님? {n} 님?',
  '{n} 님 오늘 운세: 낙 🔮',
  '다들 박수 👏👏 {n} 님이 해냈어요 (낙을)',
];   // 낙: 윷가락이 판 밖으로 떨어짐 → 무효, 차례 넘어감
// 1단계: 낙 3% / 나머지 97%
// 2단계: 도개걸윷모 (1000 기준) — 실측 배 확률 57.9%(김미경·허명회 1995, 4개 동시 1,120회)로 계산
const ODDS = [['도', 130], ['뒷도', 43], ['개', 357], ['걸', 327], ['윷', 112], ['모', 31]];
const STEPS = { '도': 1, '뒷도': -1, '개': 2, '걸': 3, '윷': 4, '모': 5 };
function bitsFor(name) {   // 화면에 보일 윷가락 앞뒷면 (1 = 배·평평한 면)
  const flat = { '도': 1, '뒷도': 1, '개': 2, '걸': 3, '윷': 4, '모': 0 }[name];
  if (name === '뒷도') return [1, 0, 0, 0];
  const idx = name === '도' ? [1, 2, 3] : [0, 1, 2, 3];
  for (let i = idx.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const bits = [0, 0, 0, 0]; idx.slice(0, flat).forEach(i => { bits[i] = 1; }); return bits;
}
function throwYut() {
  if (crypto.randomInt(100) < NAK_PCT) return { bits: bitsFor(['도', '개', '걸'][crypto.randomInt(3)]), steps: 0, name: '낙', extra: false, nak: true, taunt: NAK_TAUNTS[crypto.randomInt(NAK_TAUNTS.length)] };
  let r = crypto.randomInt(1000), name = '개';
  for (const [n, w] of ODDS) { if (r < w) { name = n; break; } r -= w; }
  return { bits: bitsFor(name), steps: STEPS[name], name, extra: name === '윷' || name === '모' };
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
  return [...games.values()].filter(g => g.status === 'open' || g.status === 'play')
    .map(g => ({ code: g.code, host: g.names[g.host], bet: g.bet, n: g.players.length, status: g.status, watchers: watchersOf(g).length }));
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
      id, name: g.names[id], color: colorOf(g, id), skin: skinOf(id), shame: shameOfId(id),
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
    spectating: !g.players.includes(uid), watchers: watchersOf(g).length,
    tally: g.tally || {},
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
function push(g) { for (const m of g.chat) if (m.n == null) m.n = (g.chatN = (g.chatN || 0) + 1); for (const id of g.players) notifyFn(id, 'yutState', view(g, id)); for (const id of watchersOf(g)) notifyFn(id, 'yutState', view(g, id)); saveFn(); }
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
    // 업적 기록: 연승 · 무혈입성 · 역전 · 큰손
    const S = (u.st = u.st || {});
    if (id === winner) {
      S.streak = (S.streak || 0) + 1; S.bestStreak = Math.max(S.bestStreak || 0, S.streak);
      if (g.players.length === 4 && !(g.hit && g.hit[id])) S.flawless4 = (S.flawless4 || 0) + 1;
      if (g.cb && g.cb[id]) S.comebacks = (S.comebacks || 0) + 1;
      if (g.bet >= 1e8 && g.players.length === 4) S.bigWins = (S.bigWins || 0) + 1;
    } else S.streak = 0;
    const me = GS(g, id), done = g.pos[id].filter(isDone).length;
    maxTo(S, 'maxCaughtGame', me.caught); maxTo(S, 'maxCapsGame', me.caps); maxTo(S, 'maxBackGame', me.back);
    maxTo(S, 'maxNakGame', me.nak); maxTo(S, 'maxChatsGame', me.chats); maxTo(S, 'maxThrowsGame', me.throws);
    maxTo(S, 'maxSameHit', Math.max(0, ...Object.values(me.hitBy)));
    if (me.caps >= 20 && me.caught >= 20) inc(S, 'brawls');
    if (id === winner) {
      if (me.throws <= 10) inc(S, 'fastWin');
      if (g.afk && g.afk[id]) inc(S, 'afkWin');
    } else {
      if (done === 0) inc(S, 'zeroLoss');
      if (g.bet >= 1e8 && g.players.length === 4) inc(S, 'bigLoss');
      const rest = g.pos[id].find(q => !isDone(q));
      if (done === 3 && rest && ['R20', 'R19', 'E2'].includes(nodeOf(rest))) inc(S, 'almost');   // 다 된 밥에 재
    }
  }
  g.chat.push({ name: '📢', text: `${g.names[winner]} 님 우승! 판돈 ${pot.toLocaleString('ko-KR')}원과 🏆 1개 획득` });
  saveFn();
  for (const id of g.players) { userGame.delete(id); notifyFn(id, 'me'); }
  setTimeout(() => closeGame(g, false), 60000);
  push(g); pushList();
}
// 추가로 던질 횟수: 윷·모 +1, 잡으면 +1 (윷·모로 잡으면 두 번 더)
// 같은 칸의 내 말 묶음 (업힌 말)
function group0(g, id, pi) { const n = nodeOf(g.pos[id][pi]); return n === 'start' ? [pi] : g.pos[id].map((_, qi) => qi).filter(qi => nodeOf(g.pos[id][qi]) === n); }
function endTurn(g, captured = false) {
  g.bonus = (g.bonus || 0) + (g.last && g.last.extra ? 1 : 0) + (captured ? 1 : 0);
  if (g.bonus > 0) { g.bonus--; g.repeat = true; }
  else { GS(g, g.players[g.turn]).turns++; g.turn = (g.turn + 1) % g.players.length; g.repeat = false; }
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
  g.backHome = g.backHome || {};
  const fromNodeB = nodeOf(startP);
  const backShort = fromNodeB === 'R20' && nodeOf(o.state) === 'goal' && group0(g, id, o.pi).some(qi => g.backHome[id + ':' + qi]);
  const path = o.path || (o.route === 'back' ? [nodeOf(startP), nodeOf(o.state)] : pathOf(startP, g.last.steps, o.route));
  for (const qi of group) g.pos[id][qi] = { ...o.state };
  const node = nodeOf(o.state);
  const stackedBefore = node !== 'goal' && g.pos[id].some((q, qi) => !group.includes(qi) && nodeOf(q) === node);
  if (node !== 'goal' && node !== 'start') {
    const here = g.pos[id].filter(q => nodeOf(q) === node).length;
    if (here > group.length) g.chat.push({ name: '📢', text: `${g.names[id]} 님이 말을 업었어요 (${here}동)` });
  }
  let captured = false; const capturedAt = []; let capN = 0; const capBy = {};
  if (node !== 'goal' && node !== 'start') {
    for (const other of g.players) {
      if (other === id) continue;
      g.pos[other] = g.pos[other].map(q => {
        if (!isDone(q) && !isStart(q) && nodeOf(q) === node) {
          if (!captured || captured !== other) g.chat.push({ name: '📢', text: `${g.names[id]} 님이 ${g.names[other]} 님의 말을 잡았어요 — 한 번 더!` });
          captured = other; capN++; capBy[other] = (capBy[other] || 0) + 1; if (!capturedAt.some(c => c.id === other)) capturedAt.push({ id: other, node });
          return START_P();
        }
        return q;
      });
    }
  }
  // 잡았으면 내 말(장착한 말)의 조롱 한 마디
  let taunt = null;
  if (captured) {
    const mu = getUser(id), pid = (mu && mu.equip && mu.equip.piece) || 'p_basic';
    taunt = SHOP.tauntFor(pid, capturedAt.map(c => g.names[c.id]).join(', '));
    g.chat.push({ name: '📢', text: `😈 ${g.names[id]}: ${taunt}` });
  }
  // 예능 업적 기록
  { const me = GS(g, id);
    if (o.route === 'back' && node === 'R20') for (const qi of group) g.backHome[id + ':' + qi] = true;   // 첫 칸 빽도로 참먹이
    if (backShort) inc(ST(id), 'backShortcut');                                                          // 그 말이 바로 나감
    for (const qi of group) if (node !== 'R20') delete g.backHome[id + ':' + qi];
    me.caps += capN;
    g.rev = g.rev || {};
    for (const [vid, n] of Object.entries(capBy)) {
      const V = GS(g, vid), VS = ST(vid);
      V.caught += n; V.hitBy[id] = (V.hitBy[id] || 0) + n;
      if (node === 'R20') inc(VS, 'caughtAtHome');                    // 참먹이(나가기 직전 칸)에서 잡힘
      if (n >= 4) inc(VS, 'lost4');                                    // 4동 업은 채 한 번에 잡힘
      // 나를 잡은 사람을 '바로 다음 내 차례'에 되잡으면 복수
      const r = g.rev[id];
      if (r && r.by === vid && GS(g, id).turns === r.turns) inc(ST(id), 'revenges');
      g.rev[vid] = { by: id, turns: V.turns };
    } }
  // 업적 기록: 잡기 · 뒷도 잡기 · 4동 나기 · 역전 조건 · 잡힌 적 있음
  { const S = ST(id);
    if (capN) { S.captures = (S.captures || 0) + capN; S.maxCapOnce = Math.max(S.maxCapOnce || 0, capN); if (g.last.steps < 0) S.backCaptures = (S.backCaptures || 0) + 1; }
    if (node === 'goal' && group.length === 4) S.fourHome = (S.fourHome || 0) + 1;
    g.hit = g.hit || {}; for (const c of capturedAt) g.hit[c.id] = true;
    g.cb = g.cb || {};
    const doneOf = pid => g.pos[pid].filter(isDone).length;
    for (const pid of g.players) if (doneOf(pid) === 0 && g.players.some(o => o !== pid && doneOf(o) >= 3)) g.cb[pid] = true; }
  g.move = { n: (g.move ? g.move.n : 0) + 1, by: id, path, to: node, count: group.length, taunt,
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
  // 던지기 기록: 이번 판 + 계정 누적 (확률 확인용)
  g.tally = g.tally || {}; const t = (g.tally[id] = g.tally[id] || {}); t[g.last.name] = (t[g.last.name] || 0) + 1;
  const tu = getUser(id); if (tu) { tu.throws = tu.throws || {}; tu.throws[g.last.name] = (tu.throws[g.last.name] || 0) + 1; }
  { const S = ST(id), nm = g.last.name;   // 업적 기록: 모·윷 연속, 낙
    S.moStreak = nm === '모' ? (S.moStreak || 0) + 1 : 0; S.maxMoStreak = Math.max(S.maxMoStreak || 0, S.moStreak);
    S.yutStreak = nm === '윷' ? (S.yutStreak || 0) + 1 : 0; S.maxYutStreak = Math.max(S.maxYutStreak || 0, S.yutStreak);
    if (g.last.nak) S.naks = (S.naks || 0) + 1;
    S.nakRun = g.last.nak ? (S.nakRun || 0) + 1 : 0; maxTo(S, 'maxNakRun', S.nakRun);
    const me = GS(g, id); me.throws++;
    if (nm === '뒷도') me.back++;
    if (g.last.nak) { me.nak++; if (me.prevThrow === '모') inc(S, 'moNak'); }   // 천당과 지옥: 모 바로 다음 낙
    me.prevThrow = nm; }
  g.seq = (g.seq || 0) + 1;
  g.chat.push({ name: '🎲', text: `${g.names[id]} : ${g.last.name}` });
  if (g.last.nak) {   // 낙: 움직이지 않고 이번 던지기는 무효
    g.options = []; g.move = null;
    g.last.taunt = (g.last.taunt || '{n} 님 낙!').replace(/\{n\}/g, g.names[id]);
    g.chat.push({ name: '📢', text: `🤣 낙! ${g.last.taunt}` });
    endTurn(g); armTimer(g); push(g); return { ok: true };
  }
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

// 판 없애기: 남은 사람·관전자에게 알림 (notify=true 면 'yutGone' 이벤트)
function closeGame(g, notify) {
  if (games.get(g.code) !== g) return;
  clearT(g);
  games.delete(g.code);
  for (const id of g.players) if (userGame.get(id) === g.code) userGame.delete(id);
  for (const id of watchersOf(g)) { if (userWatch.get(id) === g.code) userWatch.delete(id); if (notify) notifyFn(id, 'yutGone', g.code); }
  pushList();
}
function unwatch(uid) {
  const wc = userWatch.get(uid); if (!wc) return;
  userWatch.delete(uid);
  const w = games.get(wc); if (w) { w.watchers = watchersOf(w).filter(x => x !== uid); push(w); pushList(); }
}
function yutAct(u, op, arg) {
  const code = userGame.get(u.id);
  const g = code && games.get(code);
  const wg = !g && userWatch.get(u.id) ? games.get(userWatch.get(u.id)) : null;
  if (op === 'list') return { ok: true, list: lobbyList(), mine: g ? view(g, u.id) : wg ? view(wg, u.id) : null };
  if (op === 'watch') {
    if (g) return { error: '참여 중인 판이 있어요' };
    const w = games.get(String(arg || '').toUpperCase());
    if (!w || w.status === 'done') return { error: '관전할 수 없는 판이에요' };
    unwatch(u.id);
    watchersOf(w).push(u.id); userWatch.set(u.id, w.code);
    push(w); pushList();
    return { ok: true, state: view(w, u.id) };
  }
  if (op === 'unwatch') { unwatch(u.id); return { ok: true }; }
  if (wg && op === 'chat') {   // 관전자 채팅: 30자, 3초에 1번
    const now = Date.now();
    if (now - (u._wchat || 0) < 3000) return { error: '관전자는 3초에 한 번만 말할 수 있어요' };
    const text = String(arg || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (!text) return { ok: true };
    u._wchat = now;
    wg.chat.push({ name: u.username, text, watcher: true }); wg.chat = wg.chat.slice(-100);
    push(wg);
    return { ok: true };
  }
  if ((op === 'create' || op === 'join') && !g) unwatch(u.id);
  if ((op === 'create' || op === 'join') && !g && otherBusyFn(u.id)) return { error: '미니게임 판에 참여 중이에요' };
  if (op === 'create') {
    if (g) return { error: '참여 중인 판이 있어요' };
    const bet = Math.floor(Number(arg));
    if (!(bet >= MIN_BET && bet <= MAX_BET)) return { error: `판돈은 ${MIN_BET / 1e4}만 ~ ${MAX_BET / 1e8}억이에요` };
    if (u.assets < bet) return { error: '보유 현금이 부족해요' };
    const ng = { code: newCode(), host: u.id, players: [u.id], names: { [u.id]: u.username }, bet, status: 'open', chat: [], pos: null, turn: 0, phase: 'throw', last: null, options: [], winner: null, deadline: 0 };
    hold(u, bet);
    colorOf(ng, u.id);
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
    j.players.push(u.id); j.names[u.id] = u.username; userGame.set(u.id, j.code); colorOf(j, u.id);
    j.chat.push({ name: '📢', text: `${u.username} 님이 들어왔어요` });
    saveFn(); pushList(); notifyFn(u.id, 'me'); push(j);
    return { ok: true, state: view(j, u.id) };
  }
  if (!g) return { error: '참여 중인 판이 없어요' };
  if (op === 'leave' || op === 'cancel') {
    if (g.status !== 'open') return { error: '이미 시작했어요' };
    if (op === 'cancel' && g.host !== u.id) return { error: '방장만 닫을 수 있어요' };
    if (op === 'leave' && g.host !== u.id) {   // 손님이 나감: 그 사람 판돈만 돌려주고 판은 유지
      release(u, g.bet, g.bet);
      g.players = g.players.filter(id => id !== u.id); userGame.delete(u.id); if (g.colors) delete g.colors[u.id];
      g.chat.push({ name: '📢', text: `${u.username} 님이 나갔어요` });
      notifyFn(u.id, 'me'); push(g); pushList();
      return { ok: true };
    }
    // 방장이 닫거나 나감: 모두에게 판돈 돌려주고 판 없애기
    const others = g.players.filter(id => id !== u.id);
    for (const id of g.players) { const p = getUser(id); if (!p) continue; release(p, g.bet, g.bet); notifyFn(id, 'me'); }
    closeGame(g, true);
    for (const id of others) notifyFn(id, 'yutGone', g.code);
    saveFn();
    return { ok: true };
  }
  if (op === 'start') {
    if (g.status !== 'open') return { error: '이미 시작했어요' };
    if (g.host !== u.id) return { error: '방장만 시작할 수 있어요' };
    if (g.players.length < MIN_PLAYERS) return { error: `${MIN_PLAYERS}명 이상 모여야 시작할 수 있어요` };
    // 순서는 무작위로 섞음 (Fisher–Yates)
    for (let i = g.players.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [g.players[i], g.players[j]] = [g.players[j], g.players[i]]; }
    g.chat.push({ name: '📢', text: `순서 추첨: ${g.players.map((id, i) => `${i + 1}. ${g.names[id]}`).join('  ')}` });
    g.status = 'play'; g.turn = 0; g.phase = 'throw'; g.last = null; g.options = []; g.winner = null; g.afk = {}; g.miss = {}; g.bonus = 0; g.repeat = false; g.move = null; g.tally = {}; g.hit = {}; g.cb = {}; g.gs = {}; g.rev = {}; g.backHome = {};
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
    if (g.status === 'play') GS(g, u.id).chats++;
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
    for (const id of watchersOf(g)) userWatch.set(id, g.code);
    if (g.status === 'play') armTimer(g);   // 차례 시간은 처음부터 다시
  }
  return [...games.values()].flatMap(g => g.players);
}
// 충전 등으로 딱지가 바뀌면 그 사람 판을 다시 보냄
function refreshFor(uid) { const c = userGame.get(uid); const g = c && games.get(c); if (g) push(g); }
const busy = uid => userGame.has(uid) && games.has(userGame.get(uid));
const hasCode = c => games.has(c);
module.exports = { busy, hasCode, refreshFor, pathOf, backward, norm, dump, restore, init, skinOf, yutAct, view, lobbyList, throwYut, optionsFor, forward, backward, START_P, nodeOf, ROUTE, MIN_BET, MAX_BET, _games: games };
