// 아주 간단한 파일 저장소 (Railway 볼륨에 db.json으로 저장)
const fs = require('fs');
const playstats = require('./playstats');
const path = require('path');
const crypto = require('crypto');

const START_ASSETS = 1e9;   // 초기 자산 10억
const ENTRY_FEE = 1e8;      // 토너먼트 참가비 1억

const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DIR, { recursive: true });
const FILE = path.join(DIR, 'db.json');

// 이 숫자를 올리면 다음 배포 때 모든 계정이 한 번 초기화됨
// (또는 Railway 변수 RESET_ID 값을 새로 바꾸면 그때도 한 번 초기화됨)
const DATA_VERSION = 4;
const RESET_ID = process.env.RESET_ID || '';
const SHAME_MS = 24 * 60 * 60 * 1000; // 충전 후 좃밥 유지 시간
const DAILY_BAILOUTS = 3;
const BAILOUT_AMOUNT = 3e8;
const TROPHY_RATE = 1e8;                 // 트로피 1개 = 1억              // 충전 1회 금액 3억
const RANK_MIN_RATIO = 0.7;             // 평균 순위 랭킹 자격: 전체 유저 평균 토너 참가 수의 70% (소수점 버림)              // 하루 충전 한도 (한국 날짜 기준)

let data = { users: {}, sessions: {} };
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* 첫 실행 */ }
if (data.version !== DATA_VERSION || (RESET_ID && data.resetId !== RESET_ID)) {
  console.log(`데이터 초기화 (버전 ${data.version || 1} → ${DATA_VERSION}${RESET_ID ? ', RESET_ID ' + RESET_ID : ''})`);
  data = { version: DATA_VERSION, resetId: RESET_ID, users: {}, sessions: {} };
}
data.users = data.users || {};
data.sessions = data.sessions || {};
const byIdMap = new Map();
for (const u of Object.values(data.users)) byIdMap.set(u.id, u);

// 서버가 꺼졌다 켜졌을 때: 테이블에 있던 돈과 쓰던 티켓 되돌려주기
for (const u of Object.values(data.users)) {
  if (u.inPlay) { u.assets += u.inPlay; u.inPlay = 0; }
  if (u.bjHold) { u.assets += u.bjHold; u.bjHold = 0; } // 블랙잭 하던 판 베팅금 환불
  // 이전 버전 티켓은 돈으로 환불
  if (u.tickets) { u.assets += u.tickets * ENTRY_FEE; u.tickets = 0; }
  if (u.tourneyHold) { u.assets += u.tourneyHold < 1e6 ? u.tourneyHold * ENTRY_FEE : u.tourneyHold; u.tourneyHold = 0; }
  u.stats.placeSum = u.stats.placeSum || 0;
  u.stats.bailouts = u.stats.bailouts || 0;
  u.bailoutLog = u.bailoutLog || [];
}

// 지난 찹 대회 소급 반영 — 예전엔 1위/2위로 기록됐던 걸 둘 다 1.5위·우승으로 고침
// Railway 변수 CHOP_FIX="1위이름>2위이름;1위이름>2위이름" (각 항목은 한 번만 적용)
data.appliedFixes = data.appliedFixes || [];
for (const item of (process.env.CHOP_FIX || '').split(';').map(x => x.trim()).filter(Boolean)) {
  if (data.appliedFixes.includes(item)) continue;
  const [n1, n2] = item.split('>').map(x => x.trim().toLowerCase());
  const u1 = data.users[n1], u2 = data.users[n2];
  if (!u1 || !u2) { console.log(`찹 소급: 계정 없음 → ${item}`); continue; }
  u1.stats.placeSum += 0.5;   // 1위 → 1.5위
  u2.stats.placeSum -= 0.5;   // 2위 → 1.5위
  u2.stats.tWins += 1;        // 2위도 우승 1회
  u2.trophies = (u2.trophies || 0) + 1;
  data.appliedFixes.push(item);
  console.log(`찹 소급 적용: ${item}`);
}

// 스킨: 🏆 = 우승할 때마다 1개. 처음 한 번은 지금까지 우승 횟수만큼 지급
const Shop = require('./public/shop.js');
for (const u of Object.values(data.users)) {
  if (u.trophies == null) u.trophies = u.stats.tWins || 0;
  u.owned = u.owned || [];
  u.equip = u.equip || {};
}
// 한 번만: 예전 테두리(금테·불꽃·얼음·무지개·다이아) 회수하고 산 가격만큼 트로피 환불
const OLD_FRAMES = { f_gold: 3, f_fire: 5, f_ice: 5, f_rainbow: 10, f_diamond: 20 };
data.migrations = data.migrations || [];
if (!data.migrations.includes('refund-frames')) {
  for (const u of Object.values(data.users)) {
    const had = (u.owned || []).filter(id => OLD_FRAMES[id]);
    if (!had.length) continue;
    const refund = had.reduce((a, id) => a + OLD_FRAMES[id], 0);
    u.owned = u.owned.filter(id => !OLD_FRAMES[id]);
    if (u.equip && OLD_FRAMES[u.equip.frame]) delete u.equip.frame;
    u.trophies = (u.trophies || 0) + refund;
    console.log(`테두리 환불: ${u.username} ${had.join(',')} → 🏆 +${refund}`);
  }
  data.migrations.push('refund-frames');
}

