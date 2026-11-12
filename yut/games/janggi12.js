// 십이장기 — 가로 3 × 세로 4, 말 4개씩 (왕·장·상·자)
// 좌표: c(열 0~2), r(줄 0~3). 0번(초)은 아래쪽(앞 = 위, r-1), 1번(한)은 위쪽(앞 = 아래, r+1)
// 처음 배치 (0번 기준): 맨 아래 줄 왼쪽부터 장·왕·상, 왕 바로 앞에 자. 1번은 점대칭.
// 움직임: 왕 8방향 1칸 / 장 앞뒤좌우 1칸 / 상 대각선 1칸 / 자 앞 1칸 / 후(자가 상대 끝줄에 닿아 뒤집힘) 앞·옆·뒤 + 앞대각선 1칸
// 잡은 말은 내 것이 되어(후는 자로) 내 차례에 빈 칸에 놓을 수 있음. 단, 상대 진영(상대 끝줄)에는 놓을 수 없음.
// 이기기: 상대 왕을 잡거나, 내 왕이 상대 끝줄에 들어가 상대 차례를 버티면 승리.
// 200수까지 끝나지 않으면 무승부.
const MAX_PLIES = 200;
const DIRS = {
  K: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  J: [[0, -1], [-1, 0], [1, 0], [0, 1]],
  S: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  P: [[0, -1]],
  H: [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]],
};
const NAME = { K: '왕', J: '장', S: '상', P: '자', H: '후' };
const backRow = side => (side === 0 ? 3 : 0);       // 내 진영(끝줄)
const enemyRow = side => (side === 0 ? 0 : 3);      // 상대 끝줄
const inside = (c, r) => c >= 0 && c < 3 && r >= 0 && r < 4;

function init() {
  const b = Array.from({ length: 4 }, () => [null, null, null]);
  b[3][0] = { t: 'J', o: 0 }; b[3][1] = { t: 'K', o: 0 }; b[3][2] = { t: 'S', o: 0 }; b[2][1] = { t: 'P', o: 0 };
  b[0][2] = { t: 'J', o: 1 }; b[0][1] = { t: 'K', o: 1 }; b[0][0] = { t: 'S', o: 1 }; b[1][1] = { t: 'P', o: 1 };
  return { b, hand: [[], []], turn: 0, ply: 0, last: null, tryKing: null, winner: null, reason: '' };
}
function legal(s, side) {
  const out = [], dy = side === 0 ? 1 : -1;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const p = s.b[r][c]; if (!p || p.o !== side) continue;
    for (const [dx, dr] of DIRS[p.t]) {
      const nc = c + dx * dy, nr = r + dr * dy;   // 1번은 좌우·앞뒤 뒤집기
      if (!inside(nc, nr)) continue;
      const q = s.b[nr][nc]; if (q && q.o === side) continue;
      out.push({ id: out.length, kind: 'move', from: [c, r], to: [nc, nr] });
    }
  }
  const seen = new Set();
  for (const t of s.hand[side]) {
    if (seen.has(t)) continue; seen.add(t);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      if (s.b[r][c] || r === enemyRow(side)) continue;
      out.push({ id: out.length, kind: 'drop', t, to: [c, r] });
    }
  }
  return out;
}
function apply(s, side, m) {
  const ev = {};
  // 지난 차례에 상대 왕이 내 끝줄에 들어왔다면, 이번에 내가 그 왕을 잡지 못하면 상대 승리 (아래 result 에서 판정)
  if (m.kind === 'drop') {
    const i = s.hand[side].indexOf(m.t); s.hand[side].splice(i, 1);
    s.b[m.to[1]][m.to[0]] = { t: m.t, o: side };
    ev.drop = m.t;
  } else {
    const [c, r] = m.from, [nc, nr] = m.to;
    const p = s.b[r][c], q = s.b[nr][nc];
    if (q) { ev.captured = q.t; if (q.t === 'K') { s.winner = side; s.reason = '상대 왕을 잡았어요'; } else s.hand[side].push(q.t === 'H' ? 'P' : q.t); }
    s.b[nr][nc] = p; s.b[r][c] = null;
    if (p.t === 'P' && nr === enemyRow(side)) { p.t = 'H'; ev.promote = true; }
  }
  // 내 왕을 지키지 못한 상대의 '왕 들어가기' 확인: 상대 왕이 여전히 내 끝줄에 살아 있으면 상대 승리
  if (s.winner === null && s.tryKing === 1 - side) {
    if (kingIn(s, 1 - side, enemyRow(1 - side))) { s.winner = 1 - side; s.reason = '왕이 상대 진영에서 버텼어요'; }
    s.tryKing = null;
  }
  // 이번 수로 내 왕이 상대 끝줄에 들어갔으면 다음 상대 차례를 버티는지 봄
  if (s.winner === null && kingIn(s, side, enemyRow(side))) s.tryKing = side;
  s.ply++; s.turn = 1 - side; s.last = { side, ...m, ev };
  return ev;
}
function kingIn(s, side, row) { return s.b[row].some(p => p && p.o === side && p.t === 'K'); }
function result(s) {
  if (s.winner !== null) return { winner: s.winner, reason: s.reason };
  if (!legal(s, s.turn).length) return { winner: 1 - s.turn, reason: '둘 수 있는 수가 없어요' };
  if (s.ply >= MAX_PLIES) return { draw: true, reason: `${MAX_PLIES}수 동안 승부가 안 나서 무승부` };
  return null;
}
module.exports = { name: '십이장기', key: 'j12', init, legal, apply, result, NAME, MAX_PLIES };
