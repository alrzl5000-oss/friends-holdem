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
const byId = new Map();
for (const u of Object.values(data.users)) byId.set(u.id, u);
// 서버가 판 도중 꺼졌으면 판돈을 돌려줌
for (const u of Object.values(data.users)) if (u.yutHold) { u.assets += u.yutHold; u.yutHold = 0; }

function save() {
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
  save();
  return { user: u };
}
function login(name, pw) {
  const u = data.users[String(name || '').trim().toLowerCase()];
  if (!u) return { error: '없는 닉네임이에요 (처음이면 비밀번호를 정하고 가입해 주세요)' };
  if (hash(String(pw || ''), u.salt) !== u.pw) return { error: '비밀번호가 달라요' };
  return { user: u };
}
// 상점: 구매(현금에서 차감) · 장착(보유한 것만)
function buy(u, id) {
  const it = SHOP.byId(id);
  if (!it) return { error: '없는 상품이에요' };
  u.owned = u.owned || SHOP.DEFAULT_OWNED.slice();
  if (u.owned.includes(id)) return { error: '이미 가지고 있어요' };
  if (u.assets < it.price) return { error: '현금이 부족해요' };
  u.assets -= it.price; u.owned.push(id);
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
module.exports = { byId, save, register, login, buy, equip, START };