// ===== 시즌 1 종료 → 시즌 2 시작 (한 번만) =====
// 시즌1 토너 평균 등수(참가 5회 이상) 1·2·3위에게 '시즌1 N위' 칭호, 전원 돈 10억으로 초기화
// 트로피·스킨·우승/참가/충전 기록은 그대로
if (!data.migrations.includes('season2')) {
  const ranked = Object.values(data.users)
    .filter(u => (u.stats.tPlayed || 0) >= 5)
    .sort((a, b) => a.stats.placeSum / a.stats.tPlayed - b.stats.placeSum / b.stats.tPlayed || b.stats.tPlayed - a.stats.tPlayed)
    .slice(0, 3);
  ranked.forEach((u, i) => {
    u.badge = `시즌1 ${i + 1}위`;
    console.log(`시즌1 ${i + 1}위: ${u.username} (평균 ${(u.stats.placeSum / u.stats.tPlayed).toFixed(2)}위, ${u.stats.tPlayed}회)`);
  });
  data.season1 = ranked.map((u, i) => ({ place: i + 1, username: u.username, avg: u.stats.placeSum / u.stats.tPlayed, played: u.stats.tPlayed }));
  for (const u of Object.values(data.users)) {
    // 시즌1 우승·참가 기록은 프로필 히스토리로 옮기고, 시즌2 기록은 0부터
    const st = u.stats;
    u.history = u.history || {};
    u.history.s1 = {
      wins: st.tWins || 0, played: st.tPlayed || 0,
      avg: st.tPlayed ? st.placeSum / st.tPlayed : null,
      place: ranked.indexOf(u) >= 0 ? ranked.indexOf(u) + 1 : null,
    };
    u.stats = { tWins: 0, tPlayed: 0, placeSum: 0, scoreSum: 0, scored: 0, bailouts: 0 };
    u.bailoutLog = [];          // 충전 기록 삭제 (좃밥 딱지도 해제)
    u.assets = START_ASSETS; u.inPlay = 0; u.tourneyHold = 0;
  }
  console.log(`시즌 2 시작: 전원 ${START_ASSETS / 1e8}억으로 초기화 (${Object.keys(data.users).length}명)`);
  data.season = 2;
  data.migrations.push('season2');
}

// ===== 칭호: 상점 칭호 + 시즌/부문상 칭호 중 2개까지 골라 달기 =====
const MAX_TITLES = 2;
const isRankTitle = n => /^시즌\d+ \d위$/.test(n); // 시즌 순위 칭호는 금색 뱃지로 이름 앞에
// 가진 칭호 전체: { key, name }  (상점 칭호는 상품 id, 그 외는 'aw:이름')
// 시즌 칭호('시즌N …')는 기간 한정: 바로 다음 시즌 동안만 쓸 수 있음 (시즌2 칭호 → 시즌3 동안만)
const seasonTitleOk = n => { const m = /^시즌(\d+)/.exec(n); return !m || +m[1] === (data.season || 1) - 1; };
function titleList(u) {
  const out = [];
  for (const id of u.owned || []) { const it = Shop.byId(id); if (it && it.cat === 'title') out.push({ key: id, name: it.name }); }
  const aw = (u.badge ? [u.badge] : []).concat(u.awards || []);
  for (const n of aw) if (seasonTitleOk(n) && !out.some(t => t.name === n)) out.push({ key: 'aw:' + n, name: n });
  return out;
}
function equippedTitles(u) {
  const all = titleList(u);
  return ((u.equip || {}).titles || []).map(k => all.find(t => t.key === k)).filter(Boolean).slice(0, MAX_TITLES).map(t => t.name);
}
// 새로 받은 칭호: 빈 자리 있으면 바로 달아줌
function autoTitle(u, key) {
  u.equip = u.equip || {};
  const valid = titleList(u).map(x => x.key);
  const t = u.equip.titles = (u.equip.titles || []).filter(k => valid.includes(k)); // 기간 끝난 칭호는 자리 비움
  if (!t.includes(key) && t.length < MAX_TITLES) t.push(key);
}

