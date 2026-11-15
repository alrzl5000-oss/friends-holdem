// 미니게임 봇 — 호박고누 · 십이장기
// 알파베타 탐색(네가맥스) + 반복 심화. 난이도: mid(중간) · hard(어려움)
//  - mid : 얕게 읽고, 최선과 비슷한 수 중에서 무작위로 고름 (가끔 덜 좋은 수)
//  - hard: 시간 안에서 최대한 깊게 읽고 최선의 수만 둠
const crypto = require('crypto');
const GONU = require('./gonu'), J12 = require('./janggi12');

const WIN = 100000;
const LEVELS = {
  mid: { gonu: { depth: 8, ms: 500, slack: 3 }, j12: { depth: 3, ms: 700, slack: 12 } },
  hard: { gonu: { depth: 20, ms: 1500, slack: 0 }, j12: { depth: 6, ms: 1800, slack: 0 } },
};
const rnd = n => crypto.randomInt(n);

// ---------------- 호박고누 ----------------
const gClone = s => ({ board: s.board.slice(), turn: s.turn, ply: s.ply });
function gApply(s, m) { s.board[m.to] = s.turn; s.board[m.from] = null; s.ply++; s.turn = 1 - s.turn; }
function gEval(s) {   // 둘 차례인 쪽 기준: 내 이동 가능 수 - 상대 이동 가능 수, 진영 밖으로 나온 말
  const me = s.turn, op = 1 - me;
  const mob = GONU.legal(s, me).length - GONU.legal(s, op).length;
  let out = 0; s.board.forEach((o, p) => { if (o === me && p < 5) out++; else if (o === op && p < 5) out--; });
  return mob * 10 + out * 3 + (s.board[0] === me ? 4 : s.board[0] === op ? -4 : 0);   // 가운데를 잡으면 유리
}
function gSearch(s, depth, a, b, T) {
  const L = GONU.legal(s, s.turn);
  if (!L.length) return -(WIN - s.ply);          // 둘 곳 없으면 짐
  if (s.ply >= GONU.MAX_PLIES) return 0;
  if (depth <= 0 || T.out()) return gEval(s);
  let best = -Infinity;
  for (const m of L) {
    const c = gClone(s); gApply(c, m);
    const v = -gSearch(c, depth - 1, -b, -a, T);
    if (v > best) best = v; if (v > a) a = v; if (a >= b) break;
  }
  return best;
}

// ---------------- 십이장기 ----------------
const VAL = { K: 0, J: 50, S: 45, P: 15, H: 55 };
const jClone = s => ({ b: s.b.map(r => r.map(p => (p ? { t: p.t, o: p.o } : null))), hand: [s.hand[0].slice(), s.hand[1].slice()], turn: s.turn, ply: s.ply, last: null, tryKing: s.tryKing, winner: s.winner, reason: '' });
function jEval(s) {
  const me = s.turn; let v = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const p = s.b[r][c]; if (!p) continue;
    let x = VAL[p.t];
    if (p.t === 'K') { const adv = p.o === 0 ? 3 - r : r; x += adv * 6; }          // 왕이 앞으로 나갈수록 (들어가기 위협)
    if (p.t === 'P') { const adv = p.o === 0 ? 3 - r : r; x += adv * 3; }          // 자는 앞으로 갈수록 후가 가까움
    if (c === 1) x += 2;                                                           // 가운데 줄
    v += p.o === me ? x : -x;
  }
  for (const t of s.hand[me]) v += VAL[t] * 0.9;
  for (const t of s.hand[1 - me]) v -= VAL[t] * 0.9;
  return v;
}
function jOrder(s, L) {   // 잡는 수 → 왕 잡는 수를 맨 앞, 놓기는 뒤로
  const score = m => {
    if (m.kind === 'drop') return -1;
    const q = s.b[m.to[1]][m.to[0]];
    return q ? (q.t === 'K' ? 1000 : 10 + VAL[q.t]) : 0;
  };
  return L.map(m => [score(m), m]).sort((x, y) => y[0] - x[0]).map(x => x[1]);
}
function jSearch(s, depth, a, b, T) {
  const res = J12.result(s);
  if (res) return res.draw ? 0 : (res.winner === s.turn ? WIN - s.ply : -(WIN - s.ply));
  if (depth <= 0 || T.out()) return jEval(s);
  let best = -Infinity;
  for (const m of jOrder(s, J12.legal(s, s.turn))) {
    const c = jClone(s); J12.apply(c, c.turn, m);
    const v = -jSearch(c, depth - 1, -b, -a, T);
    if (v > best) best = v; if (v > a) a = v; if (a >= b) break;
  }
  return best;
}

