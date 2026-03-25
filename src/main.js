import './style.css';
import { createGame } from './game';
import { connectWallet, depositEntryFee, disconnect, getWalletState, onWalletStateChange } from './wallet';

const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="bg"></canvas>
  <div class="top-actions">
    <button id="muteBtn" class="mute-btn">MUTE</button>
  </div>
  <div id="menuScreen" class="screen menu">
    <div class="menu-card">
      <h1 class="title">SPACE <span>JUMP</span></h1>
      <div id="walletInfo" class="wallet-info">
        <div class="wallet-row">
          <span id="walletAddress" class="wallet-address">—</span>
          <span id="walletBalance" class="wallet-balance">—</span>
          <button id="disconnectBtn" class="btn btn-small">Disconnect</button>
        </div>
      </div>
      <div class="btn-stack">
        <button id="connectBtn" class="btn btn-gold">CONNECT WALLET</button>
        <button id="depositBtn" class="btn btn-gold hidden">PLAY <span class="badge">10 UCT</span></button>
        <button id="practiceBtn" class="btn btn-teal">START PRACTICE</button>
      </div>
      <div id="errorBox" class="error-box"></div>
      <div class="subtext">Practice works instantly. Ranked uses Sphere wallet + 10 UCT entry.</div>
    </div>
  </div>
  <div id="gameScreen" class="screen game-screen hidden">
    <div class="game-wrap">
      <div class="hud">
        <div class="pill">SCORE <span id="hudScore">0</span></div>
        <div class="pill">LIVES <span id="hudLives">3</span></div>
        <div class="pill"><span id="hudAddr">DEMO</span></div>
      </div>
      <canvas id="gameCanvas"></canvas>
      <div class="hint">space / click / tap to jump · double jump works</div>
      <div id="gameOverlay" class="overlay">
        <div class="overlay-card">
          <h2>GAME OVER</h2>
          <div class="score-number" id="overlayScore">0</div>
          <div class="overlay-actions">
            <button id="playAgainBtn" class="btn btn-gold">PLAY AGAIN</button>
            <button id="menuBtn" class="btn btn-teal">MENU</button>
          </div>
          <div id="waitingNote" class="waiting-note">Confirm 10 UCT in Sphere to start ranked again.</div>
        </div>
      </div>
    </div>
  </div>
