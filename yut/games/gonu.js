// 호박고누 — 둥근 판(호박) 안의 원과 십자선 + 위아래 진영(점 3개씩), 말 3개씩
//
//            5   6   7          ← 1번(위) 진영: 5·6·7 은 모두 1(N)로만 이어짐
//             ╲  │  ╱
//               1(N)
//            ╱  │   ╲          원: 1(N)-2(E)-3(S)-4(W) 를 둥글게 잇고
//         4(W)─0(C)─2(E)        십자선: 가운데 0(C) 와 네 점을 이음
//            ╲  │   ╱
//               3(S)
//             ╱  │  ╲
//            8   9   10         ← 0번(아래) 진영: 8·9·10 은 모두 3(S)로만 이어짐
//
// 규칙: 번갈아 말 하나를 선을 따라 빈 점으로 한 칸.
//      진영에 있는 말은 자기 진영 입구(0번은 S, 1번은 N)로만 나갈 수 있고,
//      진영을 나온 말은 자기 진영에도 상대 진영에도 다시 들어갈 수 없음.
//      차례가 왔는데 움직일 수 있는 말이 없으면 짐.
//      같은 모양(말 위치 + 차례)이 3번 나오거나 80수(한 사람 40수)가 지나면 무승부.
const EDGES = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1], [5, 1], [6, 1], [7, 1], [8, 3], [9, 3], [10, 3]];
const N = 11;
const ADJ = Array.from({ length: N }, (_, p) => EDGES.filter(e => e.includes(p)).map(e => (e[0] === p ? e[1] : e[0])));
const CAMP = [[8, 9, 10], [5, 6, 7]];          // 0번(아래) · 1번(위) 진영
const IS_CAMP = p => p >= 5;
const MAX_PLIES = 80;

const keyOf = s => s.board.map(o => (o === null ? '-' : o)).join('') + s.turn;
function init() {
  const board = Array(N).fill(null);
  CAMP[0].forEach(p => (board[p] = 0)); CAMP[1].forEach(p => (board[p] = 1));
  const s = { board, turn: 0, ply: 0, last: null, seen: {}, rep: 1 };
  s.seen[keyOf(s)] = 1;
  return s;
}
function legal(s, side) {
  const out = [];
  s.board.forEach((o, p) => {
    if (o !== side) return;
    for (const q of ADJ[p]) {
      if (s.board[q] !== null) continue;
      if (IS_CAMP(q)) continue;                 // 진영으로는 (자기 것이든 상대 것이든) 들어갈 수 없음
      out.push({ id: out.length, from: p, to: q });
    }
  });
  return out;
}
function apply(s, side, m) {
  s.board[m.to] = side; s.board[m.from] = null;
  s.ply++; s.turn = 1 - side; s.last = { side, from: m.from, to: m.to };
  s.seen = s.seen || {}; const k = keyOf(s); s.seen[k] = (s.seen[k] || 0) + 1; s.rep = s.seen[k];
  return {};
}
function result(s) {
  if (!legal(s, s.turn).length) return { winner: 1 - s.turn, reason: '상대가 움직일 곳이 없어요' };
  if ((s.rep || 0) >= 3) return { draw: true, reason: '같은 모양이 3번 반복돼서 무승부' };
  if (s.ply >= MAX_PLIES) return { draw: true, reason: `${MAX_PLIES}수 동안 승부가 안 나서 무승부` };
  return null;
}
module.exports = { name: '호박고누', key: 'gonu', init, legal, apply, result, ADJ, EDGES, CAMP, N, MAX_PLIES };
