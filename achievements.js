// 업적 (조건은 전부 숨김 — 달성하면 이름·조건·보상이 공개됨)
const { bestHand } = require('./public/poker.js');
const Shop = require('./public/shop.js');

// reward: 업적 전용 아이템 id (public/shop.js 의 ACH_ITEMS)
const ACH = [
  // ----- 판 단위 -----
  { id: 'royal', name: '신의 손', desc: '로열 플러시 완성', reward: 'a_royal' },
  { id: 'sflush', name: '일직선', desc: '스트레이트 플러시 완성', reward: 'a_violet' },
  { id: 'quads', name: '천둥번개', desc: '쇼다운에서 포카드 이상으로 승리', reward: 'a_thunder' },
  { id: 'seven2', name: '7-2의 기적', desc: '7·2 (다른 무늬)로 팟 승리', reward: 'a_lol' },
  { id: 'allin10', name: '올인 중독', desc: '올인해서 이긴 판 3판 연속', reward: 'a_dragon' },

  { id: 'bluff', name: '뻥카의 신', desc: '플랍 이후 하이카드로 모두 폴드시키고 팟 획득 (빅블 20배 이상)', reward: 'a_smoke' },
  { id: 'streak5', name: '연승 행진', desc: '참여한 판 5연속 승리', reward: 'a_flame' },
  { id: 'badbeat', name: '배드빗', desc: '쇼다운에서 풀하우스 이상으로 패배', reward: 'a_glass' },
  { id: 'allin6', name: '미친 왕', desc: '프리플랍 올인 10판 연속', reward: 'a_crown' },
  // ----- 토너먼트 -----

  { id: 'threepeat', name: '3연패', desc: '토너먼트 3번 연속 우승', reward: 'a_emperor' },
  { id: 'phoenix', name: '불사조', desc: '리바이 2번 하고 우승', reward: 'a_phoenix' },
  { id: 'chop3', name: '반반 장인', desc: '찹 누적 3회', reward: 'a_half' },
  { id: 'full8', name: '용의 왕좌', desc: '8명 꽉 찬 토너먼트 우승', reward: 'a_dragonfx' },
  { id: 'bigpot', name: '큰손', desc: '토너먼트에서 10억 이상 보유한 채로 우승', reward: 'a_goldbar' },
  // ----- 자산 -----
  { id: 'broke3', name: '걍접으셈', desc: '하루에 충전 3번', reward: 'a_cloud' },
  { id: 'rich', name: '재벌', desc: '총 자산 100억 달성', reward: 'a_diamond' },
];
const byId = id => ACH.find(a => a.id === id);

let notify = () => {};
let saveFn = () => {};
function init(opts) { notify = opts.notify; saveFn = opts.save; }

function st(u) {
  u.ach = u.ach || { done: {}, c: {} };
  u.ach.done = u.ach.done || {};
  u.ach.c = u.ach.c || {};
  return u.ach;
}

function unlock(u, id, room) {
  const a = st(u);
  if (a.done[id]) return false;
  const def = byId(id);
  a.done[id] = Date.now();
  u.owned = u.owned || [];
  if (!u.owned.includes(def.reward)) u.owned.push(def.reward);
  saveFn();
  notify(u, def, room);
  return true;
}

// 판이 끝났을 때 (showdown 또는 모두 폴드) — table.seats 의 결과를 읽음
function onHand(table, getUser, room) {
  const board = table.community || [];
  const live = table.seats.filter(s => s && s.inHand && !s.folded);
  const uncontested = live.length === 1;
  for (const s of table.seats) {
    if (!s || !s.inHand || !s.hand || s.hand.length !== 2) continue;
    const u = getUser(s.id);
    if (!u) continue;
    const a = st(u);
    const won = s.won > 0;
    const inShowdown = !s.folded && !uncontested;
    const best = board.length >= 3 ? bestHand(s.hand.concat(board)) : null;
    const cat = best ? best.score[0] : -1;

    if (!s.folded && board.length === 5 && cat === 8 && best.score[1] === 14) unlock(u, 'royal', room);
    if (!s.folded && board.length === 5 && cat === 8) unlock(u, 'sflush', room);
    if (won && inShowdown && cat >= 7) unlock(u, 'quads', room);
    const [h1, h2] = s.hand;
    if (won && h1.s !== h2.s && [h1.r, h2.r].sort((x, y) => x - y).join() === '2,7') unlock(u, 'seven2', room);
    // 올인해서 이긴 판 3판 연속 (사이에 다른 판이 끼면 끊김)
    a.c.allinWinRow = won && s.allIn ? (a.c.allinWinRow || 0) + 1 : 0;
    if (a.c.allinWinRow >= 3) unlock(u, 'allin10', room);
    // 프리플랍에서 끝난 판은 제외 (보드가 3장 이상 깔린 뒤 모두 폴드)
    if (won && uncontested && board.length >= 3 && cat === 0 && s.won >= table.bb * 20) unlock(u, 'bluff', room);
    if (!s.folded || won) {
      a.c.streak = won ? (a.c.streak || 0) + 1 : 0;
      if (a.c.streak >= 5) unlock(u, 'streak5', room);
    } else a.c.streak = 0;
    if (!won && inShowdown && board.length === 5 && cat >= 6) unlock(u, 'badbeat', room);
    // 프리플랍 올인 10판 연속 (블라인드 내다 올인된 건 제외, 한 판이라도 안 하면 0부터)
    a.c.preAllinRow = s.allIn && s.allInStage === 'preflop' ? (a.c.preAllinRow || 0) + 1 : 0;
    if (a.c.preAllinRow >= 10) unlock(u, 'allin6', room);
  }
  saveFn();
}

// 토너먼트가 끝났을 때
function onTourney(room, getUser) {
  for (const r of room.results) {
    const u = getUser(r.id);
    if (!u) continue;
    const a = st(u);
    const win = r.place === 1 || r.co;
    const seat = room.table.seat(r.id);
    a.c.tStreak = win ? (a.c.tStreak || 0) + 1 : 0;
    if (a.c.tStreak >= 3) unlock(u, 'threepeat', room);
    if (win && seat && seat.rebuys >= 2) unlock(u, 'phoenix', room);
    if (r.co) { a.c.chops = (a.c.chops || 0) + 1; if (a.c.chops >= 3) unlock(u, 'chop3', room); }
    if (win && room.players >= 8) unlock(u, 'full8', room);
    if (win && seat && (seat.chips || 0) >= 10e8) unlock(u, 'bigpot', room); // 우승 순간 칩 10억 이상
  }
  saveFn();
}

function onBailout(u, todayCount) { if (todayCount >= 3) unlock(u, 'broke3', null); }
function onAssets(u, total) { if (total >= 100e8) unlock(u, 'rich', null); }

// 화면용 목록 — 잠긴 업적은 이름·조건을 숨기고 보상 종류만 보여줌
function listFor(u) {
  const a = st(u);
  return ACH.map(x => {
    const item = Shop.byId(x.reward);
    const done = a.done[x.id];
    return done
      ? { id: x.id, done: true, at: done, name: x.name, desc: x.desc, reward: x.reward, rewardName: item.name, slot: item.cat }
      : { id: x.id, done: false, slot: item.cat };
  });
}

module.exports = { ACH, init, onHand, onTourney, onBailout, onAssets, listFor, unlock };
