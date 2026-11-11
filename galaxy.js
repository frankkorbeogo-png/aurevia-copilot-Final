/* AUREVIA — galaxie volumétrique WebGL : disque spiralé, profondeur et parallaxe 3D. */
(() => {
  const canvas = document.getElementById('galaxyCanvas');
  if (!canvas) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMotion.matches;
  try { reduced = reduced || localStorage.getItem('aurevia_reduce_motion') === '1'; } catch {}

  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', premultipliedAlpha: false
  });

  // Repli visuel si WebGL est désactivé par le navigateur ou l'appareil.
  if (!gl) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, stars = [];
    const count = 110;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      stars = Array.from({length: count}, () => ({x:Math.random()*w,y:Math.random()*h,r:.4+Math.random()*1.2,p:Math.random()*6.28}));
    };
    const draw = t => {
      ctx.clearRect(0,0,w,h);
      for (const s of stars) {
        const a = .22 + (Math.sin(t*.0007+s.p)+1)*.22;
        ctx.fillStyle = `rgba(177,178,255,${a})`;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      }
      if (!reduced) requestAnimationFrame(draw);
    };
    resize(); draw(0); window.addEventListener('resize',resize,{passive:true});
    return;
  }

  const vertexSource = `
    attribute vec3 a_position;
    attribute vec3 a_color;
    attribute float a_size;
    attribute float a_phase;
    uniform float u_time;
    uniform float u_aspect;
    uniform float u_pixel_ratio;
    varying vec3 v_color;
    varying float v_alpha;
    void main(){
      float spin = u_time * 0.018;
      float c = cos(spin), s = sin(spin);
      vec3 p = vec3(a_position.x*c-a_position.z*s, a_position.y, a_position.x*s+a_position.z*c);
      float tilt = 0.48;
      float cy = cos(tilt), sy = sin(tilt);
      p = vec3(p.x, p.y*cy-p.z*sy, p.y*sy+p.z*cy);
      float depth = p.z + 4.25;
      float perspective = 1.65 / max(depth, 1.1);
      gl_Position = vec4(p.x*perspective/u_aspect, p.y*perspective, 0.0, 1.0);
      gl_PointSize = clamp(a_size * (3.5/depth) * u_pixel_ratio, 1.0, 7.0);
      v_color = a_color;
      v_alpha = 0.48 + 0.42 * sin(u_time*1.15+a_phase);
    }`;
  const fragmentSource = `
    precision mediump float;
    varying vec3 v_color;
    varying float v_alpha;
    void main(){
      vec2 p = gl_PointCoord - vec2(0.5);
      float d = length(p);
      if(d > 0.5) discard;
      float core = smoothstep(0.5,0.03,d);
      float halo = exp(-d*11.0)*0.24;
      gl_FragColor = vec4(v_color, (core+halo)*v_alpha);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message);
    }
    return shader;
  }
  function makeProgram() {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  let program;
  try { program = makeProgram(); } catch { return; }
  gl.useProgram(program);
  const locations = {
    position: gl.getAttribLocation(program,'a_position'),
    color: gl.getAttribLocation(program,'a_color'),
    size: gl.getAttribLocation(program,'a_size'),
    phase: gl.getAttribLocation(program,'a_phase'),
    time: gl.getUniformLocation(program,'u_time'),
    aspect: gl.getUniformLocation(program,'u_aspect'),
    pixelRatio: gl.getUniformLocation(program,'u_pixel_ratio')
  };

  const mobile = window.matchMedia('(max-width: 720px)').matches;
  const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
  const count = mobile || lowPower ? 850 : 1900;
  const data = new Float32Array(count * 8);
  const random = (min,max) => min + Math.random()*(max-min);
  for (let i=0;i<count;i++) {
    const arm = Math.floor(Math.random()*4);
    const radius = Math.pow(Math.random(),.72)*1.95;
    const angle = arm*(Math.PI/2) + radius*2.45 + random(-.24,.24);
    const inGalaxy = Math.random() < .78;
    const x = inGalaxy ? Math.cos(angle)*radius + random(-.08,.08) : random(-2.8,2.8);
    const y = inGalaxy ? Math.sin(angle)*radius*.66 + random(-.07,.07) : random(-1.8,1.8);
    const z = inGalaxy ? random(-.25,.25)*(1.1-radius*.18) : random(-1.4,1.4);
    const hue = Math.random();
    const color = hue < .48 ? [0.58,0.68,1.0] : hue < .82 ? [0.69,0.53,1.0] : [0.83,0.88,1.0];
    const k=i*8;
    data[k]=x; data[k+1]=y; data[k+2]=z;
    data[k+3]=color[0]; data[k+4]=color[1]; data[k+5]=color[2];
    data[k+6]=random(1.2,4.0); data[k+7]=random(0,Math.PI*2);
  }
  const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  const stride=8*Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(locations.position); gl.vertexAttribPointer(locations.position,3,gl.FLOAT,false,stride,0);
  gl.enableVertexAttribArray(locations.color); gl.vertexAttribPointer(locations.color,3,gl.FLOAT,false,stride,3*4);
  gl.enableVertexAttribArray(locations.size); gl.vertexAttribPointer(locations.size,1,gl.FLOAT,false,stride,6*4);
  gl.enableVertexAttribArray(locations.phase); gl.vertexAttribPointer(locations.phase,1,gl.FLOAT,false,stride,7*4);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  gl.clearColor(0,0,0,0);

  let raf=0, start=0, pixelRatio=1;
  function resize(){
    pixelRatio=Math.min(window.devicePixelRatio||1,lowPower?1:1.5);
    const w=window.innerWidth,h=window.innerHeight;
    canvas.width=Math.round(w*pixelRatio); canvas.height=Math.round(h*pixelRatio);
    canvas.style.width=`${w}px`; canvas.style.height=`${h}px`;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform1f(locations.aspect,w/Math.max(h,1));
    gl.uniform1f(locations.pixelRatio,pixelRatio);
    draw(performance.now());
  }
  function draw(now){
    if(!start) start=now;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(locations.time,reduced?0:(now-start)*.001);
    gl.drawArrays(gl.POINTS,0,count);
    if(!reduced && !document.hidden) raf=requestAnimationFrame(draw);
  }
  function stop(){cancelAnimationFrame(raf);raf=0;}
  function play(){stop();start=0;raf=requestAnimationFrame(draw);}
  resize(); if(!reduced) play();
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(!reduced)play();});
  window.addEventListener('aurevia:motionchange',event=>{
    reduced=Boolean(event.detail?.reduced)||reducedMotion.matches;
    if(reduced){stop();draw(performance.now());}else play();
  });
  reducedMotion.addEventListener?.('change',event=>{
    reduced=event.matches;
    if(reduced){stop();draw(performance.now());}else play();
  });
})();
