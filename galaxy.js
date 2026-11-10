(() => {
  const canvas = document.getElementById('galaxyCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { reduced = reduced || localStorage.getItem('aurevia_reduce_motion') === '1'; } catch {}
  const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
  const mobile = window.matchMedia('(max-width: 720px)').matches;
  const motionScale = lowPower || mobile ? 0.48 : 1;
  let width = 0, height = 0, dpr = 1, stars = [], raf = 0, last = 0;
  const count = Math.min(mobile ? 125 : 280, Math.max(mobile ? 65 : 90, Math.floor((window.innerWidth * window.innerHeight) / (lowPower || mobile ? 13500 : 6500))));
  const rand = (a, b) => a + Math.random() * (b - a);
  const focal = 420;

  function makeStar() {
    const z = rand(.18, 1.25);
    return {
      x: rand(-1, 1) * z * width / focal * .9,
      y: rand(-1, 1) * z * height / focal * .9,
      z, radius: rand(.45, 1.45), hue: Math.random() < .2 ? rand(195, 220) : rand(250, 285),
      twinkle: rand(0, Math.PI * 2), previous: null
    };
  }
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: count }, makeStar);
  }
  function project(star, now = 0) {
    // Rotation orbitale très lente + perspective Z : sensation de volume 3D.
    const angle = now * (mobile ? 0.0000018 : 0.0000028);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rx = star.x * cos - star.y * sin;
    const ry = star.x * sin + star.y * cos;
    return { x: width / 2 + rx * focal / star.z, y: height / 2 + ry * focal / star.z };
  }
  function draw(now = 0) {
    const delta = last ? Math.min(40, now - last) : 16;
    last = now;
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      const point = project(star, now);
      const depth = 1 - star.z / 1.25;
      const alpha = .25 + (Math.sin(now * .0012 + star.twinkle) + 1) * .2;
      const radius = Math.max(.35, star.radius * (.45 + depth * 1.8));
      if (star.previous && !reduced && star.z < .42) {
        ctx.beginPath(); ctx.moveTo(star.previous.x, star.previous.y); ctx.lineTo(point.x, point.y);
        ctx.strokeStyle = `hsla(${star.hue},85%,82%,${alpha * .28})`; ctx.lineWidth = radius * .7; ctx.stroke();
      }
      ctx.beginPath(); ctx.fillStyle = `hsla(${star.hue},88%,${star.z < .38 ? 94 : 80}%,${alpha})`;
      ctx.shadowBlur = star.z < .38 ? 9 : 3; ctx.shadowColor = `hsl(${star.hue},90%,75%)`;
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      star.previous = point;
      if (!reduced) {
        star.z -= delta * .000075 * motionScale;
        if (star.z <= .13) Object.assign(star, makeStar(), { previous: null });
      }
    }
    // Ellipse orbitale subtile : donne une échelle cosmique sans couvrir les panneaux.
    ctx.globalAlpha = .055; ctx.strokeStyle = '#8b83f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(width * .68, height * .46, width * .42, height * .19, -.24, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    if (!reduced) raf = requestAnimationFrame(draw);
  }
  function start() { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(draw); }
  resize(); start();
  window.addEventListener('resize', () => { resize(); if (reduced) draw(); }, { passive: true });
  window.addEventListener('aurevia:motionchange', event => {
    reduced = Boolean(event.detail?.reduced) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { cancelAnimationFrame(raf); draw(); } else start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduced) start();
  });
})();
