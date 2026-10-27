// 아주 간단한 파일 저장소 (Railway 볼륨에 db.json으로 저장)
const fs = require('fs');
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
const RANK_MIN_TOURNEYS = 5;            // 평균 순위 랭킹에 오르려면 토너먼트 5회 이상              // 하루 충전 한도 (한국 날짜 기준)

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
function skinOf(u) {
  const e = u.equip || {};
  return { frame: e.frame || null, back: e.back || null, title: e.title ? (Shop.byId(e.title) || {}).name || null : null, fx: e.fx || null };
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
    total: total(u),
    trophies: u.trophies || 0,
    owned: u.owned || [],
    equip: u.equip || {},
    skin: skinOf(u),
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
    const item = Shop.byId(id);
    if (!item) return { error: '없는 상품이에요' };
    if (u.owned.includes(id)) return { error: '이미 가지고 있어요' };
    if ((u.trophies || 0) < item.price) return { error: `🏆가 ${item.price - (u.trophies || 0)}개 부족해요` };
    u.trophies -= item.price;
    u.owned.push(id);
    u.equip[item.cat] = id; // 사면 바로 장착
    save();
    return { ok: true };
  },
  equip(u, cat, id) {
    if (!Shop.CATS[cat]) return { error: '잘못된 종류예요' };
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
    }));
    return {
      // 충전 적은 순 → 같으면 총 자산 많은 순
      bailouts: all.slice().sort((a, b) => a.bailouts - b.bailouts || b.total - a.total).slice(0, 100),
      minTourneys: RANK_MIN_TOURNEYS,
      avg: all.filter(u => u.tPlayed >= RANK_MIN_TOURNEYS).sort((a, b) => a.avgPlace - b.avgPlace || b.tPlayed - a.tPlayed).slice(0, 100),
    };
  },

};
