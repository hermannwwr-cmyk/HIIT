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
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    var names = ['uRes', 'uTime', 'uTravel', 'uA', 'uB', 'uEnergy', 'uBeat', 'uFocus', 'uFlash'];
    for (var i = 0; i < names.length; i++) this.u[names[i]] = gl.getUniformLocation(prog, names[i]);
    this.gl = gl;
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