const CF_DEFAULT = { mode: 'color', c1: '#e9c46a', c2: '#ff4d6d', style: 'grad', fx: 'glow', px: '', spd: 'mid' };
// ===== 프리셋 슬롯: 프로필 그림 / 커스텀 테두리를 여러 개 저장해두고 골라 쓰기 =====
const SLOT_PRICE = 5;   // 슬롯 1칸 = 🏆5
const MAX_SLOTS = 10;
function presets(u) {
  u.slots = u.slots || { av: 1, fr: 1 };
  if (!Array.isArray(u.avPresets)) u.avPresets = [u.avatar || ''];
  if (!Array.isArray(u.frPresets)) u.frPresets = [u.customFrame ? Object.assign({}, u.customFrame) : null];
  while (u.avPresets.length < u.slots.av) u.avPresets.push('');
  while (u.frPresets.length < u.slots.fr) u.frPresets.push(null);
  u.avSel = Math.min(u.avSel || 0, u.slots.av - 1);
  u.frSel = Math.min(u.frSel || 0, u.slots.fr - 1);
  return u;
}
const FRAME_PX = /^(?:[0-9a-f]{1024}){1,5}$/; // 커스텀 도트 테두리: 1~5프레임
function skinOf(u) {
  const e = u.equip || {};
  const tt = equippedTitles(u);
  const rank = tt.filter(isRankTitle), other = tt.filter(n => !isRankTitle(n));
  return {
    frame: e.frame || null, back: e.back || null, title: other.length ? other.join(' · ') : null, fx: e.fx || null,
    cf: e.frame === 'f_custom' ? Object.assign({}, CF_DEFAULT, u.customFrame) : null,
    badge: rank.length ? rank.join(' · ') : null,
    aura: e.aura || null, sdfx: e.sdfx || null, enter: e.enter || null,
  };
}

// 한 번만: 예전 규칙(10억까지 채워줌)으로 충전했던 사람은 충전 1회당 5억 회수 (0원 밑으로는 안 내려감)
data.migrations = data.migrations || [];
if (!data.migrations.includes('bailout-5억')) {
  for (const u of Object.values(data.users)) {
    const n = u.stats.bailouts || 0;
    if (!n) continue;
    const before = u.assets;
    u.assets = Math.max(0, u.assets - n * 5e8);
    console.log(`충전 회수: ${u.username} 충전 ${n}회 → ${(before - u.assets) / 1e8}억 차감`);
  }
  data.migrations.push('bailout-5억');
}

// 관리자 지급: Railway 변수 GIVE="키|닉네임|금액;키|닉네임|금액" — 같은 키는 한 번만 지급 (금액은 원 단위, 음수면 차감)
data.gives = data.gives || [];
for (const item of (process.env.GIVE || '').split(';').map(x => x.trim()).filter(Boolean)) {
  const [key, name, amt] = item.split('|').map(x => (x || '').trim());
  if (!key || data.gives.includes(key)) continue;
  const u = data.users[String(name).toLowerCase()];
  const n = Math.round(Number(amt));
  if (!u || !Number.isFinite(n)) { console.log(`지급 실패(계정/금액 확인): ${item}`); continue; }
  u.assets = Math.max(0, u.assets + n);
  data.gives.push(key);
  console.log(`지급: ${u.username} ${n >= 0 ? '+' : ''}${n / 1e8}억 (키 ${key})`);
}

// 관리자 트로피 지급: Railway 변수 TROPHY="키|닉네임|개수;..." — 같은 키는 한 번만
for (const item of (process.env.TROPHY || '').split(';').map(x => x.trim()).filter(Boolean)) {
  const [key, name, cnt] = item.split('|').map(x => (x || '').trim());
  const k = 'trophy:' + key;
  if (!key || data.gives.includes(k)) continue;
  const u = data.users[String(name).toLowerCase()];
  const n = Math.round(Number(cnt));
  if (!u || !Number.isFinite(n)) { console.log(`트로피 지급 실패(계정/개수 확인): ${item}`); continue; }
  u.trophies = Math.max(0, (u.trophies || 0) + n);
  data.gives.push(k);
  console.log(`트로피 지급: ${u.username} ${n >= 0 ? '+' : ''}${n}개 (키 ${key})`);
}

const kstDay = t => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
// 최근 24시간 충전 횟수 → 1 좃밥 / 2 좃좃밥 / 3 걍접으셈
function shameLevel(u) {
  const now = Date.now();
  return Math.min(3, (u.bailoutLog || []).filter(t => now - t < SHAME_MS).length);
}
function shameUntil(u) {
  const log = u.bailoutLog || [];
  return log.length ? Math.max(...log) + SHAME_MS : 0;
}
function bailoutsToday(u) {
  const today = kstDay(Date.now());
  return (u.bailoutLog || []).filter(t => kstDay(t) === today).length;
}