// ---------------- 호박고누 완전 풀이 ----------------
// 판이 작아서(도달 가능한 모양 약 2,500개) 시작할 때 모든 모양의 승패를 미리 계산해 둠.
// GW: 모양 → 둘 차례인 쪽 기준 1(이김)·-1(짐)·없음(서로 잘 두면 무승부), GD: 끝날 때까지 남은 수
const gKey = (b, t) => b.map(o => (o === null ? '-' : o)).join('') + t;
const GW = new Map(), GD = new Map();
(function solveGonu() {
  const succ = new Map(), pred = new Map(), st = GONU.init(), stack = [[st.board.slice(), 0]];
  while (stack.length) {
    const [b, t] = stack.pop(), k = gKey(b, t); if (succ.has(k)) continue;
    const nx = [];
    for (const m of GONU.legal({ board: b }, t)) {
      const nb = b.slice(); nb[m.to] = t; nb[m.from] = null; const nk = gKey(nb, 1 - t);
      nx.push(nk); if (!pred.has(nk)) pred.set(nk, []); pred.get(nk).push(k);
      if (!succ.has(nk)) stack.push([nb, 1 - t]);
    }
    succ.set(k, nx);
  }
  const cnt = new Map(), Q = [];
  for (const [k, n] of succ) { cnt.set(k, n.length); if (!n.length) { GW.set(k, -1); GD.set(k, 0); Q.push(k); } }
  for (let i = 0; i < Q.length; i++) {
    const k = Q[i];
    for (const p of pred.get(k) || []) {
      if (GW.has(p)) continue;
      if (GW.get(k) === -1) { GW.set(p, 1); GD.set(p, GD.get(k) + 1); Q.push(p); }
      else { cnt.set(p, cnt.get(p) - 1); if (!cnt.get(p)) { GW.set(p, -1); GD.set(p, GD.get(k) + 1); Q.push(p); } }
    }
  }
})();
// 중간: 이기는 수가 있으면 대개(75%) 가장 빨리 이기는 수, 아니면 지는 수는 피하고
//       같은 모양 반복은 피하면서 상대가 실수할 여지가 많은 수(상대 이동 수가 적은 수)를 고름
function gonuChoose(state, level) {
  const side = state.turn, L = GONU.legal(state, side);
  const info = L.map(m => {
    const nb = state.board.slice(); nb[m.to] = side; nb[m.from] = null;
    const k = gKey(nb, 1 - side), w = GW.get(k);            // 상대 기준
    const rep = (state.seen && state.seen[k]) || 0;
    const oppMob = GONU.legal({ board: nb }, 1 - side).length;
    return { m, res: w === -1 ? 1 : w === 1 ? -1 : 0, d: GD.get(k) || 0, rep, oppMob };
  });
  const wins = info.filter(x => x.res === 1).sort((a, b) => a.d - b.d);
  if (wins.length && (level === 'hard' || rnd(100) < 75)) return wins[0].m;
  let pool = info.filter(x => x.res >= 0); if (!pool.length) pool = info.slice().sort((a, b) => b.d - a.d).slice(0, 1);   // 다 지면 최대한 오래 버팀
  const fresh = pool.filter(x => x.rep < 2); if (fresh.length) pool = fresh;   // 3번째 반복(무승부)은 피함
  const best = Math.min(...pool.map(x => x.oppMob + x.rep * 2));
  const top = pool.filter(x => x.oppMob + x.rep * 2 <= best + (level === 'hard' ? 0 : 1));
  return top[rnd(top.length)].m;
}

// ---------------- 수 고르기 ----------------
function choose(type, state, level) {
  if (type === 'gonu') return gonuChoose(state, level);
  const cfg = (LEVELS[level] || LEVELS.mid)[type];
  const side = state.turn;
  const legal = type === 'gonu' ? GONU.legal(state, side) : J12.legal(state, side);
  if (legal.length <= 1) return legal[0];
  const t0 = Date.now(); let nodes = 0;
  let stop = false;
  const T = { out: () => stop || ((++nodes & 255) === 0 && Date.now() - t0 > cfg.ms && (stop = true)) };
  let scored = null;
  for (let d = 1; d <= cfg.depth; d++) {   // 반복 심화: 시간이 남으면 한 수 더 깊게
    const cur = legal.map(m => {
      let v;
      if (type === 'gonu') {
        const c = gClone(state); gApply(c, m);
        const k = c.board.map(o => (o === null ? '-' : o)).join('') + c.turn;
        v = (state.seen && (state.seen[k] || 0) >= 2) ? 0 : -gSearch(c, d - 1, -Infinity, Infinity, T);   // 3번째 반복이면 무승부
      } else {
        const c = jClone(state); J12.apply(c, side, m);
        v = -jSearch(c, d - 1, -Infinity, Infinity, T);
      }
      return { m, v };
    });
    if (stop && scored) break;             // 시간 넘긴 깊이는 버리고 전 깊이 결과 사용
    scored = cur;
    if (Date.now() - t0 > cfg.ms) break;
    if (scored.some(x => x.v > WIN / 2)) break;   // 이기는 수를 찾음
  }
  const best = Math.max(...scored.map(x => x.v));
  const pool = scored.filter(x => x.v >= best - cfg.slack && (best < WIN / 2 || x.v === best));   // 이기는 수가 있으면 그것만
  return pool[rnd(pool.length)].m;
}

module.exports = { choose, LEVELS };
