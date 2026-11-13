// 업적 — 어렵게. 달성하면 트로피 + 업적 전용 아이템(말·윷·판·잔상·펫)
// stat: 진행도를 셀 값 (u.st 의 키, 또는 아래 VALUE 의 계산식)
const SHOP = require('./shop');
const ACH = [
  // 윷놀이 승리·판수
  { id: 'win1', name: '첫 승리', desc: '윷놀이 1승', stat: 'win', goal: 1, reward: { trophy: 1, item: 'pet_chick' } },
  { id: 'win10', name: '승부사', desc: '윷놀이 10승', stat: 'win', goal: 10, reward: { trophy: 3, item: 'pet_cat' } },
  { id: 'win50', name: '윷판의 지배자', desc: '윷놀이 50승', stat: 'win', goal: 50, reward: { trophy: 15, item: 'p_legend' } },
  { id: 'win100', name: '윷신(神)', desc: '윷놀이 100승', stat: 'win', goal: 100, reward: { trophy: 40, item: 'pet_dragon' } },
  { id: 'games100', name: '백전노장', desc: '윷놀이 100판 하기', stat: 'games', goal: 100, reward: { trophy: 5, item: 'pet_owl' } },
  { id: 'streak5', name: '파죽지세', desc: '윷놀이 5판 연속 우승', stat: 'bestStreak', goal: 5, reward: { trophy: 10, item: 'pet_fox' } },
  { id: 'streak10', name: '무패 신화', desc: '윷놀이 10판 연속 우승', stat: 'bestStreak', goal: 10, reward: { trophy: 30, item: 'p_shadow' } },
  // 잡기
  { id: 'cap300', name: '사냥꾼', desc: '상대 말 누적 300개 잡기', stat: 'captures', goal: 300, reward: { trophy: 5, item: 'pet_bat' } },
  { id: 'cap500', name: '저승사자', desc: '상대 말 누적 2,000개 잡기', stat: 'captures', goal: 2000, reward: { trophy: 20, item: 'p_reaper' } },
  { id: 'capmulti', name: '일망타진', desc: '한 번에 상대 말 4개 잡기 (업힌 말 포함)', stat: 'maxCapOnce', goal: 4, reward: { trophy: 8, item: 'tr_ghost' } },
  { id: 'backcap', name: '빽도 저격수', desc: '뒷도로 상대 말 20번 잡기', stat: 'backCaptures', goal: 20, reward: { trophy: 8, item: 'pet_crab' } },
  // 묘기
  { id: 'fourhome', name: '네 동 났다', desc: '말 4개를 업어서 한 번에 내보내기', stat: 'fourHome', goal: 1, reward: { trophy: 15, item: 's_meteor' } },
  { id: 'mo3', name: '모모모', desc: '모를 3번 연속 던지기', stat: 'maxMoStreak', goal: 3, reward: { trophy: 20, item: 'tr_star' } },
  { id: 'yut4', name: '윷윷윷윷', desc: '윷을 4번 연속 던지기', stat: 'maxYutStreak', goal: 4, reward: { trophy: 8, item: 'tr_spark' } },
  { id: 'flawless', name: '무혈입성', desc: '3인 이상 판에서 내 말이 한 번도 안 잡히고 우승', stat: 'flawless4', goal: 1, reward: { trophy: 12, item: 'tr_petal' } },
  { id: 'comeback', name: '기적의 역전', desc: '상대가 3동 났을 때 나는 0동이었다가 우승', stat: 'comebacks', goal: 1, reward: { trophy: 15, item: 'tr_fire' } },
  { id: 'highroller', name: '큰손', desc: '판돈 1억 · 3인 이상 판에서 우승', stat: 'bigWins', goal: 1, reward: { trophy: 8, item: 'b_royal' } },
  { id: 'rich', name: '재벌', desc: '현금 100억 모으기', stat: 'maxCash', goal: 1e10, reward: { trophy: 15, item: 'tr_coin' } },
  // 미니게임
  { id: 'gonu20', name: '호박 장인', desc: '호박고누 20승', stat: 'gonuWin', goal: 20, reward: { trophy: 8, item: 'b_jade' } },
  { id: 'j12_20', name: '십이장기 국수', desc: '십이장기 20승', stat: 'j12Win', goal: 20, reward: { trophy: 8, item: 'b_ink' } },
  { id: 'j12try', name: '입궁', desc: '십이장기에서 왕 입궁으로 5번 이기기', stat: 'j12Try', goal: 5, reward: { trophy: 6, item: 'b_autumn' } },
  // 기타
  { id: 'nak20', name: '낙의 달인', desc: '낙 누적 20번 (자랑 아님)', stat: 'naks', goal: 20, reward: { trophy: 2, item: 'p_clown' } },
  { id: 'games300', name: '윷판 지박령', desc: '윷놀이 300판 하기', stat: 'games', goal: 300, reward: { trophy: 10, item: 'nc_scroll' } },
  { id: 'cap1000', name: '도살자', desc: '상대 말 누적 1,000개 잡기', stat: 'captures', goal: 1000, reward: { trophy: 12, item: 'fr_skull' } },
  { id: 'mo100', name: '모 수집가', desc: '모 누적 100번 던지기', stat: 'moTotal', goal: 100, reward: { trophy: 8, item: 'tr_clover' } },
  { id: 'yut300', name: '윷 장인', desc: '윷 누적 300번 던지기', stat: 'yutTotal', goal: 300, reward: { trophy: 8, item: 'pet_cow' } },
  { id: 'four3', name: '네 동 세 번', desc: '말 4개를 업어서 한 번에 내보내기 3번', stat: 'fourHome', goal: 3, reward: { trophy: 20, item: 'fr_sun' } },
  { id: 'gonu50', name: '호박 대감', desc: '호박고누 50승', stat: 'gonuWin', goal: 50, reward: { trophy: 12, item: 'nc_pumpkin' } },
  { id: 'j12_50', name: '십이장기 명인', desc: '십이장기 50승', stat: 'j12Win', goal: 50, reward: { trophy: 12, item: 'fr_jang' } },
  { id: 'rich2', name: '갑부', desc: '현금 30억 모으기', stat: 'maxCash', goal: 3e9, reward: { trophy: 10, item: 'nc_tycoon' } },
  { id: 'collector', name: '수집가', desc: '상점에서 파는 아이템 전부 모으기', stat: 'collect', goal: SHOP.BUYABLE.length, reward: { trophy: 10, item: 'p_collector' } },

  // ---------------- 예능 업적 (fun) — 웃기지만 드묾 (시뮬레이션으로 확률 맞춤) ----------------
  { id: 'f_punchbag', fun: true, name: '동네북', desc: '한 판에서 내 말이 30번 잡히기', stat: 'maxCaughtGame', goal: 30, reward: { trophy: 5, item: 'p_sandbag' } },
  { id: 'f_nemesis', fun: true, name: '원수가 생겼다', desc: '한 판에서 같은 사람한테 18번 잡히기', stat: 'maxSameHit', goal: 18, reward: { trophy: 4, item: 'pet_ghost' } },
  { id: 'f_mukbang', fun: true, name: '먹방 BJ', desc: '한 판에서 혼자 30번 잡기', stat: 'maxCapsGame', goal: 30, reward: { trophy: 6, item: 'pet_hamster' } },
  { id: 'f_brawl', fun: true, name: '난타전', desc: '한 판에서 20번 잡고 20번 잡히기', stat: 'brawls', goal: 1, reward: { trophy: 6, item: 'b_hell' } },
  { id: 'f_revenge', fun: true, name: '복수의 화신', desc: '나를 잡은 사람을 바로 다음 내 차례에 되잡기 300번', stat: 'revenges', goal: 300, reward: { trophy: 8, item: 'p_revenge' } },
  { id: 'f_lost4', fun: true, name: '업고 튀다 객사', desc: '4동 업은 말이 한 번에 몽땅 잡히기', stat: 'lost4', goal: 1, reward: { trophy: 5, item: 'tr_skull' } },
  { id: 'f_almost', fun: true, name: '다 된 밥에 재', desc: '3동 나고 마지막 말이 도착 바로 앞에 있는데 지기', stat: 'almost', goal: 1, reward: { trophy: 5, item: 'p_ash' } },
  { id: 'f_home', fun: true, name: '집 앞에서 객사', desc: '참먹이(나가기 직전 칸)에서 15번 잡히기', stat: 'caughtAtHome', goal: 15, reward: { trophy: 4, item: 'p_tomb' } },
  { id: 'f_moonwalk', fun: true, name: '문워크', desc: '한 판에서 뒷도 6번', stat: 'maxBackGame', goal: 6, reward: { trophy: 6, item: 's_disco' } },
  { id: 'f_backshort', fun: true, name: '빽도 지름길', desc: '첫 칸에서 뒷도로 참먹이 간 말이 바로 나가기 5번', stat: 'backShortcut', goal: 5, reward: { trophy: 5, item: 'tr_ink' } },
  { id: 'f_oil', fun: true, name: '손에 참기름', desc: '한 판에서 낙 5번', stat: 'maxNakGame', goal: 5, reward: { trophy: 4, item: 'tr_bubble' } },
  { id: 'f_cursed', fun: true, name: '하늘이 버린 손', desc: '낙 3번 연속', stat: 'maxNakRun', goal: 3, reward: { trophy: 10, item: 'p_glitch' } },
  { id: 'f_heavenhell', fun: true, name: '천당과 지옥', desc: '모 나오고 바로 다음에 낙 5번', stat: 'moNak', goal: 5, reward: { trophy: 5, item: 'tr_bolt' } },
  { id: 'f_zero', fun: true, name: '완패 장인', desc: '말 하나도 못 내고 지기 20번', stat: 'zeroLoss', goal: 20, reward: { trophy: 3, item: 'pet_snail' } },
  { id: 'f_bankrupt', fun: true, name: '패가망신', desc: '판돈 1억 · 3인 이상 판에서 5번 지기', stat: 'bigLoss', goal: 5, reward: { trophy: 2, item: 'p_bankrupt' } },
  { id: 'f_speed', fun: true, name: '속전속결', desc: '10번 이하로 던지고 우승', stat: 'fastWin', goal: 1, reward: { trophy: 12, item: 's_rocket' } },
  { id: 'f_turtle', fun: true, name: '거북이', desc: '한 판에서 혼자 80번 넘게 던지기', stat: 'maxThrowsGame', goal: 80, reward: { trophy: 4, item: 'pet_turtle' } },
  { id: 'f_sleep', fun: true, name: '자는 사이에 우승', desc: '자리비움 상태로 우승', stat: 'afkWin', goal: 1, reward: { trophy: 6, item: 'p_zzz' } },
  { id: 'f_chatter', fun: true, name: '입으로 윷 던지기', desc: '한 판에서 채팅 100번', stat: 'maxChatsGame', goal: 100, reward: { trophy: 2, item: 'pet_parrot' } },
  { id: 'f_charger', fun: true, name: '충전의 신', desc: '충전 누적 30번', stat: 'bailouts', goal: 30, reward: { trophy: 1, item: 'pet_pig' } },
  { id: 'f_pumpkin', fun: true, name: '호박에 갇힘', desc: '호박고누에서 10수 안에 지기', stat: 'gonuQuickLoss', goal: 1, reward: { trophy: 3, item: 'p_pumpkin' } },
  { id: 'f_pawn', fun: true, name: '자(子)의 반란', desc: '십이장기에서 자(또는 후)로 상대 왕 잡기', stat: 'pawnKing', goal: 1, reward: { trophy: 6, item: 'p_pawn' } },
  { id: 'f_plain', fun: true, name: '노잼 우승', desc: '윷·모 한 번도 없이 우승 3번', stat: 'plainWin', goal: 3, reward: { trophy: 6, item: 'pet_sloth' } },
  { id: 'f_nakwin', fun: true, name: '미끄러져도 1등', desc: '한 판에서 낙 3번 하고도 우승', stat: 'nakWin', goal: 1, reward: { trophy: 6, item: 'tr_banana' } },
  { id: 'f_shrimp', fun: true, name: '뒷걸음질 사냥꾼', desc: '한 판에서 뒷도로 3번 잡기', stat: 'maxBackCapsGame', goal: 3, reward: { trophy: 8, item: 'pet_shrimp' } },
];
const VALUE = {
  moTotal: u => (u.throws && u.throws['모']) || 0,
  yutTotal: u => (u.throws && u.throws['윷']) || 0,
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
  return ACH.map(a => ({ id: a.id, fun: !!a.fun, name: a.name, desc: a.desc, goal: a.goal, value: Math.min(a.goal, valueOf(u, a)), done: !!done[a.id], at: done[a.id] || 0, reward: a.reward }));
}
module.exports = { ACH, check, progress, st };
