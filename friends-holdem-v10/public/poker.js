// 족보 판정 + 메이드 확률 (서버/브라우저 공용)
(function (root) {
  const HAND_NAMES = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];
  const RN = r => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));

  function score5(cards) {
    const rs = cards.map(c => c.r).sort((a, b) => b - a);
    const flush = cards.every(c => c.s === cards[0].s);
    const uniq = [...new Set(rs)];
    let straightHigh = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5;
    }
    const groups = groupRanks(rs);
    const gr = groups.map(g => g[1]);
    if (straightHigh && flush) return [8, straightHigh];
    if (groups[0][0] === 4) return [7, ...gr];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...gr];
    if (flush) return [5, ...rs];
    if (straightHigh) return [4, straightHigh];
    if (groups[0][0] === 3) return [3, ...gr];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...gr];
    if (groups[0][0] === 2) return [1, ...gr];
    return [0, ...rs];
  }

  function groupRanks(rs) {
    const cnt = {};
    rs.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
    return Object.entries(cnt).map(([r, c]) => [c, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  }

  // 5장 미만 (프리플랍 2장, 플랍 전 보드 등): 같은 숫자 조합만으로 판정
  function scorePartial(cards) {
    const rs = cards.map(c => c.r).sort((a, b) => b - a);
    const groups = groupRanks(rs);
    const gr = groups.map(g => g[1]);
    if (groups[0][0] === 4) return [7, ...gr];
    if (groups[0][0] === 3) return [3, ...gr];
    if (groups[0][0] === 2 && groups[1] && groups[1][0] === 2) return [2, ...gr];
    if (groups[0][0] === 2) return [1, ...gr];
    return [0, ...rs];
  }

  function compareScore(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function handName(score) {
    if (score[0] === 8 && score[1] === 14) return '로열 플러시';
    return HAND_NAMES[score[0]];
  }

  function describe(score) {
    const [c, a, b] = score;
    switch (c) {
      case 8: return a === 14 ? '로열 플러시' : `스트레이트 플러시 (${RN(a)} 하이)`;
      case 7: return `포카드 (${RN(a)})`;
      case 6: return `풀하우스 (${RN(a)} 트리플 + ${RN(b)} 페어)`;
      case 5: return `플러시 (${RN(a)} 하이)`;
      case 4: return `스트레이트 (${RN(a)} 하이)`;
      case 3: return `트리플 (${RN(a)})`;
      case 2: return `투페어 (${RN(a)}, ${RN(b)})`;
      case 1: return `원페어 (${RN(a)})`;
      default: return `하이카드 (${RN(a)})`;
    }
  }

  function bestHand(cards) {
    if (cards.length < 5) {
      const score = scorePartial(cards);
      return { score, name: handName(score), cards };
    }
    let best = null;
    const n = cards.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
      for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
        const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
        const sc = score5(five);
        if (!best || compareScore(sc, best.score) > 0) best = { score: sc, cards: five };
      }
    best.name = handName(best.score);
    return best;
  }

  // 현재 패 설명 (2장~7장)
  function handInfo(cards) {
    if (!cards || !cards.length) return null;
    const b = bestHand(cards);
    let text = describe(b.score);
    if (cards.length === 2 && cards[0].s === cards[1].s && b.score[0] === 0) text += ' · 수딧';
    return { cat: b.score[0], name: b.name, text, score: b.score };
  }

  // 리버까지 갔을 때 최종 족보별 확률 (내 카드 + 보드 기준)
  function makeOdds(hole, board) {
    const probs = new Array(9).fill(0);
    if (!hole || hole.length !== 2) return probs;
    const known = hole.concat(board || []);
    const need = 5 - (board || []).length;
    if (need <= 0) { probs[bestHand(known).score[0]] = 1; return probs; }
    const used = new Set(known.map(c => c.r + c.s));
    const deck = [];
    for (const s of ['s', 'h', 'd', 'c']) for (let r = 2; r <= 14; r++) if (!used.has(r + s)) deck.push({ r, s });
    let total = 0;
    const add = draw => { probs[bestHand(known.concat(draw)).score[0]]++; total++; };
    if (need === 1) deck.forEach(c => add([c]));
    else if (need === 2) {
      for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) add([deck[i], deck[j]]);
    } else {
      const d = deck.slice();
      for (let t = 0; t < 2500; t++) {
        for (let k = 0; k < need; k++) {
          const j = k + Math.floor(Math.random() * (d.length - k));
          [d[k], d[j]] = [d[j], d[k]];
        }
        add(d.slice(0, need));
      }
    }
    return probs.map(x => x / total);
  }

  const Poker = { HAND_NAMES, score5, compareScore, handName, describe, bestHand, handInfo, makeOdds, RN };
  if (typeof module !== 'undefined' && module.exports) module.exports = Poker;
  else root.Poker = Poker;
})(typeof window !== 'undefined' ? window : globalThis);
