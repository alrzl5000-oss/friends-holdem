// 스킨 상점 목록 (서버/브라우저 공용) — 가격 단위: 🏆 (우승 1회 = 1개)
(function (root) {
  const SHOP = [
    // 프로필 테두리
    { id: 'f_gold', cat: 'frame', name: '금테', price: 3, desc: '번쩍이는 금색 테두리' },
    { id: 'f_fire', cat: 'frame', name: '불꽃', price: 5, desc: '활활 타오르는 테두리' },
    { id: 'f_ice', cat: 'frame', name: '얼음', price: 5, desc: '차갑게 빛나는 테두리' },
    { id: 'f_rainbow', cat: 'frame', name: '무지개', price: 10, desc: '빙글빙글 도는 무지개' },
    { id: 'f_diamond', cat: 'frame', name: '다이아', price: 20, desc: '반짝반짝 다이아몬드' },
    // 카드 뒷면 (다른 사람이 내 카드를 볼 때)
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
  const CATS = { frame: '프로필 테두리', back: '카드 뒷면', title: '칭호', fx: '우승 이펙트' };
  const byId = id => SHOP.find(x => x.id === id);
  const Shop = { SHOP, CATS, byId };
  if (typeof module !== 'undefined' && module.exports) module.exports = Shop;
  else root.Shop = Shop;
})(typeof window !== 'undefined' ? window : globalThis);