let timer = null;
function save() {
  if (timer) return;
  timer = setTimeout(flush, 400);
}
function flush() {
  clearTimeout(timer);
  timer = null;
  const tmp = FILE + '.tmp';
  data.version = DATA_VERSION;
  data.resetId = RESET_ID;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { flush(); } catch {} process.exit(0); });
save();

function hashPw(pw, salt) {
  return crypto.scryptSync(pw, salt, 32).toString('hex');
}

function randomAvatar() {
  const pal = ['3', '5', '7', '9', 'b', 'd', 'e', '4', '6', 'a', 'c'];
  const main = pal[crypto.randomInt(pal.length)];
  let sub = pal[crypto.randomInt(pal.length)];
  if (sub === main) sub = '2';
  const px = new Array(256).fill('0');
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 8; x++) {
      const r = crypto.randomInt(10);
      const v = r < 5 ? main : r < 7 ? sub : '0';
      px[y * 16 + x] = v;
      px[y * 16 + (15 - x)] = v;
    }
  }
  // 눈
  for (const [x, y] of [[5, 6], [10, 6]]) { px[y * 16 + x] = 'f'; px[(y + 1) * 16 + x] = '1'; }
  return px.join('');
}

// ===== 칭호 2개 장착으로 바뀜 (한 번만): 예전 시즌 칭호 + 장착 칭호를 새 목록으로 옮김 =====
if (!data.migrations.includes('titles2')) {
  for (const u of Object.values(data.users)) {
    u.equip = u.equip || {};
    const t = [];
    if (u.badge) t.push('aw:' + u.badge);
    if (u.equip.title) t.push(u.equip.title);
    u.equip.titles = t.slice(0, MAX_TITLES);
    delete u.equip.title;
  }
  data.migrations.push('titles2');
}

// ===== 커스텀 도트 테두리 24x24(원형) → 32x32(네모) 변환 (한 번만) =====
if (!data.migrations.includes('frame32')) {
  const oldMask = (x, y) => { const d = Math.hypot(x + .5 - 12, y + .5 - 12); return d > 8.6 && d <= 12.2; };
  for (const u of Object.values(data.users)) {
    const px = u.customFrame && u.customFrame.px;
    if (!/^[0-9a-f]{576}$/.test(px || '')) continue;
    let out = '';
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const ox = Math.floor(x * 24 / 32), oy = Math.floor(y * 24 / 32);
      out += oldMask(ox, oy) ? px[oy * 24 + ox] : '0';
    }
    u.customFrame.px = out;
    console.log(`커스텀 테두리 변환: ${u.username}`);
  }
  data.migrations.push('frame32');
}