`;

const els = {
  menuScreen: document.getElementById('menuScreen'),
  gameScreen: document.getElementById('gameScreen'),
  connectBtn: document.getElementById('connectBtn'),
  depositBtn: document.getElementById('depositBtn'),
  practiceBtn: document.getElementById('practiceBtn'),
  walletInfo: document.getElementById('walletInfo'),
  walletAddress: document.getElementById('walletAddress'),
  walletBalance: document.getElementById('walletBalance'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  errorBox: document.getElementById('errorBox'),
  hudScore: document.getElementById('hudScore'),
  hudLives: document.getElementById('hudLives'),
  hudAddr: document.getElementById('hudAddr'),
  gameOverlay: document.getElementById('gameOverlay'),
  overlayScore: document.getElementById('overlayScore'),
  playAgainBtn: document.getElementById('playAgainBtn'),
  menuBtn: document.getElementById('menuBtn'),
  waitingNote: document.getElementById('waitingNote'),
};

// tiny star background
const bg = document.getElementById('bg');
const bgCtx = bg.getContext('2d');
let stars = [];
function resizeBg() {
  bg.width = window.innerWidth;
  bg.height = window.innerHeight;
  stars = Array.from({ length: 220 }, () => ({
    x: Math.random() * bg.width,
    y: Math.random() * bg.height,
    r: 0.5 + Math.random() * 1.7,
    a: 0.3 + Math.random() * 0.7,
    t: Math.random() * Math.PI * 2,
    s: 0.005 + Math.random() * 0.015,
  }));
}
function drawBg() {
  bgCtx.clearRect(0, 0, bg.width, bg.height);
  bgCtx.fillStyle = '#050816';
  bgCtx.fillRect(0, 0, bg.width, bg.height);
  stars.forEach((star) => {
    star.t += star.s;
    bgCtx.globalAlpha = star.a * (0.55 + 0.45 * Math.sin(star.t));
    bgCtx.fillStyle = '#fff';
    bgCtx.beginPath();
    bgCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    bgCtx.fill();
  });
  bgCtx.globalAlpha = 1;
  requestAnimationFrame(drawBg);
}
resizeBg();
window.addEventListener('resize', resizeBg);
drawBg();

const game = createGame(document.getElementById('gameCanvas'), {
  onScoreChange(score, lives) {
    els.hudScore.textContent = String(score);
    els.hudLives.textContent = String(lives);
  },
  onGameOver(score) {
    els.overlayScore.textContent = String(score);
    els.gameOverlay.style.display = 'flex';
  },
});

let rankedMode = false;
let muted = false;
function toggleMute() {
  muted = !muted;
  els.connectBtn.textContent = els.connectBtn.textContent; // no-op keeps layout stable
  document.getElementById('muteBtn').textContent = muted ? 'UNMUTE' : 'MUTE';
}
document.getElementById('muteBtn').addEventListener('click', toggleMute);

function showMenu() {
  els.gameOverlay.style.display = 'none';
  els.gameScreen.classList.add('hidden');
  els.menuScreen.classList.remove('hidden');
  game.stop();
}

function startGame(mode) {
  rankedMode = mode === 'ranked';
  els.menuScreen.classList.add('hidden');
  els.gameScreen.classList.remove('hidden');
  els.gameOverlay.style.display = 'none';
  const wallet = getWalletState();
  els.hudAddr.textContent = rankedMode ? (wallet.identity?.nametag || 'RANKED') : 'DEMO';
  game.start();
}

function syncWalletUI(wallet) {
  els.errorBox.style.display = wallet.error ? 'block' : 'none';
  els.errorBox.textContent = wallet.error || '';

  if (wallet.isConnected) {
    els.walletInfo.style.display = 'block';
    els.walletAddress.textContent = wallet.identity?.nametag || 'Connected';
    els.walletBalance.textContent = wallet.balance != null ? `${wallet.balance} UCT` : '...';
    els.disconnectBtn.classList.remove('hidden');
    els.depositBtn.classList.remove('hidden');
    els.connectBtn.classList.add('hidden');
  } else {
    els.walletInfo.style.display = 'none';
    els.depositBtn.classList.add('hidden');
    els.connectBtn.classList.remove('hidden');
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'CONNECT WALLET';
  }

  if (wallet.isDepositPaid && els.menuScreen.classList.contains('hidden')) {
    startGame('ranked');
  }
}

onWalletStateChange(syncWalletUI);
syncWalletUI(getWalletState());

els.connectBtn.addEventListener('click', async () => {
  els.connectBtn.disabled = true;
  els.connectBtn.textContent = 'CONNECTING…';
  await connectWallet();
  const wallet = getWalletState();
  if (!wallet.isConnected) {
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'CONNECT WALLET';
  }
});

els.disconnectBtn.addEventListener('click', () => {
  disconnect();
  showMenu();
});

els.depositBtn.addEventListener('click', async () => {
  els.depositBtn.disabled = true;
  els.depositBtn.textContent = 'CONFIRMING…';
  const ok = await depositEntryFee();
  if (ok) {
    startGame('ranked');
  } else {
    els.depositBtn.disabled = false;
    els.depositBtn.innerHTML = 'PLAY <span class="badge">10 UCT</span>';
  }
});

els.practiceBtn.addEventListener('click', () => startGame('practice'));
els.menuBtn.addEventListener('click', showMenu);
els.playAgainBtn.addEventListener('click', async () => {
  if (rankedMode) {
    els.waitingNote.style.display = 'block';
    els.playAgainBtn.disabled = true;
    const ok = await depositEntryFee();
    els.waitingNote.style.display = 'none';
    els.playAgainBtn.disabled = false;
    if (ok) startGame('ranked');
  } else {
    startGame('practice');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
    event.preventDefault();
    game.jump();
  }
});
document.getElementById('gameCanvas').addEventListener('click', () => game.jump());
document.getElementById('gameCanvas').addEventListener('touchstart', (event) => {
  event.preventDefault();
  game.jump();
}, { passive: false });
