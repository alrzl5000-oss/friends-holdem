// 미니게임 (1대1): 고누 · 십이장기 — 판돈 걸고 이긴 사람이 다 가져감, 무승부면 돌려줌
const crypto = require('crypto');
const ENGINES = { gonu: require('./games/gonu'), j12: require('./games/janggi12') };
const TURN_MS = 30000;          // 한 수 30초, 넘기면 아무 수나 자동으로
const MIN_BET = 1e6, MAX_BET = 1e8;

let getUser = () => null, notifyFn = () => {}, saveFn = () => {}, otherBusy = () => false, hasOtherCode = () => false, shameFn = () => 0;
function init(o) { getUser = o.getUser; notifyFn = o.notify; saveFn = o.save; otherBusy = o.otherBusy || otherBusy; hasOtherCode = o.hasOtherCode || hasOtherCode; if (o.shameOf) shameFn = o.shameOf; }

const rooms = new Map();        // code → room
const userRoom = new Map();     // uid → code (참가)
const userWatch = new Map();    // uid → code (관전)
const busy = uid => userRoom.has(uid) && rooms.has(userRoom.get(uid));
const hasCode = c => rooms.has(c);

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c) || hasOtherCode(c));
  return c;
}
function hold(u, amt) { u.assets -= amt; u.yutHold = (u.yutHold || 0) + amt; }
function release(u, amt, back) { u.yutHold = Math.max(0, (u.yutHold || 0) - amt); u.assets += back; }
function stats(u, type) { u.mini = u.mini || {}; return (u.mini[type] = u.mini[type] || { games: 0, win: 0, draw: 0, net: 0 }); }
const say = (R, text, name = '📢') => { R.chat.push({ name, text }); if (R.chat.length > 100) R.chat = R.chat.slice(-100); };

function view(R, uid) {
  const E = ENGINES[R.type];
  const side = R.players.indexOf(uid);
  const myTurn = R.status === 'play' && side === R.state.turn;
  return {
    mini: true, code: R.code, type: R.type, title: E.name, host: R.names[R.host], bet: R.bet, pot: R.bet * R.players.length,
    status: R.status, you: uid, side, spectating: side < 0, watchers: R.watchers.length,
    players: R.players.map((id, i) => { const u = getUser(id); const e = (u && u.equip) || {}; return { id, name: R.names[id], side: i, host: id === R.host, piece: e.piece || 'p_basic', shame: u ? shameFn(u) : 0 }; }),
    state: R.state, turn: R.state ? R.state.turn : 0, deadline: R.deadline, seq: R.seq,
    moves: myTurn ? E.legal(R.state, side) : [],
    winner: R.winner != null ? R.names[R.players[R.winner]] : null, draw: !!R.draw, reason: R.reason || '',
    chat: R.chat,
  };
}
function push(R) {
  for (const m of R.chat) if (m.n == null) m.n = (R.chatN = (R.chatN || 0) + 1);
  for (const id of [...R.players, ...R.watchers]) notifyFn(id, 'miniState', view(R, id));
  saveFn();
}
function lobbyList() {
  return [...rooms.values()].filter(R => R.status !== 'done')
    .map(R => ({ code: R.code, type: R.type, title: ENGINES[R.type].name, host: R.names[R.host], bet: R.bet, n: R.players.length, status: R.status, watchers: R.watchers.length }));
}
let pushListFn = () => {};
const pushList = () => pushListFn();