// ===== 시즌 2 종료 정산 → 시즌 3 시작 (한 번만) =====
if (!data.migrations.includes('season3')) {
  data.season = 3; // 먼저 올려야 시즌1 칭호가 빠지고 새 시즌2 칭호가 빈 자리에 달림
  const users = Object.values(data.users);
  const tp = u => u.stats.tPlayed || 0;
  // 랭킹 자격: 전체 평균 토너 참가 수의 70% (소수점 버림) — 랭킹 화면과 같은 기준
  const minT = users.length ? Math.floor(users.reduce((n, u) => n + tp(u), 0) / users.length * RANK_MIN_RATIO) : 0;
  const elig = users.filter(u => tp(u) >= minT);
  const score = u => u.stats.scoreSum / u.stats.scored;
  const rate = (a, b) => (b ? (a || 0) / b : 0);
  const s2 = new Map(users.map(u => [u, { wins: u.stats.tWins || 0, played: tp(u), score: u.stats.scored ? score(u) : null, total: total(u), awards: [] }]));
  const log = [];
  function give(u, label, { title, item, trophies = 0 }) {
    if (title) { u.awards = u.awards || []; if (!u.awards.includes(title)) u.awards.push(title); autoTitle(u, 'aw:' + title); }
    if (item) { u.owned = u.owned || []; if (!u.owned.includes(item)) u.owned.push(item); }
    u.trophies = (u.trophies || 0) + trophies;
    s2.get(u).awards.push(label);
    log.push(`${label}: ${u.username}${title ? ` [${title}]` : ''}${item ? ` +${item}` : ''}${trophies ? ` 🏆+${trophies}` : ''}`);
  }
  // 1) 토너 점수 1~3위
  const byScore = elig.filter(u => u.stats.scored > 0).sort((a, b) => score(a) - score(b) || tp(b) - tp(a)).slice(0, 3);
  const SR = [{ title: '시즌2 1위', item: 's2_champ', trophies: 10 }, { title: '시즌2 2위', trophies: 6 }, { title: '시즌2 3위', trophies: 3 }];
  byScore.forEach((u, i) => { s2.get(u).scoreRank = i + 1; give(u, `토너 점수 ${i + 1}위`, SR[i]); });
  // 2) 총 자산 1~3위
  const byAssets = elig.slice().sort((a, b) => total(b) - total(a)).slice(0, 3);
  const AR = [{ title: '시즌2 재벌', item: 's2_gold' }, { trophies: 3 }, { trophies: 2 }];
  byAssets.forEach((u, i) => { s2.get(u).assetRank = i + 1; give(u, `총 자산 ${i + 1}위`, AR[i]); });
  // 3) 부문상 1~3위 (1위 칭호 + 🏆3, 2위 🏆2, 3위 🏆1)
  const AWARDS = [
    { title: '우승 머신', ok: u => (u.stats.tWins || 0) > 0, val: u => (u.stats.tWins || 0) - tp(u) / 1e6 },
    { title: '올인왕', ok: u => (u.play || {}).hands >= 10 && u.play.allin > 0, val: u => rate(u.play.allin, u.play.hands) },
    { title: '쫄보왕', ok: u => (u.play || {}).fr >= 5 && u.play.ffr > 0, val: u => rate(u.play.ffr, u.play.fr) },
    { title: '블러핑왕', ok: u => (u.play || {}).sdb >= 3 && u.play.bluff > 0, val: u => rate(u.play.bluff, u.play.sdb) },
    { title: '기부천사', ok: u => (u.stats.bailouts || 0) > 0, val: u => u.stats.bailouts },
  ];
  for (const a of AWARDS) {
    users.filter(a.ok).sort((x, y) => a.val(y) - a.val(x)).slice(0, 3)
      .forEach((u, i) => give(u, `${a.title} ${i + 1}위`, i === 0 ? { title: a.title, trophies: 3 } : { trophies: 3 - i }));
  }
  // 4) 참가 보상: 랭킹 자격 채운 사람 전원
  for (const u of elig) if (tp(u) >= Math.max(1, minT)) give(u, '시즌2 참가', { title: '시즌2 참가', trophies: 1 });
  log.forEach(x => console.log('시즌2 보상 · ' + x));

  data.season2 = { minTourneys: minT, score: byScore.map(u => u.username), assets: byAssets.map(u => u.username) };
  for (const u of users) {
    u.history = u.history || {};
    u.history.s2 = s2.get(u);
    u.stats = { tWins: 0, tPlayed: 0, placeSum: 0, scoreSum: 0, scored: 0, bailouts: 0 };
    u.play = {};               // 플레이 성향도 시즌3부터 새로
    u.bailoutLog = [];
    u.assets = START_ASSETS; u.inPlay = 0; u.tourneyHold = 0;
  }
  data.season = 3;
  data.migrations.push('season3');
  console.log(`시즌 3 시작: 전원 ${START_ASSETS / 1e8}억으로 초기화 (${users.length}명, 랭킹 자격 ${minT}회)`);
  save();
}

