// 블랙잭 미니게임 — 딜러전(혼자) / 1대1 결투
// 서버가 카드를 섞고 판정함. 베팅금은 시작할 때 자산에서 빼서 u.bjHold 에 보관 → 끝나면 정산
// (서버가 판 도중 꺼지면 db.js 가 bjHold 를 돌려줌)
const crypto = require('crypto');

const MIN_BET = 1e6;      // 100만
const MAX_BET = 1e8;      // 1억
const DECKS = 6;
const DUEL_MS = 60000;    // 1대1: 시작 후 60초 안에 안 멈추면 자동 스탠드

function shoe() {
  const d = [];
  for (let k = 0; k < DECKS; k++) for (const s of ['s', 'h', 'd', 'c']) for (let r = 2; r <= 14; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
// 점수: A=11 또는 1, J·Q·K=10
function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { if (c.r === 14) { aces++; t += 11; } else t += Math.min(c.r, 10); }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const isBJ = cards => cards.length === 2 && total(cards).t === 21;

let db, notify;
function init(opts) { db = opts.db; notify = opts.notify; }

function stats(u) { return (u.bj = u.bj || { hands: 0, win: 0, lose: 0, push: 0, bj: 0, net: 0 }); }
function hold(u, amt) { u.assets -= amt; u.bjHold = (u.bjHold || 0) + amt; }
function release(u, amt, pay) { u.bjHold = Math.max(0, (u.bjHold || 0) - amt); u.assets += pay; }
function checkBet(u, bet) {
  bet = Math.floor(Number(bet));
  if (!(bet >= MIN_BET && bet <= MAX_BET)) return { error: `베팅은 ${MIN_BET / 1e4}만 ~ ${MAX_BET / 1e8}억이에요` };
  if (u.assets < bet) return { error: '보유 현금이 부족해요' };
  return { bet };
}

// ===================== 딜러전 =====================
const solo = new Map(); // uid -> game

function soloView(u) {
  const g = solo.get(u.id);
  if (!g) return { stats: stats(u) };
  const done = g.status === 'done';
  return {
    bet: g.bet, doubled: g.doubled, status: g.status, result: g.result || null, payout: g.payout || 0,
    player: g.player, pt: total(g.player).t,
    dealer: done ? g.dealer : [g.dealer[0], null], dt: done ? total(g.dealer).t : total([g.dealer[0]]).t,
    canDouble: g.status === 'player' && g.player.length === 2 && !g.doubled && u.assets >= g.bet,
    stats: stats(u),
  };
}
function soloFinish(u, g) {
  const st = stats(u);
  const p = total(g.player).t, d = total(g.dealer).t;
  const stake = g.bet * (g.doubled ? 2 : 1);
  let result, pay;
  if (p > 21) { result = 'bust'; pay = 0; }
  else if (isBJ(g.player) && !isBJ(g.dealer)) { result = 'bj'; pay = Math.floor(stake * 2.5); }
  else if (isBJ(g.dealer) && !isBJ(g.player)) { result = 'lose'; pay = 0; }
  else if (d > 21 || p > d) { result = 'win'; pay = stake * 2; }
  else if (p === d) { result = 'push'; pay = stake; }
  else { result = 'lose'; pay = 0; }
  release(u, stake, pay);
  g.status = 'done'; g.result = result; g.payout = pay;
  st.hands++; st.net += pay - stake;
  if (result === 'bj') { st.bj++; st.win++; } else if (result === 'win') st.win++; else if (result === 'push') st.push++; else st.lose++;
  db.save();
}
function dealerPlay(g) {
  while (total(g.dealer).t < 17) g.dealer.push(g.deck.pop()); // 소프트 17에서 멈춤
}
function soloAct(u, op, bet) {
  let g = solo.get(u.id);
  if (op === 'deal') {
    if (g && g.status !== 'done') return { error: '진행 중인 판이 있어요' };
    const c = checkBet(u, bet); if (c.error) return c;
    g = { bet: c.bet, deck: shoe(), player: [], dealer: [], status: 'player', doubled: false };
    hold(u, g.bet);
    g.player.push(g.deck.pop()); g.dealer.push(g.deck.pop()); g.player.push(g.deck.pop()); g.dealer.push(g.deck.pop());
    solo.set(u.id, g);
    if (isBJ(g.player) || isBJ(g.dealer)) soloFinish(u, g); // 블랙잭이면 바로 끝
    db.save();
    return { ok: true };
  }
  if (!g || g.status !== 'player') return { error: '진행 중인 판이 없어요' };
  if (op === 'hit') {
    g.player.push(g.deck.pop());
    const t = total(g.player).t;
    if (t > 21) soloFinish(u, g);
    else if (t === 21) { dealerPlay(g); soloFinish(u, g); }
    return { ok: true };
  }
  if (op === 'stand') { dealerPlay(g); soloFinish(u, g); return { ok: true }; }
  if (op === 'double') {
    if (g.player.length !== 2 || g.doubled) return { error: '처음 두 장일 때만 더블할 수 있어요' };
    if (u.assets < g.bet) return { error: '더블할 현금이 부족해요' };
    hold(u, g.bet); g.doubled = true;
    g.player.push(g.deck.pop());
    if (total(g.player).t <= 21) dealerPlay(g);
    soloFinish(u, g);
    return { ok: true };
  }
  return { error: '알 수 없는 행동이에요' };
}

// ===================== 1대1 결투 =====================
const duels = new Map(); // code -> duel
const userDuel = new Map(); // uid -> code
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (duels.has(c));
  return c;
}
function duelList() {
  return [...duels.values()].filter(d => d.status === 'open').map(d => ({ code: d.code, host: d.names[d.host], bet: d.bet }));
}
function duelView(d, uid) {
  const done = d.status === 'done';
  const opp = d.players.find(p => p !== uid);
  const hand = id => d.hands[id] || [];
  const oppCards = !opp ? [] : done ? hand(opp) : hand(opp).map((c, i) => (i === 0 ? c : null));
  return {
    code: d.code, bet: d.bet, status: d.status, deadline: d.deadline || 0,
    me: { name: d.names[uid], cards: hand(uid), t: total(hand(uid)).t, stood: !!d.stood[uid] },
    opp: opp ? { name: d.names[opp], cards: oppCards, t: done ? total(hand(opp)).t : null, n: hand(opp).length, stood: !!d.stood[opp] } : null,
    result: done ? d.result[uid] : null,
  };
}
function duelPush(d) { for (const id of d.players) notify(id, 'duelState', duelView(d, id)); }
function duelFinish(d) {
  clearTimeout(d.timer);
  const [a, b] = d.players;
  const sa = total(d.hands[a]).t, sb = total(d.hands[b]).t;
  const bja = isBJ(d.hands[a]), bjb = isBJ(d.hands[b]);
  let win = null; // null = 무승부
  if (sa > 21 && sb > 21) win = null;
  else if (sa > 21) win = b;
  else if (sb > 21) win = a;
  else if (bja && !bjb) win = a;
  else if (bjb && !bja) win = b;
  else if (sa > sb) win = a;
  else if (sb > sa) win = b;
  d.result = {};
  for (const id of d.players) {
    const u = db.byId(id);
    const res = win === null ? 'push' : win === id ? 'win' : 'lose';
    d.result[id] = res;
    if (!u) continue;
    const pay = res === 'push' ? d.bet : res === 'win' ? d.bet * 2 : 0;
    release(u, d.bet, pay);
    const st = stats(u);
    st.hands++; st.net += pay - d.bet;
    if (res === 'win') st.win++; else if (res === 'push') st.push++; else st.lose++;
    st.duel = (st.duel || 0) + 1;
  }
  d.status = 'done';
  db.save();
  duelPush(d);
  for (const id of d.players) { userDuel.delete(id); notify(id, 'me'); }
  setTimeout(() => duels.delete(d.code), 30000);
  notify(null, 'duels', duelList());
}
function duelMaybeEnd(d) { if (d.players.every(id => d.stood[id])) duelFinish(d); }
function duelAct(u, op, arg) {
  const cur = userDuel.get(u.id) && duels.get(userDuel.get(u.id));
  if (op === 'list') return { ok: true, list: duelList(), mine: cur ? duelView(cur, u.id) : null };
  if (op === 'create') {
    if (cur) return { error: '참여 중인 결투가 있어요' };
    if (solo.get(u.id) && solo.get(u.id).status !== 'done') return { error: '딜러전을 먼저 끝내주세요' };
    const c = checkBet(u, arg); if (c.error) return c;
    const d = { code: newCode(), host: u.id, players: [u.id], names: { [u.id]: u.username }, bet: c.bet, hands: {}, stood: {}, status: 'open' };
    hold(u, d.bet);
    duels.set(d.code, d); userDuel.set(u.id, d.code);
    db.save();
    notify(null, 'duels', duelList());
    return { ok: true, state: duelView(d, u.id) };
  }
  if (op === 'join') {
    if (cur) return { error: '참여 중인 결투가 있어요' };
    const d = duels.get(String(arg || '').toUpperCase());
    if (!d || d.status !== 'open') return { error: '들어갈 수 없는 결투예요' };
    if (d.host === u.id) return { error: '내가 연 결투예요' };
    if (u.assets < d.bet) return { error: '보유 현금이 부족해요' };
    hold(u, d.bet);
    d.players.push(u.id); d.names[u.id] = u.username; userDuel.set(u.id, d.code);
    d.status = 'play';
    const deck = shoe();
    for (const id of d.players) d.hands[id] = [deck.pop(), deck.pop()];
    d.deck = deck;
    d.deadline = Date.now() + DUEL_MS;
    d.timer = setTimeout(() => { for (const id of d.players) d.stood[id] = true; duelFinish(d); }, DUEL_MS);
    for (const id of d.players) if (isBJ(d.hands[id])) d.stood[id] = true; // 블랙잭은 자동 스탠드
    db.save();
    notify(null, 'duels', duelList());
    duelPush(d);
    duelMaybeEnd(d);
    return { ok: true };
  }
  if (!cur) return { error: '참여 중인 결투가 없어요' };
  const d = cur;
  if (op === 'cancel') {
    if (d.status !== 'open') return { error: '이미 시작했어요' };
    release(u, d.bet, d.bet);
    duels.delete(d.code); userDuel.delete(u.id);
    db.save();
    notify(null, 'duels', duelList());
    return { ok: true };
  }
  if (d.status !== 'play') return { error: '아직 상대가 없어요' };
  if (d.stood[u.id]) return { error: '이미 멈췄어요' };
  if (op === 'hit') {
    d.hands[u.id].push(d.deck.pop());
    if (total(d.hands[u.id]).t >= 21) d.stood[u.id] = true;
  } else if (op === 'stand') d.stood[u.id] = true;
  else return { error: '알 수 없는 행동이에요' };
  duelPush(d);
  duelMaybeEnd(d);
  return { ok: true };
}

module.exports = { init, soloAct, soloView, duelAct, duelView, duelList, total, isBJ, MIN_BET, MAX_BET, _solo: solo };
