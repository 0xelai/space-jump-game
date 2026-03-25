const WALLET_ORIGIN = 'https://sphere.unicity.network';
const GAME_WALLET_ADDRESS = '@elaiii';
const ENTRY_FEE = 10;
const COIN_ID = 'UCT';
const UCT_COIN_ID_HEX = '455ad8720656b08e8dbd5bac1f3c73eeea5431565f6c1c3af742b1aa12d41d89';
const SESSION_KEY = 'spacejump-sphere-session';
const DEPOSIT_KEY = 'spacejump-deposit-paid';

const READY_EVENTS = new Set([
  'sphere-connect:host-ready',
  'HOST_READY',
  'SPHERE_HOST_READY',
]);

const state = {
  isConnected: false,
  isDepositPaid: false,
  identity: null,
  balance: null,
  error: null,
};

let popupWindow = null;
let msgListener = null;
let reqCounter = 1;
let pendingReqs = {};
let readyPingInterval = null;
let connectTimeout = null;
let connectInFlight = false;
let hostReadyReceived = false;
let currentCoinId = UCT_COIN_ID_HEX;
let currentCoinDecimals = 18;

const listeners = new Set();
function emit() { listeners.forEach((fn) => fn({ ...state })); }
export function onWalletStateChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setError(message) { state.error = message; emit(); }
function clearError() { state.error = null; emit(); }

function connectUrl() {
  return `${WALLET_ORIGIN}/connect?origin=${encodeURIComponent(window.location.origin)}`;
}

function sendToWallet(msg) {
  if (popupWindow && !popupWindow.closed) {
    popupWindow.postMessage(msg, WALLET_ORIGIN);
  }
}

function clearPending(reason = 'Cancelled') {
  Object.keys(pendingReqs).forEach((id) => {
    pendingReqs[id].reject(new Error(reason));
    delete pendingReqs[id];
  });
}

function stopReadyPing() {
  if (readyPingInterval) {
    clearInterval(readyPingInterval);
    readyPingInterval = null;
  }
}

function stopConnectTimeout() {
  if (connectTimeout) {
    clearTimeout(connectTimeout);
    connectTimeout = null;
  }
}

function cleanupHandshake() {
  stopReadyPing();
  stopConnectTimeout();
  connectInFlight = false;
  hostReadyReceived = false;
}

function startListening() {
  if (msgListener) return;
  msgListener = (event) => {
    if (event.origin !== WALLET_ORIGIN) return;
    if (popupWindow && event.source && event.source !== popupWindow) return;

    const data = event.data;
    if (!data) return;
    console.log('[SphereWallet] incoming', data);

    if (READY_EVENTS.has(data.type)) {
      hostReadyReceived = true;
      cleanupHandshake();
      doConnect();
      return;
    }

    if (data.type === 'DISCONNECT' || data.type === 'SPHERE_DISCONNECT' || data.type === 'sphere-connect:disconnect') {
      disconnect();
      return;
    }

    if (data.jsonrpc === '2.0' && data.id && pendingReqs[data.id]) {
      const { resolve, reject } = pendingReqs[data.id];
      delete pendingReqs[data.id];
      if (data.error) reject(new Error(data.error.message || 'RPC error'));
      else resolve(data.result);
    }
  };
  window.addEventListener('message', msgListener);
}

function stopListening() {
  if (msgListener) {
    window.removeEventListener('message', msgListener);
    msgListener = null;
  }
}

function rpc(method, params = {}, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const id = String(reqCounter++);
    pendingReqs[id] = { resolve, reject };
    sendToWallet({ jsonrpc: '2.0', id, method, params });
    setTimeout(() => {
      if (pendingReqs[id]) {
        delete pendingReqs[id];
        reject(new Error(`"${method}" timed out`));
      }
    }, timeoutMs);
  });
}

