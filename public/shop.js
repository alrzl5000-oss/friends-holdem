// 스킨 상점 목록 (서버/브라우저 공용) — 가격 단위: 🏆 (우승 1회 = 1개)
(function (root) {
  const SHOP = [
    // 프로필 테두리 (색·스타일을 직접 꾸미는 커스텀 1종)
    { id: 'f_custom', cat: 'frame', name: '커스텀 테두리', price: 20, desc: '색·스타일·빛 내 맘대로' },
    // 카드 스킨 (뒷면 + 내 카드 앞면)
    { id: 'b_navy', cat: 'back', name: '로열 네이비', price: 3, desc: '남색 + 금색 무늬' },
    { id: 'b_black', cat: 'back', name: '블랙 골드', price: 5, desc: '검정 바탕 금박' },
    { id: 'b_neon', cat: 'back', name: '네온', price: 10, desc: '형광 사이버 무늬' },
    { id: 'b_money', cat: 'back', name: '돈다발', price: 15, desc: '오만원권 무늬' },
    // 칭호 (이름 아래)
    { id: 't_tazza', cat: 'title', name: '타짜', price: 2 },
    { id: 't_poker', cat: 'title', name: '포커페이스', price: 2 },
    { id: 't_chop', cat: 'title', name: '찹의 신', price: 5 },
    { id: 't_allin', cat: 'title', name: '올인 장인', price: 5 },
    { id: 't_shark', cat: 'title', name: '상어', price: 10 },
    { id: 't_king', cat: 'title', name: '홀덤 황제', price: 30 },
    // 우승 이펙트 (내가 이겼을 때)
    { id: 'e_gold', cat: 'fx', name: '황금비', price: 5, desc: '금화가 쏟아져요' },
    { id: 'e_fire', cat: 'fx', name: '불꽃놀이', price: 10, desc: '폭죽이 터져요' },
    { id: 'e_money', cat: 'fx', name: '돈벼락', price: 15, desc: '지폐가 쏟아져요' },
  ];
  const CATS = { frame: '프로필 테두리', back: '카드 스킨', title: '칭호', fx: '우승 이펙트' };

  // 업적 전용 보상 (상점에서 못 삼)
  const ACH_ITEMS = [
    { id: 'a_dragon', cat: 'frame', name: '용의 테두리' },
    { id: 'a_emperor', cat: 'frame', name: '황제의 테두리' },
    { id: 'a_half', cat: 'frame', name: '반반 테두리' },
    { id: 'a_royal', cat: 'back', name: '로열 벨벳' },
    { id: 'a_glass', cat: 'back', name: '깨진 유리' },
    { id: 'a_diamond', cat: 'back', name: '다이아 컷' },
    { id: 'a_violet', cat: 'aura', name: '보랏빛 오라' },
    { id: 'a_smoke', cat: 'aura', name: '연막' },
    { id: 'a_cloud', cat: 'aura', name: '먹구름' },
    { id: 'a_goldbar', cat: 'fx', name: '금괴 폭포' },
    { id: 'a_dragonfx', cat: 'fx', name: '용의 숨결' },
    { id: 'a_thunder', cat: 'sdfx', name: '번개' },
    { id: 'a_lol', cat: 'sdfx', name: '빵 터짐' },
    { id: 'a_phoenix', cat: 'sdfx', name: '불사조' },
    { id: 'a_crown', cat: 'enter', name: '왕관 등장' },
    { id: 'a_flame', cat: 'enter', name: '불꽃 등장' },
  ];
  // 장착 슬롯 전체 (상점 + 업적 전용)
  const SLOTS = Object.assign({}, CATS, { aura: '프로필 이펙트', sdfx: '쇼다운 이펙트', enter: '입장 이펙트' });
  const byId = id => SHOP.find(x => x.id === id) || ACH_ITEMS.find(x => x.id === id);
  const Shop = { SHOP, CATS, ACH_ITEMS, SLOTS, byId };
  if (typeof module !== 'undefined' && module.exports) module.exports = Shop;
  else root.Shop = Shop;
})(typeof window !== 'undefined' ? window : globalThis);