// ===== 시즌 3 종료 정산 → 시즌 4 시작 (한 번만) =====
if (!data.migrations.includes('season4')) {
  data.season = 4; // 먼저 올려야 시즌2 칭호가 빠지고 새 시즌3 칭호가 빈 자리에 달림
  const users = Object.values(data.users);
  const tp = u => u.stats.tPlayed || 0;
  // 랭킹 자격: 전체 평균 토너 참가 수의 70% (소수점 버림) — 랭킹 화면과 같은 기준
  const minT = users.length ? Math.floor(users.reduce((n, u) => n + tp(u), 0) / users.length * RANK_MIN_RATIO) : 0;
  const elig = users.filter(u => tp(u) >= minT);
  const score = u => u.stats.scoreSum / u.stats.scored;
  const rate = (a, b) => (b ? (a || 0) / b : 0);
  const s2 = new Map(users.map(u => [u, { wins: u.stats.tWins || 0, played: tp(u), score: u.stats.scored ? score(u) : null, total: total(u), awards: [] }]));
  const log = [];
  function give(u, label, { title, item, trophies = 0 }) {
    if (title) { u.awards = u.awards || []; if (!u.awards.includes(title)) u.awards.push(title); autoTitle(u, 'aw:' + title); }
    if (item) { u.owned = u.owned || []; if (!u.owned.includes(item)) u.owned.push(item); }
    u.trophies = (u.trophies || 0) + trophies;
    s2.get(u).awards.push(label);
    log.push(`${label}: ${u.username}${title ? ` [${title}]` : ''}${item ? ` +${item}` : ''}${trophies ? ` 🏆+${trophies}` : ''}`);
  }
  // 1) 토너 점수 1~3위
  const byScore = elig.filter(u => u.stats.scored > 0).sort((a, b) => score(a) - score(b) || tp(b) - tp(a)).slice(0, 3);
  const SR = [{ title: '시즌3 1위', item: 's3_champ', trophies: 10 }, { title: '시즌3 2위', trophies: 6 }, { title: '시즌3 3위', trophies: 3 }];
  byScore.forEach((u, i) => { s2.get(u).scoreRank = i + 1; give(u, `토너 점수 ${i + 1}위`, SR[i]); });
  // 2) 총 자산 1~3위
  const byAssets = elig.slice().sort((a, b) => total(b) - total(a)).slice(0, 3);
  const AR = [{ title: '시즌3 재벌', item: 's3_gold' }, { trophies: 3 }, { trophies: 2 }];
  byAssets.forEach((u, i) => { s2.get(u).assetRank = i + 1; give(u, `총 자산 ${i + 1}위`, AR[i]); });
  // 3) 부문상 1~3위 (1위 칭호 + 🏆3, 2위 🏆2, 3위 🏆1)
  const AWARDS = [
    { title: '우승 머신', ok: u => (u.stats.tWins || 0) > 0, val: u => (u.stats.tWins || 0) - tp(u) / 1e6 },
    { title: '올인왕', ok: u => (u.play || {}).hands >= 10 && u.play.allin > 0, val: u => rate(u.play.allin, u.play.hands) },
    { title: '쫄보왕', ok: u => (u.play || {}).fr >= 5 && u.play.ffr > 0, val: u => rate(u.play.ffr, u.play.fr) },
    { title: '블러핑왕', ok: u => (u.play || {}).sdb >= 3 && u.play.bluff > 0, val: u => rate(u.play.bluff, u.play.sdb) },
    { title: '기부천사', ok: u => (u.stats.bailouts || 0) > 0, val: u => u.stats.bailouts },
  ];
  for (const a of AWARDS) {
    users.filter(a.ok).sort((x, y) => a.val(y) - a.val(x)).slice(0, 3)
      .forEach((u, i) => give(u, `${a.title} ${i + 1}위`, i === 0 ? { title: a.title, trophies: 3 } : { trophies: 3 - i }));
  }
  // 4) 참가 보상: 랭킹 자격 채운 사람 전원
  for (const u of elig) if (tp(u) >= Math.max(1, minT)) give(u, '시즌3 참가', { title: '시즌3 참가', trophies: 1 });
  log.forEach(x => console.log('시즌3 보상 · ' + x));

  data.season3 = { minTourneys: minT, score: byScore.map(u => u.username), assets: byAssets.map(u => u.username) };
  for (const u of users) {
    u.history = u.history || {};
    u.history.s3 = s2.get(u);
    u.stats = { tWins: 0, tPlayed: 0, placeSum: 0, scoreSum: 0, scored: 0, bailouts: 0 };
    u.play = {};               // 플레이 성향도 시즌4부터 새로
    u.bailoutLog = [];
    u.assets = START_ASSETS; u.inPlay = 0; u.tourneyHold = 0;
  }
  data.season = 4;
  data.migrations.push('season4');
  console.log(`시즌 4 시작: 전원 ${START_ASSETS / 1e8}억으로 초기화 (${users.length}명, 랭킹 자격 ${minT}회)`);
  save();
}

function pub(u) {
  return {
    id: u.id,
    username: u.username,
    assets: u.assets,
    inPlay: u.inPlay,
    shame: shameLevel(u),
    shameUntil: shameUntil(u),
    bailoutsToday: bailoutsToday(u),
    bailoutLimit: DAILY_BAILOUTS,
    bailoutAmount: BAILOUT_AMOUNT,
    trophyRate: TROPHY_RATE,
    avatar: u.avatar,
    stats: u.stats,
    play: playstats.summary(u),
    total: total(u),
    trophies: u.trophies || 0,
    owned: u.owned || [],
    equip: u.equip || {},
    skin: skinOf(u),
    customFrame: Object.assign({}, CF_DEFAULT, u.customFrame),
    slots: presets(u).slots, avPresets: u.avPresets, frPresets: u.frPresets.map(c => c && Object.assign({}, CF_DEFAULT, c)),
    avSel: u.avSel, frSel: u.frSel, slotPrice: SLOT_PRICE, maxSlots: MAX_SLOTS,
    history: u.history || {},
    titles: titleList(u),
    maxTitles: MAX_TITLES,
    season: data.season || 1,
    bj: u.bj || { hands: 0, win: 0, lose: 0, push: 0, bj: 0, net: 0 },
    seasonNew: (u.seenSeason || 0) < (data.season || 1), // 이번 시즌 시작 팝업을 아직 안 봤음
  };
}

function total(u) {
  return u.assets + u.inPlay; // 보유 현금 + 테이블 금액 (대회 참가비는 이미 상금풀로 들어간 돈)
}