function arm(R) {
  clearTimeout(R.timer);
  R.deadline = Date.now() + TURN_MS;
  R.timer = setTimeout(() => {
    if (R.status !== 'play') return;
    const side = R.state.turn, E = ENGINES[R.type];
    const L = E.legal(R.state, side);
    if (!L.length) return finishCheck(R);
    say(R, `${R.names[R.players[side]]} 님 시간 초과 — 아무 수나 둘게요`);
    doMove(R, side, L[crypto.randomInt(L.length)]);
  }, TURN_MS);
}
function doMove(R, side, m) {
  const E = ENGINES[R.type];
  E.apply(R.state, side, m);
  R.seq++;
  if (!finishCheck(R)) { arm(R); push(R); }
}
function finishCheck(R) {
  const res = ENGINES[R.type].result(R.state);
  if (!res) return false;
  finish(R, res.draw ? null : res.winner, res.reason);
  return true;
}
function finish(R, winSide, reason) {
  clearTimeout(R.timer); R.status = 'done'; R.deadline = 0; R.reason = reason;
  const pot = R.bet * R.players.length;
  R.players.forEach((id, i) => {
    const u = getUser(id); if (!u) return;
    const back = winSide == null ? R.bet : (i === winSide ? pot : 0);
    release(u, R.bet, back);
    const st = stats(u, R.type); st.games++; st.net += back - R.bet;
    if (winSide == null) st.draw++; else if (i === winSide) st.win++;
    if (winSide != null && i === winSide) {   // 업적 기록
      const S = (u.st = u.st || {});
      if (R.type === 'gonu') S.gonuWin = (S.gonuWin || 0) + 1;
      if (R.type === 'j12') { S.j12Win = (S.j12Win || 0) + 1; if (/버텼/.test(reason)) S.j12Try = (S.j12Try || 0) + 1; }
    }
    userRoom.delete(id); notifyFn(id, 'me');
  });
  if (winSide == null) { R.draw = true; say(R, `무승부 — ${reason}. 판돈을 돌려받았어요`); }
  else { R.winner = winSide; say(R, `${R.names[R.players[winSide]]} 님 승리! (${reason}) 판돈 ${pot.toLocaleString('ko-KR')}원 획득`); }
  push(R); pushList();
  setTimeout(() => close(R, false), 60000);
}
function close(R, notify) {
  if (rooms.get(R.code) !== R) return;
  clearTimeout(R.timer); rooms.delete(R.code);
  for (const id of R.players) if (userRoom.get(id) === R.code) userRoom.delete(id);
  for (const id of R.watchers) { if (userWatch.get(id) === R.code) userWatch.delete(id); if (notify) notifyFn(id, 'miniGone', R.code); }
  pushList();
}
function unwatch(uid) {
  const c = userWatch.get(uid); if (!c) return;
  userWatch.delete(uid);
  const R = rooms.get(c); if (R) { R.watchers = R.watchers.filter(x => x !== uid); push(R); pushList(); }
}

