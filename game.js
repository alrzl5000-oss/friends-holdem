// 텍사스 홀덤 게임 로직 (서버에서만 실행 — 카드는 서버가 섞고 관리)
const crypto = require('crypto');

// ===== 설정값 (원하면 여기만 바꾸면 됨) =====
const MAX_SEATS = 8;
const START_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const TURN_MS = 30000;      // 내 차례 제한시간
const AWAY_TURN_MS = 8000;  // 접속 끊긴 사람 제한시간
const NEXT_HAND_MS = 6000;  // 핸드 끝나고 다음 핸드까지
const RUNOUT_MS = 1300;     // 올인 후 보드 깔리는 간격

const HAND_NAMES = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];
const STAGE_NAMES = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };

function newDeck() {
  const deck = [];
  for (const s of ['s', 'h', 'd', 'c']) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// 5장 점수: [족보, 타이브레이커...] — 배열 앞에서부터 비교
function score5(cards) {
  const rs = cards.map(c => c.r).sort((a, b) => b - a);
  const flush = cards.every(c => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const cnt = {};
  rs.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
  const groups = Object.entries(cnt).map(([r, c]) => [c, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const gr = groups.map(g => g[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, ...gr];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...gr];
  if (flush) return [5, ...rs];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...gr];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...gr];
  if (groups[0][0] === 2) return [1, ...gr];
  return [0, ...rs];
}

function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

function handName(score) {
  if (score[0] === 8 && score[1] === 14) return '로열 플러시';
  return HAND_NAMES[score[0]];
}

// 7장 중 최고의 5장
function bestHand(cards) {
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
      const sc = score5(five);
      if (!best || compareScore(sc, best.score) > 0) best = { score: sc, cards: five };
    }
  best.name = handName(best.score);
  return best;
}

class Table {
  constructor(code, hooks) {
    this.code = code;
    this.hooks = hooks; // { emit(table), log(table, text) }
    this.seats = new Array(MAX_SEATS).fill(null);
    this.sb = SMALL_BLIND;
    this.bb = BIG_BLIND;
    this.hostId = null;
    this.running = false;
    this.stage = 'waiting'; // waiting | preflop | flop | turn | river | showdown
    this.dealer = -1;
    this.deck = [];
    this.community = [];
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.turn = -1;
    this.turnDeadline = 0;
    this.handNo = 0;
    this.turnSeq = 0;
    this.result = null;
    this.chat = [];
    this.lastActive = Date.now();
    this.timer = null;
    this.runoutTimer = null;
    this.nextHandTimer = null;
  }

  // ---------- 유틸 ----------
  emit() { this.lastActive = Date.now(); this.hooks.emit(this); }
  log(text) { this.hooks.log(this, text); }
  seatOf(id) { return this.seats.findIndex(s => s && s.id === id); }
  inBetting() { return ['preflop', 'flop', 'turn', 'river'].includes(this.stage); }
  canAct(s) { return s && s.inHand && !s.folded && !s.allIn; }
  needsAct(s) { return this.canAct(s) && (!s.acted || s.bet < this.currentBet); }
  live() { return this.seats.map((s, i) => i).filter(i => this.seats[i] && this.seats[i].inHand && !this.seats[i].folded); }
  pot() { return this.seats.reduce((sum, s) => sum + (s ? s.total : 0), 0); }
  readyCount() { return this.seats.filter(s => s && s.chips > 0 && s.connected && !s.leaving).length; }
  connectedCount() { return this.seats.filter(s => s && s.connected).length; }
  nextIdx(from, pred) {
    for (let k = 1; k <= MAX_SEATS; k++) {
      const j = (((from + k) % MAX_SEATS) + MAX_SEATS) % MAX_SEATS;
      if (this.seats[j] && pred(this.seats[j])) return j;
    }
    return -1;
  }
  clearTimers() {
    clearTimeout(this.timer); this.timer = null;
    clearTimeout(this.runoutTimer); this.runoutTimer = null;
  }
  destroy() {
    this.clearTimers();
    clearTimeout(this.nextHandTimer);
  }

  // ---------- 입장/퇴장 ----------
  addPlayer(id, name, socketId) {
    let i = this.seatOf(id);
    if (i >= 0) {
      const s = this.seats[i];
      Object.assign(s, { socketId, connected: true, leaving: false, name });
      this.maybeAutoStart();
      return { seat: i, rejoined: true };
    }
    i = this.seats.findIndex(s => !s);
    if (i < 0) return { error: '자리가 꽉 찼어요 (최대 8명)' };
    this.seats[i] = {
      id, name, socketId, chips: START_CHIPS, hand: [], bet: 0, total: 0,
      inHand: false, folded: true, allIn: false, acted: false, connected: true, leaving: false,
      lastAction: '', revealed: false, bestName: '', won: 0, rebuys: 0,
    };
    if (!this.hostId || this.seatOf(this.hostId) < 0) this.hostId = id;
    this.maybeAutoStart();
    return { seat: i };
  }

  removePlayer(id) {
    const i = this.seatOf(id);
    if (i < 0) return;
    const s = this.seats[i];
    if (this.stage !== 'waiting' && s.inHand) {
      s.leaving = true;
      if (this.inBetting() && !s.folded && !s.allIn) this.foldOut(i);
    } else {
      this.seats[i] = null;
    }
    if (this.hostId === id) {
      const next = this.seats.find(x => x && !x.leaving && x.id !== id);
      this.hostId = next ? next.id : null;
    }
    this.emit();
  }

  setConnected(id, socketId, connected) {
    const i = this.seatOf(id);
    if (i < 0) return;
    const s = this.seats[i];
    if (!connected && s.socketId !== socketId) return; // 이미 다른 탭/재접속으로 바뀜
    s.connected = connected;
    if (!connected && i === this.turn && this.turnDeadline - Date.now() > AWAY_TURN_MS) this.startTimer();
    this.emit();
  }

  rebuy(id) {
    const i = this.seatOf(id);
    if (i < 0) return { error: '자리가 없어요' };
    const s = this.seats[i];
    if (s.chips > 0) return { error: '칩이 남아있을 땐 리바이할 수 없어요' };
    if (this.inBetting() && s.inHand && !s.folded) return { error: '핸드가 끝난 뒤에 리바이하세요' };
    s.chips = START_CHIPS;
    s.rebuys++;
    this.log(`${s.name} 리바이 (+${START_CHIPS})`);
    this.maybeAutoStart();
    this.emit();
    return { ok: true };
  }

  start(id) {
    if (id !== this.hostId) return { error: '방장만 시작할 수 있어요' };
    if (this.stage !== 'waiting') return { error: '이미 진행 중이에요' };
    if (this.readyCount() < 2) return { error: '칩이 있는 플레이어가 2명 이상 필요해요' };
    this.running = true;
    this.startHand();
    return { ok: true };
  }

  maybeAutoStart() {
    if (this.running && this.stage === 'waiting' && !this.nextHandTimer && this.readyCount() >= 2) {
      this.nextHandTimer = setTimeout(() => {
        this.nextHandTimer = null;
        if (this.stage === 'waiting') this.startHand();
      }, 2500);
    }
  }

  // ---------- 핸드 진행 ----------
  startHand() {
    this.clearTimers();
    clearTimeout(this.nextHandTimer); this.nextHandTimer = null;
    this.seats.forEach((s, i) => { if (s && s.leaving) this.seats[i] = null; });
    if (this.hostId && this.seatOf(this.hostId) < 0) {
      const h = this.seats.find(Boolean);
      this.hostId = h ? h.id : null;
    }

    const ready = [];
    this.seats.forEach((s, i) => {
      if (!s) return;
      Object.assign(s, { hand: [], bet: 0, total: 0, allIn: false, acted: false, lastAction: '', revealed: false, bestName: '', won: 0 });
      s.inHand = s.chips > 0 && s.connected;
      s.folded = !s.inHand;
      if (s.inHand) ready.push(i);
    });

    if (ready.length < 2) {
      this.stage = 'waiting';
      this.turn = -1;
      this.community = [];
      this.seats.forEach(s => { if (s) { s.inHand = false; s.folded = true; } });
      this.emit();
      return;
    }

    this.handNo++;
    this.result = null;
    this.deck = newDeck();
    this.community = [];
    this.stage = 'preflop';

    const inHand = s => s.inHand;
    this.dealer = this.nextIdx(this.dealer, inHand);
    let sbIdx, bbIdx;
    if (ready.length === 2) {
      sbIdx = this.dealer;
      bbIdx = this.nextIdx(this.dealer, inHand);
    } else {
      sbIdx = this.nextIdx(this.dealer, inHand);
      bbIdx = this.nextIdx(sbIdx, inHand);
    }
    this.postBlind(sbIdx, this.sb, 'SB');
    this.postBlind(bbIdx, this.bb, 'BB');
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    for (let round = 0; round < 2; round++) {
      let i = sbIdx;
      do {
        this.seats[i].hand.push(this.deck.pop());
        i = this.nextIdx(i, inHand);
      } while (i !== sbIdx);
    }

    this.log(`── 핸드 #${this.handNo} 시작 (딜러: ${this.seats[this.dealer].name}) ──`);
    this.turn = this.nextIdx(bbIdx, s => this.needsAct(s));
    if (this.turn < 0) return this.endRound();
    this.startTimer();
    this.emit();
  }

  postBlind(i, amount, label) {
    const s = this.seats[i];
    this.put(s, Math.min(amount, s.chips));
    s.lastAction = s.allIn ? '올인' : label;
  }

  put(s, x) {
    s.chips -= x;
    s.bet += x;
    s.total += x;
    if (s.chips === 0) s.allIn = true;
  }

  startTimer() {
    clearTimeout(this.timer);
    const s = this.seats[this.turn];
    const ms = s.connected ? TURN_MS : AWAY_TURN_MS;
    this.turnDeadline = Date.now() + ms;
    const seq = ++this.turnSeq;
    this.timer = setTimeout(() => {
      if (seq !== this.turnSeq || !this.inBetting()) return;
      const cur = this.seats[this.turn];
      if (!cur) return;
      const toCall = this.currentBet - cur.bet;
      this.act(cur.id, toCall > 0 ? 'fold' : 'check', 0, true);
    }, ms);
  }

  act(id, type, amount, auto = false) {
    if (!this.inBetting() || this.turn < 0) return { error: '지금은 행동할 수 없어요' };
    const i = this.turn;
    const s = this.seats[i];
    if (!s || s.id !== id) return { error: '내 차례가 아니에요' };
    const toCall = this.currentBet - s.bet;

    if (type === 'call' && toCall <= 0) type = 'check';
    if (type === 'check' && toCall > 0) return { error: '체크할 수 없어요 (콜 또는 폴드)' };
    if (type === 'raise') {
      amount = Math.floor(Number(amount));
      if (!Number.isFinite(amount)) return { error: '금액이 올바르지 않아요' };
      if (amount >= s.bet + s.chips) type = 'allin';
      else if (amount < this.currentBet + this.minRaise) return { error: `최소 ${this.currentBet + this.minRaise}까지 레이즈해야 해요` };
    }

    let msg;
    switch (type) {
      case 'fold':
        s.folded = true; s.lastAction = '폴드'; msg = '폴드';
        break;
      case 'check':
        s.lastAction = '체크'; msg = '체크';
        break;
      case 'call': {
        const x = Math.min(toCall, s.chips);
        this.put(s, x);
        s.lastAction = s.allIn ? '올인' : '콜';
        msg = s.allIn ? `올인 (${s.bet})` : `콜 ${x}`;
        break;
      }
      case 'raise': {
        const label = this.currentBet === 0 ? '벳' : '레이즈';
        this.put(s, amount - s.bet);
        this.raiseTo(i, amount);
        s.lastAction = label; msg = `${label} → ${amount}`;
        break;
      }
      case 'allin': {
        const total = s.bet + s.chips;
        this.put(s, s.chips);
        if (total > this.currentBet) this.raiseTo(i, total);
        s.lastAction = '올인'; msg = `올인 (${total})`;
        break;
      }
      default:
        return { error: '알 수 없는 행동이에요' };
    }
    s.acted = true;
    this.log(`${s.name} ${msg}${auto ? ' (시간초과)' : ''}`);
    this.afterAction();
    return { ok: true };
  }

  raiseTo(i, amount) {
    this.minRaise = Math.max(this.minRaise, amount - this.currentBet);
    this.currentBet = amount;
    this.seats.forEach((s, j) => { if (s && j !== i && this.canAct(s)) s.acted = false; });
  }

  foldOut(i) {
    const s = this.seats[i];
    s.folded = true;
    s.lastAction = '폴드';
    this.log(`${s.name} 폴드 (나감)`);
    if (i === this.turn) return this.afterAction();
    const live = this.live();
    if (live.length === 1) { this.clearTimers(); return this.winUncontested(live[0]); }
  }

  afterAction() {
    clearTimeout(this.timer);
    this.turnSeq++;
    const live = this.live();
    if (live.length === 1) return this.winUncontested(live[0]);
    const next = this.nextIdx(this.turn, s => this.needsAct(s));
    if (next < 0) return this.endRound();
    this.turn = next;
    this.startTimer();
    this.emit();
  }

  endRound() {
    this.clearTimers();
    this.turnSeq++;
    this.turn = -1;
    this.seats.forEach(s => {
      if (!s) return;
      s.bet = 0;
      s.acted = false;
      if (s.inHand && !s.folded && !s.allIn) s.lastAction = '';
    });
    this.currentBet = 0;
    this.minRaise = this.bb;

    if (this.stage === 'river') return this.showdown();
    this.deck.pop(); // 번
    if (this.stage === 'preflop') {
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.stage = 'flop';
    } else if (this.stage === 'flop') {
      this.community.push(this.deck.pop());
      this.stage = 'turn';
    } else {
      this.community.push(this.deck.pop());
      this.stage = 'river';
    }

    const actors = this.seats.filter(s => this.canAct(s));
    if (actors.length < 2) {
      // 더 베팅할 사람이 없음 → 보드 자동으로 깔기
      this.emit();
      const h = this.handNo;
      this.runoutTimer = setTimeout(() => {
        if (this.handNo === h && this.inBetting()) this.endRound();
      }, RUNOUT_MS);
      return;
    }
    this.turn = this.nextIdx(this.dealer, s => this.canAct(s));
    this.startTimer();
    this.emit();
  }

  winUncontested(i) {
    this.clearTimers();
    const s = this.seats[i];
    const pot = this.pot();
    s.chips += pot;
    s.won = pot;
    this.stage = 'showdown';
    this.turn = -1;
    this.result = { lines: [`${s.name} 승리 +${pot}`] };
    this.log(`🏆 ${s.name} 승리 +${pot} (모두 폴드)`);
    this.scheduleNextHand();
  }

  buildPots() {
    const live = this.live().map(i => this.seats[i]);
    const contributors = this.seats.filter(s => s && s.total > 0);
    const levels = [...new Set(live.map(s => s.total))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const s of contributors) amount += Math.min(s.total, lvl) - Math.min(s.total, prev);
      const eligible = this.live().filter(i => this.seats[i].total >= lvl);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    }
    const total = this.pot();
    const distributed = pots.reduce((a, p) => a + p.amount, 0);
    if (total > distributed && pots.length) pots[pots.length - 1].amount += total - distributed;
    return pots;
  }

  showdown() {
    this.clearTimers();
    this.stage = 'showdown';
    this.turn = -1;
    const scores = {};
    for (const i of this.live()) {
      const s = this.seats[i];
      const best = bestHand([...s.hand, ...this.community]);
      scores[i] = best.score;
      s.revealed = true;
      s.bestName = best.name;
    }
    // 딜러 왼쪽부터 순서 (나머지 칩은 이 순서로 첫 승자에게)
    const order = [];
    for (let k = 1; k <= MAX_SEATS; k++) order.push((this.dealer + k) % MAX_SEATS);

    const pots = this.buildPots();
    const lines = [];
    pots.forEach((pot, pi) => {
      const elig = order.filter(i => pot.eligible.includes(i));
      let top = null;
      for (const i of elig) if (!top || compareScore(scores[i], top) > 0) top = scores[i];
      const winners = elig.filter(i => compareScore(scores[i], top) === 0);
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      for (const i of winners) {
        const w = this.seats[i];
        const amt = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        w.chips += amt;
        w.won += amt;
      }
      const label = pots.length > 1 ? (pi === 0 ? '메인팟' : `사이드팟${pi}`) : '';
      const names = winners.map(i => this.seats[i].name).join(', ');
      const line = `${label ? label + ': ' : ''}${names} ${winners.length > 1 ? '나눠 가짐' : '승리'} +${pot.amount} (${this.seats[winners[0]].bestName})`;
      lines.push(line);
      this.log(`🏆 ${line}`);
    });
    this.result = { lines };
    this.scheduleNextHand();
  }

  scheduleNextHand() {
    this.emit();
    clearTimeout(this.nextHandTimer);
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startHand();
    }, NEXT_HAND_MS);
  }

  // ---------- 플레이어별 화면 데이터 (남의 카드는 숨김) ----------
  viewFor(id) {
    const me = this.seatOf(id);
    const reveal = this.stage === 'showdown';
    return {
      code: this.code,
      stage: this.stage,
      stageName: STAGE_NAMES[this.stage] || '',
      community: this.community,
      pot: this.pot(),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      sb: this.sb,
      bb: this.bb,
      startChips: START_CHIPS,
      turn: this.turn,
      turnDeadline: this.turnDeadline,
      now: Date.now(),
      dealer: this.dealer,
      me,
      isHost: id === this.hostId,
      running: this.running,
      readyCount: this.readyCount(),
      result: this.result,
      seats: this.seats.map((s, i) => s && {
        name: s.name,
        chips: s.chips,
        bet: s.bet,
        inHand: s.inHand,
        folded: s.folded,
        allIn: s.allIn,
        connected: s.connected,
        lastAction: s.lastAction,
        host: s.id === this.hostId,
        hasCards: s.inHand && s.hand.length > 0,
        cards: (i === me || (reveal && s.revealed)) ? s.hand : null,
        bestName: reveal && s.revealed ? s.bestName : '',
        won: reveal ? s.won : 0,
      }),
    };
  }
}

module.exports = { Table, bestHand, score5, compareScore, MAX_SEATS };