module.exports = {
  START_ASSETS,
  ENTRY_FEE,
  DAILY_BAILOUTS,
  skinOf,
  // 프로필 그림 저장 (slot 칸에 저장하고 바로 사용)
  setAvatar(u, pixels, slot) {
    if (!/^[0-9a-f]{256}$/.test(String(pixels))) return { error: '잘못된 그림이에요' };
    presets(u);
    slot = Number.isInteger(slot) && slot >= 0 && slot < u.slots.av ? slot : u.avSel;
    u.avPresets[slot] = pixels;
    u.avSel = slot;
    u.avatar = pixels;
    save();
    return { ok: true };
  },
  // 저장해둔 칸 골라 쓰기
  useSlot(u, kind, slot) {
    presets(u);
    if (kind === 'av') {
      const p = u.avPresets[slot];
      if (!p) return { error: '빈 칸이에요 — 먼저 그려서 저장하세요' };
      u.avatar = p; u.avSel = slot;
    } else if (kind === 'fr') {
      const c = u.frPresets[slot];
      if (!c) return { error: '빈 칸이에요 — 먼저 꾸며서 저장하세요' };
      if (!(u.owned || []).includes('f_custom')) return { error: '커스텀 테두리를 먼저 사야 해요' };
      u.customFrame = Object.assign({}, c); u.frSel = slot; u.equip.frame = 'f_custom';
    } else return { error: '잘못된 종류예요' };
    save();
    return { ok: true };
  },
  // 칸 늘리기 (🏆5)
  buySlot(u, kind) {
    presets(u);
    if (!['av', 'fr'].includes(kind)) return { error: '잘못된 종류예요' };
    if (kind === 'fr' && !(u.owned || []).includes('f_custom')) return { error: '커스텀 테두리를 먼저 사야 해요' };
    if (u.slots[kind] >= MAX_SLOTS) return { error: `최대 ${MAX_SLOTS}칸까지예요` };
    if ((u.trophies || 0) < SLOT_PRICE) return { error: `🏆가 ${SLOT_PRICE - (u.trophies || 0)}개 부족해요` };
    u.trophies -= SLOT_PRICE;
    u.slots[kind]++;
    presets(u);
    save();
    return { ok: true, slot: u.slots[kind] - 1 };
  },
  seenSeason(u) { u.seenSeason = data.season || 1; save(); },
  setCustomFrame(u, cfg = {}) {
    if (!(u.owned || []).includes('f_custom')) return { error: '커스텀 테두리를 먼저 사야 해요' };
    const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    if (!hex(cfg.c1) || !hex(cfg.c2)) return { error: '색이 올바르지 않아요' };
    if (!['solid', 'grad', 'ring'].includes(cfg.style) || !['none', 'glow', 'pulse'].includes(cfg.fx)) return { error: '스타일이 올바르지 않아요' };
    const mode = cfg.mode === 'pixel' ? 'pixel' : 'color';
    const px = String(cfg.px || '');
    if (mode === 'pixel' && !FRAME_PX.test(px)) return { error: '도트 그림이 올바르지 않아요' };
    const spd = ['slow', 'mid', 'fast'].includes(cfg.spd) ? cfg.spd : 'mid';
    u.customFrame = { mode, c1: cfg.c1.toLowerCase(), c2: cfg.c2.toLowerCase(), style: cfg.style, fx: cfg.fx, px: FRAME_PX.test(px) ? px : '', spd };
    presets(u);
    const slot = Number.isInteger(cfg.slot) && cfg.slot >= 0 && cfg.slot < u.slots.fr ? cfg.slot : u.frSel;
    u.frPresets[slot] = Object.assign({}, u.customFrame);
    u.frSel = slot;
    u.equip.frame = 'f_custom';
    save();
    return { ok: true };
  },
  sellTrophy(u, n) {
    n = Math.floor(Number(n));
    if (!(n >= 1 && n <= 100)) return { error: '개수가 올바르지 않아요' };
    if ((u.trophies || 0) < n) return { error: `🏆가 ${n - (u.trophies || 0)}개 부족해요` };
    u.trophies -= n;
    u.assets += n * TROPHY_RATE;
    save();
    return { ok: true, amount: n * TROPHY_RATE };
  },
  buy(u, id) {
    const item = Shop.SHOP.find(x => x.id === id); // 업적·시즌 전용 보상은 못 삼
    if (!item) return { error: '없는 상품이에요' };
    if (u.owned.includes(id)) return { error: '이미 가지고 있어요' };
    if ((u.trophies || 0) < item.price) return { error: `🏆가 ${item.price - (u.trophies || 0)}개 부족해요` };
    u.trophies -= item.price;
    u.owned.push(id);
    if (item.cat === 'title') autoTitle(u, id); else u.equip[item.cat] = id; // 사면 바로 장착
    save();
    return { ok: true };
  },
  equip(u, cat, id, off) {
    if (!Shop.SLOTS[cat]) return { error: '잘못된 종류예요' };
    if (cat === 'title') {
      const t = u.equip.titles = (u.equip.titles || []).filter(k => titleList(u).some(x => x.key === k));
      if (off || !id) { u.equip.titles = id ? t.filter(k => k !== id) : []; save(); return { ok: true }; }
      if (!titleList(u).some(x => x.key === id)) return { error: '가지고 있지 않은 칭호예요' };
      if (t.includes(id)) return { ok: true };
      if (t.length >= MAX_TITLES) return { error: `칭호는 ${MAX_TITLES}개까지 달 수 있어요 — 하나 빼고 달아주세요` };
      t.push(id); save(); return { ok: true };
    }
    if (id && (!u.owned.includes(id) || Shop.byId(id).cat !== cat)) return { error: '가지고 있지 않아요' };
    if (id) u.equip[cat] = id; else delete u.equip[cat];
    save();
    return { ok: true };
  },
  shameLevel,
  bailoutsToday,
  bailout(u) {
    if (bailoutsToday(u) >= DAILY_BAILOUTS) return { error: `충전은 하루 ${DAILY_BAILOUTS}회까지예요. 내일 다시 오세요` };
    const amount = BAILOUT_AMOUNT;
    u.assets += amount;
    u.bailoutLog.push(Date.now());
    u.bailoutLog = u.bailoutLog.slice(-20);
    u.stats.bailouts++;
    save();
    require('./achievements.js').onBailout(u, bailoutsToday(u));
    return { ok: true, amount, level: shameLevel(u) };
  },
  save,
  flush,
  pub,
  register(username, password) {
    username = String(username || '').trim();
    password = String(password || '');
    if (!/^[가-힣a-zA-Z0-9_]{2,10}$/.test(username)) return { error: '닉네임은 한글/영문/숫자 2~10자로 해주세요' };
    if (password.length < 4) return { error: '비밀번호는 4자 이상으로 해주세요' };
    const key = username.toLowerCase();
    if (data.users[key]) return { error: '이미 있는 닉네임이에요' };
    const salt = crypto.randomBytes(16).toString('hex');
    const u = {
      id: crypto.randomUUID(),
      username,
      salt,
      hash: hashPw(password, salt),
      assets: START_ASSETS,
      inPlay: 0,
      tourneyHold: 0,
      bailoutLog: [],
      trophies: 0,
      owned: [],
      equip: {},
      avatar: randomAvatar(),
      stats: { tWins: 0, tPlayed: 0, placeSum: 0, bailouts: 0 },
      createdAt: Date.now(),
    };
    data.users[key] = u;
    byIdMap.set(u.id, u);
    const token = this.newSession(u);
    save();
    return { user: u, token };
  },
  login(username, password) {
    const u = data.users[String(username || '').trim().toLowerCase()];
    if (!u) return { error: '닉네임 또는 비밀번호가 틀렸어요' };
    const h = Buffer.from(hashPw(String(password || ''), u.salt), 'hex');
    if (!crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex'))) return { error: '닉네임 또는 비밀번호가 틀렸어요' };
    const token = this.newSession(u);
    save();
    return { user: u, token };
  },
  newSession(u) {
    const token = crypto.randomBytes(24).toString('hex');
    data.sessions[token] = u.id;
    return token;
  },
  logout(token) {
    delete data.sessions[token];
    save();
  },
  byToken(token) {
    const id = data.sessions[String(token || '')];
    return id ? byIdMap.get(id) : null;
  },
  byId(id) {
    return byIdMap.get(id);
  },
  ranking() {
    const all = [...byIdMap.values()].map(u => ({
      username: u.username, avatar: u.avatar, total: total(u), tWins: u.stats.tWins, tPlayed: u.stats.tPlayed, skin: skinOf(u),
      bailouts: u.stats.bailouts || 0, shame: shameLevel(u),
      avgPlace: u.stats.tPlayed ? u.stats.placeSum / u.stats.tPlayed : null,
      score: u.stats.scored ? u.stats.scoreSum / u.stats.scored : null,
      scored: u.stats.scored || 0,
      play: playstats.summary(u),
    }));
    // 자격 = (전체 유저 토너 참가 수 합 ÷ 유저 수) × 70%, 소수점 버림
    const minT = all.length ? Math.floor(all.reduce((n, u) => n + (u.tPlayed || 0), 0) / all.length * RANK_MIN_RATIO) : 0;
    return {
      // 충전 적은 순 → 같으면 총 자산 많은 순
      assets: all.filter(u => u.tPlayed >= minT).sort((a, b) => b.total - a.total).slice(0, 100),
      minTourneys: minT,
      // 토너 점수 낮은 순 (참가 자격 충족 + 점수 기록이 있는 사람)
      avg: all.filter(u => u.tPlayed >= minT && u.scored > 0).sort((a, b) => a.score - b.score || b.tPlayed - a.tPlayed).slice(0, 100),
    };
  },

};
