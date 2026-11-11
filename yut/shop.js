// 상점 목록 (가격은 원 단위). 기본 아이템은 처음부터 가지고 있음.
const ITEMS = [
  { id: 'p_basic', cat: 'piece', name: '소박한 말', price: 0, desc: '기본 말', art: { pat: 'dot', c1: '#5c3b1e', c2: '#e9d3a1', c3: '#8a5a2b' } },
  { id: 'p_flower', cat: 'piece', name: '모란 말', price: 5e6, desc: '붉은 모란이 피어난 말', art: { pat: 'flower', c1: '#7a1f2b', c2: '#f4c2c2', c3: '#c2185b' } },
  { id: 'p_sun', cat: 'piece', name: '일월 말', price: 5e6, desc: '둥근 해가 떠오르는 말', art: { pat: 'sun', c1: '#8a4b00', c2: '#ffe08a', c3: '#e8590c' } },
  { id: 'p_moon', cat: 'piece', name: '달빛 말', price: 8e6, desc: '초승달이 걸린 밤의 말', art: { pat: 'moon', c1: '#1b2a4a', c2: '#c9d6f2', c3: '#2a3f7a' } },
  { id: 'p_cloud', cat: 'piece', name: '구름 말', price: 8e6, desc: '흰 구름이 감싼 말', art: { pat: 'cloud', c1: '#2f6f73', c2: '#dff3f1', c3: '#ffffff' } },
  { id: 'p_bamboo', cat: 'piece', name: '대나무 말', price: 1e7, desc: '곧은 대나무 마디 말', art: { pat: 'bamboo', c1: '#2d5a2a', c2: '#b9d98a', c3: '#4f8a3c' } },
  { id: 'p_wave', cat: 'piece', name: '물결 말', price: 1e7, desc: '청색 물결무늬 말', art: { pat: 'wave', c1: '#123e5a', c2: '#9fd3e6', c3: '#1f6f99' } },
  { id: 's_basic', cat: 'stick', name: '소박한 윷', price: 0, desc: '기본 윷가락', art: { wood: '#b9824a' } },
  { id: 's_paul', cat: 'stick', name: '오동나무 윷', price: 3e6, desc: '짙은 오동나무 빛', art: { wood: '#6b3d1f' } },
  { id: 's_bamboo', cat: 'stick', name: '대나무 윷', price: 3e6, desc: '연한 대나무 빛', art: { wood: '#9bb85a' } },
  { id: 's_jade', cat: 'stick', name: '옥 윷', price: 6e6, desc: '청옥빛 윷가락', art: { wood: '#2f8f7f' } },
  { id: 'b_hanji', cat: 'board', name: '한지 판', price: 0, desc: '기본 판', art: { theme: 'hanji' } },
  { id: 'b_dancheong', cat: 'board', name: '단청 판', price: 2e7, desc: '청·적·황 단청 테두리', art: { theme: 'dancheong' } },
  { id: 'b_night', cat: 'board', name: '밤하늘 판', price: 2e7, desc: '쪽빛 밤하늘에 별이 가득', art: { theme: 'night' } },
];
const byId = id => ITEMS.find(x => x.id === id);
const DEFAULT_OWNED = ITEMS.filter(x => x.price === 0).map(x => x.id);
const DEFAULT_EQUIP = { piece: 'p_basic', stick: 's_basic', board: 'b_hanji' };
module.exports = { ITEMS, byId, DEFAULT_OWNED, DEFAULT_EQUIP };
