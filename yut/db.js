// 간단한 계정·자산 저장 (JSON 파일 · DATA_DIR 환경변수로 위치 지정)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SHOP = require('./shop');

const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'db.json');
const START = 1e9; // 처음 가입하면 10억

let data;
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { data = { users: {} }; }
data.users = data.users || {};
data.sessions = data.sessions || {};
// 한 번만 실행되는 전체 초기화 (돈·전적·트로피·꾸미기). 계정·비밀번호·로그인은 그대로
const RESET_ID = 'reset-2026-11-11';
if (data.resetId !== RESET_ID) {
  for (const u of Object.values(data.users)) {
    u.assets = START; u.yutHold = 0; u.yut = { games: 0, win: 0, net: 0 }; u.trophy = 0;
    u.owned = SHOP.DEFAULT_OWNED.slice(); u.equip = Object.assign({}, SHOP.DEFAULT_EQUIP);
  }
  data.yutGames = [];
  data.resetId = RESET_ID;
  console.log(`전체 초기화 완료: ${Object.keys(data.users).length}명`);
}
const byId = new Map();
for (const u of Object.values(data.users)) byId.set(u.id, u);
// 한 번만 지급: 운영자가 확인한 업적 기록 (보상은 다음 접속 때 업적 확인으로 지급)
data.grants = data.grants || [];
for (const [gid, name, stat] of [['grant-2026-11-13-flawless-모잡이백수', '모잡이백수', 'flawless4']]) {
  if (data.grants.includes(gid)) continue;
  const u = Object.values(data.users).find(x => x.username === name);
  if (!u) continue;
  u.st = u.st || {}; u.st[stat] = Math.max(u.st[stat] || 0, 1);
  data.grants.push(gid);
  console.log(`업적 기록 지급: ${name} ${stat}`);
}
// 서버가 다시 켜졌을 때 되살리지 못한 판의 판돈은 돌려줌 (activeIds: 복원된 판의 참가자)
function refundOrphans(activeIds) {
  const keep = new Set(activeIds || []);
  for (const u of Object.values(data.users)) if (u.yutHold && !keep.has(u.id)) { u.assets += u.yutHold; u.yutHold = 0; }
}
let dumpFn = null;
const setDump = fn => { dumpFn = fn; };
const storedGames = () => data.yutGames || [];
let miniDumpFn = null;
const setMiniDump = fn => { miniDumpFn = fn; };
const storedMini = () => data.miniGames || [];
// 로그인 유지용 세션 (브라우저에 토큰 저장)
function newSession(u) {
  const token = crypto.randomBytes(24).toString('hex');
  data.sessions[token] = u.id;
  return token;
}
function logout(token) { delete data.sessions[String(token || '')]; save(); }
function byToken(token) { const id = data.sessions[String(token || '')]; return id ? byId.get(id) || null : null; }

