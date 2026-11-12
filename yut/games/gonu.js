// 우물고누 — 점 5개(네 모서리 + 가운데), 말 2개씩
//  0 ─── 1        0: 왼쪽 위   1: 오른쪽 위
//  │ ╲ ╱ │        2: 가운데
//  │  2  │        3: 왼쪽 아래 4: 오른쪽 아래
//  │ ╱ ╲ │        3 과 4 사이는 '우물' → 오갈 수 없음
//  3 (우) 4
// 0번(먼저 두는 사람): 왼쪽 0·3 / 1번: 오른쪽 1·4
// 규칙: 한 칸씩 선을 따라 빈 점으로. 움직일 수 없으면 짐.
//      첫 수에 우물 쪽 말(아래 말)을 가운데로 넣으면 상대가 바로 막히므로 첫 수에는 금지.
//      같은 모양(말 위치 + 차례)이 3번 나오면 무승부. 서로 60수(한 사람당 30수)까지 안 끝나도 무승부.
const EDGES = [[0, 1], [0, 3], [1, 4], [0, 2], [1, 2], [3, 2], [4, 2]];
const ADJ = [0, 1, 2, 3, 4].map(p => EDGES.filter(e => e.includes(p)).map(e => (e[0] === p ? e[1] : e[0])));
const MAX_PLIES = 60;

const keyOf = s => s.board.map(o => (o === null ? '-' : o)).join('') + s.turn;
function init() { const s = { board: [0, 1, null, 0, 1], turn: 0, ply: 0, last: null, seen: {}, rep: 1 }; s.seen[keyOf(s)] = 1; return s; }   // board[점] = 주인(0/1) 또는 null
function legal(s, side) {
  const out = [];
  s.board.forEach((o, p) => {
    if (o !== side) return;
    for (const q of ADJ[p]) {
      if (s.board[q] !== null) continue;
      if (s.ply === 0 && q === 2 && (p === 3 || p === 4)) continue;   // 첫 수: 우물 쪽 말로 가운데 금지
      out.push({ id: out.length, from: p, to: q });
    }
  });
  return out;
}
function apply(s, side, m) {
  s.board[m.to] = side; s.board[m.from] = null;
  s.ply++; s.turn = 1 - side; s.last = { side, from: m.from, to: m.to };
  s.seen = s.seen || {}; const k = keyOf(s); s.seen[k] = (s.seen[k] || 0) + 1; s.rep = s.seen[k];
  return { text: `${m.from}→${m.to}` };
}
// 다음 차례인 사람이 움직일 수 없으면 그 사람 패배
function result(s) {
  if (!legal(s, s.turn).length) return { winner: 1 - s.turn, reason: '움직일 곳이 없어요' };
  if ((s.rep || 0) >= 3) return { draw: true, reason: '같은 모양이 3번 반복돼서 무승부' };
  if (s.ply >= MAX_PLIES) return { draw: true, reason: `${MAX_PLIES}수 동안 승부가 안 나서 무승부` };
  return null;
}
module.exports = { name: '고누', key: 'gonu', init, legal, apply, result, ADJ, EDGES, MAX_PLIES };
