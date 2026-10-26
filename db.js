// 아주 간단한 파일 저장소 (Railway 볼륨에 db.json으로 저장)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START_ASSETS = 1e9;   // 초기 자산 10억
const ENTRY_FEE = 1e8;      // 토너먼트 참가비 1억

const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DIR, { recursive: true });
const FILE = path.join(DIR, 'db.json');

let data = { users: {}, sessions: {} };
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* 첫 실행 */ }
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
  u.shame = u.shame || 0;
  u.stats.bailouts = u.stats.bailouts || 0;
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
    shame: u.shame || 0,
    avatar: u.avatar,
    stats: u.stats,
    total: total(u),
  };
}

function total(u) {
  return u.assets + u.inPlay; // 보유 현금 + 테이블 금액 (대회 참가비는 이미 상금풀로 들어간 돈)
}

module.exports = {
  START_ASSETS,
  ENTRY_FEE,
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
      shame: 0,
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
      username: u.username, avatar: u.avatar, total: total(u), tWins: u.stats.tWins, tPlayed: u.stats.tPlayed,
      avgPlace: u.stats.tPlayed ? u.stats.placeSum / u.stats.tPlayed : null,
    }));
    return {
      assets: all.slice().sort((a, b) => b.total - a.total || b.tWins - a.tWins).slice(0, 100),
      avg: all.filter(u => u.tPlayed > 0).sort((a, b) => a.avgPlace - b.avgPlace || b.tPlayed - a.tPlayed).slice(0, 100),
    };
  },
};
