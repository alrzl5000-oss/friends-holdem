// 상점 목록 (가격은 우승 트로피 개수). 기본 아이템은 처음부터 가지고 있음.
// art.fx  = 말: 판 위·프로필에서 계속 나오는 효과 / 윷: 던질 때 나오는 효과
// taunts  = 그 말로 상대 말을 잡을 때 화면·채팅에 뜨는 조롱 ({n} = 잡힌 사람)
const ITEMS = [
  // ---------------- 말 ----------------
  { id: 'p_basic', cat: 'piece', name: '소박한 말', price: 0, desc: '기본 말', art: { pat: 'dot', c1: '#5c3b1e', c2: '#e9d3a1', c3: '#8a5a2b' },
    taunts: ['{n} 님 출발점으로 다시 가세요 👋', '잡았다 ㅋㅋ 수고하셨어요', '{n} 님 말 잘 받았습니다 🙏'] },
  { id: 'p_flower', cat: 'piece', name: '모란 말', price: 3, desc: '꽃잎이 은은하게 빛나는 말', art: { pat: 'flower', c1: '#7a1f2b', c2: '#f4c2c2', c3: '#c2185b', fx: 'bloom' },
    taunts: ['꽃길만 걷게 해 줄게요… 출발점까지 🌸', '{n} 님, 모란이 피었습니다… 당신은 졌습니다 🌺'] },
  { id: 'p_sun', cat: 'piece', name: '일월 말', price: 3, desc: '뒤에서 햇살이 빙글빙글', art: { pat: 'sun', c1: '#8a4b00', c2: '#ffe08a', c3: '#e8590c', fx: 'sunray' },
    taunts: ['해가 뜨면 {n} 님은 집으로 ☀️', '눈부셔서 못 피했죠? 😎'] },
  { id: 'p_moon', cat: 'piece', name: '달빛 말', price: 5, desc: '푸른 달빛과 별이 반짝', art: { pat: 'moon', c1: '#1b2a4a', c2: '#c9d6f2', c3: '#2a3f7a', fx: 'moonglow' },
    taunts: ['달빛 아래 조용히 처리했습니다 🌙', '{n} 님, 밤길 조심하시랬잖아요 🌚'] },
  { id: 'p_cloud', cat: 'piece', name: '구름 말', price: 5, desc: '구름 위에 둥실둥실 떠다님', art: { pat: 'cloud', c1: '#2f6f73', c2: '#dff3f1', c3: '#ffffff', fx: 'float' },
    taunts: ['구름처럼 와서 {n} 님을 날려 버림 ☁️', '{n} 님 말, 하늘나라 갔어요 😇'] },
  { id: 'p_bamboo', cat: 'piece', name: '대나무 말', price: 8, desc: '댓잎이 흩날리는 말', art: { pat: 'bamboo', c1: '#2d5a2a', c2: '#b9d98a', c3: '#4f8a3c', fx: 'leaf' },
    taunts: ['대쪽같이 잡았습니다 🎋', '{n} 님, 대나무 숲에 소문내세요 "나 잡혔다" 🎍'] },
  { id: 'p_wave', cat: 'piece', name: '물결 말', price: 8, desc: '발밑에 물결이 퍼지는 말', art: { pat: 'wave', c1: '#123e5a', c2: '#9fd3e6', c3: '#1f6f99', fx: 'ripple' },
    taunts: ['{n} 님 말, 파도에 휩쓸려 갔어요 🌊', '물에 빠진 생쥐 꼴 ㅋㅋ 🐭💦'] },
  // 비싼 말 (움직이는 효과 + 전용 조롱)
  { id: 'p_tiger', cat: 'piece', name: '호랑이 말', price: 15, desc: '불타는 기운이 일렁이는 산군', art: { pat: 'tiger', c1: '#3a1a00', c2: '#ffb347', c3: '#1c1c1c', fx: 'roar' },
    taunts: ['어흥! 🐯 {n} 님 말 맛있게 먹었습니다', '호랑이 굴에 제 발로 들어오셨네요 🐅', '{n} 님은 이제 호랑이 밥 🍖'] },
  { id: 'p_dragon', cat: 'piece', name: '청룡 말', price: 25, desc: '번개를 두른 청룡, 파직파직', art: { pat: 'scale', c1: '#0b2a5c', c2: '#7fd3ff', c3: '#1e66c9', fx: 'lightning' },
    taunts: ['청룡의 번개를 맞으셨습니다 ⚡🐉', '{n} 님, 감전 주의 표지판 못 보셨어요? ⚡', '용 앞에서 까불면 이렇게 됩니다 🐲'] },
  { id: 'p_phoenix', cat: 'piece', name: '봉황 말', price: 35, desc: '불꽃 깃털이 피어오르는 봉황', art: { pat: 'feather', c1: '#6b0f0f', c2: '#ffd36a', c3: '#ff5a1f', fx: 'fire' },
    taunts: ['{n} 님 말, 재가 되어 출발점으로 🔥', '봉황 앞에선 다 불쏘시개예요 🪶🔥', '활활 타오르는 건 제 말, 꺼진 건 {n} 님 희망 🕯️'] },
  { id: 'p_rainbow', cat: 'piece', name: '오방색 말', price: 50, desc: '색이 끝없이 바뀌는 무지개 말', art: { pat: 'rainbow', c1: '#1a1a1a', c2: '#ffffff', c3: '#ff4d6d', fx: 'rainbow' },
    taunts: ['무지개 너머 출발점으로 보내 드렸어요 🌈', '{n} 님, 인생은 원래 이렇게 알록달록해요 🎨', '오방색으로 곱게 접어 반송합니다 📦🌈'] },
  { id: 'p_king', cat: 'piece', name: '임금님 말', price: 80, desc: '황금빛 후광과 왕관, 최고급', art: { pat: 'crown', c1: '#4a2c00', c2: '#fff1b8', c3: '#e0a800', fx: 'gold' },
    taunts: ['어명이오! {n} 님은 출발점으로 귀양 👑', '감히 짐의 길을 막다니… 물렀거라! 🐎', '{n} 님, 성은이 망극하옵니다 해 보세요 🙇', '짐이 곧 판이니라 👑✨'] },

  // 업적 전용 말 (상점에서 못 삼, ach = 얻는 업적)
  { id: 'p_legend', cat: 'piece', name: '전설의 윷꾼 말', price: null, ach: 'win50', desc: '보랏빛 소용돌이를 두른 전설', art: { pat: 'crown', c1: '#1a0b2e', c2: '#d9b8ff', c3: '#7b2cff', fx: 'void' },
    taunts: ['전설 앞에 무릎 꿇어라 {n} 👑🌀', '{n} 님은 제 전설의 엑스트라 1이에요', '이게 바로 50승의 손맛 🌀'] },
  { id: 'p_shadow', cat: 'piece', name: '그림자 말', price: null, ach: 'streak10', desc: '어둠 속에서 떠다니는 무패의 말', art: { pat: 'moon', c1: '#050505', c2: '#4a4a5a', c3: '#a0a0ff', fx: 'void' },
    taunts: ['{n} 님, 뒤를 조심하셨어야죠 🌑', '그림자는 지지 않습니다 🖤'] },
  { id: 'p_reaper', cat: 'piece', name: '저승사자 말', price: null, ach: 'cap500', desc: '말 2,000개를 거둔 자', art: { pat: 'scale', c1: '#0a0a0a', c2: '#3a3a3a', c3: '#e8e8e8', fx: 'void' },
    taunts: ['{n} 님, 명부에 이름 올라갔습니다 📜💀', '저승 가는 길은 출발점부터예요 ⚰️', '2001번째 손님 어서 오세요 💀'] },
  { id: 'p_clown', cat: 'piece', name: '광대 말', price: null, ach: 'nak20', desc: '낙을 20번 한 사람에게 주는 위로', art: { pat: 'rainbow', c1: '#c2185b', c2: '#fff', c3: '#ffd600', fx: 'bloom' },
    taunts: ['낙 20번 한 사람한테 잡히셨어요 ㅋㅋㅋ 🤡', '{n} 님, 광대한테 잡히는 기분 어때요? 🎪'] },
  { id: 'p_collector', cat: 'piece', name: '수집가 말', price: null, ach: 'collector', desc: '상점을 다 털어 버린 자', art: { pat: 'rainbow', c1: '#4a2c00', c2: '#fff1b8', c3: '#e0a800', fx: 'gold' },
    taunts: ['{n} 님 말도 제 수집품에 추가 🗃️', '트로피로 산 말에 잡히는 기분 💸'] },

  // ---------------- 윷 ----------------
  { id: 's_basic', cat: 'stick', name: '소박한 윷', price: 0, desc: '기본 윷가락', art: { wood: '#b9824a' } },
  { id: 's_paul', cat: 'stick', name: '오동나무 윷', price: 3, desc: '떨어질 때 나무 부스러기가 튐', art: { wood: '#6b3d1f', fx: 'chips' } },
  { id: 's_bamboo', cat: 'stick', name: '대나무 윷', price: 4, desc: '던지면 댓잎이 흩날림', art: { wood: '#9bb85a', fx: 'leaf' } },
  { id: 's_jade', cat: 'stick', name: '옥 윷', price: 7, desc: '청옥빛으로 빛나며 굴러감', art: { wood: '#2f8f7f', fx: 'jade' } },
  { id: 's_fire', cat: 'stick', name: '불꽃 윷', price: 15, desc: '불꼬리를 달고 떨어져 불티가 튐', art: { wood: '#b8321e', fx: 'flame' } },
  { id: 's_thunder', cat: 'stick', name: '번개 윷', price: 25, desc: '떨어지는 순간 번쩍! 벼락이 침', art: { wood: '#2a3f8f', fx: 'thunder' } },
  { id: 's_blossom', cat: 'stick', name: '벚꽃 윷', price: 35, desc: '던지면 판 위로 꽃비가 내림', art: { wood: '#e48aa8', fx: 'petals' } },
  { id: 's_gold', cat: 'stick', name: '황금 윷', price: 60, desc: '황금빛 후광과 엽전이 쏟아짐', art: { wood: '#d9a21f', fx: 'gold' } },

  { id: 's_meteor', cat: 'stick', name: '유성 윷', price: null, ach: 'fourhome', desc: '하늘에서 유성이 쏟아지는 윷', art: { wood: '#5a2d8f', fx: 'meteor' } },

  // ---------------- 판 ----------------
  { id: 'b_hanji', cat: 'board', name: '한지 판', price: 0, desc: '기본 판', art: { theme: 'hanji' } },
  { id: 'b_dancheong', cat: 'board', name: '단청 판', price: 10, desc: '청·적·황 단청 테두리', art: { theme: 'dancheong' } },
  { id: 'b_night', cat: 'board', name: '밤하늘 판', price: 15, desc: '쪽빛 밤하늘에 별이 가득', art: { theme: 'night' } },
];
const byId = id => ITEMS.find(x => x.id === id);
const DEFAULT_OWNED = ITEMS.filter(x => x.price === 0).map(x => x.id);
const BUYABLE = ITEMS.filter(x => x.price > 0).map(x => x.id);   // 수집가 업적 기준
const DEFAULT_EQUIP = { piece: 'p_basic', stick: 's_basic', board: 'b_hanji' };
// 잡을 때 조롱 한 줄 (말 아이템 기준)
function tauntFor(pieceId, victim) {
  const it = byId(pieceId) || byId('p_basic');
  const list = it.taunts && it.taunts.length ? it.taunts : byId('p_basic').taunts;
  return list[Math.floor(Math.random() * list.length)].replace(/\{n\}/g, victim);
}
module.exports = { ITEMS, byId, DEFAULT_OWNED, DEFAULT_EQUIP, BUYABLE, tauntFor };
