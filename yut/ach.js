// 업적 — 어렵게. 달성하면 트로피 + (일부) 업적 전용 아이템
// stat: 진행도를 셀 값 (u.st 의 키, 또는 아래 VALUE 의 계산식)
const SHOP = require('./shop');
const ACH = [
  // 윷놀이 승리·판수
  { id: 'win1', name: '첫 승리', desc: '윷놀이 1승', stat: 'win', goal: 1, reward: { trophy: 1 } },
  { id: 'win10', name: '승부사', desc: '윷놀이 10승', stat: 'win', goal: 10, reward: { trophy: 3 } },
  { id: 'win50', name: '윷판의 지배자', desc: '윷놀이 50승', stat: 'win', goal: 50, reward: { trophy: 15, item: 'p_legend' } },
  { id: 'win100', name: '윷신(神)', desc: '윷놀이 100승', stat: 'win', goal: 100, reward: { trophy: 40 } },
  { id: 'games100', name: '백전노장', desc: '윷놀이 100판 하기', stat: 'games', goal: 100, reward: { trophy: 5 } },
  { id: 'streak5', name: '파죽지세', desc: '윷놀이 5판 연속 우승', stat: 'bestStreak', goal: 5, reward: { trophy: 10 } },
  { id: 'streak10', name: '무패 신화', desc: '윷놀이 10판 연속 우승', stat: 'bestStreak', goal: 10, reward: { trophy: 30, item: 'p_shadow' } },
  // 잡기
  { id: 'cap300', name: '사냥꾼', desc: '상대 말 누적 300개 잡기', stat: 'captures', goal: 300, reward: { trophy: 5 } },
  { id: 'cap500', name: '저승사자', desc: '상대 말 누적 2,000개 잡기', stat: 'captures', goal: 2000, reward: { trophy: 20, item: 'p_reaper' } },
  { id: 'capmulti', name: '일망타진', desc: '한 번에 상대 말 4개 잡기 (업힌 말 포함)', stat: 'maxCapOnce', goal: 4, reward: { trophy: 8 } },
  { id: 'backcap', name: '빽도 저격수', desc: '뒷도로 상대 말 20번 잡기', stat: 'backCaptures', goal: 20, reward: { trophy: 8 } },
  // 묘기
  { id: 'fourhome', name: '네 동 났다', desc: '말 4개를 업어서 한 번에 내보내기', stat: 'fourHome', goal: 1, reward: { trophy: 15, item: 's_meteor' } },
  { id: 'mo3', name: '모모모', desc: '모를 3번 연속 던지기', stat: 'maxMoStreak', goal: 3, reward: { trophy: 20 } },
  { id: 'yut4', name: '윷윷윷윷', desc: '윷을 4번 연속 던지기', stat: 'maxYutStreak', goal: 4, reward: { trophy: 8 } },
  { id: 'flawless', name: '무혈입성', desc: '4인 판에서 내 말이 한 번도 안 잡히고 우승', stat: 'flawless4', goal: 1, reward: { trophy: 12 } },
  { id: 'comeback', name: '기적의 역전', desc: '상대가 3동 났을 때 나는 0동이었다가 우승', stat: 'comebacks', goal: 1, reward: { trophy: 15 } },
  { id: 'highroller', name: '큰손', desc: '판돈 1억 · 4인 판에서 우승', stat: 'bigWins', goal: 1, reward: { trophy: 8 } },
  { id: 'rich', name: '재벌', desc: '현금 100억 모으기', stat: 'maxCash', goal: 1e10, reward: { trophy: 15 } },
  // 미니게임
  { id: 'gonu20', name: '호박 장인', desc: '호박고누 20승', stat: 'gonuWin', goal: 20, reward: { trophy: 8 } },
  { id: 'j12_20', name: '십이장기 국수', desc: '십이장기 20승', stat: 'j12Win', goal: 20, reward: { trophy: 8 } },
  { id: 'j12try', name: '입궁', desc: '십이장기에서 왕 입궁으로 5번 이기기', stat: 'j12Try', goal: 5, reward: { trophy: 6 } },
  // 기타
  { id: 'nak20', name: '낙의 달인', desc: '낙 누적 20번 (자랑 아님)', stat: 'naks', goal: 20, reward: { trophy: 2, item: 'p_clown' } },
  { id: 'collector', name: '수집가', desc: '상점에서 파는 아이템 전부 모으기', stat: 'collect', goal: SHOP.BUYABLE.length, reward: { trophy: 10, item: 'p_collector' } },
];
const VALUE = {
  win: u => (u.yut && u.yut.win) || 0,
  games: u => (u.yut && u.yut.games) || 0,
  maxCash: u => Math.max((u.st && u.st.maxCash) || 0, u.assets || 0),
  collect: u => SHOP.BUYABLE.filter(id => (u.owned || []).includes(id)).length,
};
const valueOf = (u, a) => (VALUE[a.stat] ? VALUE[a.stat](u) : (u.st && u.st[a.stat]) || 0);
const st = u => (u.st = u.st || {});

// 새로 달성한 업적을 처리하고 목록을 돌려줌 (보상 지급까지)
function check(u) {
  u.achDone = u.achDone || {};
  const fresh = [];
  for (const a of ACH) {
    if (u.achDone[a.id]) continue;
    if (valueOf(u, a) < a.goal) continue;
    u.achDone[a.id] = Date.now();
    if (a.reward.trophy) u.trophy = (u.trophy || 0) + a.reward.trophy;
    if (a.reward.item) { u.owned = u.owned || SHOP.DEFAULT_OWNED.slice(); if (!u.owned.includes(a.reward.item)) u.owned.push(a.reward.item); }
    fresh.push({ id: a.id, name: a.name, desc: a.desc, reward: a.reward });
  }
  return fresh;
}
function progress(u) {
  const done = u.achDone || {};
  return ACH.map(a => ({ id: a.id, name: a.name, desc: a.desc, goal: a.goal, value: Math.min(a.goal, valueOf(u, a)), done: !!done[a.id], at: done[a.id] || 0, reward: a.reward }));
}
module.exports = { ACH, check, progress, st };