function act(u, op, arg = {}) {
  const code = userRoom.get(u.id), R = code && rooms.get(code);
  const W = !R && userWatch.get(u.id) ? rooms.get(userWatch.get(u.id)) : null;
  if (op === 'mine') return { ok: true, state: R ? view(R, u.id) : W ? view(W, u.id) : null };
  if (op === 'create') {
    if (R) return { error: '이미 참여 중인 판이 있어요' };
    if (otherBusy(u.id)) return { error: '윷놀이 판에 참여 중이에요' };
    const type = arg.type, bet = Math.floor(Number(arg.bet) || 0);
    if (!ENGINES[type]) return { error: '없는 게임이에요' };
    if (bet < MIN_BET || bet > MAX_BET) return { error: '판돈은 100만~1억원' };
    if (u.assets < bet) return { error: '현금이 부족해요' };
    unwatch(u.id);
    hold(u, bet);
    const N = { code: newCode(), type, host: u.id, players: [u.id], names: { [u.id]: u.username }, bet, status: 'open', state: null, seq: 0, chat: [], watchers: [], deadline: 0, timer: null };
    say(N, `${u.username} 님이 ${ENGINES[type].name} 판을 열었어요`);
    rooms.set(N.code, N); userRoom.set(u.id, N.code);
    notifyFn(u.id, 'me'); push(N); pushList();
    return { ok: true, state: view(N, u.id) };
  }
  if (op === 'join') {
    if (R) return { error: '이미 참여 중인 판이 있어요' };
    if (otherBusy(u.id)) return { error: '윷놀이 판에 참여 중이에요' };
    const J = rooms.get(String(arg.code || '').toUpperCase());
    if (!J) return { error: '없는 판이에요' };
    if (J.status !== 'open') return { error: '이미 시작한 판이에요' };
    if (J.players.length >= 2) return { error: '1대1 판이라 자리가 없어요' };
    if (u.assets < J.bet) return { error: '현금이 부족해요' };
    unwatch(u.id);
    hold(u, J.bet);
    J.players.push(u.id); J.names[u.id] = u.username; userRoom.set(u.id, J.code);
    say(J, `${u.username} 님이 들어왔어요`);
    notifyFn(u.id, 'me'); push(J); pushList();
    return { ok: true, state: view(J, u.id) };
  }
  if (op === 'watch') {
    if (R) return { error: '참여 중인 판이 있어요' };
    const X = rooms.get(String(arg.code || '').toUpperCase());
    if (!X || X.status === 'done') return { error: '관전할 수 없는 판이에요' };
    unwatch(u.id); X.watchers.push(u.id); userWatch.set(u.id, X.code);
    push(X); pushList();
    return { ok: true, state: view(X, u.id) };
  }
  if (op === 'unwatch') { unwatch(u.id); return { ok: true }; }
  if (W && op === 'chat') {
    if (Date.now() - (u._wchat || 0) < 3000) return { error: '관전자는 3초에 한 번만 말할 수 있어요' };
    const text = String(arg.text || '').replace(/\s+/g, ' ').trim().slice(0, 30); if (!text) return { ok: true };
    u._wchat = Date.now(); W.chat.push({ name: u.username, text, watcher: true }); push(W); return { ok: true };
  }
  if (!R) return { error: '참여 중인 판이 없어요' };
  if (op === 'chat') {
    const text = String(arg.text || '').replace(/\s+/g, ' ').trim().slice(0, 100); if (!text) return { ok: true };
    say(R, text, u.username); push(R); return { ok: true };
  }
  if (op === 'leave' || op === 'cancel') {
    if (R.status === 'play') return { error: '진행 중에는 나갈 수 없어요. 기권은 할 수 있어요' };
    if (R.status === 'done') { userRoom.delete(u.id); return { ok: true }; }
    if (R.host !== u.id) {   // 손님만 나감
      release(u, R.bet, R.bet); R.players = R.players.filter(x => x !== u.id); userRoom.delete(u.id);
      say(R, `${u.username} 님이 나갔어요`); notifyFn(u.id, 'me'); push(R); pushList(); return { ok: true };
    }
    for (const id of R.players) { const p = getUser(id); if (p) { release(p, R.bet, R.bet); notifyFn(id, 'me'); } if (id !== u.id) notifyFn(id, 'miniGone', R.code); }
    close(R, true); saveFn(); return { ok: true };
  }
  if (op === 'start') {
    if (R.host !== u.id) return { error: '방장만 시작할 수 있어요' };
    if (R.status !== 'open') return { error: '이미 시작했어요' };
    if (R.players.length !== 2) return { error: '두 명이 있어야 시작할 수 있어요' };
    if (crypto.randomInt(2)) R.players.reverse();      // 선(먼저 두는 사람)은 무작위
    R.state = ENGINES[R.type].init(); R.status = 'play'; R.seq = 1;
    say(R, `시작! 선: ${R.names[R.players[0]]} 님`);
    arm(R); push(R); pushList();
    return { ok: true };
  }
  if (op === 'move') {
    if (R.status !== 'play') return { error: '진행 중이 아니에요' };
    const side = R.players.indexOf(u.id);
    if (side !== R.state.turn) return { error: '내 차례가 아니에요' };
    const m = ENGINES[R.type].legal(R.state, side).find(x => x.id === Number(arg.id));
    if (!m) return { error: '둘 수 없는 수예요' };
    doMove(R, side, m);
    return { ok: true };
  }
  if (op === 'resign') {
    if (R.status !== 'play') return { error: '진행 중이 아니에요' };
    const side = R.players.indexOf(u.id);
    say(R, `${u.username} 님이 기권했어요`);
    finish(R, 1 - side, '기권');
    return { ok: true };
  }
  return { error: '알 수 없는 요청' };
}

// 저장·복원 (서버 재시작에도 판 유지)
function dump() { return [...rooms.values()].filter(R => R.status !== 'done').map(R => { const { timer, ...rest } = R; return rest; }); }
function restore(list) {
  for (const R of list || []) {
    if (!R || !R.code || rooms.has(R.code)) continue;
    if (R.type === 'gonu' && R.state && (!R.state.board || R.state.board.length !== ENGINES.gonu.N)) continue;   // 예전 우물고누 판 → 환불
    R.timer = null; R.watchers = R.watchers || [];
    rooms.set(R.code, R);
    for (const id of R.players) userRoom.set(id, R.code);
    for (const id of R.watchers) userWatch.set(id, R.code);
    if (R.status === 'play') arm(R);
  }
  return [...rooms.values()].flatMap(R => R.players);
}
module.exports = { init, act, view, lobbyList, busy, hasCode, dump, restore, setPushList: f => { pushListFn = f; }, ENGINES, _rooms: rooms };
