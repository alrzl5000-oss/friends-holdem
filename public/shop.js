// 스킨 상점 목록 (서버/브라우저 공용) — 가격 단위: 🏆 (우승 1회 = 1개)
(function (root) {
  const SHOP = [
    // 프로필 테두리 (색·스타일을 직접 꾸미는 커스텀 1종)
    { id: 'f_custom', cat: 'frame', name: '커스텀 테두리', price: 20, desc: '도트로 직접 그리기' },
    { id: 'f_wood', cat: 'frame', name: '원목 액자', price: 3, desc: '금못 박힌 나무 액자' },
    { id: 'f_cat', cat: 'frame', name: '고양이', price: 5, desc: '쫑긋한 귀 + 수염' },
    { id: 'f_sakura', cat: 'frame', name: '벚꽃', price: 6, desc: '벚꽃이 흩날리는 분홍 테' },
    { id: 'f_ice', cat: 'frame', name: '얼음 결정', price: 8, desc: '눈꽃 + 고드름' },
    { id: 'f_chips', cat: 'frame', name: '칩 스택', price: 10, desc: '모서리마다 칩 더미' },
    { id: 'f_neon', cat: 'frame', name: '네온 사인', price: 25, desc: '가끔 깜빡이는 네온' },
    // 카드 스킨 (뒷면 + 내 카드 앞면)
    { id: 'b_navy', cat: 'back', name: '로열 네이비', price: 3, desc: '남색 + 금색 무늬' },
    { id: 'b_black', cat: 'back', name: '블랙 골드', price: 5, desc: '검정 바탕 금박' },
    { id: 'b_neon', cat: 'back', name: '네온', price: 10, desc: '형광 사이버 무늬' },
    { id: 'b_money', cat: 'back', name: '돈다발', price: 15, desc: '오만원권 무늬' },
    { id: 'b_carbon', cat: 'back', name: '카본', price: 4, desc: '탄소섬유 직조' },
    { id: 'b_matrix', cat: 'back', name: '매트릭스', price: 20, desc: '흘러내리는 초록 코드' },
    { id: 'b_galaxy', cat: 'back', name: '은하수', price: 25, desc: '반짝이는 성운' },
    // 칭호 (이름 아래)
    { id: 't_tazza', cat: 'title', name: '타짜', price: 2 },
    { id: 't_poker', cat: 'title', name: '포커페이스', price: 2 },
    { id: 't_chop', cat: 'title', name: '찹의 신', price: 5 },
    { id: 't_allin', cat: 'title', name: '올인 장인', price: 5 },
    { id: 't_shark', cat: 'title', name: '상어', price: 10 },
    { id: 't_king', cat: 'title', name: '홀덤 황제', price: 30 },
    { id: 't_call', cat: 'title', name: '콜 머신', price: 2 },
    { id: 't_river', cat: 'title', name: '리버 요정', price: 3 },
    { id: 't_thief', cat: 'title', name: '팟 도둑', price: 5 },
    { id: 't_legend', cat: 'title', name: '전설의 시작', price: 8 },
    // 우승 이펙트 (내가 이겼을 때)
    { id: 'e_gold', cat: 'fx', name: '황금비', price: 5, desc: '금화가 쏟아져요' },
    { id: 'e_fire', cat: 'fx', name: '불꽃놀이', price: 10, desc: '폭죽이 터져요' },
    { id: 'e_money', cat: 'fx', name: '돈벼락', price: 15, desc: '지폐가 쏟아져요' },
    { id: 'e_confetti', cat: 'fx', name: '꽃가루', price: 6, desc: '색종이가 흩날려요' },
    { id: 'e_hearts', cat: 'fx', name: '하트 폭탄', price: 10, desc: '하트가 터져요' },
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
    // 2차 업적 보상
    { id: 'a_aceframe', cat: 'frame', name: '에이스 테두리' },
    { id: 'a_upframe', cat: 'frame', name: '역전 테두리' },
    { id: 'a_rags', cat: 'frame', name: '누더기 테두리' },
    { id: 'a_t_straight', cat: 'title', name: '일자 인생' },
    { id: 'a_t_patience', cat: 'title', name: '참을 인' },
    { id: 'a_t_second', cat: 'title', name: '만년 2등' },
    { id: 'a_t_last', cat: 'title', name: '프로 꼴찌' },
    { id: 'a_suits', cat: 'back', name: '포 수트' },
    { id: 'a_mine', cat: 'back', name: '광맥' },
    { id: 'a_rocket', cat: 'aura', name: '로켓 부스터' },
    { id: 'a_chips', cat: 'aura', name: '칩 궤도' },
    { id: 'a_mic', cat: 'sdfx', name: '마이크 드롭' },
    { id: 'a_wave', cat: 'sdfx', name: '리버 웨이브' },
    { id: 'a_ko', cat: 'fx', name: 'K.O.' },
    { id: 'a_carpet', cat: 'enter', name: '레드카펫' },
    { id: 'a_mega', cat: 'enter', name: '확성기 등장' },
  ];
  // 시즌 보상 전용 (상점에서 못 삼)
  const SEASON_ITEMS = [
    { id: 's2_champ', cat: 'frame', name: '시즌2 챔피언 테두리', desc: '시즌2 토너 점수 1위' },
    { id: 's2_gold', cat: 'back', name: '시즌2 순금 카드', desc: '시즌2 총 자산 1위' },
    { id: 's3_champ', cat: 'frame', name: '시즌3 챔피언 테두리', desc: '시즌3 토너 점수 1위' },
    { id: 's3_gold', cat: 'back', name: '시즌3 순금 카드', desc: '시즌3 총 자산 1위' },
  ];
  // 장착 슬롯 전체 (상점 + 업적 전용)
  const SLOTS = Object.assign({}, CATS, { aura: '프로필 이펙트', sdfx: '쇼다운 이펙트', enter: '입장 이펙트' });
  const byId = id => SHOP.find(x => x.id === id) || ACH_ITEMS.find(x => x.id === id) || SEASON_ITEMS.find(x => x.id === id);
  const Shop = { SHOP, CATS, ACH_ITEMS, SEASON_ITEMS, SLOTS, byId };
  if (typeof module !== 'undefined' && module.exports) module.exports = Shop;
  else root.Shop = Shop;
})(typeof window !== 'undefined' ? window : globalThis);
