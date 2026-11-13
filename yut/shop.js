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

  // 창의 효과 말
  { id: 'p_heart', cat: 'piece', name: '사랑꾼 말', price: 20, desc: '하트가 몽글몽글 피어오르는 말', art: { pat: 'heart', c1: '#7a0f3a', c2: '#ffd1e3', c3: '#ff2e7e', fx: 'heart' },
    taunts: ['{n} 님 사랑해요… 출발점에서 기다릴게요 💘', '이건 사랑의 매예요 {n} 님 💕', '잡았다 내 사랑 😘'] },
  { id: 'p_snow', cat: 'piece', name: '눈사람 말', price: 20, desc: '머리 위로 눈이 펑펑 내리는 말', art: { pat: 'cloud', c1: '#2a4a6a', c2: '#ffffff', c3: '#bfe6ff', fx: 'snow' },
    taunts: ['{n} 님 말, 꽁꽁 얼려서 반송 ❄️', '겨울왕국 입장 실패 ⛄', '눈 오는 날엔 출발점이 따뜻해요 {n} 님 🧣'] },
  { id: 'p_ghost', cat: 'piece', name: '도깨비 말', price: 30, desc: '도깨비불이 빙빙 돌고 몸이 깜빡깜빡', art: { pat: 'moon', c1: '#0d1b3a', c2: '#6f8cff', c3: '#c7f9ff', fx: 'ghost' },
    taunts: ['금 나와라 뚝딱! {n} 님 말은 사라져라 뚝딱 👹', '도깨비한테 홀리셨네요 {n} 님 🔥', '방망이로 한 대 퉁 🪄'] },
  { id: 'p_disco', cat: 'piece', name: '디스코 말', price: 40, desc: '사방으로 조명을 뿌리는 미러볼', art: { pat: 'scale', c1: '#3a3a4a', c2: '#e8e8f0', c3: '#9aa0b8', fx: 'disco' },
    taunts: ['{n} 님 말, 무대에서 퇴장 🕺', '음악 끝났어요 {n} 님, 집에 가세요 🪩', '오늘 밤 주인공은 나야 나 💃'] },
  { id: 'p_orbit', cat: 'piece', name: '우주 말', price: 45, desc: '작은 행성들이 궤도를 도는 말', art: { pat: 'dot', c1: '#05051a', c2: '#2a2a6a', c3: '#ffe680', fx: 'orbit' },
    taunts: ['{n} 님 말, 블랙홀로 빨려 들어감 🕳️', '지구는 둥글고 출발점은 저기예요 🌍', '휴스턴, {n} 님에게 문제가 생겼다 🚀'] },

  // 업적 전용 말 (상점에서 못 삼, ach = 얻는 업적)
  { id: 'p_sandbag', cat: 'piece', name: '샌드백 말', price: null, ach: 'f_punchbag', desc: '30번 맞고도 버틴 말, 맞을 때마다 흔들림', art: { pat: 'bamboo', c1: '#5a3a1a', c2: '#e8c99a', c3: '#a87a4a', fx: 'sandbag' },
    taunts: ['30번 맞아 본 사람의 주먹은 맵습니다 🥊', '{n} 님, 이제 제 차례예요 💢'] },
  { id: 'p_glitch', cat: 'piece', name: '버그 말', price: null, ach: 'f_cursed', desc: '낙 3연속으로 세상이 고장 남', art: { pat: 'wave', c1: '#001a00', c2: '#00ff66', c3: '#ff00aa', fx: 'glitch' },
    taunts: ['ERROR 404: {n} 님 말을 찾을 수 없음 👾', '{n}.exe 가 응답하지 않습니다 💻', '시스템이 {n} 님을 삭제했습니다 🗑️'] },
  { id: 'p_zzz', cat: 'piece', name: '잠꾸러기 말', price: null, ach: 'f_sleep', desc: '자면서 우승한 전설, 쿨쿨', art: { pat: 'moon', c1: '#2a1a4a', c2: '#d8c8ff', c3: '#7a5acc', fx: 'zzz' },
    taunts: ['zzZ… 아 잡았어요? 몰랐어요 😴', '{n} 님은 자는 사람한테도 지네요 💤'] },

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

  // 업적 보상 말 (2차)
  { id: 'p_revenge', cat: 'piece', name: '복수귀 말', price: null, ach: 'f_revenge', desc: '300번 되갚은 원한, 붉은 불꽃이 이글이글', art: { pat: 'skull', c1: '#2a0000', c2: '#5a0a0a', c3: '#ff3a3a', fx: 'fire' },
    taunts: ['기억하지? 아까 네가 날 잡았잖아 {n} 😈', '원한은 반드시 갚는다 🔥', '{n} 님, 복수는 차갑게… 아니 뜨겁게 🔥'] },
  { id: 'p_ash', cat: 'piece', name: '잿더미 말', price: null, ach: 'f_almost', desc: '다 된 밥에 재 뿌린 말, 재가 폴폴', art: { pat: 'dot', c1: '#2e2e2e', c2: '#bdbdbd', c3: '#6a6a6a', fx: 'snow' },
    taunts: ['{n} 님 밥에 재 뿌려 드렸어요 🍚', '다 된 밥이었는데 아깝다 그쵸? ㅋㅋ'] },
  { id: 'p_tomb', cat: 'piece', name: '비석 말', price: null, ach: 'f_home', desc: '집 앞에서 15번 객사한 영혼이 맴돎', art: { pat: 'tomb', c1: '#1e1e22', c2: '#9aa0a6', c3: '#4a4f55', fx: 'ghost' },
    taunts: ['{n} 님 여기 잠들다 🪦', '명복을 빕니다 {n} 님 🕯️'] },
  { id: 'p_bankrupt', cat: 'piece', name: '빈털터리 말', price: null, ach: 'f_bankrupt', desc: '엽전이 블랙홀로 빨려 들어가는 말', art: { pat: 'coin', c1: '#3a2a00', c2: '#7a6640', c3: '#e0b93a', fx: 'void' },
    taunts: ['{n} 님도 같이 가난해집시다 💸', '내 지갑처럼 {n} 님 말도 텅 비었네요 👛'] },
  { id: 'p_pumpkin', cat: 'piece', name: '호박 말', price: null, ach: 'f_pumpkin', desc: '호박에 갇혀 봤던 자, 이제 호박이 되다', art: { pat: 'pumpkin', c1: '#4a2200', c2: '#ff8c1a', c3: '#b85200', fx: 'leaf' },
    taunts: ['{n} 님 호박에 가둬 드림 🎃', '호박 넝쿨째 굴러왔다 🎃'] },
  { id: 'p_pawn', cat: 'piece', name: '반란군 말', price: null, ach: 'f_pawn', desc: '졸병이 왕을 잡았다, 황금빛 반란', art: { pat: 'cross', c1: '#0b3d1f', c2: '#e9f7ec', c3: '#1f8a4c', fx: 'gold' },
    taunts: ['졸병한테 잡힌 기분 어때요 {n} 님? ⚔️', '하극상이다! {n} 님 퇴장 🪖'] },

  // ---------------- 윷 ----------------
  { id: 's_basic', cat: 'stick', name: '소박한 윷', price: 0, desc: '기본 윷가락', art: { wood: '#b9824a' } },
  { id: 's_paul', cat: 'stick', name: '오동나무 윷', price: 3, desc: '떨어질 때 나무 부스러기가 튐', art: { wood: '#6b3d1f', fx: 'chips' } },
  { id: 's_bamboo', cat: 'stick', name: '대나무 윷', price: 4, desc: '던지면 댓잎이 흩날림', art: { wood: '#9bb85a', fx: 'leaf' } },
  { id: 's_jade', cat: 'stick', name: '옥 윷', price: 7, desc: '청옥빛으로 빛나며 굴러감', art: { wood: '#2f8f7f', fx: 'jade' } },
  { id: 's_fire', cat: 'stick', name: '불꽃 윷', price: 15, desc: '불꼬리를 달고 떨어져 불티가 튐', art: { wood: '#b8321e', fx: 'flame' } },
  { id: 's_thunder', cat: 'stick', name: '번개 윷', price: 25, desc: '떨어지는 순간 번쩍! 벼락이 침', art: { wood: '#2a3f8f', fx: 'thunder' } },
  { id: 's_blossom', cat: 'stick', name: '벚꽃 윷', price: 35, desc: '던지면 판 위로 꽃비가 내림', art: { wood: '#e48aa8', fx: 'petals' } },
  { id: 's_gold', cat: 'stick', name: '황금 윷', price: 60, desc: '황금빛 후광과 엽전이 쏟아짐', art: { wood: '#d9a21f', fx: 'gold' } },

  { id: 's_bubble', cat: 'stick', name: '비눗방울 윷', price: 20, desc: '던지면 비눗방울이 몽글몽글', art: { wood: '#7ec8e3', fx: 'bubble' } },
  { id: 's_snow', cat: 'stick', name: '눈꽃 윷', price: 20, desc: '떨어지면 눈보라가 휘몰아침', art: { wood: '#cfe8ff', fx: 'snow' } },
  { id: 's_ink', cat: 'stick', name: '먹물 윷', price: 25, desc: '떨어질 때 먹물이 촥 튐', art: { wood: '#2b2b2b', fx: 'ink' } },
  { id: 's_confetti', cat: 'stick', name: '축하 윷', price: 30, desc: '떨어지면 폭죽이 펑! 색종이 파티', art: { wood: '#ff7ab6', fx: 'confetti' } },
  { id: 's_disco', cat: 'stick', name: '디스코 윷', price: null, ach: 'f_moonwalk', desc: '판이 클럽이 됨, 조명이 번쩍번쩍', art: { wood: '#c0c0d0', fx: 'disco' } },
  { id: 's_rocket', cat: 'stick', name: '로켓 윷', price: null, ach: 'f_speed', desc: '연기를 뿜으며 날아와 쾅', art: { wood: '#e0e0e0', fx: 'rocket' } },
  { id: 's_meteor', cat: 'stick', name: '유성 윷', price: null, ach: 'fourhome', desc: '하늘에서 유성이 쏟아지는 윷', art: { wood: '#5a2d8f', fx: 'meteor' } },

  // ---------------- 판 ----------------
  { id: 'b_hanji', cat: 'board', name: '한지 판', price: 0, desc: '기본 판', art: { theme: 'hanji' } },
  { id: 'b_dancheong', cat: 'board', name: '단청 판', price: 10, desc: '청·적·황 단청 테두리', art: { theme: 'dancheong' } },
  { id: 'b_night', cat: 'board', name: '밤하늘 판', price: 15, desc: '쪽빛 밤하늘에 별이 가득', art: { theme: 'night' } },
  // 업적 보상 판
  { id: 'b_royal', cat: 'board', name: '궁궐 금박 판', price: null, ach: 'highroller', desc: '붉은 비단에 금박, 큰손 전용', art: { theme: 'royal' } },
  { id: 'b_jade', cat: 'board', name: '청자 판', price: null, ach: 'gonu20', desc: '비색 청자빛 판', art: { theme: 'jade' } },
  { id: 'b_ink', cat: 'board', name: '수묵화 판', price: null, ach: 'j12_20', desc: '먹으로만 그린 판', art: { theme: 'ink' } },
  { id: 'b_autumn', cat: 'board', name: '단풍 판', price: null, ach: 'j12try', desc: '붉게 물든 가을 판', art: { theme: 'autumn' } },
  { id: 'b_hell', cat: 'board', name: '지옥불 판', price: null, ach: 'f_brawl', desc: '난타전이 벌어진 불지옥', art: { theme: 'hell' } },

  // ---------------- 이동 잔상 (말이 지나간 자리에 남는 효과) ----------------
  { id: 'tr_none', cat: 'trail', name: '잔상 없음', price: 0, desc: '아무것도 안 남김', art: {} },
  { id: 'tr_heart', cat: 'trail', name: '하트 뿅뿅', price: 60, desc: '지나간 자리에 하트가 뿅뿅', art: { kind: 'emoji', em: '💖' } },
  { id: 'tr_music', cat: 'trail', name: '음표', price: 60, desc: '걸을 때마다 음표가 흘러나옴', art: { kind: 'emoji', em: '🎵' } },
  { id: 'tr_leaf', cat: 'trail', name: '나뭇잎', price: 50, desc: '바람에 나뭇잎이 날림', art: { kind: 'emoji', em: '🍃' } },
  { id: 'tr_snow', cat: 'trail', name: '눈발', price: 50, desc: '지나간 자리에 눈이 흩날림', art: { kind: 'emoji', em: '❄️' } },
  { id: 'tr_comet', cat: 'trail', name: '혜성 꼬리', price: 90, desc: '빛나는 꼬리를 길게 끌며 이동', art: { kind: 'comet' } },
  { id: 'tr_rainbow', cat: 'trail', name: '무지개 길', price: 120, desc: '지나간 길이 무지개로 물듦', art: { kind: 'rainbow' } },
  { id: 'tr_clover', cat: 'trail', name: '네잎클로버', price: null, ach: 'mo100', desc: '모를 부르는 행운의 잎', art: { kind: 'emoji', em: '🍀' } },
  { id: 'tr_banana', cat: 'trail', name: '바나나 껍질', price: null, ach: 'f_nakwin', desc: '미끄러져도 1등, 바나나 껍질을 흘림', art: { kind: 'emoji', em: '🍌' } },
  { id: 'tr_ghost', cat: 'trail', name: '분신술', price: null, ach: 'capmulti', desc: '지나간 자리에 내 말 잔상이 남음', art: { kind: 'ghost' } },
  { id: 'tr_star', cat: 'trail', name: '별똥별', price: null, ach: 'mo3', desc: '별이 줄줄이 떨어짐', art: { kind: 'emoji', em: '⭐' } },
  { id: 'tr_spark', cat: 'trail', name: '반짝이', price: null, ach: 'yut4', desc: '반짝이 가루가 흩날림', art: { kind: 'emoji', em: '✨' } },
  { id: 'tr_petal', cat: 'trail', name: '꽃길', price: null, ach: 'flawless', desc: '지나간 길에 꽃잎이 깔림', art: { kind: 'emoji', em: '🌸' } },
  { id: 'tr_fire', cat: 'trail', name: '불길', price: null, ach: 'comeback', desc: '지나간 자리가 활활', art: { kind: 'emoji', em: '🔥' } },
  { id: 'tr_coin', cat: 'trail', name: '돈길', price: null, ach: 'rich', desc: '엽전을 뿌리며 이동', art: { kind: 'emoji', em: '🪙' } },
  { id: 'tr_skull', cat: 'trail', name: '해골길', price: null, ach: 'f_lost4', desc: '지나간 자리에 해골이 굴러다님', art: { kind: 'emoji', em: '💀' } },
  { id: 'tr_ink', cat: 'trail', name: '먹물 발자국', price: null, ach: 'f_backshort', desc: '먹물이 뚝뚝 번짐', art: { kind: 'ink' } },
  { id: 'tr_bubble', cat: 'trail', name: '참기름 방울', price: null, ach: 'f_oil', desc: '손에 묻은 기름이 방울방울', art: { kind: 'emoji', em: '🫧' } },
  { id: 'tr_bolt', cat: 'trail', name: '번개길', price: null, ach: 'f_heavenhell', desc: '지나갈 때마다 번쩍번쩍', art: { kind: 'emoji', em: '⚡' } },

  // ---------------- 펫 (내 말 옆에 따라다님) ----------------
  { id: 'pet_none', cat: 'pet', name: '펫 없음', price: 0, desc: '혼자 다님', art: {} },
  { id: 'pet_dog', cat: 'pet', name: '강아지', price: 60, desc: '꼬리 치며 졸졸 따라오는 강아지', art: { em: '🐶', move: 'hop' } },
  { id: 'pet_rabbit', cat: 'pet', name: '토끼', price: 60, desc: '깡총깡총 옥토끼', art: { em: '🐰', move: 'hop' } },
  { id: 'pet_penguin', cat: 'pet', name: '펭귄', price: 70, desc: '뒤뚱뒤뚱 펭귄', art: { em: '🐧', move: 'side' } },
  { id: 'pet_panda', cat: 'pet', name: '판다', price: 80, desc: '대나무 씹으며 따라오는 판다', art: { em: '🐼', move: 'sway' } },
  { id: 'pet_tiger', cat: 'pet', name: '아기 호랑이', price: 100, desc: '어흥 하는 새끼 호랑이', art: { em: '🐯', move: 'hop' } },
  { id: 'pet_unicorn', cat: 'pet', name: '유니콘', price: 150, desc: '무지갯빛으로 날아다니는 유니콘', art: { em: '🦄', move: 'fly', glow: 1 } },
  { id: 'pet_chick', cat: 'pet', name: '병아리', price: null, ach: 'win1', desc: '첫 승리 기념, 종종종 따라옴', art: { em: '🐥', move: 'hop' } },
  { id: 'pet_cat', cat: 'pet', name: '고양이', price: null, ach: 'win10', desc: '말 옆에서 꼬리 흔드는 고양이', art: { em: '🐈', move: 'sway' } },
  { id: 'pet_dragon', cat: 'pet', name: '아기 용', price: null, ach: 'win100', desc: '윷신을 지키는 아기 용, 둥실둥실', art: { em: '🐉', move: 'fly' } },
  { id: 'pet_owl', cat: 'pet', name: '부엉이', price: null, ach: 'games100', desc: '백 판을 지켜본 부엉이', art: { em: '🦉', move: 'sway' } },
  { id: 'pet_fox', cat: 'pet', name: '여우', price: null, ach: 'streak5', desc: '파죽지세 여우, 깡총깡총', art: { em: '🦊', move: 'hop' } },
  { id: 'pet_bat', cat: 'pet', name: '박쥐', price: null, ach: 'cap300', desc: '사냥꾼 곁을 맴도는 박쥐', art: { em: '🦇', move: 'fly' } },
  { id: 'pet_crab', cat: 'pet', name: '꽃게', price: null, ach: 'backcap', desc: '옆으로… 아니 뒤로 걷는 게', art: { em: '🦀', move: 'side' } },
  { id: 'pet_ghost', cat: 'pet', name: '원혼', price: null, ach: 'f_nemesis', desc: '원수를 잊지 않는 유령', art: { em: '👻', move: 'fly' } },
  { id: 'pet_hamster', cat: 'pet', name: '먹방 햄스터', price: null, ach: 'f_mukbang', desc: '볼 빵빵하게 잡아먹는 햄스터', art: { em: '🐹', move: 'hop' } },
  { id: 'pet_snail', cat: 'pet', name: '달팽이', price: null, ach: 'f_zero', desc: '말 하나도 못 낸 자의 친구', art: { em: '🐌', move: 'side' } },
  { id: 'pet_turtle', cat: 'pet', name: '거북이', price: null, ach: 'f_turtle', desc: '느려도 끝까지 따라옴', art: { em: '🐢', move: 'side' } },
  { id: 'pet_parrot', cat: 'pet', name: '앵무새', price: null, ach: 'f_chatter', desc: '수다쟁이 곁엔 앵무새', art: { em: '🦜', move: 'fly' } },
  { id: 'pet_cow', cat: 'pet', name: '황소', price: null, ach: 'yut300', desc: '윷(소)을 300번 부른 자의 황소', art: { em: '🐂', move: 'side' } },
  { id: 'pet_sloth', cat: 'pet', name: '나무늘보', price: null, ach: 'f_plain', desc: '아무도 안 잡고 느긋하게 이긴 평화주의자', art: { em: '🦥', move: 'sway' } },
  { id: 'pet_shrimp', cat: 'pet', name: '새우', price: null, ach: 'f_shrimp', desc: '뒷걸음질 전문가', art: { em: '🦐', move: 'side' } },
  { id: 'pet_pig', cat: 'pet', name: '저금통 돼지', price: null, ach: 'f_charger', desc: '충전할 때마다 배가 불렀던 돼지', art: { em: '🐷', move: 'hop' } },

  // ---------------- 말 테두리 ----------------
  { id: 'fr_none', cat: 'frame', name: '테두리 없음', price: 0, desc: '기본', art: {} },
  { id: 'fr_stone', cat: 'frame', name: '돌담 테', price: 40, desc: '벽돌을 쌓아 만든 네모 담장', art: { fr: 'stone' } },
  { id: 'fr_flower', cat: 'frame', name: '꽃 테', price: 50, desc: '꽃잎 여덟 장이 둘러싼 테', art: { fr: 'flower' } },
  { id: 'fr_cat', cat: 'frame', name: '고양이 귀', price: 60, desc: '쫑긋한 귀에 수염까지', art: { fr: 'cat' } },
  { id: 'fr_laurel', cat: 'frame', name: '월계관', price: 60, desc: '승리자의 잎사귀 관', art: { fr: 'laurel' } },
  { id: 'fr_ice', cat: 'frame', name: '얼음 결정', price: 70, desc: '여덟 갈래 눈꽃 결정', art: { fr: 'ice' } },
  { id: 'fr_thorn', cat: 'frame', name: '가시덩굴', price: 80, desc: '붉은 가시가 돋은 덩굴', art: { fr: 'thorn' } },
  { id: 'fr_star', cat: 'frame', name: '별 테', price: 90, desc: '천천히 도는 커다란 별', art: { fr: 'star' } },
  { id: 'fr_devil', cat: 'frame', name: '악마 뿔', price: 100, desc: '뿔 두 개에 살랑대는 꼬리', art: { fr: 'devil' } },
  { id: 'fr_wing', cat: 'frame', name: '천사 날개', price: 120, desc: '파닥이는 날개와 머리 위 고리', art: { fr: 'wing' } },
  { id: 'fr_fire', cat: 'frame', name: '불꽃 테', price: 120, desc: '도트 불길이 일렁일렁', art: { fr: 'fire' } },
  { id: 'fr_skull', cat: 'frame', name: '해골 테', price: null, ach: 'cap1000', desc: '잡은 말 1,000개의 해골이 빙 둘러섬', art: { fr: 'skull' } },
  { id: 'fr_sun', cat: 'frame', name: '태양 테', price: null, ach: 'four3', desc: '열두 갈래 햇살이 천천히 돎', art: { fr: 'sun' } },
  { id: 'fr_jang', cat: 'frame', name: '장기알 테', price: null, ach: 'j12_50', desc: '팔각 장기알 나무 테', art: { fr: 'jang' } },
  { id: 'fr_crown', cat: 'frame', name: '왕관', price: 150, desc: '보석 박힌 황금 왕관', art: { fr: 'crown' } },

  // ---------------- 네임 카드 (게임 화면의 내 이름표) ----------------
  { id: 'nc_none', cat: 'card', name: '기본 이름표', price: 0, desc: '기본', art: {} },
  { id: 'nc_hanji', cat: 'card', name: '한지 이름표', price: 40, desc: '은은한 한지 결', art: { nc: 'hanji' } },
  { id: 'nc_night', cat: 'card', name: '밤하늘 이름표', price: 60, desc: '별이 반짝이는 밤하늘', art: { nc: 'night' } },
  { id: 'nc_sakura', cat: 'card', name: '벚꽃 이름표', price: 60, desc: '꽃잎이 흩날리는 분홍빛', art: { nc: 'sakura' } },
  { id: 'nc_gold', cat: 'card', name: '황금 이름표', price: 100, desc: '빛이 스쳐 지나가는 금박', art: { nc: 'gold' } },
  { id: 'nc_neon', cat: 'card', name: '네온 이름표', price: 120, desc: '사이버펑크 네온사인', art: { nc: 'neon' } },
  { id: 'nc_scroll', cat: 'card', name: '고서 이름표', price: null, ach: 'games300', desc: '양쪽이 말린 낡은 두루마리', art: { nc: 'scroll' } },
  { id: 'nc_pumpkin', cat: 'card', name: '호박 이름표', price: null, ach: 'gonu50', desc: '호박 줄무늬에 호박등이 둥실', art: { nc: 'pumpkin' } },
  { id: 'nc_tycoon', cat: 'card', name: '금괴 이름표', price: null, ach: 'rich2', desc: '금괴가 쌓이고 엽전이 쏟아짐', art: { nc: 'tycoon' } },
  { id: 'nc_dragon', cat: 'card', name: '청룡 이름표', price: 180, desc: '용이 휘감은 오색 이름표', art: { nc: 'dragon' } },
];
const byId = id => ITEMS.find(x => x.id === id);
const DEFAULT_OWNED = ITEMS.filter(x => x.price === 0).map(x => x.id);
const BUYABLE = ITEMS.filter(x => x.price > 0).map(x => x.id);   // 수집가 업적 기준
const DEFAULT_EQUIP = { piece: 'p_basic', stick: 's_basic', board: 'b_hanji', trail: 'tr_none', pet: 'pet_none', frame: 'fr_none', card: 'nc_none' };
// 잡을 때 조롱 한 줄 (말 아이템 기준)
function tauntFor(pieceId, victim) {
  const it = byId(pieceId) || byId('p_basic');
  const list = it.taunts && it.taunts.length ? it.taunts : byId('p_basic').taunts;
  return list[Math.floor(Math.random() * list.length)].replace(/\{n\}/g, victim);
}
module.exports = { ITEMS, byId, DEFAULT_OWNED, DEFAULT_EQUIP, BUYABLE, tauntFor };
