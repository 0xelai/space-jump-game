export function createGame(canvas, { onGameOver, onScoreChange }) {
  const ctx = canvas.getContext('2d');
  const W = 460;
  const H = 620;
  canvas.width = W;
  canvas.height = H;

  function resize() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
  }
  resize();
  window.addEventListener('resize', resize);

  const GRAVITY = 0.42;
  const JUMP_VELOCITY = -10.4;
  const DOUBLE_JUMP_VELOCITY = -9.2;
  const CEILING = 58;
  const BASE_Y = 505;

  const state = {
    running: false,
    ended: false,
    frame: 0,
    score: 0,
    lives: 3,
    particles: [],
    obstacles: [],
    coins: [],
    obstacleTimer: 0,
    coinTimer: 0,
    invincibility: 0,
    player: { x: 88, y: 330, w: 22, h: 52, vy: 0, jumps: 2, onGround: false, tick: 0 },
  };

  let raf = null;

  function currentSpeed() {
    const s = state.score;
    if (s < 400) return 3.0 + (s / 400) * 0.8;
    if (s < 1500) return 3.8 + ((s - 400) / 1100) * 1.7;
    if (s < 3500) return 5.5 + ((s - 1500) / 2000) * 1.5;
    return Math.min(9.2, 7 + ((s - 3500) / 800) * 1.4);
  }

  function obstacleInterval() {
    const s = state.score;
    if (s < 400) return 120;
    if (s < 1500) return 100;
    if (s < 3500) return 82;
    return 62;
  }

  function spawnObstacle() {
    const roll = Math.random();
    if (roll < 0.24) {
      state.obstacles.push({ type: 'rock', x: W + 20, y: 410 + Math.random() * 75, w: 26 + Math.random() * 24, h: 24 + Math.random() * 22, spin: Math.random() * Math.PI * 2 });
    } else if (roll < 0.42) {
      state.obstacles.push({ type: 'sat', x: W + 20, y: 140 + Math.random() * 160, w: 34, h: 24, spin: Math.random() * Math.PI * 2 });
    } else if (roll < 0.58) {
      const fromTop = Math.random() < 0.5;
      const h = 90 + Math.random() * 90;
      state.obstacles.push({ type: 'laser', x: W + 20, y: fromTop ? CEILING : H - 30 - h, w: 12, h });
    } else if (roll < 0.76) {
      state.obstacles.push({ type: 'ufo', x: W + 20, y: 140 + Math.random() * 220, w: 44, h: 22, vy: (Math.random() < 0.5 ? -1 : 1) * 1.1 });
    } else {
      state.obstacles.push({ type: 'ball', x: W + 20, y: 110 + Math.random() * 330, w: 18, h: 18, pulse: 0 });
    }
  }

  function spawnCoin() {
    state.coins.push({ x: W + 20, y: 100 + Math.random() * 360, r: 6, bob: Math.random() * Math.PI * 2, collected: false });
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 - 1.5, life: 1, color, r: 1.5 + Math.random() * 2.5 });
    }
  }

  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function hit() {
    if (state.invincibility > 0) return;
    state.lives -= 1;
    burst(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2, '#ffb3c8', 16);
    if (state.lives <= 0) {
      state.ended = true;
      state.running = false;
      onGameOver?.(state.score);
      return;
    }
    state.invincibility = 110;
    state.player.y = 220;
    state.player.vy = 0;
  }

  function update() {
    if (!state.running || state.ended) return;
    const p = state.player;
    state.frame += 1;
    state.score += 1;
    onScoreChange?.(state.score, state.lives);
    if (state.invincibility > 0) state.invincibility -= 1;

    p.tick += 1;
    p.vy += GRAVITY;
    p.y += p.vy;
    if (p.y < CEILING) {
      p.y = CEILING;
      p.vy = Math.abs(p.vy) * 0.22;
      p.jumps = 0;
    }

    const speed = currentSpeed();
    state.obstacles.forEach((o) => {
      o.x -= speed * 1.05;
      if (o.type === 'ufo') {
        o.y += o.vy;
        if (o.y < CEILING + 10 || o.y > H - 70) o.vy *= -1;
      }
      if (o.type === 'ball') o.pulse += 0.18;
      if (o.spin != null) o.spin += 0.035;
    });
    state.coins.forEach((c) => {
      c.x -= speed;
      c.bob += 0.055;
    });

    state.obstacleTimer += 1;
    if (state.obstacleTimer >= obstacleInterval()) {
      state.obstacleTimer = 0;
      spawnObstacle();
    }
    state.coinTimer += 1;
    if (state.coinTimer >= 90) {
      state.coinTimer = 0;
      spawnCoin();
    }

    p.onGround = false;
    if (p.y + p.h >= BASE_Y) {
      p.y = BASE_Y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.jumps = 2;
    }

    const playerHitBox = { x: p.x + 6, y: p.y + 6, w: p.w - 12, h: p.h - 10 };
    if (state.invincibility === 0) {
      for (const o of state.obstacles) {
        const ob = { x: o.x + 2, y: o.y + 2, w: o.w - 4, h: o.h - 4 };
        if (rectOverlap(playerHitBox, ob)) {
          hit();
          break;
        }
      }
    }

    state.coins.forEach((c) => {
      if (c.collected) return;
      const cy = c.y + Math.sin(c.bob) * 4;
      const dx = p.x + p.w / 2 - c.x;
      const dy = p.y + p.h / 2 - cy;
      if (Math.hypot(dx, dy) < c.r + 16) {
        c.collected = true;
        state.score += 80;
        burst(c.x, cy, '#ffe680', 10);
      }
    });

    state.obstacles = state.obstacles.filter((o) => o.x + o.w > -40);
    state.coins = state.coins.filter((c) => !c.collected && c.x > -20);
    state.particles.forEach((pt) => {
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.1; pt.life -= 0.03;
    });
    state.particles = state.particles.filter((pt) => pt.life > 0);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#07091a';
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createLinearGradient(0, 0, 0, CEILING + 40);
    glow.addColorStop(0, 'rgba(255,130,180,.14)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, CEILING + 40);

    ctx.strokeStyle = 'rgba(255,140,185,.4)';
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(0, CEILING);
    ctx.lineTo(W, CEILING);
    ctx.stroke();
    ctx.setLineDash([]);

    // floor
    ctx.fillStyle = '#121838';
    ctx.fillRect(0, BASE_Y, W, H - BASE_Y);
    ctx.fillStyle = 'rgba(184,164,255,0.8)';
    ctx.fillRect(0, BASE_Y, W, 3);
  }

  function drawCoins() {
    state.coins.forEach((coin) => {
      const y = coin.y + Math.sin(coin.bob) * 4;
      const g = ctx.createRadialGradient(coin.x, y, 0, coin.x, y, coin.r * 2.6);
      g.addColorStop(0, 'rgba(255,230,120,.28)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(coin.x, y, coin.r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe680';
      ctx.beginPath();
      ctx.arc(coin.x, y, coin.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawObstacles() {
    state.obstacles.forEach((o) => {
      ctx.save();
      if (o.type === 'rock') {
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        ctx.rotate(o.spin);
        ctx.fillStyle = '#9e8c7a';
        ctx.beginPath();
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2;
          const r = (o.w / 2) * (0.75 + 0.25 * Math.sin(a * 2.1 + 1.3));
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (o.type === 'sat') {
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        ctx.rotate(o.spin);
        ctx.fillStyle = '#c8d2e0';
        ctx.fillRect(-o.w / 2, -o.h / 3, o.w, o.h * 0.66);
        ctx.fillStyle = '#78c8e8';
        ctx.fillRect(-o.w, -4, o.w * 0.4, 8);
        ctx.fillRect(o.w * 0.6, -4, o.w * 0.4, 8);
      } else if (o.type === 'laser') {
        const g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y);
        g.addColorStop(0, 'rgba(255,140,185,0)');
        g.addColorStop(0.5, 'rgba(255,140,185,.88)');
        g.addColorStop(1, 'rgba(255,140,185,0)');
        ctx.fillStyle = g;
        ctx.fillRect(o.x, o.y, o.w, o.h);
      } else if (o.type === 'ufo') {
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        ctx.fillStyle = '#c0e0ff';
        ctx.beginPath();
        ctx.ellipse(0, 0, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,220,255,.7)';
        ctx.beginPath();
        ctx.ellipse(0, -o.h / 2 + 2, o.w / 4, o.h / 2, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      } else {
        const pulse = 0.86 + 0.14 * Math.sin(o.pulse);
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, (o.w / 2) * pulse);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, '#88ffee');
        g.addColorStop(0.7, '#00ccff');
        g.addColorStop(1, 'rgba(0,100,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, (o.w / 2) * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawParticles() {
    state.particles.forEach((pt) => {
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * pt.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = state.player;
    if (state.invincibility > 0 && Math.floor(state.invincibility / 5) % 2 === 0) return;
    const px = p.x + p.w / 2;
    const py = p.y;
    const legSwing = p.onGround ? Math.sin(p.tick * 0.28) * 10 : 0;
    const legSwing2 = p.onGround ? Math.sin(p.tick * 0.28 + Math.PI) * 10 : 0;

    ctx.save();
    ctx.translate(px, py);

    // hoverboard
    const boardW = 38; const boardH = 7; const boardY = p.h + 2;
    const glow = ctx.createRadialGradient(0, boardY + 4, 0, 0, boardY + 4, 22);
    glow.addColorStop(0, 'rgba(80,200,255,.32)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(0, boardY + 4, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a3a5a';
    roundRect(-boardW / 2, boardY, boardW, boardH, 4); ctx.fill();
    ctx.fillStyle = '#3a5080';
    roundRect(-boardW / 2 + 2, boardY + 1, boardW - 4, 3, 2); ctx.fill();

    // legs
    ctx.strokeStyle = '#3a8090'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, p.h - 14); ctx.lineTo(-4 + legSwing, p.h - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, p.h - 14); ctx.lineTo(4 + legSwing2, p.h - 2); ctx.stroke();

    // body
    ctx.fillStyle = '#2e7090';
    ctx.beginPath();
    ctx.moveTo(-9, p.h - 14); ctx.lineTo(-10, p.h - 34); ctx.lineTo(10, p.h - 34); ctx.lineTo(9, p.h - 14); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c8a020'; ctx.fillRect(-11, p.h - 32, 2, 18); ctx.fillRect(9, p.h - 32, 2, 18);

    // helmet
    const helmetY = p.h - 52;
    ctx.fillStyle = '#c8d8e8'; ctx.beginPath(); ctx.arc(0, helmetY, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dde8f4'; ctx.beginPath(); ctx.arc(0, helmetY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a1830'; ctx.beginPath(); ctx.ellipse(0, helmetY, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-3, helmetY - 3, 4, 2.5, -0.4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawCoins();
    drawObstacles();
    drawPlayer();
    drawParticles();
  }

  function tick() {
    update();
    draw();
    raf = requestAnimationFrame(tick);
  }

  function jump() {
    if (!state.running || state.ended) return;
    const p = state.player;
    if (p.jumps > 0) {
      p.vy = p.jumps === 2 ? JUMP_VELOCITY : DOUBLE_JUMP_VELOCITY;
      p.jumps -= 1;
      burst(p.x + p.w / 2, p.y + p.h, '#c4b0ff', 5);
    }
  }

  function start() {
    reset();
    state.running = true;
    tick();
  }

  function reset() {
    cancelAnimationFrame(raf);
    raf = null;
    state.running = false;
    state.ended = false;
    state.frame = 0;
    state.score = 0;
    state.lives = 3;
    state.invincibility = 0;
    state.obstacles = [];
    state.coins = [];
    state.particles = [];
    state.obstacleTimer = 0;
    state.coinTimer = 0;
    state.player = { x: 88, y: 330, w: 22, h: 52, vy: 0, jumps: 2, onGround: false, tick: 0 };
    onScoreChange?.(0, 3);
    draw();
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = null;
    state.running = false;
  }

  return { start, reset, stop, jump };
}