function startReadyPing() {
  stopReadyPing();
  readyPingInterval = setInterval(() => {
    if (!popupWindow || popupWindow.closed || hostReadyReceived) return;
    sendToWallet({
      type: 'DAPP_READY',
      origin: window.location.origin,
      dapp: { name: 'Space Jump', description: 'Pay 10 UCT to play', url: window.location.origin },
    });
    sendToWallet({
      type: 'sphere-connect:dapp-ready',
      origin: window.location.origin,
      dapp: { name: 'Space Jump', description: 'Pay 10 UCT to play', url: window.location.origin },
    });
    console.log('[SphereWallet] sent ready ping');
  }, 700);
}

function startConnectTimeout() {
  stopConnectTimeout();
  connectTimeout = setTimeout(() => {
    if (!hostReadyReceived) {
      setError('Wallet popup opened, but no ready signal came back.');
      cleanupHandshake();
    }
  }, 18000);
}

async function doConnect() {
  if (connectInFlight) return;
  connectInFlight = true;
  try {
    const result = await rpc('sphere_connect', {
      dapp: { name: 'Space Jump', description: 'Pay 10 UCT to play', url: window.location.origin },
      sessionId: sessionStorage.getItem(SESSION_KEY) || undefined,
    });

    state.isConnected = true;
    state.identity = result?.identity || null;
    if (result?.sessionId) sessionStorage.setItem(SESSION_KEY, result.sessionId);
    clearError();
    emit();
    await refreshBalance();
    if (sessionStorage.getItem(DEPOSIT_KEY)) {
      state.isDepositPaid = true;
      sessionStorage.removeItem(DEPOSIT_KEY);
      emit();
    }
  } catch (err) {
    setError(err?.message || 'Connection failed');
    state.isConnected = false;
    state.identity = null;
    emit();
  } finally {
    connectInFlight = false;
  }
}

export async function connectWallet() {
  clearError();
  startListening();
  try {
    if (!popupWindow || popupWindow.closed) {
      popupWindow = window.open(connectUrl(), 'sphere-wallet', 'width=430,height=660,left=200,top=80');
      if (!popupWindow) throw new Error('Popup blocked. Please allow popups for this site and try again.');
    } else {
      popupWindow.focus();
    }
    hostReadyReceived = false;
    startReadyPing();
    startConnectTimeout();
  } catch (err) {
    setError(err?.message || 'Failed to open wallet popup');
  }
}

export async function refreshBalance() {
  if (!state.isConnected) return;
  try {
    const assets = await rpc('sphere_getBalance', {});
    if (Array.isArray(assets)) {
      const uct = assets.find((asset) => asset.symbol === COIN_ID);
      if (uct) {
        currentCoinId = uct.coinId || UCT_COIN_ID_HEX;
        currentCoinDecimals = uct.decimals || 18;
        state.balance = Number(uct.totalAmount) / Math.pow(10, currentCoinDecimals);
      } else {
        state.balance = 0;
      }
      emit();
    }
  } catch (err) {
    console.error('[SphereWallet] balance failed', err);
  }
}

export async function depositEntryFee() {
  if (!state.isConnected) {
    setError('Connect your wallet first.');
    return false;
  }
  try {
    clearError();
    await rpc('sphere_sendTransaction', {
      to: GAME_WALLET_ADDRESS,
      amount: String(ENTRY_FEE),
      coinId: currentCoinId,
      memo: 'Space Jump entry fee',
    });
    state.isDepositPaid = true;
    sessionStorage.setItem(DEPOSIT_KEY, 'true');
    emit();
    await refreshBalance();
    return true;
  } catch (err) {
    setError(err?.message || 'Payment failed');
    return false;
  }
}

export function disconnect() {
  try {
    sendToWallet({ jsonrpc: '2.0', id: String(reqCounter++), method: 'sphere_disconnect', params: {} });
  } catch {}
  try { popupWindow?.close(); } catch {}
  popupWindow = null;
  cleanupHandshake();
  clearPending('Disconnected');
  stopListening();
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(DEPOSIT_KEY);
  Object.assign(state, { isConnected: false, isDepositPaid: false, identity: null, balance: null, error: null });
  emit();
}

export function getWalletState() { return { ...state }; }
