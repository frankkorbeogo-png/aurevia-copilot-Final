/* AUREVIA — Voie lactée 3D lointaine, animée en WebGL. */
(() => {
  const canvas = document.getElementById('galaxyCanvas');
  if (!canvas) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMotion.matches;
  try { reduced = reduced || localStorage.getItem('aurevia_reduce_motion') === '1'; } catch {}
  const gl = canvas.getContext('webgl', { alpha:true, antialias:false, depth:false, stencil:false, powerPreference:'high-performance', premultipliedAlpha:false });
  if (!gl) {
    const ctx=canvas.getContext('2d'); if(!ctx)return;
    let w=0,h=0,stars=[];
    const resize=()=>{w=canvas.width=innerWidth;h=canvas.height=innerHeight;stars=Array.from({length:650},()=>({x:Math.random()*w,y:Math.random()*h,r:.25+Math.random()*1.15,a:.2+Math.random()*.65,p:Math.random()*6.28}));};
    const draw=t=>{ctx.clearRect(0,0,w,h);for(const s of stars){ctx.fillStyle=`rgba(190,205,255,${s.a*(.65+.35*Math.sin(t*.0005+s.p))})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}if(!reduced)requestAnimationFrame(draw);};
    resize();draw(0);addEventListener('resize',resize,{passive:true});return;
  }
  const vertex=`
    attribute vec3 a_pos; attribute vec3 a_col; attribute float a_size; attribute float a_phase; attribute float a_kind;
    uniform float u_time; uniform float u_aspect; uniform float u_ratio;
    varying vec3 v_col; varying float v_alpha; varying float v_kind;
    void main(){
      float spin=u_time*0.010;
      float c=cos(spin),s=sin(spin);
      vec3 p=a_pos;
      if(a_kind<1.5) p=vec3(a_pos.x*c-a_pos.y*s,a_pos.x*s+a_pos.y*c,a_pos.z);
      float tilt=0.43+0.025*sin(u_time*0.07);
      float ct=cos(tilt),st=sin(tilt);
      if(a_kind<1.5) p=vec3(p.x,p.y*ct-p.z*st,p.y*st+p.z*ct);
      float depth=8.2+p.z;
      float perspective=3.7/max(depth,2.0);
      gl_Position=vec4(p.x*perspective/u_aspect,p.y*perspective,0.0,1.0);
      gl_PointSize=clamp(a_size*(7.5/depth)*u_ratio,0.65,8.0);
      v_col=a_col; v_kind=a_kind;
      v_alpha=(0.58+0.42*sin(u_time*0.55+a_phase));
    }`;
  const fragment=`
    precision mediump float; varying vec3 v_col; varying float v_alpha; varying float v_kind;
    void main(){vec2 q=gl_PointCoord-vec2(.5);float d=length(q);if(d>.5)discard;
      float core=1.0-smoothstep(.02,.48,d);float glow=exp(-d*9.0);
      float intensity=mix(core*.75+glow*.28,core*.9+glow*.75,v_kind);
      gl_FragColor=vec4(v_col,intensity*v_alpha);
    }`;
  function shader(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh;}
  let program;
  try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));}catch{return;}
  gl.useProgram(program);
  const loc={pos:gl.getAttribLocation(program,'a_pos'),col:gl.getAttribLocation(program,'a_col'),size:gl.getAttribLocation(program,'a_size'),phase:gl.getAttribLocation(program,'a_phase'),kind:gl.getAttribLocation(program,'a_kind'),time:gl.getUniformLocation(program,'u_time'),aspect:gl.getUniformLocation(program,'u_aspect'),ratio:gl.getUniformLocation(program,'u_ratio')};
  const mobile=matchMedia('(max-width:720px)').matches, cores=navigator.hardwareConcurrency||4;
  const count=mobile||cores<=4?7800:18000, data=new Float32Array(count*9);
  const rnd=(a,b)=>a+Math.random()*(b-a), gauss=()=>((Math.random()+Math.random()+Math.random()+Math.random()+Math.random()+Math.random())-3)*.42;
  for(let i=0;i<count;i++){
    let x,y,z,r,arm,angle,kind=0,size;
    const zone=Math.random();
    if(zone<.57){ // quatre bras spiraux de la galaxie
      arm=Math.floor(Math.random()*4);r=Math.pow(Math.random(),.72)*3.55;
      angle=arm*Math.PI/2+r*1.48+gauss()*.22;
      const spread=.035+r*.035;
      x=Math.cos(angle)*r+gauss()*spread;y=Math.sin(angle)*r*.67+gauss()*spread;
      z=gauss()*(.055+r*.018);size=rnd(.65,2.25);kind=.18;
    }else if(zone<.78){ // bulbe central lumineux
      r=Math.abs(gauss())*.72;angle=rnd(0,Math.PI*2);
      x=Math.cos(angle)*r;y=Math.sin(angle)*r*.68;z=gauss()*.28;
      size=rnd(1.0,3.4);kind=.9;
    }else if(zone<.91){ // halo galactique diffus
      r=Math.sqrt(Math.random())*3.85;angle=rnd(0,Math.PI*2);
      x=Math.cos(angle)*r;y=Math.sin(angle)*r*.72;z=gauss()*.42;
      size=rnd(.45,1.45);kind=.08;
    }else{ // étoiles au premier et à l'arrière-plan, profondeur réelle
      x=rnd(-7,7);y=rnd(-4.2,4.2);z=rnd(-5.5,5.5);size=rnd(.45,1.55);kind=2.0;
    }
    const dist=Math.hypot(x,y), center=Math.max(0,1-dist/1.35), hue=Math.random();
    let col;
    if(center>.25)col=[1.0,.78+.18*Math.random(),.52+.25*Math.random()];
    else if(hue<.46)col=[.48+.15*Math.random(),.62+.2*Math.random(),1.0];
    else if(hue<.78)col=[.65+.16*Math.random(),.52+.15*Math.random(),1.0];
    else col=[.78,.84,.98];
    const k=i*9;data[k]=x;data[k+1]=y;data[k+2]=z;data[k+3]=col[0];data[k+4]=col[1];data[k+5]=col[2];data[k+6]=size;data[k+7]=rnd(0,6.28);data[k+8]=kind;
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  const stride=9*4;
  for(const [name,size,offset] of [['pos',3,0],['col',3,3],['size',1,6],['phase',1,7],['kind',1,8]]){gl.enableVertexAttribArray(loc[name]);gl.vertexAttribPointer(loc[name],size,gl.FLOAT,false,stride,offset*4);}
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(0,0,0,0);
  let raf=0,start=0,ratio=1;
  function resize(){ratio=Math.min(devicePixelRatio||1,mobile?1.25:1.7);const w=innerWidth,h=innerHeight;canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);canvas.style.width=w+'px';canvas.style.height=h+'px';gl.viewport(0,0,canvas.width,canvas.height);gl.uniform1f(loc.aspect,w/Math.max(h,1));gl.uniform1f(loc.ratio,ratio);render(performance.now());}
  function render(now){if(!start)start=now;gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(loc.time,reduced?0:(now-start)*.001);gl.drawArrays(gl.POINTS,0,count);if(!reduced&&!document.hidden)raf=requestAnimationFrame(render);}
  function stop(){cancelAnimationFrame(raf);raf=0;}function play(){stop();start=0;raf=requestAnimationFrame(render);}
  resize();if(!reduced)play();addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(!reduced)play();});
  addEventListener('aurevia:motionchange',e=>{reduced=Boolean(e.detail?.reduced)||reducedMotion.matches;if(reduced){stop();render(performance.now());}else play();});
  reducedMotion.addEventListener?.('change',e=>{reduced=e.matches;if(reduced){stop();render(performance.now());}else play();});
})();
