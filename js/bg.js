/*
 * Full-screen WebGL backdrop: a neon warp tunnel with a domain-warped
 * nebula, light streaks and beat-synced rings. Colours, speed and pulse
 * follow the workout phase. Falls back to a CSS gradient if WebGL is missing.
 */
(function () {
  'use strict';

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;uniform float uTime;uniform float uTravel;uniform vec3 uA;uniform vec3 uB;',
    'uniform float uEnergy;uniform float uBeat;uniform vec2 uFocus;uniform float uFlash;',
    '#define TAU 6.28318530718',
    'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    ' for(int i=0;i<5;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}',
    'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}',
    'void main(){',
    ' vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);',
    ' vec2 q=p-uFocus;',
    ' float r=length(q);',
    ' float ang=atan(q.y,q.x);',
    ' float T=uTime;',
    ' vec3 col=vec3(.010,.004,.028);',
    // nebula
    ' vec2 np=rot(T*.015+uTravel*.02)*q*1.7;',
    ' vec2 w=vec2(fbm(np*1.2+vec2(T*.04,0.)),fbm(np*1.2+vec2(5.2,-T*.035)));',
    ' float n=fbm(np*1.6+w*1.8+vec2(0.,T*.02));',
    ' vec3 neb=mix(uA,uB,smoothstep(.2,.8,w.x));',
    ' col+=neb*pow(n,2.4)*(.55+.45*uEnergy)*smoothstep(1.7,.05,r)*1.25;',
    // tunnel geometry: depth grows toward the centre
    ' float k=.30;',
    ' float z=k/max(r,.002)+uTravel;',
    ' float seg=18.;',
    ' float sa=ang/TAU*seg+uTravel*.15;',
    ' float fogNear=smoothstep(.015,.42,r);',
    ' float fogFar=smoothstep(2.2,.5,r);',
    // rings: convert depth distance into screen distance for constant width
    ' float rf=abs(fract(z)-.5);',
    ' float rd=(.5-rf)*r*r/k;',
    ' float ringId=floor(z+.5);',
    ' float cell=floor(sa);',
    ' float gate=step(.38,h21(vec2(cell,ringId)));',
    ' float ringLine=exp(-rd*rd*9000.)*gate;',
    ' float ringGlow=exp(-rd*42.)*(.25+.75*gate);',
    ' vec3 ringCol=mix(uA,uB,h21(vec2(ringId,3.1)));',
    ' float ringBeat=.55+.9*uBeat*exp(-abs(fract(z)-.5)*0.)+.35*uEnergy;',
    ' col+=ringCol*(ringLine*1.4+ringGlow*.35)*ringBeat*fogNear*fogFar;',
    // longitudinal rails
    ' float af=abs(fract(sa)-.5);',
    ' float ad=(.5-af)*TAU/seg*r;',
    ' float rail=exp(-ad*ad*60000.)*step(.55,h21(vec2(cell,7.)));',
    ' col+=mix(uB,uA,.3)*rail*.55*fogNear*fogFar*(.6+.4*uEnergy);',
    // warp streaks
    ' for(int L=0;L<2;L++){',
    '  float fl=float(L);',
    '  float N=70.+fl*50.;',
    '  float sc=ang/TAU*N+fl*.37;',
    '  float id=floor(sc);',
    '  float hh=h21(vec2(id,fl*9.1+1.));',
    '  float spd=.18+.5*hh;',
    '  float ph=fract(hh*7.3+uTravel*spd*(.6+fl*.4));',
    '  float sr=mix(.04,2.1,ph*ph*ph);',
    '  float len=(.02+.5*uEnergy*uEnergy+.03*uBeat)*sr;',
    '  float along=smoothstep(sr-len,sr,r)*step(r,sr);',
    '  float across=abs(fract(sc)-.5)*TAU/N*r;',
    '  float sw=exp(-across*across*(140000./(1.+r*6.)));',
    '  vec3 sCol=mix(vec3(1.),mix(uA,uB,hh),.55);',
    '  col+=sCol*sw*along*(.35+.65*ph)*(.45+.9*uEnergy)*step(.35,h21(vec2(id,fl+4.)));',
    ' }',
    // centre bloom
    ' vec3 core=mix(uA,uB,.5);',
    ' col+=core*(.010/(r*r+.006))*(.30+.30*uEnergy+.45*uBeat);',
    ' col+=uA*exp(-r*3.2)*(.10+.25*uBeat);',
    // flash on phase change
    ' col+=mix(uA,vec3(1.),.5)*uFlash*.35*exp(-r*.8);',
    // grade: soft tone map, vignette, grain
    ' col=1.-exp(-col*1.25);',
    ' col*=smoothstep(1.9,.25,length(p));',
    ' col+=(h21(gl_FragCoord.xy+fract(T)*100.)-.5)*.028;',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  // Studio look: a quiet photographic backdrop. Graphite (or warm paper) with a
  // soft spotlight pool where the athlete stands, two slow phase-tinted light
  // washes, and a gentle vignette. Grain is a static CSS layer (cheaper, and it
  // dithers the smooth gradients).
  var FRAG_STUDIO = [
    'precision highp float;',
    'uniform vec2 uRes;uniform float uTime;uniform vec3 uA;uniform vec3 uB;',
    'uniform float uEnergy;uniform float uBeat;uniform vec2 uFocus;uniform float uFlash;uniform float uLight;',
    'uniform vec3 uD0;uniform vec3 uD1;uniform vec3 uDPool;uniform float uDWash;uniform float uDVig;uniform float uDTint;',
    'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}',
    'void main(){',
    ' vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);',
    ' vec2 q=p-uFocus;',
    ' float T=uTime;',
    ' float gy=clamp(gl_FragCoord.y/uRes.y,0.,1.);',
    // base gradient: lighter at the top like a cyclorama
    ' vec3 dark=mix(uD0,uD1,gy);',
    ' vec3 light=mix(vec3(.905,.900,.885),vec3(.972,.968,.955),gy);',
    ' vec3 col=mix(dark,light,uLight);',
    // spotlight pool around the athlete
    ' vec2 sp=q*vec2(.9,1.35);',
    ' float pool=exp(-dot(sp,sp)*mix(3.6,2.4,uLight));',
    ' col+=mix(uDPool,vec3(.03,.03,.026),uLight)*pool;',
    ' col+=mix(vec3(dot(uA,vec3(.3,.59,.11))),uA,.55)*pool*uDTint*(1.-uLight);',
    // soft top key light falling on the stage
    ' float beam=exp(-pow(abs(q.x)*1.6,2.))*smoothstep(-.6,1.2,q.y)*.5;',
    ' col+=mix(vec3(.035,.037,.045),vec3(.012,.012,.01),uLight)*beam;',
    // two slow phase-coloured light washes with a little organic texture
    ' vec2 c1=uFocus+vec2(-.62+.07*sin(T*.11),.42+.05*cos(T*.13));',
    ' vec2 c2=uFocus+vec2(.66+.06*cos(T*.09),-.30+.05*sin(T*.12));',
    ' float n=.75+.5*(noise(p*1.4+T*.025)*.65+noise(p*3.1-T*.02)*.35);',
    ' float b1=exp(-dot(p-c1,p-c1)*1.5)*n;',
    ' float b2=exp(-dot(p-c2,p-c2)*1.8)*n;',
    ' float w=(.03+.03*uEnergy+.008*uBeat)*mix(uDWash,1.,uLight);',
    ' vec3 tA=mix(vec3(dot(uA,vec3(.3,.59,.11))),uA,.5);',
    ' vec3 tB=mix(vec3(dot(uB,vec3(.3,.59,.11))),uB,.5);',
    ' vec3 addD=(tA*b1+tB*b2*.7)*w;',
    ' vec3 lit=col+addD;',
    ' vec3 tinted=mix(mix(col,uA,b1*w*1.2),uB,b2*w*.8);',
    ' col=mix(lit,tinted,uLight);',
    // phase-change lift
    ' col+=mix(uA*.10,uA*.05,uLight)*uFlash*exp(-dot(q,q)*1.2);',
    // vignette
    ' float v=smoothstep(1.75,.3,length(p*vec2(.85,1.)));',
    ' col*=mix(1.-uDVig+uDVig*v,.9+.1*v,uLight);',
    ' col+=(h21(gl_FragCoord.xy)-.5)/255.;',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function Backdrop(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.a = hexToRgb('#8a5cff'); this.b = hexToRgb('#22e5ff');
    this.ta = this.a.slice(); this.tb = this.b.slice();
    this.energy = 0.25; this.targetEnergy = 0.25;
    this.beat = 0; this.flash = 0;
    this.travel = 0; this.time = 0;
    this.focus = [0, 0.05]; this.targetFocus = [0, 0.05];
    this.scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
    this.frameTimes = [];
    this.running = true;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = document.documentElement;
    this.style = root.getAttribute('data-look') === 'studio' ? 'studio' : 'neon';
    this.light = root.getAttribute('data-scheme') === 'light' ? 1 : 0;
    this.dark = DARK_STAGES[root.getAttribute('data-dark')] || DARK_STAGES.graphite;
    try { this._init(); } catch (e) { this.ok = false; }
    if (!this.ok) document.documentElement.classList.add('no-webgl');
    this._loop = this._loop.bind(this);
    this._last = performance.now();
    requestAnimationFrame(this._loop);
    var self = this;
    window.addEventListener('resize', function () { self._sizeDirty = true; self._drewStill = false; });
  }

  Backdrop.prototype._init = function () {
    var gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function program(frag) {
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      var u = {};
      ['uRes', 'uTime', 'uTravel', 'uA', 'uB', 'uEnergy', 'uBeat', 'uFocus', 'uFlash', 'uLight', 'uD0', 'uD1', 'uDPool', 'uDWash', 'uDVig', 'uDTint'].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });
      return { prog: prog, u: u };
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.programs = { neon: program(FRAG), studio: program(FRAG_STUDIO) };
    this.gl = gl;
    this._useStyle();
    var self = this;
    this.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.ok = false; }, false);
    this.canvas.addEventListener('webglcontextrestored', function () { try { self._init(); } catch (err) { /* stay on CSS fallback */ } }, false);
    this.ok = true;
    this._resize();
  };

  Backdrop.prototype._resize = function () {
    if (!this.gl) return;
    var w = Math.max(1, Math.round(this.canvas.clientWidth * this.scale));
    var h = Math.max(1, Math.round(this.canvas.clientHeight * this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  };

  Backdrop.prototype._useStyle = function () {
    if (!this.gl) return;
    var pr = this.programs[this.style] || this.programs.neon;
    this.gl.useProgram(pr.prog);
    this.u = pr.u;
  };
  // Dark-stage directions for the studio backdrop: bottom/top colour, spotlight pool,
  // phase-wash strength and vignette depth.
  var DARK_STAGES = {
    graphite: { d0: [.062, .061, .062], d1: [.100, .098, .099], pool: [.07, .069, .069], wash: .9, vig: .3, tint: 0 },
    midnight: { d0: [.012, .018, .036], d1: [.045, .064, .112], pool: [.055, .075, .13], wash: .9, vig: .55 },
    oled: { d0: [0, 0, 0], d1: [.022, .022, .026], pool: [.05, .05, .056], wash: .75, vig: .7 },
    charcoal: { d0: [.040, .037, .034], d1: [.094, .088, .082], pool: [.085, .079, .072], wash: 1.0, vig: .4, tint: .03 }
  };
  Backdrop.prototype.setDark = function (name) {
    this.dark = DARK_STAGES[name] || DARK_STAGES.graphite;
    this._drewStill = false;
  };

  /** Switch between the neon tunnel and the studio backdrop. */
  Backdrop.prototype.setStyle = function (style, scheme) {
    this.style = style === 'studio' ? 'studio' : 'neon';
    this.light = scheme === 'light' ? 1 : 0;
    this._useStyle();
    this._drewStill = false;
  };

  /** Smoothly retarget colours / energy. */
  Backdrop.prototype.setMood = function (a, b, energy) {
    this.ta = hexToRgb(a); this.tb = hexToRgb(b);
    if (energy != null) this.targetEnergy = energy;
  };
  Backdrop.prototype.setFocus = function (x, y) { this.targetFocus = [x, y]; };
  Backdrop.prototype.beatNow = function (amt) { this.beat = Math.max(this.beat, amt == null ? 1 : amt); };
  Backdrop.prototype.flashNow = function () { this.flash = 1; this.beat = 1; };
  Backdrop.prototype.setRunning = function (on) { this.running = on; };
  /** Cap the frame rate (e.g. 30 on menus); 0 = every frame. */
  Backdrop.prototype.setFrameRate = function (fps) { this.minStep = fps ? 1 / fps : 0; };

  /** Nothing visible is changing: colours, energy, focus and pulses have settled. */
  Backdrop.prototype._settled = function () {
    var d = 0;
    for (var i = 0; i < 3; i++) d += Math.abs(this.ta[i] - this.a[i]) + Math.abs(this.tb[i] - this.b[i]);
    return d < 0.004 && Math.abs(this.targetEnergy - this.energy) < 0.004 && this.beat < 0.004 && this.flash < 0.004 &&
      Math.abs(this.targetFocus[0] - this.focus[0]) + Math.abs(this.targetFocus[1] - this.focus[1]) < 0.002;
  };

  Backdrop.prototype._loop = function (now) {
    requestAnimationFrame(this._loop);
    var dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    if (!this.ok || document.hidden) return;
    // Battery: paused or reduced motion shows a still frame once things settle.
    var still = !this.running || this.reduced;
    if (still && this._drewStill && this._settled()) return;
    this._acc = (this._acc || 0) + dt;
    if (!still && this.minStep && this._acc < this.minStep) return;
    dt = Math.min(0.1, this._acc);
    this._acc = 0;
    if (this.reduced) { this.beat = 0; this.flash = 0; }

    var k = 1 - Math.exp(-dt * 6);
    for (var i = 0; i < 3; i++) {
      this.a[i] += (this.ta[i] - this.a[i]) * k;
      this.b[i] += (this.tb[i] - this.b[i]) * k;
    }
    this.energy += (this.targetEnergy - this.energy) * (1 - Math.exp(-dt * 1.5));
    this.focus[0] += (this.targetFocus[0] - this.focus[0]) * k;
    this.focus[1] += (this.targetFocus[1] - this.focus[1]) * k;
    this.beat *= Math.exp(-dt * 3.2);
    this.flash *= Math.exp(-dt * 2.6);
    var motion = still ? 0 : 1;
    var speed = (0.06 + 0.9 * this.energy * this.energy + 0.5 * this.beat) * motion;
    this.travel += dt * speed;
    this.time += dt * motion;
    this._drewStill = still;

    if (!still && !this.minStep) this._adapt(dt);
    if (this._sizeDirty) { this._sizeDirty = false; this._resize(); }
    var gl = this.gl, u = this.u;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uTravel, this.travel);
    gl.uniform3fv(u.uA, this.a);
    gl.uniform3fv(u.uB, this.b);
    gl.uniform1f(u.uEnergy, this.energy);
    gl.uniform1f(u.uBeat, this.beat);
    gl.uniform1f(u.uFlash, this.flash);
    gl.uniform2f(u.uFocus, this.focus[0], this.focus[1]);
    if (u.uLight) gl.uniform1f(u.uLight, this.light);
    if (u.uD0) {
      var D = this.dark;
      gl.uniform3fv(u.uD0, D.d0); gl.uniform3fv(u.uD1, D.d1); gl.uniform3fv(u.uDPool, D.pool);
      gl.uniform1f(u.uDWash, D.wash); gl.uniform1f(u.uDVig, D.vig); gl.uniform1f(u.uDTint, D.tint || 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Drop render resolution if frames are slow (phones), raise it back if there's headroom.
  Backdrop.prototype._adapt = function (dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    var avg = this.frameTimes.reduce(function (a, b) { return a + b; }, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    var max = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
    if (avg > 1 / 45 && this.scale > 0.3) { this.scale = Math.max(0.3, this.scale * 0.8); this._sizeDirty = true; }
    else if (avg < 1 / 58 && this.scale < max) { this.scale = Math.min(max, this.scale * 1.08); this._sizeDirty = true; }
  };

  window.HIITBackdrop = Backdrop;
})();
