// 플레이 성향 기록 (베팅 습관)
// 판마다 seat.ps 에 쌓인 액션 플래그를 유저의 u.play 에 누적
const { bestHand } = require('./public/poker.js');

const MIN_HANDS = 10; // 이만큼 쌓여야 성향 태그를 붙임

function onHand(table, getUser) {
  const board = table.community || [];
  const live = table.seats.filter(s => s && s.inHand && !s.folded);
  const uncontested = live.length === 1;
  for (const s of table.seats) {
    if (!s || !s.inHand || !s.hand || s.hand.length !== 2) continue;
    const ps = s.ps || {};
    if (ps.auto) continue; // 시간초과·자리비움으로 자동 행동한 판은 습관에서 제외
    const u = getUser(s.id);
    if (!u) continue;
    const p = u.play = u.play || {};
    const add = (k, n = 1) => { p[k] = (p[k] || 0) + n; };
    add('hands');
    if (ps.vpip) add('vpip');
    if (ps.pfr) add('pfr');
    add('agg', ps.agg || 0);
    add('call', ps.call || 0);
    if (ps.fr) { add('fr'); if (ps.ffr) add('ffr'); }
    if (s.allIn && s.allInStage !== 'blind') add('allin');
    const sd = !s.folded && !uncontested && board.length === 5;
    if (sd) {
      add('sd');
      if (s.won > 0) add('sdw');
      if (ps.pagg) {
        add('sdb'); // 플랍 이후 벳·레이즈하고 쇼다운까지 간 판
        if (bestHand(s.hand.concat(board)).score[0] === 0) add('bluff'); // 그런데 하이카드였음
      }
    }
  }
}

const pct = (a, b) => (b ? Math.round((a || 0) / b * 100) : null);

function summary(u) {
  const p = u.play || {};
  const h = p.hands || 0;
  const vpip = pct(p.vpip, h);
  const agg = p.call ? Math.round((p.agg || 0) / p.call * 10) / 10 : (p.agg ? 9.9 : 0);
  let style = '';
  if (h >= MIN_HANDS) {
    const a = agg >= 1.5;
    if (vpip >= 40) style = a ? '🎰 도박꾼' : '🐟 물고기';
    else if (vpip < 22) style = a ? '🦈 상어' : '🪨 바위';
    else style = a ? '🔥 공격형' : '🙂 무난';
  }
  return {
    hands: h, minHands: MIN_HANDS, style,
    vpip, pfr: pct(p.pfr, h), agg,
    ffr: pct(p.ffr, p.fr), allin: pct(p.allin, h),
    sd: pct(p.sd, h), sdw: pct(p.sdw, p.sd), bluff: pct(p.bluff, p.sdb),
  };
}

module.exports = { onHand, summary, MIN_HANDS };