function save() {
  if (dumpFn) data.yutGames = dumpFn();
  if (miniDumpFn) data.miniGames = miniDumpFn();
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function register(name, pw) {
  name = String(name || '').trim().slice(0, 12);
  pw = String(pw || '');
  if (!name) return { error: '닉네임을 입력해 주세요' };
  if (pw.length < 4) return { error: '비밀번호는 4자 이상으로 해 주세요' };
  const key = name.toLowerCase();
  if (data.users[key]) return { error: '이미 있는 닉네임이에요' };
  const salt = crypto.randomBytes(8).toString('hex');
  const u = { id: crypto.randomUUID(), username: name, salt, pw: hash(pw, salt), assets: START, yutHold: 0, yut: { games: 0, win: 0, net: 0 }, owned: SHOP.DEFAULT_OWNED.slice(), equip: Object.assign({}, SHOP.DEFAULT_EQUIP) };
  data.users[key] = u; byId.set(u.id, u);
  const token = newSession(u);
  save();
  return { user: u, token };
}
function login(name, pw) {
  const u = data.users[String(name || '').trim().toLowerCase()];
  if (!u) return { error: '없는 닉네임이에요 (처음이면 비밀번호를 정하고 가입해 주세요)' };
  if (hash(String(pw || ''), u.salt) !== u.pw) return { error: '비밀번호가 달라요' };
  const token = newSession(u);
  save();
  return { user: u, token };
}
// 상점: 구매(우승 트로피로) · 장착(보유한 것만)
function buy(u, id) {
  const it = SHOP.byId(id);
  if (!it) return { error: '없는 상품이에요' };
  if (it.ach || it.price == null) return { error: '업적 보상으로만 얻을 수 있어요' };
  u.owned = u.owned || SHOP.DEFAULT_OWNED.slice();
  if (u.owned.includes(id)) return { error: '이미 가지고 있어요' };
  if ((u.trophy || 0) < it.price) return { error: `트로피가 부족해요 (🏆 ${it.price}개 필요)` };
  u.trophy = (u.trophy || 0) - it.price; u.owned.push(id);
  save();
  return { ok: true };
}
function equip(u, id) {
  const it = SHOP.byId(id);
  if (!it) return { error: '없는 상품이에요' };
  u.owned = u.owned || SHOP.DEFAULT_OWNED.slice();
  if (!u.owned.includes(id)) return { error: '먼저 구매해 주세요' };
  u.equip = Object.assign({}, SHOP.DEFAULT_EQUIP, u.equip || {});
  u.equip[it.cat] = id;
  save();
  return { ok: true };
}
// 랭킹: 우승 횟수 → 트로피 → 승률 순
function rank() {
  return Object.values(data.users).map(u => {
    const y = u.yut || {};
    return { name: u.username, win: y.win || 0, games: y.games || 0, net: y.net || 0, trophy: u.trophy || 0,
      piece: (u.equip && u.equip.piece) || SHOP.DEFAULT_EQUIP.piece, shame: shameLevel(u) };
  }).filter(r => r.games > 0)
    .sort((a, b) => b.win - a.win || b.trophy - a.trophy || (b.win / b.games) - (a.win / a.games))
    .slice(0, 50);
}
// 충전(구제금): 현금(판돈 포함) 1억 미만이면 3억 · 하루(한국 날짜) 3번 · 24시간 딱지
const BAILOUT_AMOUNT = 3e8, DAILY_BAILOUTS = 3, SHAME_MS = 24 * 60 * 60 * 1000;
const kstDay = t => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
const bailoutsToday = u => (u.bailoutLog || []).filter(t => kstDay(t) === kstDay(Date.now())).length;
// 최근 24시간 충전 횟수 → 1 좃밥 / 2 좃좃밥 / 3 걍접으셈
const shameLevel = u => Math.min(3, (u.bailoutLog || []).filter(t => Date.now() - t < SHAME_MS).length);
const shameUntil = u => { const l = (u.bailoutLog || []).filter(t => Date.now() - t < SHAME_MS); return l.length ? Math.max(...l) + SHAME_MS : 0; };
function bailout(u) {
  if (u.assets + (u.yutHold || 0) >= 1e8) return { error: '현금이 1억 미만일 때만 충전할 수 있어요' };
  if (bailoutsToday(u) >= DAILY_BAILOUTS) return { error: `오늘은 더 충전할 수 없어요 (하루 ${DAILY_BAILOUTS}번)` };
  u.bailoutLog = (u.bailoutLog || []).filter(t => Date.now() - t < 7 * SHAME_MS);
  u.bailoutLog.push(Date.now());
  u.st = u.st || {}; u.st.bailouts = (u.st.bailouts || 0) + 1;
  u.assets += BAILOUT_AMOUNT;
  save();
  return { ok: true, amount: BAILOUT_AMOUNT, level: shameLevel(u) };
}

// 전체 던지기 통계 (모든 계정 합계)
function throwStats() {
  const tot = {};
  for (const u of Object.values(data.users)) for (const [k, n] of Object.entries(u.throws || {})) tot[k] = (tot[k] || 0) + n;
  return tot;
}
module.exports = { bailout, bailoutsToday, shameLevel, shameUntil, BAILOUT_AMOUNT, DAILY_BAILOUTS, throwStats, byId, save, register, login, buy, equip, rank, START, refundOrphans, setDump, storedGames, setMiniDump, storedMini, byToken, logout };
