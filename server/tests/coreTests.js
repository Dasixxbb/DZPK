const assert = require('assert');
const { HAND_TYPES, createCard, createWildCard, WILD_TYPES } = require('../src/game/cards');
const { evaluateClassicHand, compareHandEvaluations } = require('../src/game/handEvaluator');
const { evaluateWildHand, compareWildHandEvaluations, findBest5CardsFrom7 } = require('../src/game/wildHandEvaluator');
const config = require('../src/config');
const PlayerManager = require('../src/managers/PlayerManager');
const RoomManager = require('../src/managers/RoomManager');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  OK ' + name);
  } catch (e) {
    failed++;
    errors.push({ name, error: e.message });
    console.log('  FAIL ' + name);
    console.log('       ERROR: ' + e.message);
  }
}

function expectEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) {
    throw new Error((msg || '') + ' expected ' + sb + ', got ' + sa);
  }
}

console.log('\n===== 经典模式牌型判定测试 =====');

test('高牌', function () {
  const cards = [
    createCard(14, 'spades'),
    createCard(10, 'hearts'),
    createCard(8, 'diamonds'),
    createCard(5, 'clubs'),
    createCard(3, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.HIGH_CARD, 'type');
  expectEqual(r.primary, 14, 'primary');
});

test('一对', function () {
  const cards = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createCard(8, 'diamonds'),
    createCard(5, 'clubs'),
    createCard(3, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.PAIR, 'type');
  expectEqual(r.primary, 10, 'primary');
});

test('两对', function () {
  const cards = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createCard(8, 'diamonds'),
    createCard(8, 'clubs'),
    createCard(3, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.TWO_PAIR, 'type');
  expectEqual(r.primary, 10, 'high pair');
  expectEqual(r.secondary, 8, 'low pair');
});

test('三条', function () {
  const cards = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createCard(10, 'diamonds'),
    createCard(5, 'clubs'),
    createCard(3, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.THREE_OF_A_KIND, 'type');
  expectEqual(r.primary, 10, 'primary');
});

test('顺子 10-A', function () {
  const cards = [
    createCard(14, 'spades'),
    createCard(13, 'hearts'),
    createCard(12, 'diamonds'),
    createCard(11, 'clubs'),
    createCard(10, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.STRAIGHT, 'type');
  expectEqual(r.primary, 14, 'primary');
});

test('小顺 A-2-3-4-5', function () {
  const cards = [
    createCard(14, 'spades'),
    createCard(2, 'hearts'),
    createCard(3, 'diamonds'),
    createCard(4, 'clubs'),
    createCard(5, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.STRAIGHT, 'type');
  expectEqual(r.primary, 5, 'primary should be 5');
});

test('同花', function () {
  const cards = [
    createCard(14, 'spades'),
    createCard(10, 'spades'),
    createCard(8, 'spades'),
    createCard(5, 'spades'),
    createCard(3, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.FLUSH, 'type');
});

test('葫芦', function () {
  const cards = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createCard(10, 'diamonds'),
    createCard(5, 'clubs'),
    createCard(5, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.FULL_HOUSE, 'type');
  expectEqual(r.primary, 10, 'three of a kind');
  expectEqual(r.secondary, 5, 'pair');
});

test('四条', function () {
  const cards = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createCard(10, 'diamonds'),
    createCard(10, 'clubs'),
    createCard(5, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.FOUR_OF_A_KIND, 'type');
  expectEqual(r.primary, 10, 'primary');
});

test('皇家同花顺', function () {
  const cards = [
    createCard(14, 'spades'),
    createCard(13, 'spades'),
    createCard(12, 'spades'),
    createCard(11, 'spades'),
    createCard(10, 'spades')
  ];
  const r = evaluateClassicHand(cards);
  expectEqual(r.type, HAND_TYPES.ROYAL_FLUSH, 'type');
});

test('比较：皇家同花顺 > 同花顺', function () {
  const rf = [
    createCard(14, 'spades'),
    createCard(13, 'spades'),
    createCard(12, 'spades'),
    createCard(11, 'spades'),
    createCard(10, 'spades')
  ];
  const sf = [
    createCard(9, 'spades'),
    createCard(8, 'spades'),
    createCard(7, 'spades'),
    createCard(6, 'spades'),
    createCard(5, 'spades')
  ];
  const a = evaluateClassicHand(rf);
  const b = evaluateClassicHand(sf);
  expectEqual(a.type, HAND_TYPES.ROYAL_FLUSH, 'rf type');
  expectEqual(b.type, HAND_TYPES.STRAIGHT_FLUSH, 'sf type');
  const cmp = compareHandEvaluations(a, b);
  if (!(cmp > 0)) throw new Error('Royal flush should beat straight flush, cmp=' + cmp);
});

console.log('\n===== 癞子模式牌型判定测试 =====');

test('无癞子一对', function () {
  const cards = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createCard(8, 'diamonds'),
    createCard(5, 'clubs'),
    createCard(3, 'spades')
  ];
  const r = evaluateWildHand(cards);
  expectEqual(r.type, HAND_TYPES.PAIR, 'type');
  expectEqual(r.usedWildCount, 0, 'usedWildCount');
});

test('1张万能牌补三条（原一对）', function () {
  const cards = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createWildCard(WILD_TYPES.UNIVERSAL),
    createCard(5, 'clubs'),
    createCard(3, 'spades')
  ];
  const r = evaluateWildHand(cards);
  expectEqual(r.type, HAND_TYPES.THREE_OF_A_KIND, 'type');
  expectEqual(r.usedWildCount, 1, 'wild count 1');
  expectEqual(r.primary, 10, 'primary 10');
});

test('小王牌补黑桃皇家同花顺', function () {
  const cards = [
    createCard(14, 'spades'),
    createCard(13, 'spades'),
    createCard(12, 'spades'),
    createCard(11, 'spades'),
    createWildCard(WILD_TYPES.JOKER_SMALL)
  ];
  const r = evaluateWildHand(cards);
  expectEqual(r.type, HAND_TYPES.ROYAL_FLUSH, 'royal flush');
  expectEqual(r.usedWildCount, 1);
  expectEqual(r.primary, 14);
});

test('大王牌(红色限定)不能补黑桃同花顺', function () {
  const cards = [
    createCard(14, 'spades'),
    createCard(13, 'spades'),
    createCard(12, 'spades'),
    createCard(11, 'spades'),
    createWildCard(WILD_TYPES.JOKER_BIG)
  ];
  const r = evaluateWildHand(cards);
  if (r.type === HAND_TYPES.ROYAL_FLUSH || r.type === HAND_TYPES.STRAIGHT_FLUSH) {
    throw new Error('Big joker (red only) should NOT complete spades straight flush! got type=' + r.type);
  }
  expectEqual(r.usedWildCount, 1);
});

test('癞子比较：牌型相同，癞子少者更大', function () {
  const pure = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createCard(10, 'diamonds'),
    createCard(5, 'clubs'),
    createCard(3, 'spades')
  ];
  const withWild = [
    createCard(10, 'spades'),
    createCard(10, 'hearts'),
    createWildCard(WILD_TYPES.UNIVERSAL),
    createCard(5, 'clubs'),
    createCard(3, 'spades')
  ];
  const a = evaluateWildHand(pure);
  const b = evaluateWildHand(withWild);
  expectEqual(a.type, HAND_TYPES.THREE_OF_A_KIND, 'a: three');
  expectEqual(b.type, HAND_TYPES.THREE_OF_A_KIND, 'b: three');
  expectEqual(a.usedWildCount, 0, 'a wild count 0');
  expectEqual(b.usedWildCount, 1, 'b wild count 1');
  const cmp = compareWildHandEvaluations(a, b);
  if (!(cmp > 0)) throw new Error('pure three-of-a-kind should beat with-wild three, cmp=' + cmp);
});

console.log('\n===== 7选5 最优组合测试 =====');

test('经典7选5：挑出皇家同花顺', function () {
  const seven = [
    createCard(14, 'spades'),
    createCard(13, 'spades'),
    createCard(12, 'spades'),
    createCard(11, 'spades'),
    createCard(10, 'spades'),
    createCard(2, 'hearts'),
    createCard(3, 'diamonds')
  ];
  const res = findBest5CardsFrom7(seven, 'classic');
  expectEqual(res.bestEvaluation.type, HAND_TYPES.ROYAL_FLUSH, 'best hand');
});

test('癞子7选5：1张万能牌补皇家同花顺', function () {
  const seven = [
    createCard(14, 'spades'),
    createCard(13, 'spades'),
    createCard(12, 'spades'),
    createCard(11, 'spades'),
    createWildCard(WILD_TYPES.UNIVERSAL),
    createCard(2, 'hearts'),
    createCard(3, 'diamonds')
  ];
  const res = findBest5CardsFrom7(seven, 'wild');
  expectEqual(res.bestEvaluation.type, HAND_TYPES.ROYAL_FLUSH, 'best hand');
  expectEqual(res.bestEvaluation.usedWildCount, 1, 'used wild 1');
});

console.log('\n===== 积分显示格式化测试 =====');
function formatScore(score) {
  if (score < 10000) return String(score);
  const w = score / 10000;
  let str = w.toFixed(2);
  str = str.replace(/\.?0+$/, '');
  return str + 'w';
}
test('9999 -> "9999"', function () { expectEqual(formatScore(9999), '9999'); });
test('10000 -> "1w"', function () { expectEqual(formatScore(10000), '1w'); });
test('10500 -> "1.05w"', function () { expectEqual(formatScore(10500), '1.05w'); });
test('126000 -> "12.6w"', function () { expectEqual(formatScore(126000), '12.6w'); });
test('100000 -> "10w"', function () { expectEqual(formatScore(100000), '10w'); });

console.log('\n===== 房间积分生命周期测试 =====');

test('正常离房后重新进房重置为初始积分', function () {
  const playerManager = new PlayerManager();
  const roomManager = new RoomManager(playerManager);
  const player = playerManager.createPlayer('score_reset_rejoin', 'socket_1');

  roomManager.joinRoom(player.sessionId, 1);
  player.score = 320;
  roomManager.leaveRoom(player.sessionId);

  expectEqual(player.score, config.player.defaultScore, 'leave room reset score');

  roomManager.joinRoom(player.sessionId, 2);
  expectEqual(player.score, config.player.defaultScore, 'join new room should keep default score');
});

test('断线重连同房重新进入时保留房内积分', function () {
  const playerManager = new PlayerManager();
  const roomManager = new RoomManager(playerManager);
  const player = playerManager.createPlayer('score_preserve_reconnect', 'socket_2');

  roomManager.joinRoom(player.sessionId, 1);
  player.score = 280;
  roomManager.leaveRoom(player.sessionId, { preserveScore: true, preserveRoomBinding: true });

  expectEqual(player.roomId, 1, 'preserve room binding should keep room id');
  expectEqual(player.seatId, null, 'seat should be released during reconnect grace');
  expectEqual(player.score, 280, 'score should be preserved during reconnect grace');

  roomManager.joinRoom(player.sessionId, 1);
  expectEqual(player.roomId, 1, 'player should rejoin same room');
  expectEqual(player.score, 280, 'rejoin same room should keep preserved score');
});

test('断线宽限过期后再清理会重置为初始积分', function () {
  const playerManager = new PlayerManager();
  const roomManager = new RoomManager(playerManager);
  const player = playerManager.createPlayer('score_reset_after_grace', 'socket_3');

  roomManager.joinRoom(player.sessionId, 1);
  player.score = 125;
  roomManager.leaveRoom(player.sessionId, { preserveScore: true, preserveRoomBinding: true });
  roomManager.leaveRoom(player.sessionId);

  expectEqual(player.roomId, null, 'player should fully leave room after grace cleanup');
  expectEqual(player.score, config.player.defaultScore, 'cleanup after reconnect grace should reset score');
});

console.log('\n========================================');
console.log('结果: 通过 ' + passed + ' / 失败 ' + failed);
if (errors.length > 0) {
  console.log('\n失败:');
  errors.forEach(function (e) { console.log('  - ' + e.name + ': ' + e.error); });
}
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
