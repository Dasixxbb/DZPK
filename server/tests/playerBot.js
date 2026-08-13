const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', { autoConnect: true, reconnection: true });

const log = (tag, msg) => {
  const t = new Date().toISOString().slice(11,19);
  const s = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
  console.log(`[${t}] [${tag}] ${s}`);
};

socket.on('connect', () => log('INFO', 'Connected, socketId=' + socket.id));
socket.on('pong', () => {});
socket.on('error', (e) => log('ERROR', e?.message || JSON.stringify(e)));
socket.on('hand_started', (d) => log('HAND', `STARTED hand=${d.handId} dealer=${d.dealerSeat} sb=${d.smallBlindSeat} bb=${d.bigBlindSeat}`));
socket.on('settlement', (d) => log('SETTLE', `pot=${d.pot} byFold=${d.byFold} winners=${d.winners.map(w=>w.nickname+'+'+w.amount).join(',')} deltas=${JSON.stringify(d.playerDeltas)}`));
socket.on('hand_ended', (d) => log('HAND', `ENDED nextDealer=${d.nextDealerSeat}`));

setInterval(() => socket.emit('ping'), 5000);

let mySeatId = null;

socket.on('room_state', (d) => {
  mySeatId = d.mySeatId;
  const occ = d.seats.filter(s => s.occupied).length;
  const readies = d.seats.filter(s => s.occupied && s.isReady).length;
  log('ROOM', `room#${d.roomId} ${d.mode} ${d.status} ${occ}/6 seats ready=${readies} mySeat=${mySeatId}`);
});

let sawSB = false;
let actionsDone = 0;
socket.on('hand_state', (d) => {
  if (!mySeatId) mySeatId = d.mySeatId;
  const info = `stage=${d.stage} pot=${d.pot} toCall=${d.currentBetToCall} curSeat=${d.currentPlayerSeat} mySeat=${mySeatId} commCards=${d.communityCards?.length||0}`;
  log('HAND', info);

  if (d.stage === 'small_blind_declare' && !sawSB) {
    sawSB = true;
    if (d.currentPlayerSeat === mySeatId) {
      log('FLOW', 'I am SB -> declare 10');
      socket.emit('declare_small_blind', { amount: 10 });
    } else {
      log('FLOW', 'SB seat=' + d.currentPlayerSeat + ', I wait');
    }
  }

  const betting = ['pre_flop_bet','flop_bet','turn_bet','river_bet'].includes(d.stage);
  if (betting && d.currentPlayerSeat === mySeatId && actionsDone < 15) {
    actionsDone++;
    setTimeout(() => {
      const me = Object.values(d.players || {}).find(p => p.seatId === mySeatId);
      const myScore = me?.score ?? 0;
      let action;
      if (d.currentBetToCall === 0) action = { actionType: 'check' };
      else if (d.currentBetToCall <= myScore + (me?.currentBet||0)) action = { actionType: 'call' };
      else action = { actionType: 'fold' };
      log('FLOW', 'ACT: ' + JSON.stringify(action) + ' (myScore='+myScore+', curBet='+(me?.currentBet||0)+')');
      socket.emit('player_action', action);
    }, 600);
  }

  if (d.stage === 'showdown_select') {
    const me = Object.values(d.players || {}).find(p => p.seatId === mySeatId);
    if (me && !me.hasFolded && d.myShowdownCards && d.myShowdownCards.length >= 5) {
      setTimeout(() => {
        const ids = d.myShowdownCards.slice(0,5).map(c => c.id);
        log('FLOW', '[showdown] submit 5 cards=' + ids.join(','));
        socket.emit('submit_selected_cards', { cardIds: ids });
      }, 1200);
    }
  }
});

socket.once('connect', () => {
  setTimeout(() => {
    log('FLOW', 'get_lobby');
    socket.emit('get_lobby');
    setTimeout(() => {
      log('FLOW', 'join room 1');
      socket.emit('join_room', { roomId: 1 });
      setTimeout(() => {
        log('FLOW', 'toggle_ready');
        socket.emit('toggle_ready');
        setTimeout(() => {
          log('FLOW', 'Waiting for game to start (2 players ready)...');
        }, 1500);
      }, 1500);
    }, 1500);
  }, 1000);
});

process.on('SIGINT', () => { socket.close(); process.exit(0); });
