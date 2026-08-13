const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
function makeBot(name) {
  const s = io(URL, { autoConnect: true });
  let mySeat = null;
  let sawSB = false;
  let actCount = 0;
  s.onAny((ev, d) => {
    if (['ping','pong','lobby_state','room_state','hand_state'].includes(ev)) return;
    console.log(`[${name}] EVENT ${ev}:`, typeof d === 'object' ? JSON.stringify(d).slice(0,300) : d);
  });
  s.on('connect', () => console.log(`[${name}] connected id=${s.id}`));
  s.on('error', (e) => console.log(`[${name}] ERROR ${typeof e === 'object' ? JSON.stringify(e) : e}`));
  s.on('room_state', (d) => {
    mySeat = d.mySeatId;
    const rs = d.seats.map(s => s.occupied ? `${s.seatId}:${s.nickname?.slice(0,4)}${s.isReady?'R':'-'}` : `${s.seatId}:-`).join(' ');
    console.log(`[${name}] ROOM id=${d.roomId} ${d.mode} ${d.status} mySeat=${mySeat} seats=[${rs}]`);
  });
  s.on('hand_started', (d) => console.log(`[${name}] !!!! HAND_STARTED hand=${d.handId} dealer=${d.dealerSeat} sb=${d.smallBlindSeat} bb=${d.bigBlindSeat}`));
  s.on('settlement', (d) => console.log(`[${name}] !!!! SETTLE pot=${d.pot} byFold=${d.byFold} winners=${JSON.stringify(d.winners.map(w=>({n:w.nickname,a:w.amount,t:w.handTypeName})))} deltas=${JSON.stringify(d.playerDeltas)}`));
  s.on('hand_ended', (d) => console.log(`[${name}] !!!! HAND_ENDED nextDealer=${d.nextDealerSeat}`));
  s.on('hand_state', (d) => {
    if (!mySeat && d.mySeatId != null) mySeat = d.mySeatId;
    console.log(`[${name}] HAND stg=${d.stage} pot=${d.pot} toCall=${d.currentBetToCall} curSeat=${d.currentPlayerSeat} mySeat=${mySeat} sbAmt=${d.smallBlindAmount ?? '?'} comm=${d.communityCards?.length||0}`);
    if (d.stage === 'small_blind_declare' && !sawSB) {
      sawSB = true;
      if (d.currentPlayerSeat === mySeat) {
        console.log(`[${name}] >>> I am SB, declare amount=10`);
        setTimeout(() => s.emit('declare_small_blind', { amount: 10 }), 200);
      } else {
        console.log(`[${name}] SB seat=${d.currentPlayerSeat}, I wait + auto-timeout`);
      }
    }
    const betStages = ['pre_flop_bet','flop_bet','turn_bet','river_bet'];
    if (betStages.includes(d.stage) && d.currentPlayerSeat === mySeat && actCount < 20) {
      actCount++;
      setTimeout(() => {
        const me = Object.values(d.players || {}).find(p => p.seatId === mySeat);
        const ms = me?.score ?? 0;
        const curBet = me?.currentBet || 0;
        const toCall = d.currentBetToCall || 0;
        const needToCall = Math.max(0, toCall - curBet);
        let act;
        if (needToCall === 0) act = { actionType: 'check' };
        else if (needToCall <= ms) act = { actionType: 'call' };
        else act = { actionType: 'fold' };
        console.log(`[${name}] >>> ACT ${JSON.stringify(act)} (myScore=${ms}, bet=${curBet}, toCall=${toCall}, need=${needToCall})`);
        s.emit('player_action', act);
      }, 300);
    }
    if (d.stage === 'showdown_select') {
      const me = Object.values(d.players || {}).find(p => p.seatId === mySeat);
      if (me && !me.hasFolded && d.myShowdownCards?.length >= 5) {
        setTimeout(() => {
          const ids = d.myShowdownCards.slice(0,5).map(c => c.id);
          console.log(`[${name}] >>> SUBMIT showdown cards: ${ids.join(',')}`);
          s.emit('submit_selected_cards', { cardIds: ids });
        }, 500);
      }
    }
  });
  setInterval(() => s.emit('ping'), 5000);
  return s;
}

async function flow() {
  const p1 = makeBot('P1');
  await new Promise(r => p1.once('connect', () => setTimeout(r, 300)));
  p1.emit('join_room', { roomId: 1 });
  await new Promise(r => setTimeout(r, 800));
  console.log('\n--- P1 click ready ---\n');
  p1.emit('toggle_ready');

  const p2 = makeBot('P2');
  await new Promise(r => p2.once('connect', () => setTimeout(r, 300)));
  p2.emit('join_room', { roomId: 1 });
  await new Promise(r => setTimeout(r, 800));
  console.log('\n--- P2 click ready (should trigger start) ---\n');
  p2.emit('toggle_ready');

  await new Promise(r => setTimeout(r, 60000));
  console.log('\n=== 60秒超时，停止 ===\n');
  p1.close(); p2.close(); process.exit(0);
}

if (!process.argv.includes('--two')) setTimeout(flow, 500);

async function flowTwoHands() {
  const p1 = makeBot('P1');
  await new Promise(r => p1.once('connect', () => setTimeout(r, 300)));
  p1.emit('join_room', { roomId: 1 });
  await new Promise(r => setTimeout(r, 800));
  p1.emit('toggle_ready');

  const p2 = makeBot('P2');
  await new Promise(r => p2.once('connect', () => setTimeout(r, 300)));
  p2.emit('join_room', { roomId: 1 });
  await new Promise(r => setTimeout(r, 800));

  let dealers = [];
  let handCount = 0;
  p1.on('hand_started', (d) => { dealers.push(d.dealerSeat); handCount++; console.log(`[DEALER] hand#${handCount} dealerSeat=${d.dealerSeat}`); });
  p2.on('hand_ended', async () => {
    if (handCount >= 2) return;
    console.log(`\n=== Auto-READY for HAND#${handCount+1} ===\n`);
    await new Promise(r => setTimeout(r, 500));
    p1.emit('toggle_ready');
    p2.emit('toggle_ready');
  });

  p2.emit('toggle_ready');
  await new Promise(r => setTimeout(r, 90000));
  console.log(`\n=== DEALER SEQUENCE (expects rotate): [${dealers.join(', ')}] ===\n`);
  console.log(dealers.length >= 2 && dealers[0] !== dealers[1] ? '✅ DEALER ROTATION OK' : '❌ DEALER ROTATION FAIL');
  p1.close(); p2.close(); process.exit(0);
}

if (process.argv.includes('--two')) setTimeout(flowTwoHands, 500);
process.on('SIGINT', () => process.exit(0));
