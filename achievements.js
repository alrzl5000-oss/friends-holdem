// 업적 (조건은 전부 숨김 — 달성하면 이름·조건·보상이 공개됨)
const { bestHand, compareScore } = require('./public/poker.js');
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
  // ===== 2차 업적 =====
  // ----- 판 단위 -----
  { id: 'quadace', name: '에이스 포카드', desc: 'A 포카드로 쇼다운 승리', reward: 'a_aceframe' },
  { id: 'straight10', name: '일자 인생', desc: '스트레이트로 쇼다운 승리 누적 10회', reward: 'a_t_straight' },
  { id: 'flush10', name: '무늬 수집가', desc: '플러시로 쇼다운 승리 누적 10회', reward: 'a_suits' },
  { id: 'aa5', name: '포켓 로켓', desc: 'A·A 들고 팟 승리 누적 5회', reward: 'a_rocket' },
  { id: 'highcard', name: '맨손의 승리', desc: '하이카드로 쇼다운 승리', reward: 'a_mic' },
  { id: 'river3', name: '리버의 신', desc: '턴까지 지고 있다가 리버에서 역전승 누적 3회', reward: 'a_wave' },
  { id: 'setmine', name: '광부', desc: '포켓 페어로 트리플 만들어 쇼다운 승리 누적 5회', reward: 'a_mine' },
  { id: 'patience', name: '참을 인', desc: '프리플랍 폴드 20판 연속', reward: 'a_t_patience' },
  // ----- 토너먼트 -----
  { id: 'comeback', name: '역전의 명수', desc: '토너먼트에서 칩 꼴찌(평균의 절반 이하)까지 밀렸다가 우승', reward: 'a_upframe' },
  { id: 'chipleader', name: '칩 리더', desc: '토너먼트에서 전체 칩의 80% 이상 보유 (3명 이상 남았을 때)', reward: 'a_chips' },
  { id: 'doubleko', name: '더블 킬', desc: '토너먼트 한 판에서 2명 이상 탈락시키며 팟 승리', reward: 'a_ko' },
  { id: 'runnerup', name: '만년 2등', desc: '토너먼트 2위 누적 3회', reward: 'a_t_second' },
  { id: 'lastout', name: '프로 꼴찌', desc: '토너먼트 꼴찌 누적 5회', reward: 'a_t_last' },
  { id: 'legend', name: '레전드', desc: '전 시즌 합산 토너먼트 우승 10회', reward: 'a_carpet' },
  // ----- 기타 -----
  { id: 'broke', name: '빈털터리', desc: '총 자산 0원', reward: 'a_rags' },
  { id: 'chatter', name: '확성기', desc: '채팅 누적 100회', reward: 'a_mega' },
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
    // ===== 2차 업적 (판 단위) =====
    const sdWin = won && inShowdown && board.length === 5;
    if (sdWin && cat === 7 && best.score[1] === 14) unlock(u, 'quadace', room);
    if (sdWin && cat === 4) { a.c.straightW = (a.c.straightW || 0) + 1; if (a.c.straightW >= 10) unlock(u, 'straight10', room); }
    if (sdWin && cat === 5) { a.c.flushW = (a.c.flushW || 0) + 1; if (a.c.flushW >= 10) unlock(u, 'flush10', room); }
    if (won && h1.r === 14 && h2.r === 14) { a.c.aaW = (a.c.aaW || 0) + 1; if (a.c.aaW >= 5) unlock(u, 'aa5', room); }
    if (sdWin && cat === 0) unlock(u, 'highcard', room);
    if (sdWin && h1.r === h2.r && cat === 3) { a.c.setW = (a.c.setW || 0) + 1; if (a.c.setW >= 5) unlock(u, 'setmine', room); }
    // 리버 역전: 턴(보드 4장) 기준으로는 누군가에게 지고 있었는데 리버에서 이김
    if (sdWin) {
      const turnBoard = board.slice(0, 4);
      const mine = bestHand(s.hand.concat(turnBoard)).score;
      const behind = live.some(o => o !== s && o.hand && o.hand.length === 2 && compareScore(bestHand(o.hand.concat(turnBoard)).score, mine) > 0);
      if (behind) { a.c.riverW = (a.c.riverW || 0) + 1; if (a.c.riverW >= 3) unlock(u, 'river3', room); }
    }
    // 프리플랍 폴드 20판 연속 (시간초과·자리비움 판은 세지도 끊지도 않음)
    if (!(s.ps && s.ps.auto)) {
      a.c.pfFoldRow = s.folded && s.foldStage === 'preflop' ? (a.c.pfFoldRow || 0) + 1 : 0;
      if (a.c.pfFoldRow >= 20) unlock(u, 'patience', room);
    }
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
    if (win && seat && seat.wasLast) unlock(u, 'comeback', room);
    if (r.place === 2 && !r.co) { a.c.second = (a.c.second || 0) + 1; if (a.c.second >= 3) unlock(u, 'runnerup', room); }
    if (r.place === room.players && room.players >= 2) { a.c.last = (a.c.last || 0) + 1; if (a.c.last >= 5) unlock(u, 'lastout', room); }
    const h = u.history || {};
    const lifeWins = Object.values(h).reduce((n, x) => n + ((x && x.wins) || 0), 0) + (u.stats.tWins || 0);
    if (lifeWins >= 10) unlock(u, 'legend', room);
  }
  saveFn();
}

// 토너먼트 판이 끝났을 때 (파산 처리 전) — 칩 꼴찌 기록 · 칩 리더 · 더블 킬
function onTourneyHand(room, getUser) {
  const t = room.table;
  const alive = room.seated.filter(s => s.tStatus === 'alive');
  const busted = alive.filter(s => s.inHand && s.chips === 0);
  const standing = alive.filter(s => s.chips > 0);
  if (standing.length >= 3) {
    const min = Math.min(...standing.map(s => s.chips));
    const sum = standing.reduce((n, s) => n + s.chips, 0);
    // 꼴찌이면서 평균의 절반 이하일 때만 (첫 판 스몰블 정도로는 안 셈)
    for (const s of standing) if (s.chips === min && s.chips <= sum / standing.length * 0.5) s.wasLast = true;
    for (const s of standing) if (s.chips >= sum * 0.8) { const u = getUser(s.id); if (u) unlock(u, 'chipleader', room); }
  }
  if (busted.length >= 2) {
    for (const s of t.seats) if (s && s.won > 0 && s.chips > 0) { const u = getUser(s.id); if (u) unlock(u, 'doubleko', room); }
  }
}
function onChat(u) {
  const a = st(u);
  const now = Date.now();
  if (now - (a.c.chatAt || 0) < 2000) return; // 도배로 채우기 방지: 2초에 1번만 셈
  a.c.chatAt = now;
  a.c.chat = (a.c.chat || 0) + 1;
  if (a.c.chat >= 100) unlock(u, 'chatter', null);
}

function onBailout(u, todayCount) { if (todayCount >= 3) unlock(u, 'broke3', null); }
function onAssets(u, total) { if (total >= 100e8) unlock(u, 'rich', null); if (total <= 0) unlock(u, 'broke', null); }

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

module.exports = { ACH, init, onHand, onTourney, onTourneyHand, onChat, onBailout, onAssets, listFor, unlock };
