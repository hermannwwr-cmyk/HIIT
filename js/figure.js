/*!
 * HIIT athlete figure: Canvas-2D animated exercise demonstrator.
 * Classic script (no modules, no deps, works from file://).
 *
 *   window.HIITFigure = {
 *     EXERCISES: ['pushup','crunch','legraise','flutter','squat','lunge','twist','jacks','rest'],
 *     STYLES: ['neon','studio'],
 *     STUDIO: { dark: {body, shade, lit}, light: {...} },   // default studio materials (read-only info)
 *     create(canvas, opts) -> instance
 *   }
 *   opts: { exercise:'pushup', primary:'#ff2bd6', secondary:'#ffb000', quality:'high'|'low', energy:0..1,
 *           style:'neon'|'studio' (default neon; unknown -> neon), scheme:'dark'|'light' (studio only),
 *           body, shade (studio material overrides: lit body colour, core-shadow colour) }
 *   instance.setExercise(id) / setColors(primary, secondary) / setPlaying(bool)
 *   instance.setEnergy(x) / pulse() / setSuspended(bool) / destroy()
 *   instance.setStyle(style, scheme) - switch look live (theme toggle); repaints immediately
 *
 * The figure is a 3D skeleton (forward kinematics + 2-bone IK so planted
 * hands/feet never slide), projected with a per-exercise camera, auto-fitted
 * to the canvas, and rendered either as additive neon tubes with a white-hot
 * core ('neon') or as a matte, softly lit 3D mannequin with contact shadows
 * ('studio'). The canvas stays transparent; the page paints the backdrop.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var EXERCISES = ['pushup', 'crunch', 'legraise', 'flutter', 'squat', 'lunge', 'twist', 'jacks', 'rest'];
  var MORPH_S = 0.45;
  var COLOR_S = 0.3;

  /* ------------------------------------------------------------------ math */

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sine(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function cubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  var now = (root.performance && root.performance.now) ? function () { return root.performance.now(); } : function () { return Date.now(); };

  // Keyframe track, sine-eased between keys (velocity 0 at every key).
  function kf(p, K) {
    if (p <= K[0][0]) return K[0][1];
    for (var i = 1; i < K.length; i++) {
      if (p <= K[i][0]) {
        var a = K[i - 1], b = K[i];
        return lerp(a[1], b[1], sine((p - a[0]) / ((b[0] - a[0]) || 1)));
      }
    }
    return K[K.length - 1][1];
  }

  // Monotone cubic (Fritsch-Carlson) through keys: smooth, no overshoot, flows through keys.
  function monoTan(K, i) {
    if (i <= 0 || i >= K.length - 1) return 0;
    var d0 = (K[i][1] - K[i - 1][1]) / (K[i][0] - K[i - 1][0]);
    var d1 = (K[i + 1][1] - K[i][1]) / (K[i + 1][0] - K[i][0]);
    if (d0 * d1 <= 0) return 0;
    return 2 * d0 * d1 / (d0 + d1);
  }
  function mono(p, K) {
    var n = K.length;
    if (p <= K[0][0]) return K[0][1];
    if (p >= K[n - 1][0]) return K[n - 1][1];
    var i = 0;
    while (i < n - 2 && p > K[i + 1][0]) i++;
    var x0 = K[i][0], x1 = K[i + 1][0], y0 = K[i][1], y1 = K[i + 1][1], h = x1 - x0;
    var m0 = monoTan(K, i), m1 = monoTan(K, i + 1);
    var t = (p - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
  }

  function V(x, y, z) { return [x, y, z]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function addS(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function rot(v, k, ang) { // Rodrigues, k = unit axis
    var c = Math.cos(ang), s = Math.sin(ang), kv = cross(k, v), d = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
  }
  // direction in the sagittal (x,y) plane, degrees CCW from +x
  function dir(a, z) { a *= DEG; return z ? norm([Math.cos(a), Math.sin(a), z]) : [Math.cos(a), Math.sin(a), 0]; }
  // direction tilted from vertical toward +x by a degrees
  function lean(a) { a *= DEG; return [Math.sin(a), Math.cos(a), 0]; }
  var Y = [0, 1, 0], Z = [0, 0, 1];

  var ikClamps = 0; // dev counter: target out of reach => something would slide

  // Two-bone IK. Returns [mid, end]. Mid joint bends toward `pole`.
  function ik(A, T, l1, l2, pole) {
    var d = sub(T, A), dist = len(d);
    var maxD = (l1 + l2) * 0.9999, minD = Math.abs(l1 - l2) + 1e-4;
    var dn = dist > 1e-9 ? mul(d, 1 / dist) : [0, -1, 0];
    if (dist > maxD + 1e-4) ikClamps++;
    var dd = clamp(dist, minD, maxD);
    var a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
    var h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    var pp = sub(pole, mul(dn, dot(pole, dn)));
    var pl = len(pp);
    pp = pl > 1e-9 ? mul(pp, 1 / pl) : norm(cross(dn, Math.abs(dn[2]) < 0.9 ? Z : Y));
    return [addS(addS(A, dn, a), pp, h), addS(A, dn, dd)];
  }

  /* -------------------------------------------------------------- skeleton */
  // Units: body height H = 1 (≈1.75 m). Head ≈ 1/7.5 H. Floor at y = 0.
  var B = {
    thigh: 0.245, shin: 0.245, foot: 0.115, uarm: 0.18, farm: 0.155, hand: 0.07,
    sp1: 0.14, sp2: 0.15, neck: 0.105, shw: 0.1, hipw: 0.055, headR: 0.062, ankleH: 0.045
  };
  var FLAT = [0.1095, -0.035, 0]; // ankle -> toe for a flat foot pointing +x

  var JN = ['head', 'neck', 'chest', 'pelvis', 'shL', 'elL', 'wrL', 'haL', 'shR', 'elR', 'wrR', 'haR',
    'hipL', 'knL', 'anL', 'toL', 'hipR', 'knR', 'anR', 'toR', 'face'];
  var NJ = JN.length;
  var HEAD = 0, NECK = 1, CHEST = 2, PELVIS = 3, SHL = 4, ELL = 5, WRL = 6, HAL = 7, SHR = 8, ELR = 9, WRR = 10, HAR = 11,
    HIPL = 12, KNL = 13, ANL = 14, TOL = 15, HIPR = 16, KNR = 17, ANR = 18, TOR = 19, FACE = 20;

  // Torso from pelvis P and spine directions; R = shoulder-line right vector, Rp = pelvis right vector.
  function torso(J, P, u1, u2, u3, R, Rp, shrug) {
    J.pelvis = P;
    J.chest = addS(P, u1, B.sp1);
    J.neck = addS(J.chest, u2, B.sp2);
    J.head = addS(J.neck, u3, B.neck);
    var F = norm(cross(u2, R));
    var base = addS(addS(J.neck, u2, -0.022 + (shrug || 0)), F, 0.012);
    J.shR = addS(base, R, B.shw);
    J.shL = addS(base, R, -B.shw);
    J.hipR = addS(P, Rp, B.hipw);
    J.hipL = addS(P, Rp, -B.hipw);
    J.face = addS(J.head, norm(cross(u3, R)), B.headR);
    J.F = F; J.R = R;
    return J;
  }
  function armIK(J, s, wrist, pole, handDir) {
    var r = ik(J['sh' + s], wrist, B.uarm, B.farm, pole);
    J['el' + s] = r[0]; J['wr' + s] = r[1];
    J['ha' + s] = addS(r[1], handDir ? norm(handDir) : norm(sub(r[1], r[0])), B.hand);
  }
  function armFK(J, s, d1, d2, d3) {
    J['el' + s] = addS(J['sh' + s], norm(d1), B.uarm);
    J['wr' + s] = addS(J['el' + s], norm(d2), B.farm);
    J['ha' + s] = addS(J['wr' + s], norm(d3 || d2), B.hand);
  }
  function legIK(J, s, ankle, pole, footDir) {
    var r = ik(J['hip' + s], ankle, B.thigh, B.shin, pole);
    J['kn' + s] = r[0]; J['an' + s] = r[1];
    J['to' + s] = footDir ? addS(r[1], norm(footDir), B.foot) : add(r[1], FLAT);
  }
  function legFK(J, s, d1, d2, d3) {
    J['kn' + s] = addS(J['hip' + s], norm(d1), B.thigh);
    J['an' + s] = addS(J['kn' + s], norm(d2), B.shin);
    J['to' + s] = addS(J['an' + s], norm(d3), B.foot);
  }
  var SIDES = [['L', -1], ['R', 1]];

  /* ------------------------------------------------------------- exercises */
  // Side views: figure faces +x, +z (its right side) is toward the camera.
  // cam: yaw (0 = side, 90 = front), pitch (camera looking down, deg).
  // far: how much each side is "far" (dimmer/thinner). order: group draw order.
  var SIDE_ORDER = ['AL', 'LL', 'T', 'LR', 'AR'];
  var EX = {};

  EX.pushup = {
    period: 1.6, cam: { yaw: 8, pitch: 10 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
    emit: [HEAD, CHEST, PELVIS],
    pose: function (p) {
      var J = {};
      var k = kf(p, [[0, 0], [0.07, 0], [0.5, 1], [0.56, 1], [0.93, 0], [1, 0]]);
      var al = lerp(19.1, 0.6, k);            // body line angle (pivot on the toes)
      var bd = dir(al), fa = (al + 74) * DEG;
      var ank = [B.foot * Math.cos(fa), 0.012 + B.foot * Math.sin(fa), 0];
      var P = addS(ank, bd, B.shin + B.thigh - 0.0006);
      torso(J, P, bd, bd, dir(al + 8), Z, Z, 0);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        var a = [ank[0], ank[1], 0.06 * sg];
        var r = ik(J['hip' + s], a, B.thigh, B.shin, J.F);
        J['kn' + s] = r[0]; J['an' + s] = r[1]; J['to' + s] = [0, 0.012, 0.06 * sg];
        armIK(J, s, [0.712, 0.035, 0.15 * sg], [-1, 0.85, 0.75 * sg], [1, -0.35, 0]);
      }
      return J;
    }
  };

  EX.crunch = {
    period: 1.5, cam: { yaw: 14, pitch: 16 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
    emit: [HEAD, ELR, ELL],
    pose: function (p) {
      var J = {};
      var k = kf(p, [[0, 0], [0.06, 0], [0.42, 1], [0.54, 1], [0.92, 0], [1, 0]]);
      var u1 = dir(180 - 7 * k), u2 = dir(180 - 34 * k), u3 = dir(178 - 44 * k);
      torso(J, [0, 0.066, 0], u1, u2, u3, Z, Z, 0);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1], R = [0, 0, sg];
        legIK(J, s, [0.355, B.ankleH, 0.075 * sg], [0.25, 1, 0.12 * sg]);
        var wrist = addS(addS(J.head, R, 0.088), u3, -0.012);
        armIK(J, s, wrist, add(add(mul(R, 1), mul(u2, -0.35)), mul(J.F, 0.2)), add(u3, mul(R, -0.4)));
      }
      return J;
    }
  };

  EX.legraise = {
    period: 2.2, cam: { yaw: 14, pitch: 16 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
    emit: [TOL, TOR, ANR],
    pose: function (p) {
      var J = {};
      var k = kf(p, [[0, 0], [0.05, 0], [0.42, 1], [0.5, 1], [0.95, 0], [1, 0]]);
      var th = lerp(4.5, 90, k);
      var P = [0, 0.066, 0];
      // slight posterior pelvic tilt as legs pass vertical-ish
      torso(J, P, dir(180 + 2 * k), dir(180), dir(179), Z, Z, 0);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        legFK(J, s, dir(th + 2.2, -0.04 * sg), dir(th - 2.2, -0.02 * sg), dir(th + 48));
        armFK(J, s, [1, -0.12, 0.2 * sg], [1, -0.02, 0.08 * sg], [1, -0.1, 0.02 * sg]);
      }
      return J;
    }
  };

  EX.flutter = {
    period: 0.5, cam: { yaw: 14, pitch: 16 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
    emit: [TOL, TOR],
    pose: function (p) {
      var J = {};
      var w = Math.sin(TAU * p);
      torso(J, [0, 0.066, 0], dir(178), dir(167), dir(150), Z, Z, 0);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        var th = 9 + 8 * w * sg;
        legFK(J, s, dir(th + 1.5, -0.03 * sg), dir(th - 1.5, -0.015 * sg), dir(th + 30));
        armIK(J, s, [-0.03, 0.032, 0.165 * sg], [-0.3, 1, 0.6 * sg], [1, -0.2, 0]);
      }
      return J;
    }
  };

  EX.squat = {
    period: 2.0, cam: { yaw: 10, pitch: 6 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
    emit: [HAL, HAR, HEAD],
    pose: function (p) {
      var J = {};
      var k = kf(p, [[0, 0], [0.06, 0], [0.48, 1], [0.56, 1], [0.93, 0], [1, 0]]);
      var fs = lerp(3, 36, k) * DEG, ft = lerp(5, 88, k) * DEG;
      var kx = B.shin * Math.sin(fs), ky = B.ankleH + B.shin * Math.cos(fs);
      var P = [kx - B.thigh * Math.sin(ft), ky + B.thigh * Math.cos(ft), 0];
      torso(J, P, lean(lerp(3, 44, k)), lean(lerp(1, 36, k)), lean(lerp(-3, 16, k)), Z, Z, 0);
      var a = lerp(10, 86, Math.sin(k * Math.PI / 2)), e = lerp(14, 8, k);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        legIK(J, s, [0, B.ankleH, 0.08 * sg], [1, 0, 0.25 * sg], [0.1095, -0.035, 0.012 * sg]);
        var ar = a * DEG, er = (a + e) * DEG, hr = (a + e + 6) * DEG;
        armFK(J, s, [Math.sin(ar), -Math.cos(ar), 0.07 * sg], [Math.sin(er), -Math.cos(er), 0.02 * sg],
          [Math.sin(hr), -Math.cos(hr), 0]);
      }
      return J;
    }
  };

  (function () {
    var D = 0.53;
    var HX = [[0, 0], [0.12, 0.03], [0.3, 0.24], [0.5, D - 0.235], [0.58, D - 0.235], [0.78, 0.24], [0.92, 0.03], [1, 0]];
    var HY = [[0, 0.531], [0.12, 0.522], [0.3, 0.42], [0.5, 0.3], [0.58, 0.3], [0.78, 0.42], [0.92, 0.522], [1, 0.531]];
    var HEEL = [[0, 17.7], [0.12, 19], [0.3, 38], [0.5, 58], [0.58, 58], [0.78, 38], [0.92, 19], [1, 17.7]];
    var FX = [[0, 0], [0.1, 0], [0.3, D], [0.78, D], [0.95, 0], [1, 0]];
    EX.lunge = {
      period: 4.8, cam: { yaw: 10, pitch: 6 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
      emit: [TOL, TOR, HEAD],
      pose: function (p) {
        var J = {};
        var half = p < 0.5 ? 0 : 1, q = (p - half * 0.5) * 2;
        var fs = half ? 'L' : 'R', bs = half ? 'R' : 'L';
        var fz = half ? -0.075 : 0.075, bz = -fz;
        var low = clamp((mono(q, HY) - 0.531) / (0.3 - 0.531), 0, 1);
        var P = [mono(q, HX), mono(q, HY), 0];
        torso(J, P, lean(3 + 4 * low), lean(2 + 3 * low), lean(-2), Z, Z, 0);
        // front (stepping) foot
        var lift = 0;
        if (q > 0.1 && q < 0.3) lift = 0.075 * Math.sin(Math.PI * (q - 0.1) / 0.2);
        else if (q > 0.78 && q < 0.95) lift = 0.075 * Math.sin(Math.PI * (q - 0.78) / 0.17);
        var fd = lift > 0.002 ? norm([0.11, -0.035 + lift * 0.5, 0]) : FLAT;
        legIK(J, fs, [kf(q, FX), B.ankleH + lift, fz], [1, 0, 0.15 * (half ? -1 : 1)], fd);
        // back foot pivots on the ball of the foot (toe stays planted)
        var b = mono(q, HEEL) * DEG;
        var toe = [0.1095, 0.01, bz];
        var ank = [toe[0] - B.foot * Math.cos(b), toe[1] + B.foot * Math.sin(b), bz];
        var r = ik(J['hip' + bs], ank, B.thigh, B.shin, [0.35, -1, 0]);
        J['kn' + bs] = r[0]; J['an' + bs] = r[1]; J['to' + bs] = toe;
        // arms hang with a light contralateral swing
        for (var i = 0; i < 2; i++) {
          var s = SIDES[i][0], sg = SIDES[i][1];
          var sw = (s === fs ? -1 : 1) * 10 * low + 4;
          var a1 = sw * DEG, a2 = (sw + 18 + 10 * low) * DEG;
          armFK(J, s, [Math.sin(a1), -Math.cos(a1), 0.12 * sg], [Math.sin(a2), -Math.cos(a2), 0.04 * sg]);
        }
        return J;
      }
    };
  })();

  EX.twist = {
    period: 1.4, cam: { yaw: 38, pitch: 22 }, far: { L: 0.5, R: 0 }, order: ['LL', 'T', 'LR', 'AL', 'AR'],
    emit: [HAL, HAR],
    pose: function (p) {
      var J = {};
      var s0 = Math.sin(TAU * p), s = (s0 < 0 ? -1 : 1) * Math.pow(Math.abs(s0), 0.7);
      var psi = 55 * s * DEG, bend = 12 * s * DEG, X = [1, 0, 0];
      // V-sit: torso leaned back ~40 deg, side-bends + rotates toward the hands
      var u1 = rot(lean(-40), X, bend), u2 = rot(lean(-31), X, bend * 1.2), u3 = rot(lean(-14), X, bend * 0.8);
      var R = rot(rot(Z, X, bend * 1.2), u2, -psi);
      torso(J, [0, 0.085, 0], u1, u2, u3, R, Z, 0);
      J.face = addS(J.head, norm(cross(u3, rot(R, u2, -psi * 0.2))), B.headR);
      // clasped hands sweep a wide arc: in front of the belly -> floor beside each hip
      var a = s * 82 * DEG, ca = Math.cos(a);
      var tgt = [-0.03 + 0.15 * ca, 0.07 + 0.13 * ca, 0.21 * Math.sin(a)];
      var F = J.F;
      for (var i = 0; i < 2; i++) {
        var sd = SIDES[i][0], sg = SIDES[i][1];
        armIK(J, sd, addS(tgt, R, 0.022 * sg), add(add(mul(u2, -0.5), mul(R, sg)), mul(F, -0.2)),
          add(mul(F, 0.4), mul(u2, -0.9)));
        legFK(J, sd, [Math.cos(40 * DEG), Math.sin(40 * DEG), -0.12 * s - 0.03 * sg],
          [Math.cos(-8 * DEG), Math.sin(-8 * DEG), -0.07 * s - 0.035 * sg], [Math.cos(-30 * DEG), Math.sin(-30 * DEG), -0.02 * s]);
      }
      return J;
    }
  };

  EX.jacks = {
    period: 0.8, cam: { yaw: 90, pitch: 4 }, far: { L: 0, R: 0 }, order: ['T', 'LL', 'LR', 'AL', 'AR'],
    emit: [HAL, HAR, TOL, TOR],
    pose: function (p) {
      var J = {};
      var w = kf(p, [[0, 0], [0.06, 0], [0.42, 1], [0.56, 1], [0.92, 0], [1, 0]]);
      var h = 0, dip = 0, g;
      if (p > 0.06 && p < 0.42) h = 0.045 * Math.sin(Math.PI * (p - 0.06) / 0.36);
      else if (p > 0.56 && p < 0.92) h = 0.045 * Math.sin(Math.PI * (p - 0.56) / 0.36);
      else {
        g = p >= 0.92 ? (p - 0.92) / 0.14 : p <= 0.06 ? (p + 0.08) / 0.14 : (p - 0.42) / 0.14;
        dip = 0.028 * Math.sin(Math.PI * clamp(g, 0, 1));
      }
      var armK = 0.5 - 0.5 * Math.cos(TAU * p);
      var lat = 0.02 + 0.17 * w, reach = (B.thigh + B.shin) * 0.992;
      torso(J, [0, B.ankleH + Math.sqrt(reach * reach - lat * lat) - dip + h, 0], Y, Y, lean(1), Z, Z, 0.012 * armK);
      var a = lerp(14, 166, armK) * DEG, fa = (lerp(14, 166, armK) + lerp(6, 26, armK)) * DEG;
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        legIK(J, s, [0, B.ankleH + h, (0.075 + 0.17 * w) * sg], [1, 0, 0.5 * sg], [1, -0.32, 0.32 * sg]);
        armFK(J, s, [0.08, -Math.cos(a), Math.sin(a) * sg], [0.05, -Math.cos(fa), Math.sin(fa) * sg],
          [0, -Math.cos(fa + 0.1), Math.sin(fa + 0.1) * sg]);
      }
      return J;
    }
  };

  EX.rest = {
    period: 4.0, cam: { yaw: 58, pitch: 5 }, far: { L: 0.3, R: 0 }, order: ['AL', 'T', 'LL', 'LR', 'AR'],
    emit: [HAL, HAR],
    pose: function (p) {
      var J = {};
      var b = 0.5 - 0.5 * Math.cos(TAU * p);           // breath: inhale peaks at p = 0.5
      var sw = Math.sin(TAU * p + 0.6);
      var P = [0.004 * sw, 0.527 - 0.003 * b, 0.012 * sw];
      var Rp = norm([0, 0.09, 1]);                      // contrapposto: weight on right leg
      var R = norm([0, -0.05 + 0.02 * sw, 1]);
      torso(J, P, lean(-1.5 - 1 * b), lean(-2 - 2.5 * b), lean(3 - 2 * b), R, Rp, 0.013 * b);
      // shake-out: relaxed hands flick for a moment each breath cycle
      var env = (p > 0.58 && p < 0.9) ? Math.sin(Math.PI * (p - 0.58) / 0.32) : 0;
      var wob = env * Math.sin(TAU * 22 * p);
      legIK(J, 'R', [0.0, B.ankleH, 0.095], [1, 0, 0.2], [0.1095, -0.035, 0.03]);
      legIK(J, 'L', [0.065, B.ankleH, -0.105], [1, 0, -0.25], [0.1095, -0.035, -0.04]);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        var a1 = (6 + 3 * wob) * DEG, a2 = (22 + 2 * b + 9 * wob) * DEG, a3 = (26 + 22 * wob) * DEG;
        armFK(J, s, [Math.sin(a1), -Math.cos(a1), 0.13 * sg], [Math.sin(a2), -Math.cos(a2), 0.05 * sg],
          [Math.sin(a3), -Math.cos(a3), 0.03 * sg]);
      }
      return J;
    }
  };

  // studio (opaque) draw order where it differs from the neon one
  EX.jacks.sorder = ['LL', 'LR', 'T', 'AL', 'AR'];
  EX.rest.sorder = ['AL', 'LL', 'LR', 'T', 'AR'];
  for (var exk in EX) if (EX.hasOwnProperty(exk)) EX[exk].id = exk;
  function getEx(id) { return (typeof id === 'string' && EX.hasOwnProperty(id)) ? EX[id] : EX.rest; }
  function exId(ex) { return (ex && ex.id) || 'rest'; }

  var FALLBACK_POSE = null;
  function safePose(ex, p, t) {
    try {
      var J = ex.pose(p, t);
      for (var i = 0; i < NJ; i++) {
        var v = J[JN[i]];
        if (!v || !isFinite(v[0]) || !isFinite(v[1]) || !isFinite(v[2])) throw new Error('bad joint ' + JN[i]);
      }
      return J;
    } catch (e) {
      if (!FALLBACK_POSE) FALLBACK_POSE = EX.rest.pose(0, 0);
      return FALLBACK_POSE;
    }
  }

  /* ------------------------------------------------------------ projection */
  var PERSP = 4.5;
  function camSetup(ex) {
    if (ex._cam) return ex._cam;
    var c = ex.cam, cy = Math.cos(c.yaw * DEG), sy = Math.sin(c.yaw * DEG), cp = Math.cos(c.pitch * DEG), sp = Math.sin(c.pitch * DEG);
    var o = { cy: cy, sy: sy, cp: cp, sp: sp, px: 0, py: 0, pd: 0 };
    var pv = projectPt(o, [0.15, 0.3, 0]);
    o.px = pv[0]; o.py = pv[1]; o.pd = pv[2];
    o.floorV = projectPt(o, [0.15, 0, 0])[1];
    ex._cam = o;
    return o;
  }
  function projectPt(o, v) {
    var x1 = v[0] * o.cy - v[2] * o.sy, d1 = v[0] * o.sy + v[2] * o.cy;
    return [x1, v[1] * o.cp - d1 * o.sp, d1 * o.cp + v[1] * o.sp];
  }
  function project(J, ex, out) {
    var o = camSetup(ex);
    for (var i = 0; i < NJ; i++) {
      var q = projectPt(o, J[JN[i]]);
      var s = PERSP / (PERSP - (q[2] - o.pd));
      out[i * 3] = o.px + (q[0] - o.px) * s;
      out[i * 3 + 1] = o.py + (q[1] - o.py) * s;
      out[i * 3 + 2] = q[2];
    }
    return out;
  }
  // Bounding box of the whole cycle in view space (y up), cached per exercise.
  var TMPV = new Float32Array(NJ * 3);
  function exBox(ex) {
    if (ex._box) return ex._box;
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, N = 72;
    for (var n = 0; n < N; n++) {
      project(safePose(ex, n / N, n / N * ex.period), ex, TMPV);
      for (var i = 0; i < NJ; i++) {
        if (i === FACE) continue;
        var x = TMPV[i * 3], y = TMPV[i * 3 + 1], r = i === HEAD ? B.headR : 0.03;
        if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r;
        if (y - r < y0) y0 = y - r; if (y + r > y1) y1 = y + r;
      }
    }
    var fv = camSetup(ex).floorV;
    ex._box = { x0: x0 - 0.05, x1: x1 + 0.05, y0: Math.min(y0, fv) - 0.06, y1: y1 + 0.05 };
    return ex._box;
  }
  // Studio contact shadows: screen position of each joint dropped straight onto the
  // floor (x, 0, z), plus its true height above the floor (body units).
  function groundProject(J, ex, f, out) {
    var o = camSetup(ex);
    for (var i = 0; i < NJ; i++) {
      var v = J[JN[i]], q = projectPt(o, [v[0], 0, v[2]]);
      var s = PERSP / (PERSP - (q[2] - o.pd));
      out[i * 3] = f.ox + (o.px + (q[0] - o.px) * s) * f.sc;
      out[i * 3 + 1] = f.oy - (o.py + (q[1] - o.py) * s) * f.sc;
      out[i * 3 + 2] = v[1];
    }
  }

  /* --------------------------------------------------------------- colours */
  var NAMED = { white: [255, 255, 255], black: [0, 0, 0] };
  function parseColor(c, d) {
    if (Array.isArray(c) && c.length >= 3) return [num(c[0], 0), num(c[1], 0), num(c[2], 0)];
    if (typeof c !== 'string') return d.slice();
    var s = c.trim().toLowerCase(), m;
    if (NAMED[s]) return NAMED[s].slice();
    if (s[0] === '#') {
      s = s.slice(1);
      if (s.length === 3 || s.length === 4) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      if (s.length >= 6) {
        var n = parseInt(s.slice(0, 6), 16);
        if (isFinite(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
    } else if ((m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/))) {
      return [+m[1], +m[2], +m[3]];
    }
    return d.slice();
  }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  var WHITE = [255, 255, 255];
  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : +a.toFixed(3)) + ')';
  }

  /* ---------------------------------------------------------------- shapes */
  var RS = 0.88; // global body radius multiplier
  var SHAPES = {
    T: [[PELVIS, CHEST, 0.052, 0.058], [CHEST, NECK, 0.06, 0.048], [NECK, HEAD, 0.028, 0.03], [SHL, SHR, 0.042, 0.042], [HIPL, HIPR, 0.038, 0.038]],
    AL: [[SHL, ELL, 0.035, 0.027], [ELL, WRL, 0.027, 0.02], [WRL, HAL, 0.02, 0.016]],
    AR: [[SHR, ELR, 0.035, 0.027], [ELR, WRR, 0.027, 0.02], [WRR, HAR, 0.02, 0.016]],
    LL: [[HIPL, KNL, 0.056, 0.037], [KNL, ANL, 0.037, 0.024], [ANL, TOL, 0.024, 0.015]],
    LR: [[HIPR, KNR, 0.056, 0.037], [KNR, ANR, 0.037, 0.024], [ANR, TOR, 0.024, 0.015]]
  };
  var NODES = { T: [], AL: [ELL, WRL], AR: [ELR, WRR], LL: [KNL, ANL], LR: [KNR, ANR] };
  // light pulses run along these chains (centre -> extremities)
  var FLOW = { T: [PELVIS, CHEST, NECK], AL: [SHL, ELL, WRL, HAL], AR: [SHR, ELR, WRR, HAR], LL: [HIPL, KNL, ANL, TOL], LR: [HIPR, KNR, ANR, TOR] };
  var FLOW_OFS = { T: 0.15, AL: 0.55, AR: 0.05, LL: 0.8, LR: 0.3 };
  var CHAINS = [[HIPL, KNL, ANL, TOL], [HIPR, KNR, ANR, TOR], [SHL, ELL, WRL, HAL], [SHR, ELR, WRR, HAR], [PELVIS, CHEST, NECK, HEAD]];
  var TRAIL_J = [HAL, HAR, TOL, TOR, HEAD];

  function capsule(ctx, x1, y1, r1, x2, y2, r2) {
    var dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= Math.abs(r1 - r2) + 0.01) {
      var bx = r1 >= r2 ? x1 : x2, by = r1 >= r2 ? y1 : y2, br = Math.max(r1, r2);
      ctx.moveTo(bx + br, by);
      ctx.arc(bx, by, br, 0, TAU);
      return;
    }
    var a = Math.atan2(dy, dx), ph = Math.acos(clamp((r1 - r2) / d, -1, 1));
    ctx.moveTo(x1 + r1 * Math.cos(a + ph), y1 + r1 * Math.sin(a + ph));
    ctx.arc(x1, y1, r1, a + ph, a + TAU - ph, false);
    ctx.arc(x2, y2, r2, a - ph, a + ph, false);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }

  // Adds group g to the current path. full = include torso plate + head disc.
  // Adds group g to the current path. full = include torso plate + head disc.
  // noHead: skip the head disc; spineOnly: torso spine capsules only.
  function pathGroup(ctx, g, P, sc, rm, grow, full, coreMul, noHead, spineOnly) {
    var list = SHAPES[g], cm = coreMul || 1, n = spineOnly ? 2 : list.length;
    for (var i = 0; i < n; i++) {
      var s = list[i], a = s[0] * 3, b = s[1] * 3;
      capsule(ctx, P[a], P[a + 1], s[2] * RS * sc * rm * cm + grow, P[b], P[b + 1], s[3] * RS * sc * rm * cm + grow);
    }
    if (g === 'T' && full) {
      var q = [SHL, SHR, HIPR, HIPL], area = 0, j, k;
      for (j = 0; j < 4; j++) {
        k = (j + 1) % 4;
        area += P[q[j] * 3] * P[q[k] * 3 + 1] - P[q[k] * 3] * P[q[j] * 3 + 1];
      }
      if (Math.abs(area) > 1) {
        if (area < 0) q.reverse();
        ctx.moveTo(P[q[0] * 3], P[q[0] * 3 + 1]);
        for (j = 1; j < 4; j++) ctx.lineTo(P[q[j] * 3], P[q[j] * 3 + 1]);
        ctx.closePath();
      }
      if (!noHead) circle(ctx, P[HEAD * 3], P[HEAD * 3 + 1], B.headR * sc * rm + grow);
    }
  }

  /* ------------------------------------------------------------ shared loop */
  var registry = [];
  var rafId = 0, lastT = 0;
  var hasRAF = typeof root.requestAnimationFrame === 'function';
  var raf = hasRAF ? function (f) { return root.requestAnimationFrame(f); } : function (f) { return setTimeout(function () { f(now()); }, 16); };
  var caf = hasRAF ? function (id) { root.cancelAnimationFrame(id); } : function (id) { clearTimeout(id); };
  var doc = root.document;
  function isHidden() { return !!(doc && doc.hidden); }
  function tick(t) {
    rafId = 0;
    if (isHidden()) { lastT = 0; return; }
    var dt = lastT ? Math.min(0.1, Math.max(0, (t - lastT) / 1000)) : 1 / 60;
    lastT = t;
    var list = registry.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i]._tick(dt); } catch (e) { list[i]._fail(e); }
    }
    ensureLoop();
  }
  function ensureLoop() {
    if (!rafId && registry.length && !isHidden()) rafId = raf(tick);
  }
  if (doc && doc.addEventListener) {
    doc.addEventListener('visibilitychange', function () {
      if (isHidden()) { if (rafId) caf(rafId); rafId = 0; lastT = 0; } else ensureLoop();
    });
  }
  var reduceMQ = null;
  try { reduceMQ = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { reduceMQ = null; }
  function reducedMotion() { return !!(reduceMQ && reduceMQ.matches); }

  /* --------------------------------------------------------------- instance */
  var HIST_MAX = 48, HIST_AGE = 0.3;

  function Figure(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = null;
    try { this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null; } catch (e) { this.ctx = null; }
    this.low = opts.quality === 'low';
    this.ex = getEx(opts.exercise);
    this.time = 0;
    this.rt = 0;
    this.playing = true;
    this.energy = this.energyT = clamp(num(opts.energy, 1), 0, 1);
    var c1 = parseColor(opts.primary, [255, 43, 214]), c2 = parseColor(opts.secondary, [255, 176, 0]);
    this.c1 = c1; this.c2 = c2; this.c1a = c1; this.c2a = c2; this.c1b = c1; this.c2b = c2; this.colT = 1;
    this.cur = new Float32Array(NJ * 3);
    this.view = new Float32Array(NJ * 3);
    this.gnd = new Float32Array(NJ * 3);
    this.meta = { floorY: 0, sc: 1, farL: 0, farR: 0, flat: 0.2 };
    this.matOpts = { body: opts.body, shade: opts.shade };
    this.hasPose = false;
    this.from = null; this.fromMeta = null; this.morphT = 1;
    this.hist = []; this.histPool = [];
    this.sparks = []; this.emitAcc = {};
    this.flash = 0; this.ring = -1; this.emberAcc = 0;
    this._setStyle(opts.style, opts.scheme);
    this.W = 0; this.H = 0; this.dpr = 1;
    this.visible = true;
    this.dead = false;
    this.errors = 0;
    this._frozen = false;
    this._stats = { frames: 0, ms: 0 };
    this._fitCache = null;
    var self = this;
    if (canvas && root.ResizeObserver) {
      try {
        this.ro = new root.ResizeObserver(function () { if (!self.dead) self._measure(); });
        this.ro.observe(canvas);
      } catch (e) { this.ro = null; }
    }
    if (!this.ro) {
      this._onResize = function () { self._measure(); };
      if (root.addEventListener) root.addEventListener('resize', this._onResize);
    }
    if (canvas && root.IntersectionObserver) {
      try {
        this.io = new root.IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) self.visible = entries[i].isIntersecting;
        });
        this.io.observe(canvas);
      } catch (e) { this.io = null; }
    }
    if (this.ctx) {
      this._measure();
      registry.push(this);
      ensureLoop();
    }
  }

  var FP = Figure.prototype;

  FP._fail = function (e) {
    this.errors++;
    if (this.errors === 1 && root.console && console.warn) console.warn('[HIITFigure] frame error (suppressed):', e);
    this.hist.length = 0; this.sparks.length = 0;
  };

  FP._measure = function () {
    var c = this.canvas;
    if (!c) return;
    var w = c.clientWidth, h = c.clientHeight;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
    if (w === this.W && h === this.H && dpr === this.dpr && c.width === bw && c.height === bh) return;
    this._still = false; // resized: the next tick must repaint
    if (c.width !== bw || c.height !== bh) {
      c.width = bw; c.height = bh;
      // If the canvas was sized only by its attributes, resizing the backing store would
      // change its CSS size too (feedback loop). Pin its CSS size in that case.
      if (c.clientWidth !== w || c.clientHeight !== h) {
        c.style.width = w + 'px'; c.style.height = h + 'px';
      }
    }
    this.W = w; this.H = h; this.dpr = dpr;
    this._fitCache = null;
    this.hist.length = 0;
    this.sparks.length = 0;
    this.morphT = 1; this.from = null;
    if (this.bloom) { this.bloom.width = 1; }
  };

  FP._fit = function (ex) {
    var fc = this._fitCache || (this._fitCache = {});
    var id = exId(ex);
    if (fc[id]) return fc[id];
    var b = exBox(ex), W = this.W, H = this.H;
    var px = Math.max(4, W * 0.06), py = Math.max(4, H * 0.06);
    var sc = Math.max(1e-3, Math.min((W - 2 * px) / (b.x1 - b.x0), (H - 2 * py) / (b.y1 - b.y0)));
    var f = { sc: sc, ox: W / 2 - (b.x0 + b.x1) / 2 * sc, oy: H / 2 + (b.y0 + b.y1) / 2 * sc };
    f.floorY = f.oy - camSetup(ex).floorV * sc;
    fc[id] = f;
    return f;
  };

  FP._computePose = function () {
    var ex = this.ex;
    var p = ((this.time / ex.period) % 1 + 1) % 1;
    var J = safePose(ex, p, this.time);
    project(J, ex, this.view);
    var f = this._fit(ex), v = this.view, P = this.cur, m = this.meta;
    for (var i = 0; i < NJ; i++) {
      P[i * 3] = f.ox + v[i * 3] * f.sc;
      P[i * 3 + 1] = f.oy - v[i * 3 + 1] * f.sc;
      P[i * 3 + 2] = v[i * 3 + 2];
    }
    m.floorY = f.floorY; m.sc = f.sc; m.farL = ex.far.L; m.farR = ex.far.R;
    if (this.studio) { groundProject(J, ex, f, this.gnd); m.flat = camSetup(ex).sp; }
    if (this.morphT < 1 && this.from) {
      var k = cubic(this.morphT), A = this.from, fm = this.fromMeta;
      for (i = 0; i < NJ * 3; i++) P[i] = lerp(A[i], P[i], k);
      m.floorY = lerp(fm.floorY, m.floorY, k); m.sc = lerp(fm.sc, m.sc, k);
      m.farL = lerp(fm.farL, m.farL, k); m.farR = lerp(fm.farR, m.farR, k);
      if (this.studio && this.fromGnd) {
        var G = this.gnd, Ag = this.fromGnd;
        for (i = 0; i < NJ * 3; i++) G[i] = lerp(Ag[i], G[i], k);
        m.flat = lerp(fm.flat === undefined ? m.flat : fm.flat, m.flat, k);
      }
    }
    this.hasPose = true;
  };

  FP._tick = function (dt) {
    if (this.dead || !this.ctx || this.suspended) return;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    if (dpr !== this.dpr || (!this.ro && (this._chk = (this._chk || 0) + 1) % 30 === 0)) this._measure();
    if (!this.visible || this.W < 4 || this.H < 4) return;
    // Battery: a stopped figure with nothing in flight only needs an occasional
    // repaint for its breathing glow (none at all for thumbnails or reduced
    // motion), and thumbnails run at 30 fps.
    var settled = !this.playing && this.morphT >= 1 && this.colT >= 1 && this.flash === 0 &&
      this.ring < 0 && !this.sparks.length && Math.abs(this.energyT - this.energy) < 0.01;
    this._acc = (this._acc || 0) + dt;
    if (settled) {
      if (this.low || this.studio || reducedMotion()) { if (this._still) return; }
      else if (this._acc < 1 / 8) return;
    } else if (this.low && this._acc < 1 / 30) return;
    var step = Math.min(0.1, this._acc);
    this._acc = 0;
    var t0 = now();
    this._update(step);
    this._draw();
    this._still = settled;
    var st = this._stats;
    st.frames++; st.ms += now() - t0;
  };

  FP._update = function (dt) {
    var reduced = reducedMotion();
    this.rt += dt;
    this.energy += (this.energyT - this.energy) * (1 - Math.exp(-dt * 5));
    if (this.colT < 1) {
      this.colT = Math.min(1, this.colT + dt / COLOR_S);
      var k = sine(this.colT);
      this.c1 = mix(this.c1a, this.c1b, k); this.c2 = mix(this.c2a, this.c2b, k);
    }
    this.flash *= Math.exp(-dt * 3.2);
    if (this.flash < (this.studio ? 0.03 : 0.002)) this.flash = 0;
    if (this.ring >= 0) { this.ring += dt / 0.8; if (this.ring > 1) this.ring = -1; }
    if (this._frozen) { this._computePose(); return; }
    if (this.morphT < 1) this.morphT = Math.min(1, this.morphT + dt / MORPH_S);
    else if (this.playing) this.time += dt * (reduced ? 0.5 : 1);
    this._computePose();
    this._record(dt, reduced);
    this._updateSparks(dt, reduced);
  };

  FP._record = function (dt, reduced) {
    if (this.low || reduced || this.studio) { this.hist.length = 0; return; }
    var H = this.hist, pool = this.histPool;
    while (H.length && (this.rt - H[0].t > HIST_AGE || H.length >= HIST_MAX)) pool.push(H.shift());
    var e = pool.pop() || { t: 0, P: new Float32Array(NJ * 3), sc: 1 };
    e.t = this.rt; e.P.set(this.cur); e.sc = this.meta.sc; e.dt = dt;
    H.push(e);
  };

  /* ---------------------------------------------------------------- sparks */
  FP._spawn = function (x, y, vx, vy, life, hot) {
    if (this.sparks.length >= 160) return;
    this.sparks.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, hot: hot || 0 });
  };

  FP._updateSparks = function (dt, reduced) {
    var S = this.sparks, sc = this.meta.sc, floorY = this.meta.floorY;
    var i, s;
    for (i = S.length - 1; i >= 0; i--) {
      s = S[i];
      s.life -= dt;
      if (s.life <= 0) { S[i] = S[S.length - 1]; S.pop(); continue; }
      var drag = Math.exp(-dt * 1.8);
      s.vx *= drag; s.vy = s.vy * drag + sc * (s.hot < 0 ? -0.25 : 1.7) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > floorY && s.vy > 0) { s.y = floorY; s.vy *= -0.35; s.vx *= 0.75; }
    }
    if (this.low || reduced || this.studio || !this.playing || this.hist.length < 2) return;
    var H = this.hist, prev = H[H.length - 2], P = this.cur, pdt = Math.max(1e-3, this.rt - prev.t);
    var E = this.ex.emit || [], en = this.energy;
    var emit = [HAL, HAR, TOL, TOR, HEAD];
    for (i = 0; i < E.length; i++) if (emit.indexOf(E[i]) < 0) emit.push(E[i]);
    for (i = 0; i < emit.length; i++) {
      var j = emit[i] * 3;
      var vx = (P[j] - prev.P[j]) / pdt, vy = (P[j + 1] - prev.P[j + 1]) / pdt;
      var u = Math.sqrt(vx * vx + vy * vy) / sc;           // body-heights per second
      var rate = en * 12 * Math.max(0, u - 0.5);
      var acc = (this.emitAcc[emit[i]] || 0) + rate * dt;
      while (acc >= 1) {
        acc -= 1;
        var a = Math.random() * TAU, sp = sc * (0.15 + Math.random() * 0.4);
        this._spawn(P[j] + (Math.random() - 0.5) * 0.02 * sc, P[j + 1] + (Math.random() - 0.5) * 0.02 * sc,
          vx * 0.3 + Math.cos(a) * sp, vy * 0.3 + Math.sin(a) * sp - sc * 0.25, 0.25 + Math.random() * 0.4, 0);
      }
      this.emitAcc[emit[i]] = acc;
    }
    // drifting embers keep a still pose alive
    this.emberAcc += dt * (1 + 2.5 * en);
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      var jj = ((Math.random() * 20) | 0) * 3;
      this._spawn(P[jj], P[jj + 1], (Math.random() - 0.5) * 0.12 * sc, -sc * (0.05 + Math.random() * 0.12), 0.5 + Math.random() * 0.6, -1);
    }
  };

  /* --------------------------------------------------------------- drawing */
  FP._grads = function (ctx, P, c1, c2, boost) {
    var hx = P[HEAD * 3], hy = P[HEAD * 3 + 1];
    var fx = (P[ANL * 3] + P[ANR * 3]) / 2, fy = (P[ANL * 3 + 1] + P[ANR * 3 + 1]) / 2;
    if (Math.abs(fx - hx) + Math.abs(fy - hy) < 1) fy = hy + 1;
    var col = ctx.createLinearGradient(hx, hy, fx, fy);
    col.addColorStop(0, rgba(c1)); col.addColorStop(0.45, rgba(mix(c1, c2, 0.5))); col.addColorStop(1, rgba(c2));
    var wt = clamp(0.72 + 0.25 * boost, 0, 0.95);
    var core = ctx.createLinearGradient(hx, hy, fx, fy);
    core.addColorStop(0, rgba(mix(c1, WHITE, wt))); core.addColorStop(1, rgba(mix(c2, WHITE, wt)));
    return { col: col, core: core };
  };

  FP._draw = function () {
    if (this.studio) { this._drawStudio(); return; }
    var ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr;
    var P = this.cur, m = this.meta, sc = m.sc, low = this.low;
    var reduced = reducedMotion();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    if (!this.hasPose) return;
    var c1 = this.c1, c2 = this.c2, en = this.energy, fl = this.flash;
    var breath = 1 + 0.07 * Math.sin(this.rt * 2.2);
    var glowI = (0.55 + 0.45 * en) * breath * (1 + 1.3 * fl);
    var G = this._grads(ctx, P, c1, c2, fl);
    var order = (this.morphT < 0.5 && this.fromOrder) ? this.fromOrder : this.ex.order;

    if (!low) this._drawReflection(ctx, P, m, G, order, glowI);
    this._drawFloor(ctx, P, m, c1, c2, glowI);
    if (!low && !reduced) this._drawTrails(ctx, m, c1, c2);
    if (!low) this._drawBloom(ctx, P, m, c1, c2, glowI, order);

    var passes = low ? LOW_PASSES : HIGH_PASSES;
    for (var gi = 0; gi < order.length; gi++) {
      var g = order[gi];
      var far = g === 'T' ? 0 : (g[1] === 'L' ? m.farL : m.farR);
      this._drawGroup(ctx, g, P, sc, far, G, passes, glowI, c1, c2);
    }
    if (this.sparks.length) this._drawSparks(ctx, sc, c1, c2);
    if (fl > 0.01 || this.ring >= 0) this._drawFlash(ctx, P, m, c1, c2, fl);
  };

  // Unit radial gradient used (scaled/rotated) for the torso's volumetric shading; one per context.
  function torsoShade(ctx) {
    if (ctx.__hiitShade) return ctx.__hiitShade;
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(10,3,24,0.36)');
    g.addColorStop(0.6, 'rgba(10,3,24,0.2)');
    g.addColorStop(1, 'rgba(10,3,24,0)');
    try { ctx.__hiitShade = g; } catch (e) { /* ignore */ }
    return g;
  }
  var HIGH_PASSES = [[0.034, 0.07], [0.017, 0.12], [0.007, 0.2]];
  var LOW_PASSES = [[0.04, 0.09], [0.016, 0.2]];

  FP._drawGroup = function (ctx, g, P, sc, far, G, passes, glowI, c1, c2) {
    var am = 1 - 0.58 * far, rm = 1 - 0.16 * far, i;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = G.col;
    for (i = 0; i < passes.length; i++) {
      ctx.globalAlpha = clamp(passes[i][1] * am * glowI, 0, 1);
      ctx.beginPath();
      pathGroup(ctx, g, P, sc, rm, passes[i][0] * sc, true);
      ctx.fill();
    }
    if (g === 'T') {
      // torso: rim-lit shell (bright outline, coloured body, darker centre) - reads as a
      // volume instead of a stick-figure cross
      var rimW = Math.max(1, 0.011 * sc);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      pathGroup(ctx, g, P, sc, rm, 0, true, 1, true);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = G.core;
      ctx.globalAlpha = 1;
      ctx.lineWidth = rimW * 2;
      ctx.stroke();
      ctx.fillStyle = G.col;
      ctx.fill();
      // volumetric shading: elliptical dark core aligned with the spine
      var px = P[PELVIS * 3], py = P[PELVIS * 3 + 1], nx = P[NECK * 3], ny = P[NECK * 3 + 1];
      var sx = P[SHL * 3] - P[SHR * 3], sy = P[SHL * 3 + 1] - P[SHR * 3 + 1];
      var ax = nx - px, ay = ny - py, al = Math.sqrt(ax * ax + ay * ay) || 1;
      var halfW = Math.abs((sx * -ay + sy * ax) / al) * 0.5 + 0.045 * sc;
      ctx.save();
      ctx.translate((px + nx) / 2, (py + ny) / 2);
      ctx.rotate(Math.atan2(ay, ax));
      ctx.scale(al * 0.5 + 0.05 * sc, Math.max(halfW, 0.05 * sc));
      ctx.fillStyle = torsoShade(ctx);
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.restore();
      // faint spine energy line
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(0.35 * glowI, 0, 1);
      ctx.fillStyle = G.core;
      ctx.beginPath();
      pathGroup(ctx, g, P, sc, rm, 0, false, 0.22, true, true);
      ctx.fill();
      if (!this.low) this._drawFlow(ctx, g, P, sc, 0);
      this._drawHead(ctx, P, sc, c1, glowI);
      return;
    }
    // limb body: opaque-ish so near limbs occlude what is behind them
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.94;
    ctx.beginPath();
    pathGroup(ctx, g, P, sc, rm, 0, true);
    ctx.fill();
    if (far > 0.01) {
      ctx.fillStyle = 'rgba(6,2,16,' + (0.5 * far).toFixed(3) + ')';
      ctx.globalAlpha = 1;
      ctx.fill();
    }
    // white-hot core
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = G.core;
    ctx.globalAlpha = clamp((0.85 - 0.45 * far) * (0.8 + 0.2 * glowI), 0, 1);
    ctx.beginPath();
    pathGroup(ctx, g, P, sc, rm, 0, false, 0.36);
    ctx.fill();
    if (!this.low) this._drawFlow(ctx, g, P, sc, far);
    // joint nodes
    var N = NODES[g];
    if (N.length) {
      ctx.globalAlpha = clamp(0.9 - 0.5 * far, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      for (i = 0; i < N.length; i++) circle(ctx, P[N[i] * 3], P[N[i] * 3 + 1], 0.0125 * sc * rm);
      ctx.fill();
      if (!this.low) {
        ctx.globalAlpha = clamp(0.35 * am * glowI, 0, 1);
        ctx.fillStyle = G.core;
        ctx.beginPath();
        for (i = 0; i < N.length; i++) circle(ctx, P[N[i] * 3], P[N[i] * 3 + 1], 0.03 * sc * rm);
        ctx.fill();
      }
    }
  };

  // A short bright slice of the tube travelling along the chain: energy flowing through the body.
  FP._drawFlow = function (ctx, g, P, sc, far) {
    var ch = FLOW[g], n = ch.length, i, L = [0], tot = 0;
    for (i = 1; i < n; i++) {
      var dx = P[ch[i] * 3] - P[ch[i - 1] * 3], dy = P[ch[i] * 3 + 1] - P[ch[i - 1] * 3 + 1];
      tot += Math.sqrt(dx * dx + dy * dy); L.push(tot);
    }
    if (tot < 4) return;
    var ph = (this.rt * (0.55 + 0.5 * this.energy) + FLOW_OFS[g]) % 1;
    var u = ph * 1.35 - 0.15, a0 = (u - 0.13) * tot, a1 = (u + 0.06) * tot;
    if (a1 <= 0 || a0 >= tot) return;
    a0 = Math.max(0, a0); a1 = Math.min(tot, a1);
    ctx.beginPath();
    var started = false;
    for (i = 1; i < n; i++) {
      var s0 = L[i - 1], s1 = L[i];
      if (s1 < a0 || s0 > a1 || s1 - s0 < 1e-6) continue;
      var t0 = (Math.max(a0, s0) - s0) / (s1 - s0), t1 = (Math.min(a1, s1) - s0) / (s1 - s0);
      var x0 = P[ch[i - 1] * 3], y0 = P[ch[i - 1] * 3 + 1], x1 = P[ch[i] * 3], y1 = P[ch[i] * 3 + 1];
      if (!started) { ctx.moveTo(lerp(x0, x1, t0), lerp(y0, y1, t0)); started = true; }
      ctx.lineTo(lerp(x0, x1, t1), lerp(y0, y1, t1));
    }
    var fade = Math.sin(Math.PI * clamp(ph * 1.1, 0, 1));
    var al = (0.35 + 0.5 * this.energy) * fade * (1 - 0.6 * far);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.globalAlpha = clamp(al * 0.3, 0, 1);
    ctx.lineWidth = 0.06 * sc;
    ctx.stroke();
    ctx.globalAlpha = clamp(al, 0, 1);
    ctx.lineWidth = 0.018 * sc;
    ctx.stroke();
  };

  FP._drawHead = function (ctx, P, sc, c1, glowI) {
    var hx = P[HEAD * 3], hy = P[HEAD * 3 + 1], r = B.headR * sc;
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(hx - r * 0.2, hy - r * 0.25, 0, hx, hy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, rgba(mix(c1, WHITE, 0.55), 0.55));
    g.addColorStop(1, rgba(c1, 0));
    ctx.globalAlpha = clamp(0.85 * (0.75 + 0.25 * glowI), 0, 1);
    ctx.fillStyle = g;
    ctx.beginPath(); circle(ctx, hx, hy, r); ctx.fill();
    // visor: shows which way the athlete is facing
    var fx = P[FACE * 3] - hx, fy = P[FACE * 3 + 1] - hy;
    var l = clamp(Math.sqrt(fx * fx + fy * fy) / r, 0, 1);
    var ux = hx - P[NECK * 3], uy = hy - P[NECK * 3 + 1], ul = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= ul; uy /= ul;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, r * 0.17);
    var arcA = clamp((l - 0.35) / 0.4, 0, 1);
    if (arcA > 0) {
      // biased toward the top of the head (eye line)
      var sg = (fx * uy - fy * ux) > 0 ? 1 : -1, ang = Math.atan2(fy, fx) + 0.3 * sg;
      ctx.globalAlpha = 0.9 * arcA;
      ctx.beginPath(); ctx.arc(hx, hy, r * 0.72, ang - 0.6, ang + 0.6); ctx.stroke();
    }
    if (arcA < 1) {
      var cx = hx + fx * 0.5 - ux * r * 0.05, cy = hy + fy * 0.5 - uy * r * 0.05;
      var hl = r * 0.5 * (1 - 0.4 * l);
      ctx.globalAlpha = 0.9 * (1 - arcA);
      ctx.beginPath();
      ctx.moveTo(cx + uy * hl, cy - ux * hl);
      ctx.lineTo(cx - uy * hl, cy + ux * hl);
      ctx.stroke();
    }
  };

  FP._drawFloor = function (ctx, P, m, c1, c2, glowI) {
    var W = this.W, y = m.floorY, sc = m.sc;
    if (y > this.H + 4) return;
    var cx = (P[PELVIS * 3] + P[CHEST * 3]) / 2;
    var fc = mix(c2, c1, 0.25);
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createLinearGradient(0, 0, W, 0);
    var mid = clamp(cx / W, 0.2, 0.8);
    g.addColorStop(0, rgba(fc, 0)); g.addColorStop(mid, rgba(mix(fc, WHITE, 0.35), 1)); g.addColorStop(1, rgba(fc, 0));
    ctx.fillStyle = g;
    if (!this.low) {
      ctx.globalAlpha = clamp(0.1 * glowI, 0, 1);
      ctx.fillRect(0, y - 0.022 * sc, W, 0.044 * sc);
      ctx.globalAlpha = clamp(0.16 * glowI, 0, 1);
      ctx.fillRect(0, y - 0.008 * sc, W, 0.016 * sc);
    } else {
      ctx.globalAlpha = clamp(0.18 * glowI, 0, 1);
      ctx.fillRect(0, y - 0.015 * sc, W, 0.03 * sc);
    }
    ctx.globalAlpha = clamp(0.55 * glowI, 0, 1);
    ctx.fillRect(0, y - 0.6, W, 1.2);
    if (this.low) return;
    // pool of light under the body
    var minX = 1e9, maxX = -1e9;
    for (var i = 0; i < NJ; i++) { var x = P[i * 3]; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    var rx = Math.max(0.25 * sc, (maxX - minX) * 0.62), ry = 0.07 * sc;
    var pcx = (minX + maxX) / 2;
    ctx.save();
    ctx.translate(pcx, y);
    ctx.scale(1, ry / rx);
    var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    rg.addColorStop(0, rgba(mix(fc, WHITE, 0.2), 0.32));
    rg.addColorStop(0.5, rgba(fc, 0.1));
    rg.addColorStop(1, rgba(fc, 0));
    ctx.globalAlpha = clamp(glowI, 0, 1);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  };

  FP._drawReflection = function (ctx, P, m, G, order, glowI) {
    var y = m.floorY, H = this.H, W = this.W, sc = m.sc;
    if (y >= H - 1) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, W, H - y); ctx.clip();
    ctx.translate(0, y); ctx.scale(1, -0.7); ctx.translate(0, -y);
    ctx.globalCompositeOperation = 'lighter';
    for (var gi = 0; gi < order.length; gi++) {
      var g = order[gi], far = g === 'T' ? 0 : (g[1] === 'L' ? m.farL : m.farR);
      ctx.fillStyle = G.col;
      ctx.globalAlpha = clamp(0.1 * (1 - 0.6 * far) * glowI, 0, 1);
      ctx.beginPath(); pathGroup(ctx, g, P, sc, 0.8, 0, true); ctx.fill();
      ctx.fillStyle = G.core;
      ctx.globalAlpha = clamp(0.16 * (1 - 0.6 * far) * glowI, 0, 1);
      ctx.beginPath(); pathGroup(ctx, g, P, sc, 0.3, 0, false); ctx.fill();
    }
    ctx.restore();
    // fade with distance below the floor (only the reflection exists on the canvas yet)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    var fade = ctx.createLinearGradient(0, y, 0, y + 0.22 * sc);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, y, W, H - y);
  };

  FP._drawBloom = function (ctx, P, m, c1, c2, glowI, order) {
    var W = this.W, H = this.H, sc = m.sc;
    var bw = Math.max(2, Math.ceil(W / 7)), bh = Math.max(2, Math.ceil(H / 7));
    if (!this.bloom) {
      this.bloom = (root.document && document.createElement) ? document.createElement('canvas') : null;
      if (!this.bloom) return;
      this.bctx = this.bloom.getContext('2d');
      if (!this.bctx) { this.bloom = null; return; }
    }
    var b = this.bloom, bc = this.bctx;
    if (b.width !== bw || b.height !== bh) { b.width = bw; b.height = bh; }
    bc.setTransform(bw / W, 0, 0, bh / H, 0, 0);
    bc.globalCompositeOperation = 'source-over';
    bc.globalAlpha = 1;
    bc.clearRect(0, 0, W, H);
    var Gb = this._grads(bc, P, c1, c2, 0);
    bc.fillStyle = Gb.col;
    for (var gi = 0; gi < order.length; gi++) {
      var g = order[gi], far = g === 'T' ? 0 : (g[1] === 'L' ? m.farL : m.farR);
      bc.globalAlpha = 1 - 0.55 * far;
      bc.beginPath(); pathGroup(bc, g, P, sc, 1, 0.02 * sc, true); bc.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = clamp(0.55 * glowI, 0, 1);
    ctx.drawImage(b, 0, 0, W, H);
    // second, wider halo: re-sample the same buffer slightly enlarged
    var e = 0.05 * sc;
    ctx.globalAlpha = clamp(0.32 * glowI, 0, 1);
    ctx.drawImage(b, -e, -e, W + 2 * e, H + 2 * e);
  };

  FP._drawTrails = function (ctx, m, c1, c2) {
    var Hs = this.hist, n = Hs.length, P = this.cur, sc = m.sc;
    if (n < 3) return;
    var tnow = this.rt, en = 0.55 + 0.45 * this.energy, i, j, k;
    ctx.globalCompositeOperation = 'lighter';
    // ghosts of recent poses (only the limb chains that actually moved)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var ages = [0.06, 0.12, 0.18];
    var gc = mix(mix(c1, c2, 0.5), WHITE, 0.45);
    for (k = 0; k < ages.length; k++) {
      var e = null;
      for (i = n - 1; i >= 0; i--) if (tnow - Hs[i].t >= ages[k]) { e = Hs[i]; break; }
      if (!e) continue;
      var Q = e.P, any = false;
      ctx.beginPath();
      for (i = 0; i < CHAINS.length; i++) {
        var ch = CHAINS[i], mv = 0;
        for (j = 0; j < ch.length; j++) {
          var dx = Q[ch[j] * 3] - P[ch[j] * 3], dy = Q[ch[j] * 3 + 1] - P[ch[j] * 3 + 1];
          mv = Math.max(mv, dx * dx + dy * dy);
        }
        if (mv < (0.04 * sc) * (0.04 * sc)) continue;
        any = true;
        ctx.moveTo(Q[ch[0] * 3], Q[ch[0] * 3 + 1]);
        for (j = 1; j < ch.length; j++) ctx.lineTo(Q[ch[j] * 3], Q[ch[j] * 3 + 1]);
      }
      if (!any) continue;
      // thin, bright afterimage strokes (dim wide strokes read as muddy shadows)
      ctx.strokeStyle = rgba(gc);
      ctx.globalAlpha = 0.26 * (1 - k / ages.length) * en;
      ctx.lineWidth = Math.max(1, 0.011 * sc);
      ctx.stroke();
    }
    // light-painting ribbons behind hands / feet / head
    for (k = 0; k < TRAIL_J.length; k++) {
      var jj = TRAIL_J[k] * 3, L = 0;
      for (i = 1; i < n; i++) {
        L += Math.abs(Hs[i].P[jj] - Hs[i - 1].P[jj]) + Math.abs(Hs[i].P[jj + 1] - Hs[i - 1].P[jj + 1]);
      }
      if (L < 0.08 * sc) continue;
      // a trail that doubles back on itself (fast oscillation) reads as a solid bar: fade it out
      var h0 = Hs[0].P, nx = P[jj] - h0[jj], ny = P[jj + 1] - h0[jj + 1];
      var unfold = clamp((Math.sqrt(nx * nx + ny * ny) / L - 0.35) / 0.35, 0, 1);
      if (unfold <= 0) continue;
      var wmax = (TRAIL_J[k] === HEAD ? 0.03 : 0.022) * sc * clamp((L / sc - 0.06) / 0.3, 0, 1);
      var xs = [], ys = [];
      for (i = 0; i < n; i++) { xs.push(Hs[i].P[jj]); ys.push(Hs[i].P[jj + 1]); }
      xs.push(P[jj]); ys.push(P[jj + 1]);
      var N = xs.length, lx = [], ly = [], rx = [], ry = [];
      for (i = 0; i < N; i++) {
        var a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
        var tx = xs[b] - xs[a], ty = ys[b] - ys[a], tl = Math.sqrt(tx * tx + ty * ty) || 1;
        var w = wmax * Math.pow(i / (N - 1), 1.3);
        lx.push(xs[i] - ty / tl * w); ly.push(ys[i] + tx / tl * w);
        rx.push(xs[i] + ty / tl * w); ry.push(ys[i] - tx / tl * w);
      }
      ctx.beginPath();
      ctx.moveTo(lx[0], ly[0]);
      for (i = 1; i < N; i++) ctx.lineTo(lx[i], ly[i]);
      for (i = N - 1; i >= 0; i--) ctx.lineTo(rx[i], ry[i]);
      ctx.closePath();
      var tc = (TRAIL_J[k] === TOL || TRAIL_J[k] === TOR) ? c2 : c1;
      var gr = ctx.createLinearGradient(xs[0], ys[0], xs[N - 1], ys[N - 1]);
      gr.addColorStop(0, rgba(tc, 0));
      gr.addColorStop(0.7, rgba(tc, 0.35));
      gr.addColorStop(1, rgba(mix(tc, WHITE, 0.6), 0.8));
      ctx.fillStyle = gr;
      var far = (TRAIL_J[k] === HAL || TRAIL_J[k] === TOL) ? m.farL : 0;
      ctx.globalAlpha = clamp(Math.min(1, L / (0.25 * sc)) * unfold * en * (1 - 0.5 * far), 0, 1);
      ctx.fill();
    }
  };

  FP._drawSparks = function (ctx, sc, c1, c2) {
    var S = this.sparks, i, b;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var lw = Math.max(0.8, 0.0075 * sc);
    var cols = [mix(c2, WHITE, 0.1), mix(c1, WHITE, 0.3), mix(c1, WHITE, 0.7)];
    for (b = 0; b < 3; b++) {
      ctx.beginPath();
      var any = false;
      for (i = 0; i < S.length; i++) {
        var s = S[i], a = s.life / s.max, bk = a > 0.66 ? 2 : a > 0.33 ? 1 : 0;
        if (bk !== b) continue;
        any = true;
        var tx = s.vx * 0.02, ty = s.vy * 0.02, tl = Math.sqrt(tx * tx + ty * ty);
        if (s.hot < 0) { tx *= 0.3; ty *= 0.3; }
        if (tl < 1) { var f = 1 / (tl || 1); tx = (tx || 1) * f; ty *= f; }
        ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - tx, s.y - ty);
      }
      if (!any) continue;
      ctx.strokeStyle = rgba(cols[b]);
      ctx.globalAlpha = 0.12 + 0.14 * b;
      ctx.lineWidth = lw * 3;
      ctx.stroke();
      ctx.globalAlpha = 0.35 + 0.25 * b;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };

  FP._drawFlash = function (ctx, P, m, c1, c2, fl) {
    var sc = m.sc, cx = P[CHEST * 3], cy = P[CHEST * 3 + 1];
    ctx.globalCompositeOperation = 'lighter';
    if (fl > 0.01) {
      var r = sc * (0.75 - 0.25 * fl);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba(mix(c1, WHITE, 0.6), 0.5));
      g.addColorStop(0.4, rgba(c1, 0.18));
      g.addColorStop(1, rgba(c1, 0));
      ctx.globalAlpha = clamp(fl, 0, 1);
      ctx.fillStyle = g;
      ctx.beginPath(); circle(ctx, cx, cy, r); ctx.fill();
    }
    if (this.ring >= 0 && !this.low) {
      var e = this.ring, rx = sc * lerp(0.12, 1.3, 1 - Math.pow(1 - e, 3)), px = (P[PELVIS * 3] + P[CHEST * 3]) / 2;
      ctx.save();
      ctx.translate(px, m.floorY); ctx.scale(1, 0.14);
      ctx.strokeStyle = rgba(mix(c1, WHITE, 0.5));
      ctx.globalAlpha = clamp((1 - e) * (1 - e), 0, 1);
      ctx.lineWidth = sc * 0.06 * (1 - e) + 1;
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  };

  /* ================================================================= STUDIO */
  // A matte, softly lit 3D mannequin (source-over only: no glow, sparks, trails or
  // reflection). Each limb is a tapered capsule shaded across its width from its 3D
  // orientation: wrapped-Lambert key light (upper-left-front) + sky fill, a satin
  // Blinn highlight and a phase-tinted rim light on the opposite edge. Tapers use a
  // conic gradient centred on the cone apex, so the shading follows the taper
  // exactly. The torso is lofted from elliptical cross-sections; the floor gets soft
  // contact shadows scaled by each body part's true height above it.

  var STYLES = ['neon', 'studio'];
  function styleOf(s) { return s === 'studio' ? 'studio' : 'neon'; }
  function schemeOf(s) { return s === 'light' ? 'light' : 'dark'; }

  // Lights in camera space (x right, y up, z toward the viewer): every exercise is lit
  // like the same product shot.
  var KEY = norm([-0.46, 0.56, 0.69]);
  var HALFV = norm([KEY[0], KEY[1], KEY[2] + 1]);
  var RIMX = 0.94, RIMY = 0.34;
  var KEY2 = (function () { var l = Math.sqrt(KEY[0] * KEY[0] + KEY[1] * KEY[1]); return [KEY[0] / l, KEY[1] / l]; })();
  // samples across a limb's width: u = sin(phi), phi evenly spaced over the visible half
  var SU = [-1, -0.924, -0.707, -0.383, 0, 0.383, 0.707, 0.924, 1];
  var SUL = [-0.8, 0.15, 0.85];
  var BLACK = [0, 0, 0];

  var MATS = {
    dark: {
      body: [233, 235, 239], shade: [140, 147, 163], deepTo: [34, 38, 48], deepK: 0.45, lit: [250, 251, 252],
      spec: [255, 255, 255], specK: 0.45, shin: 16, rimK: 0.8, rimW: 0.15,
      far: [13, 15, 19], farK: 0.32, ao: [18, 21, 30], aoK: 0.42,
      shadow: [0, 0, 0], shadowK: 1.25, floor: [255, 255, 255], floorK: 0.03, pool: 0.07, sweep: 0.5
    },
    light: {
      body: [42, 45, 52], shade: [24, 26, 31], deepTo: [6, 7, 9], deepK: 0.5, lit: [107, 114, 128],
      spec: [170, 176, 188], specK: 0.55, shin: 14, rimK: 0.72, rimW: 0.08,
      far: [8, 9, 11], farK: 0.22, ao: [0, 0, 0], aoK: 0.5,
      shadow: [44, 38, 30], shadowK: 0.62, floor: [0, 0, 0], floorK: 0.03, pool: 0, sweep: 0.4
    }
  };
  function buildMat(scheme, o) {
    var b = MATS[scheme], m = {}, k;
    for (k in b) if (b.hasOwnProperty(k)) m[k] = b[k];
    o = o || {};
    var body = parseColor(o.body, b.body), shade = parseColor(o.shade, b.shade);
    var lit = o.body ? mix(body, scheme === 'dark' ? WHITE : b.lit, 0.4) : b.lit;
    m.ramp = scheme === 'dark' ? [[0, mix(shade, b.deepTo, b.deepK)], [0.3, shade], [0.7, body], [1, lit]]
      : [[0, mix(shade, b.deepTo, b.deepK)], [0.3, shade], [0.62, body], [1, lit]];
    return m;
  }

  // Surface colour for camera-space unit normal (nx, ny, nz). M = per-frame state.
  // acc: optional accent albedo (wristbands, soles) instead of the body ramp.
  // ed: how close the sample is to the silhouette (|u| across a limb, 0 = no rim).
  function stShade(M, nx, ny, nz, acc, ed) {
    var ndl = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
    var dif = clamp((ndl + 0.4) / 1.4, 0, 1);
    var I = clamp((0.07 + 0.15 * (0.5 + 0.5 * ny) + 0.8 * dif * (0.5 + 0.5 * dif)) * M.dim, 0, 1);
    var c, R = M.ramp;
    if (acc) c = I < 0.6 ? mix(mix(acc, BLACK, 0.6), acc, I / 0.6) : mix(acc, mix(acc, WHITE, 0.3), (I - 0.6) / 0.4);
    else if (I <= R[1][0]) c = mix(R[0][1], R[1][1], I / R[1][0]);
    else if (I <= R[2][0]) c = mix(R[1][1], R[2][1], (I - R[1][0]) / (R[2][0] - R[1][0]));
    else c = mix(R[2][1], R[3][1], (I - R[2][0]) / (R[3][0] - R[2][0]));
    var nh = nx * HALFV[0] + ny * HALFV[1] + nz * HALFV[2];
    if (nh > 0.5) {
      var sp = Math.pow(nh, M.shin) * M.specK * M.dim;
      if (sp > 0.003) c = mix(c, M.spec, clamp(sp, 0, 1));
    }
    if (ed > 0) {
      var pl = Math.sqrt(nx * nx + ny * ny), rr = pl > 1e-4 ? (nx * RIMX + ny * RIMY) / pl : 0;
      if (rr > 0) {
        var e2 = ed * ed, e4 = e2 * e2, rim = rr * e4 * e4 * M.rimK;
        if (rim > 0.003) c = mix(c, M.rimC, clamp(rim, 0, 1));
      }
    }
    if (M.far > 0) c = mix(c, M.farC, M.far);
    return c;
  }

  // Capsule piece: cap bit 1 = round start, bit 2 = round end (else a flat end).
  function piece(ctx, x1, y1, r1, x2, y2, r2, cap) {
    if (cap === 3) { capsule(ctx, x1, y1, r1, x2, y2, r2); return; }
    var dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    var a = Math.atan2(dy, dx), nx = -dy / d, ny = dx / d, H = Math.PI / 2;
    ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
    if (cap & 1) ctx.arc(x1, y1, r1, a + H, a + 3 * H, false); else ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
    ctx.lineTo(x2 - nx * r2, y2 - ny * r2);
    if (cap & 2) ctx.arc(x2, y2, r2, a - H, a + H, false); else ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
    ctx.closePath();
  }

  // Shading gradient across a (tapered) cylinder from screen A(ax,ay) r=ra to B, with
  // camera-space axis (vx,vy,vz). Returns a canvas gradient.
  function cylGrad(ctx, M, ax, ay, ra, bx, by, rb, vx, vy, vz, acc) {
    var vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;
    var e1x = -vy, e1y = vx, el = Math.sqrt(e1x * e1x + e1y * e1y);
    if (el < 1e-4) { e1x = 1; e1y = 0; } else { e1x /= el; e1y /= el; }
    var e2x = -vz * e1y, e2y = vz * e1x, e2z = vx * e1y - vy * e1x; // a x e1 (faces the viewer)
    var sx = e1x, sy = -e1y; // e1 on screen (y down)
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy);
    var rm = (ra + rb) / 2, mx = (ax + bx) / 2, my = (ay + by) / 2;
    var U = M.low ? SUL : SU, n = U.length, g, i, u, cu, c;
    if (!M.low && M.conic && d > Math.max(ra, rb) && Math.abs(ra - rb) > 0.03 * rm) {
      var t = ra / (ra - rb), px = ax + dx * t, py = ay + dy * t;
      var th0 = Math.atan2(my - py, mx - px) - Math.PI;
      g = ctx.createConicGradient(th0, px, py);
      for (i = 0; i < n; i++) {
        u = U[i]; cu = Math.sqrt(Math.max(0, 1 - u * u));
        c = stShade(M, u * e1x + cu * e2x, u * e1y + cu * e2y, cu * e2z, acc, Math.abs(u));
        var th = Math.atan2(my + sy * u * rm - py, mx + sx * u * rm - px) - th0;
        th = ((th % TAU) + TAU) % TAU;
        g.addColorStop(th / TAU, rgba(c));
      }
      return g;
    }
    g = ctx.createLinearGradient(mx - sx * rm, my - sy * rm, mx + sx * rm, my + sy * rm);
    for (i = 0; i < n; i++) {
      u = U[i]; cu = Math.sqrt(Math.max(0, 1 - u * u));
      c = stShade(M, u * e1x + cu * e2x, u * e1y + cu * e2y, cu * e2z, acc, Math.abs(u));
      g.addColorStop((u + 1) / 2, rgba(c));
    }
    return g;
  }

  function sq(x) { return x * x; }
  // Shading for a quadrilateral slab of a lofted body (edges L0-L1 and R0-R1), axis (vx,vy,vz).
  function slabGrad(ctx, M, L0, L1, R0, R1, vx, vy, vz) {
    var vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;
    var e1x = -vy, e1y = vx, el = Math.sqrt(e1x * e1x + e1y * e1y);
    if (el < 1e-4) { e1x = 1; e1y = 0; } else { e1x /= el; e1y /= el; }
    var e2x = -vz * e1y, e2y = vz * e1x, e2z = vx * e1y - vy * e1x;
    var lmx = (L0[0] + L1[0]) / 2, lmy = (L0[1] + L1[1]) / 2, rmx = (R0[0] + R1[0]) / 2, rmy = (R0[1] + R1[1]) / 2;
    var mx = (lmx + rmx) / 2, my = (lmy + rmy) / 2;
    // +u side is the one along e1 on screen
    var flip = ((lmx - mx) * e1x + (lmy - my) * -e1y) < 0;
    var px = flip ? rmx : lmx, py = flip ? rmy : lmy, hw = Math.sqrt(sq(px - mx) + sq(py - my)) || 1;
    var Pa = flip ? R0 : L0, Pb = flip ? R1 : L1, Qa = flip ? L0 : R0, Qb = flip ? L1 : R1;
    var d1x = Pb[0] - Pa[0], d1y = Pb[1] - Pa[1], d2x = Qb[0] - Qa[0], d2y = Qb[1] - Qa[1];
    var den = d1x * d2y - d1y * d2x, U = SU, n = U.length, g, i, u, cu, c;
    var conic = M.conic && Math.abs(den) > 1e-6, ax = 0, ay = 0, th0 = 0;
    if (conic) {
      var t = ((Qa[0] - Pa[0]) * d2y - (Qa[1] - Pa[1]) * d2x) / den;
      ax = Pa[0] + d1x * t; ay = Pa[1] + d1y * t;
      var dd = Math.sqrt(sq(ax - mx) + sq(ay - my));
      conic = dd > 2.5 * hw && dd < 400 * hw;
      th0 = Math.atan2(my - ay, mx - ax) - Math.PI;
    }
    g = conic ? ctx.createConicGradient(th0, ax, ay) : ctx.createLinearGradient(2 * mx - px, 2 * my - py, px, py);
    for (i = 0; i < n; i++) {
      u = U[i]; cu = Math.sqrt(Math.max(0, 1 - u * u));
      c = rgba(stShade(M, u * e1x + cu * e2x, u * e1y + cu * e2y, cu * e2z, null, Math.abs(u)));
      if (conic) {
        var th = Math.atan2(my + (py - my) * u - ay, mx + (px - mx) * u - ax) - th0;
        g.addColorStop((((th % TAU) + TAU) % TAU) / TAU, c);
      } else g.addColorStop((u + 1) / 2, c);
    }
    return g;
  }

  // Studio body: radii in body units (start, end); per-group draw lists.
  var ST_ARM = { up: [0.041, 0.0285], fore: [0.0285, 0.0205], hand: [0.0195, 0.016] };
  var ST_LEG = { thigh: [0.056, 0.038], knee: 0.0375, calf: 0.0415, calfAt: 0.27, ankle: 0.0235 };
  var TORSO = [ // anchor (0 pelvis+u1*o | 1 chest+u2*o), o, half-width (R), half-depth (F), forward, hips->shoulders blend
    [0, 0.0, 0.092, 0.066, -0.008, 0],
    [0, 0.08, 0.074, 0.054, 0.004, 0.4],
    [1, 0.0, 0.093, 0.062, 0.012, 0.8],
    [1, 0.064, 0.106, 0.067, 0.016, 1],
    [1, 0.124, 0.109, 0.056, 0.006, 1],
    [1, 0.158, 0.05, 0.042, 0.0, 1]
  ];
  // Occlusion silhouettes (rough) per group, for the soft shadow a near part casts on what is behind it.
  var ST_OCC = {
    T: [[PELVIS, CHEST, 0.075, 0.08], [CHEST, NECK, 0.085, 0.06], [NECK, HEAD, 0.03, 0.062]],
    AL: [[SHL, ELL, 0.041, 0.029], [ELL, WRL, 0.029, 0.021], [WRL, HAL, 0.02, 0.016]],
    AR: [[SHR, ELR, 0.041, 0.029], [ELR, WRR, 0.029, 0.021], [WRR, HAR, 0.02, 0.016]],
    LL: [[HIPL, KNL, 0.056, 0.038], [KNL, ANL, 0.041, 0.024], [ANL, TOL, 0.025, 0.014]],
    LR: [[HIPR, KNR, 0.056, 0.038], [KNR, ANR, 0.041, 0.024], [ANR, TOR, 0.025, 0.014]]
  };
  // Contact-shadow samples: [joint a, joint b, t, clearance radius]
  var ST_SHADOW = [[HEAD, HEAD, 0, 0.062], [PELVIS, PELVIS, 0, 0.07], [PELVIS, CHEST, 0.5, 0.066], [CHEST, CHEST, 0, 0.07],
    [CHEST, NECK, 0.6, 0.066], [NECK, HEAD, 0.4, 0.04]];
  (function () {
    var S = [[SHL, ELL, WRL, HAL, HIPL, KNL, ANL, TOL], [SHR, ELR, WRR, HAR, HIPR, KNR, ANR, TOR]];
    for (var i = 0; i < 2; i++) {
      var s = S[i];
      ST_SHADOW.push([s[0], s[0], 0, 0.044], [s[0], s[1], 0.5, 0.037], [s[1], s[1], 0, 0.031], [s[1], s[2], 0.5, 0.026],
        [s[2], s[2], 0, 0.022], [s[3], s[3], 0, 0.016], [s[4], s[5], 0.3, 0.058], [s[4], s[5], 0.7, 0.048],
        [s[5], s[5], 0, 0.041], [s[5], s[6], 0.4, 0.04], [s[5], s[6], 0.75, 0.031], [s[6], s[6], 0, 0.045],
        [s[6], s[7], 0.5, 0.025], [s[7], s[7], 0, 0.012]);
    }
  })();

  // Screen ellipse (orthographic outline) of an ellipsoid with camera-space semi-axis vectors.
  function projEllipse(axes, k) {
    var sxx = 0, sxy = 0, syy = 0;
    for (var i = 0; i < axes.length; i++) {
      var vx = axes[i][0] * k, vy = -axes[i][1] * k;
      sxx += vx * vx; sxy += vx * vy; syy += vy * vy;
    }
    var th = 0.5 * Math.atan2(2 * sxy, sxx - syy), mid = (sxx + syy) / 2;
    var dd = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) / 4 + sxy * sxy));
    return { th: th, rx: Math.sqrt(mid + dd), ry: Math.sqrt(Math.max(1e-6, mid - dd)) };
  }

  function unitShadow(ctx, col) {
    var key = '__hiitSh' + col.join('_');
    if (ctx[key]) return ctx[key];
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.22, rgba(col, 0.8)); g.addColorStop(0.45, rgba(col, 0.46));
    g.addColorStop(0.7, rgba(col, 0.16)); g.addColorStop(0.86, rgba(col, 0.04)); g.addColorStop(1, rgba(col, 0));
    try { ctx[key] = g; } catch (e) { /* ignore */ }
    return g;
  }

  FP._stState = function () {
    var M = this._M || (this._M = {}), mat = this.mat;
    M.ramp = mat.ramp; M.spec = mat.spec; M.specK = mat.specK; M.shin = mat.shin;
    M.rimC = mix(this.c1, WHITE, mat.rimW);
    M.rimK = mat.rimK * (0.5 + 0.5 * this.energy) * (1 + 1.4 * this.flash) * (this.low ? 0.45 : 1);
    M.far = 0; M.farC = mat.far; M.dim = 1;
    M.sc = this.meta.sc; M.low = this.low;
    M.rk = M.sc * (this.low ? 1.12 : 1); // thumbnails: slightly thicker limbs so they read at ~56 px
    M.conic = typeof this.ctx.createConicGradient === 'function';
    M.zRef = this.cur[PELVIS * 3 + 2];
    return M;
  };

  FP._drawStudio = function () {
    var ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    if (!this.hasPose) return;
    var P = this.cur, m = this.meta, low = this.low, mat = this.mat;
    var M = this._stState();
    var ex = (this.morphT < 0.5 && this.fromEx) ? this.fromEx : this.ex;
    var order = ex.sorder || ex.order;
    for (var gi = 0; gi < order.length; gi++) {
      var g = order[gi], far = g === 'T' ? 0 : (g[1] === 'L' ? m.farL : m.farR);
      if (!low && gi > 0) this._stOcclude(ctx, g, P, M);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      M.far = far * mat.farK; M.dim = 1 - 0.12 * far;
      if (g === 'T') this._stTorso(ctx, P, M);
      else if (g[0] === 'A') this._stArm(ctx, g[1], P, M);
      else this._stLeg(ctx, g[1], P, M);
    }
    M.far = 0; M.dim = 1;
    if (this.ring >= 0 && !low) this._stSweep(ctx, P, M);
    ctx.globalCompositeOperation = 'destination-over';
    this._stGround(ctx, P, M);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    try { ctx.imageSmoothingQuality = 'low'; } catch (e) { /* ignore */ } // the default (neon's bloom relies on it)
  };

  // depth-scaled radius (near parts slightly larger, as in the projection)
  function rz(M, P, i, r) { return r * M.rk * (1 + (P[i * 3 + 2] - M.zRef) / PERSP); }

  FP._stCap = function (ctx, M, ax, ay, az, ra, bx, by, bz, rb, cap, acc) {
    var sc = M.sc;
    ctx.fillStyle = cylGrad(ctx, M, ax, ay, ra, bx, by, rb, (bx - ax) / sc, -(by - ay) / sc, bz - az, acc);
    ctx.beginPath();
    piece(ctx, ax, ay, ra, bx, by, rb, cap);
    ctx.fill();
  };
  // segment between joints i -> j with radii (body units)
  FP._stBone = function (ctx, M, P, i, j, r1, r2) {
    this._stCap(ctx, M, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], rz(M, P, i, r1), P[j * 3], P[j * 3 + 1], P[j * 3 + 2], rz(M, P, j, r2), 3);
  };

  FP._stArm = function (ctx, s, P, M) {
    var sh = s === 'L' ? SHL : SHR, el = sh + 1, wr = sh + 2, ha = sh + 3;
    this._stBone(ctx, M, P, sh, el, ST_ARM.up[0], ST_ARM.up[1]);
    this._stBone(ctx, M, P, el, wr, ST_ARM.fore[0], ST_ARM.fore[1]);
    this._stBone(ctx, M, P, wr, ha, ST_ARM.hand[0], ST_ARM.hand[1]);
    if (M.low) return;
    // accent wristband
    var t0 = 0.74, t1 = 0.9, e = el * 3, w = wr * 3;
    var x0 = lerp(P[e], P[w], t0), y0 = lerp(P[e + 1], P[w + 1], t0), z0 = lerp(P[e + 2], P[w + 2], t0);
    var x1 = lerp(P[e], P[w], t1), y1 = lerp(P[e + 1], P[w + 1], t1), z1 = lerp(P[e + 2], P[w + 2], t1);
    var r0 = rz(M, P, el, lerp(ST_ARM.fore[0], ST_ARM.fore[1], t0)) * 1.07, r1 = rz(M, P, wr, lerp(ST_ARM.fore[0], ST_ARM.fore[1], t1)) * 1.07;
    this._stCap(ctx, M, x0, y0, z0, r0, x1, y1, z1, r1, 0, mix(this.c1, this.c2, 0.25));
  };

  FP._stLeg = function (ctx, s, P, M) {
    var hip = s === 'L' ? HIPL : HIPR, kn = hip + 1, an = hip + 2, sc = M.sc;
    this._stBone(ctx, M, P, hip, kn, ST_LEG.thigh[0], ST_LEG.thigh[1]);
    // shin with a calf swell: two flat-joined pieces sharing the calf station
    var k = kn * 3, a = an * 3, t = ST_LEG.calfAt;
    var cx = lerp(P[k], P[a], t), cy = lerp(P[k + 1], P[a + 1], t);
    var rk = rz(M, P, kn, ST_LEG.knee), rc = rz(M, P, kn, ST_LEG.calf), ra = rz(M, P, an, ST_LEG.ankle);
    var dx = P[a] - P[k], dy = P[a + 1] - P[k + 1], dl = Math.sqrt(dx * dx + dy * dy) || 1, ov = 0.6 / dl;
    if (dl > rc) {
      var vx = dx / sc, vy = -dy / sc, vz = P[a + 2] - P[k + 2];
      ctx.fillStyle = cylGrad(ctx, M, P[k], P[k + 1], rk, cx, cy, rc, vx, vy, vz);
      ctx.beginPath(); piece(ctx, P[k], P[k + 1], rk, cx + dx * ov, cy + dy * ov, rc, 1); ctx.fill();
      ctx.fillStyle = cylGrad(ctx, M, cx, cy, rc, P[a], P[a + 1], ra, vx, vy, vz);
      ctx.beginPath(); piece(ctx, cx, cy, rc, P[a], P[a + 1], ra, 2); ctx.fill();
    } else {
      this._stBone(ctx, M, P, kn, an, ST_LEG.calf, ST_LEG.ankle);
    }
    this._stFoot(ctx, s, P, M);
  };

  // Sneaker-like foot: heel->toe capsule + instep, accent sole.
  FP._stFoot = function (ctx, s, P, M) {
    var kn = s === 'L' ? KNL : KNR, an = kn + 1, to = kn + 2, sc = M.sc;
    var A = [P[an * 3] / sc, -P[an * 3 + 1] / sc, P[an * 3 + 2]];
    var K = [P[kn * 3] / sc, -P[kn * 3 + 1] / sc, P[kn * 3 + 2]];
    var T = [P[to * 3] / sc, -P[to * 3 + 1] / sc, P[to * 3 + 2]];
    var f = norm(sub(T, A)), sd = norm(sub(A, K));
    var fd = sub(sd, mul(f, dot(sd, f)));
    fd = len(fd) > 1e-3 ? norm(fd) : [0, -1, 0];
    var heel = addS(addS(A, f, -0.017), fd, 0.0295), toe = addS(addS(A, f, 0.104), fd, 0.002);
    var ins0 = addS(A, fd, 0.004), ins1 = addS(addS(A, f, 0.062), fd, 0.011);
    var z = 1 + (A[2] - M.zRef) / PERSP;
    var self = this;
    function cap(p, r, q, r2, acc) {
      self._stCap(ctx, M, p[0] * sc, -p[1] * sc, p[2], r * M.rk * z, q[0] * sc, -q[1] * sc, q[2], r2 * M.rk * z, 3, acc);
    }
    cap(heel, 0.0225, toe, 0.0125);
    cap(ins0, 0.024, ins1, 0.0185);
    if (M.low) return;
    cap(addS(heel, fd, 0.0155), 0.0072, addS(toe, fd, 0.0062), 0.0062, mix(this.c2, this.c1, 0.2));
  };

  FP._stTorso = function (ctx, P, M) {
    var sc = M.sc, i;
    function cam(j) { return [P[j * 3] / sc, -P[j * 3 + 1] / sc, P[j * 3 + 2]]; }
    var pel = cam(PELVIS), che = cam(CHEST), nek = cam(NECK), hd = cam(HEAD);
    var u1 = norm(sub(che, pel)), u2 = norm(sub(nek, che));
    var Rh = norm(sub(cam(HIPR), cam(HIPL))), Rs = norm(sub(cam(SHR), cam(SHL)));
    var n = TORSO.length, cx = [], cy = [], AX = [], AY = [], BX = [], BY = [], wmax = 0;
    for (i = 0; i < n; i++) {
      var st = TORSO[i], b = st[5];
      var u = norm(add(mul(u1, 1 - b), mul(u2, b)));
      var R = norm(add(mul(Rh, 1 - b), mul(Rs, b)));
      var F = norm(cross(u, R)); R = cross(F, u);
      var c = addS(st[0] ? addS(che, u2, st[1]) : addS(pel, u1, st[1]), F, st[4]);
      cx.push(c[0] * sc); cy.push(-c[1] * sc);
      AX.push(R[0] * st[2] * sc); AY.push(-R[1] * st[2] * sc); BX.push(F[0] * st[3] * sc); BY.push(-F[1] * st[3] * sc);
    }
    var V = [], tx, ty, tl;
    var Lp = [], Rp = [];
    for (i = 0; i < n; i++) {
      var ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      tx = cx[ib] - cx[ia]; ty = cy[ib] - cy[ia]; tl = Math.sqrt(tx * tx + ty * ty);
      if (tl < 1e-6) { tx = 0; ty = -1; } else { tx /= tl; ty /= tl; }
      var nx = -ty, ny = tx, p1 = AX[i] * nx + AY[i] * ny, p2 = BX[i] * nx + BY[i] * ny;
      var w = Math.sqrt(p1 * p1 + p2 * p2); // (the torso sits at the depth reference)
      if (i > 0 && i < n - 1) wmax = Math.max(wmax, w);
      Lp.push([cx[i] + nx * w, cy[i] + ny * w]); Rp.push([cx[i] - nx * w, cy[i] - ny * w]);
    }
    for (i = 0; i < n; i++) V.push(Lp[i]);
    for (i = n - 1; i >= 0; i--) V.push(Rp[i]);
    // neck first (the torso's trapezius slope overlaps its base), then torso, then head
    var nb = addS(nek, u2, -0.03);
    var nt = add(nek, mul(sub(hd, nek), 0.55));
    this._stCap(ctx, M, nb[0] * sc, -nb[1] * sc, nb[2], rz(M, P, NECK, 0.033), nt[0] * sc, -nt[1] * sc, nt[2], rz(M, P, NECK, 0.029), 3);
    function outline() {
      var N = V.length, q0 = V[N - 1], q1;
      ctx.moveTo((q0[0] + V[0][0]) / 2, (q0[1] + V[0][1]) / 2);
      for (var k = 0; k < N; k++) {
        q0 = V[k]; q1 = V[(k + 1) % N];
        ctx.quadraticCurveTo(q0[0], q0[1], (q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2);
      }
      ctx.closePath();
    }
    // pelvis: an ellipsoid, so hips and seat are rounded from every camera angle; the
    // loft above it starts exactly at its widest section (station 0) and matches its shading
    var Fh = norm(cross(u1, Rh)), Rh2 = cross(Fh, u1), zk = 1 + (pel[2] - M.zRef) / PERSP;
    var pc = addS(addS(pel, Fh, -0.008), u1, 0.01);
    var pe = projEllipse([mul(Rh2, 0.09), mul(Fh, 0.062), mul(u1, 0.058)], sc * zk * (M.low ? 1.06 : 1));
    var pw = Math.sqrt(sq(Lp[0][0] - Rp[0][0]) + sq(Lp[0][1] - Rp[0][1])) / 2;
    var ppx = pc[0] * sc, ppy = -pc[1] * sc, uu = sub(che, pel);
    var ux = uu[0] * sc, uy = -uu[1] * sc, ul = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= ul; uy /= ul;
    var tx0 = sub(nek, pel);
    ctx.fillStyle = cylGrad(ctx, M, ppx - ux * pw, ppy - uy * pw, pw, ppx + ux * pw, ppy + uy * pw, pw, tx0[0], tx0[1], tx0[2]);
    ctx.beginPath();
    ctx.ellipse(ppx, ppy, pe.rx, pe.ry, pe.th, 0, TAU);
    ctx.fill();
    if (M.low) {
      var ax = sub(nek, pel), mx = 0, my = 0;
      for (i = 1; i < n - 1; i++) { mx += cx[i]; my += cy[i]; }
      mx /= (n - 2); my /= (n - 2);
      var al = len(ax) || 1, sx2 = ax[0] / al * sc, sy2 = -ax[1] / al * sc, sl = Math.sqrt(sx2 * sx2 + sy2 * sy2) || 1;
      var hl = Math.max(4, sl * al * 0.5);
      ctx.fillStyle = cylGrad(ctx, M, mx - sx2 / sl * hl, my - sy2 / sl * hl, wmax, mx + sx2 / sl * hl, my + sy2 / sl * hl, wmax, ax[0], ax[1], ax[2]);
      ctx.beginPath(); outline(); ctx.fill();
    } else {
      // loft: one slab per pair of stations (clipped), each shaded with a conic gradient
      // centred where its two silhouette edges meet -> the shading follows the changing
      // width and stays continuous across stations
      var E = 4 * wmax + 10, tax = sub(nek, pel), lastG = null; // one axis for all slabs: no banding
      for (i = 0; i < n - 1; i++) {
        var j = i + 1, ov = 0.8;
        var dxs = cx[j] - cx[i], dys = cy[j] - cy[i], dl = Math.sqrt(dxs * dxs + dys * dys) || 1;
        var ex = dxs / dl, ey = dys / dl;
        var b0 = i === 0 ? 0 : ov, b1 = j === n - 1 ? 2 * wmax : ov;
        var nx0 = (Lp[i][0] - Rp[i][0]), ny0 = (Lp[i][1] - Rp[i][1]), nl0 = Math.sqrt(nx0 * nx0 + ny0 * ny0) || 1;
        var nx1 = (Lp[j][0] - Rp[j][0]), ny1 = (Lp[j][1] - Rp[j][1]), nl1 = Math.sqrt(nx1 * nx1 + ny1 * ny1) || 1;
        nx0 /= nl0; ny0 /= nl0; nx1 /= nl1; ny1 /= nl1;
        var ax0 = cx[i] - ex * b0, ay0 = cy[i] - ey * b0, ax1 = cx[j] + ex * b1, ay1 = cy[j] + ey * b1;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ax0 + nx0 * E, ay0 + ny0 * E); ctx.lineTo(ax1 + nx1 * E, ay1 + ny1 * E);
        ctx.lineTo(ax1 - nx1 * E, ay1 - ny1 * E); ctx.lineTo(ax0 - nx0 * E, ay0 - ny0 * E);
        ctx.closePath();
        ctx.clip();
        // the steep shoulder->neck slab just continues the chest shading (a separate
        // gradient there would show a seam across the trapezius)
        if (j < n - 1 || !lastG) lastG = slabGrad(ctx, M, Lp[i], Lp[j], Rp[i], Rp[j], tax[0], tax[1], tax[2]);
        ctx.fillStyle = lastG;
        ctx.beginPath(); outline(); ctx.fill();
        ctx.restore();
      }
    }
    this._stHead(ctx, P, M);
  };

  FP._stHead = function (ctx, P, M) {
    var sc = M.sc, i;
    function cam(j) { return [P[j * 3] / sc, -P[j * 3 + 1] / sc, P[j * 3 + 2]]; }
    var hd = cam(HEAD), nk = cam(NECK), fc = cam(FACE);
    var u3 = norm(sub(hd, nk)), F = sub(fc, hd);
    F = sub(F, mul(u3, dot(F, u3)));
    F = len(F) > 1e-4 ? norm(F) : norm(cross(u3, [0, 0, 1]));
    var R = cross(F, u3);
    var c = addS(addS(hd, u3, 0.006), F, 0.004), z = 1 + (hd[2] - M.zRef) / PERSP;
    var e = projEllipse([mul(u3, 0.069), mul(F, 0.061), mul(R, 0.053)], sc * z);
    var x = c[0] * sc, y = -c[1] * sc, th = e.th, rx = e.rx, ry = e.ry;
    // work in the ellipse's unit-circle frame; screen directions mapped into it
    var ct = Math.cos(th), st = Math.sin(th);
    function local(dx, dy) {
      var lx = (dx * ct + dy * st) / rx, ly = (-dx * st + dy * ct) / ry, l = Math.sqrt(lx * lx + ly * ly) || 1;
      return [lx / l, ly / l];
    }
    var L = local(KEY2[0], -KEY2[1]);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(th); ctx.scale(rx, ry);
    // 1. diffuse along the light axis (lit edge -> dark edge)
    var g = ctx.createLinearGradient(L[0], L[1], -L[0], -L[1]);
    var S = M.low ? [1, 0.2, -0.8] : [1, 0.75, 0.45, 0.15, -0.15, -0.45, -0.75, -1];
    var sk = M.specK; M.specK = 0;
    for (i = 0; i < S.length; i++) {
      var sv = S[i], cz = Math.sqrt(Math.max(0, 1 - sv * sv));
      g.addColorStop((1 - sv) / 2, rgba(stShade(M, sv * KEY2[0], sv * KEY2[1], cz, null, 0)));
    }
    M.specK = sk;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    if (!M.low) {
      // 2. silhouette fall-off, strongest away from the light (sphere, not cylinder)
      var o = 0.28, ge = ctx.createRadialGradient(L[0] * o, L[1] * o, 0, L[0] * o, L[1] * o, 1 + o);
      var dk = M.ramp[0][1];
      ge.addColorStop(0, rgba(dk, 0)); ge.addColorStop(0.55, rgba(dk, 0)); ge.addColorStop(0.8, rgba(dk, 0.12));
      ge.addColorStop(1, rgba(dk, 0.42));
      ctx.fillStyle = ge;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
      // 3. specular spot
      var H = local(HALFV[0], -HALFV[1]), hl = Math.sqrt(HALFV[0] * HALFV[0] + HALFV[1] * HALFV[1]);
      var hx = H[0] * hl, hy = H[1] * hl, gs = ctx.createRadialGradient(hx, hy, 0, hx, hy, 0.55);
      gs.addColorStop(0, rgba(M.spec, clamp(0.75 * sk, 0, 1))); gs.addColorStop(0.4, rgba(M.spec, clamp(0.25 * sk, 0, 1)));
      gs.addColorStop(1, rgba(M.spec, 0));
      ctx.fillStyle = gs;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
      // 4. rim crescent on the far edge
      if (M.rimK > 0.01) {
        var Rd = local(RIMX, -RIMY), ro = 0.22;
        var gr = ctx.createRadialGradient(-Rd[0] * ro, -Rd[1] * ro, 0, -Rd[0] * ro, -Rd[1] * ro, 1 + ro);
        gr.addColorStop(0, rgba(M.rimC, 0)); gr.addColorStop(0.84, rgba(M.rimC, 0));
        gr.addColorStop(1, rgba(M.rimC, clamp(0.7 * M.rimK, 0, 1)));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  };

  // Soft shadow a near part casts on what is already drawn behind it. The part's silhouette
  // is rasterised into a coarse buffer and composited upscaled (= blurred, no filter or
  // shadowBlur needed) with source-atop, so only body pixels darken. Only its bounding
  // box is touched.
  FP._stOcclude = function (ctx, g, P, M) {
    var L = ST_OCC[g], sc = M.sc, mat = this.mat, i;
    var ob = this._buf('obuf');
    if (!ob) return;
    var cell = clamp(0.016 * sc, 2, 9), b = ob.c, bc = ob.x;
    var bw = Math.ceil(this.W / cell) + 4, bh = Math.ceil(this.H / cell) + 4;
    if (b.width < bw || b.height < bh) { b.width = Math.max(b.width, bw); b.height = Math.max(b.height, bh); }
    var ox = -KEY2[0] * 0.012 * sc, oy = KEY2[1] * 0.012 * sc, grow = 0.006 * sc;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (i = 0; i < L.length; i++) {
      for (var e = 0; e < 2; e++) {
        var j = L[i][e] * 3, r = L[i][2 + e] * sc * 1.1 + grow;
        x0 = Math.min(x0, P[j] - r); x1 = Math.max(x1, P[j] + r); y0 = Math.min(y0, P[j + 1] - r); y1 = Math.max(y1, P[j + 1] + r);
      }
    }
    // buffer origin sits 2 cells left/up of the canvas so nothing is clipped at the edges
    var pad = 3 * cell, o2 = 2 * cell;
    var bx0 = Math.max(0, Math.floor((x0 - pad + o2) / cell)), by0 = Math.max(0, Math.floor((y0 - pad + o2) / cell));
    var bx1 = Math.min(b.width, Math.ceil((x1 + pad + o2) / cell)), by1 = Math.min(b.height, Math.ceil((y1 + pad + o2) / cell));
    if (bx1 <= bx0 || by1 <= by0) return;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, b.width, b.height);
    bc.setTransform(1 / cell, 0, 0, 1 / cell, 2, 2);
    bc.fillStyle = rgba(mat.ao);
    bc.beginPath();
    for (i = 0; i < L.length; i++) {
      var a = L[i][0] * 3, c = L[i][1] * 3;
      capsule(bc, P[a], P[a + 1], rz(M, P, L[i][0], L[i][2]) + grow, P[c], P[c + 1], rz(M, P, L[i][1], L[i][3]) + grow);
    }
    if (g === 'T') {
      capsule(bc, P[PELVIS * 3], P[PELVIS * 3 + 1], 0.085 * sc, P[NECK * 3], P[NECK * 3 + 1], 0.08 * sc);
      circle(bc, P[HEAD * 3], P[HEAD * 3 + 1], 0.064 * sc);
    }
    bc.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = mat.aoK;
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (err) { /* ignore */ }
    ctx.drawImage(b, bx0, by0, bx1 - bx0, by1 - by0, bx0 * cell - o2 + ox, by0 * cell - o2 + oy, (bx1 - bx0) * cell, (by1 - by0) * cell);
    ctx.globalAlpha = 1;
  };

  // pulse(): a soft band of light sweeps across the body
  FP._stSweep = function (ctx, P, M) {
    var e = this.ring, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, i;
    for (i = 0; i < NJ; i++) {
      var x = P[i * 3], y = P[i * 3 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    var pad = 0.12 * M.sc; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    var w = x1 - x0, h = y1 - y0, k = 1 - Math.pow(1 - e, 2);
    var cx = lerp(x0 - 0.3 * w, x1 + 0.3 * w, k), cy = lerp(y0 - 0.3 * h, y1 + 0.3 * h, k);
    var bw = 0.17 * Math.max(w, h), gx = bw * 0.6, gy = bw * 0.8;
    var g = ctx.createLinearGradient(cx - gx, cy - gy, cx + gx, cy + gy);
    var col = mix(this.c1, WHITE, 0.72), a = this.mat.sweep * Math.sin(Math.PI * clamp(e, 0, 1));
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.35, rgba(col, a * 0.45)); g.addColorStop(0.5, rgba(col, a));
    g.addColorStop(0.65, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
  };

  // Floor: contact shadows (drawn with destination-over, i.e. beneath the body) + faint floor line.
  FP._buf = function (key) {
    var b = this[key];
    if (!b) {
      var c = (root.document && document.createElement) ? document.createElement('canvas') : null;
      var x = c ? c.getContext('2d') : null;
      if (!x) return null;
      b = this[key] = { c: c, x: x };
    }
    return b;
  };

  // Floor: soft contact shadows + (dark stage) a faint light pool, composited beneath the
  // body (destination-over). High quality evaluates the shadow analytically into a small
  // float buffer (smooth falloffs, one quantisation step: no banding or dither noise from
  // stacking many translucent fills) and composites it once, upscaled.
  var SH_MAX = 160 * 96;
  FP._stGround = function (ctx, P, M) {
    var G = this.gnd, m = this.meta, sc = m.sc, mat = this.mat, dpr = this.dpr, i;
    var flat = clamp(m.flat * 1.25 + 0.12, 0.16, 0.5), K = mat.shadowK;
    var x0 = 1e9, x1 = -1e9, sy = 0, sh = 0, n = 0;
    for (i = 0; i < NJ; i++) {
      if (i === FACE) continue;
      var gx = G[i * 3];
      if (gx < x0) x0 = gx; if (gx > x1) x1 = gx;
      sy += G[i * 3 + 1]; sh += G[i * 3 + 2]; n++;
    }
    sy /= n; sh /= n;
    var B = this._blobs || (this._blobs = []), nb = 0;
    function blob(x, y, rx, a) {
      if (a < 0.006 || rx < 0.3) return;
      var o = B[nb] || (B[nb] = {});
      o.x = x; o.y = y; o.rx = rx; o.a = a; nb++;
    }
    if (!this.low) {
      for (i = 0; i < ST_SHADOW.length; i++) {
        var s = ST_SHADOW[i], a3 = s[0] * 3, b3 = s[1] * 3, t = s[2], r = s[3];
        var h = Math.max(0, lerp(G[a3 + 2], G[b3 + 2], t) - r);
        if (h > 0.4) continue;
        var x = lerp(G[a3], G[b3], t) + h * 0.3 * sc, y = lerp(G[a3 + 1], G[b3 + 1], t);
        var k1 = clamp(1 - h / 0.06, 0, 1);
        blob(x, y, (r * 1.3 + 0.012 + h * 0.3) * sc, K * 0.3 * k1 * k1);
        blob(x, y, (r * 2.6 + 0.03 + h * 0.8) * sc, K * 0.1 * Math.exp(-h / 0.16));
      }
    } else {
      // thumbnails: one soft contact shadow under the lowest parts
      var lo = 1e9;
      for (i = 0; i < NJ; i++) lo = Math.min(lo, G[i * 3 + 2]);
      var lx0 = 1e9, lx1 = -1e9, ly = 0, ln = 0;
      for (i = 0; i < NJ; i++) {
        if (i === FACE || G[i * 3 + 2] > lo + 0.12) continue;
        lx0 = Math.min(lx0, G[i * 3]); lx1 = Math.max(lx1, G[i * 3]); ly += G[i * 3 + 1]; ln++;
      }
      blob((lx0 + lx1) / 2, ly / ln, (lx1 - lx0) / 2 + 0.09 * sc, K * 0.55 * Math.exp(-lo / 0.2));
    }
    // broad ambient occlusion under the whole body
    blob((x0 + x1) / 2, sy, (x1 - x0) / 2 + 0.16 * sc, K * 0.2 * Math.exp(-sh / 0.7));
    var done = false;
    if (!this.low && nb) done = this._stShadowBuf(ctx, B, nb, flat, mat.shadow);
    if (!done) {
      ctx.fillStyle = unitShadow(ctx, mat.shadow);
      for (i = 0; i < nb; i++) {
        var b = B[i];
        ctx.globalAlpha = clamp(b.a, 0, 1);
        ctx.setTransform(dpr * b.rx, 0, 0, dpr * b.rx * flat, dpr * b.x, dpr * b.y);
        ctx.fillRect(-1, -1, 2, 2);
      }
    }
    // dark stage: a faint pool of light on the floor so the contact shadow has something to darken
    if (mat.pool > 0) {
      var pr = (x1 - x0) / 2 + 0.45 * sc;
      ctx.fillStyle = unitShadow(ctx, mat.floor);
      ctx.globalAlpha = mat.pool;
      ctx.setTransform(dpr * pr, 0, 0, dpr * pr * flat, dpr * (x0 + x1) / 2, dpr * sy);
      ctx.fillRect(-1, -1, 2, 2);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    // faint floor line fading to the sides
    var W = this.W, y0 = m.floorY;
    var lk = mat.floorK * clamp((0.3 - m.flat) / 0.12, 0, 1); // steep cameras: no horizon line
    if (y0 < this.H + 2 && lk > 0.004) {
      var mid = clamp(((x0 + x1) / 2) / W, 0.25, 0.75);
      var lg = ctx.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, rgba(mat.floor, 0)); lg.addColorStop(mid, rgba(mat.floor, lk)); lg.addColorStop(1, rgba(mat.floor, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(0, y0 - 0.5, W, 1);
    }
  };

  // Analytic soft shadow: transmittance product of smooth elliptical falloffs, evaluated
  // per coarse cell over the blobs' bounding box. Returns false if it could not run.
  FP._stShadowBuf = function (ctx, B, nb, flat, col) {
    var buf = this._buf('gbuf');
    if (!buf || !ctx.createImageData) return false;
    var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, i, b;
    for (i = 0; i < nb; i++) {
      b = B[i];
      bx0 = Math.min(bx0, b.x - b.rx); bx1 = Math.max(bx1, b.x + b.rx);
      by0 = Math.min(by0, b.y - b.rx * flat); by1 = Math.max(by1, b.y + b.rx * flat);
    }
    bx0 = Math.max(bx0, -8); bx1 = Math.min(bx1, this.W + 8); by0 = Math.max(by0, -8); by1 = Math.min(by1, this.H + 8);
    if (bx1 <= bx0 || by1 <= by0) return true;
    var cell = clamp(0.011 * this.meta.sc, 1.5, 5);
    var gw = Math.ceil((bx1 - bx0) / cell) + 3, gh = Math.ceil((by1 - by0) / cell) + 3;
    while (gw * gh > SH_MAX) { cell *= 1.25; gw = Math.ceil((bx1 - bx0) / cell) + 3; gh = Math.ceil((by1 - by0) / cell) + 3; }
    var T = this._shT;
    if (!T || T.length < gw * gh) T = this._shT = new Float32Array(Math.max(gw * gh, 4096));
    for (i = 0; i < gw * gh; i++) T[i] = 1;
    var ox = bx0 - cell, oy = by0 - cell; // cell (c, r) centre = o + (c + 0.5) * cell
    for (i = 0; i < nb; i++) {
      b = B[i];
      var ry = b.rx * flat, ix = 1 / b.rx, iy = 1 / ry, a = clamp(b.a, 0, 1);
      var c0 = Math.max(0, Math.floor((b.x - b.rx - ox) / cell)), c1 = Math.min(gw - 1, Math.ceil((b.x + b.rx - ox) / cell));
      var r0 = Math.max(0, Math.floor((b.y - ry - oy) / cell)), r1 = Math.min(gh - 1, Math.ceil((b.y + ry - oy) / cell));
      for (var r = r0; r <= r1; r++) {
        var dy = (oy + (r + 0.5) * cell - b.y) * iy, dy2 = dy * dy;
        if (dy2 >= 1) continue;
        var row = r * gw;
        for (var c = c0; c <= c1; c++) {
          var dx = (ox + (c + 0.5) * cell - b.x) * ix, d2 = dx * dx + dy2;
          if (d2 >= 1) continue;
          var f = 1 - d2; f = f * f * f; // smooth, gaussian-like, exactly 0 at the rim
          T[row + c] *= 1 - a * f;
        }
      }
    }
    var cv = buf.c, x = buf.x;
    if (cv.width < gw || cv.height < gh) { cv.width = Math.max(cv.width, gw); cv.height = Math.max(cv.height, gh); this._shImg = null; }
    var img = this._shImg;
    if (!img || img.width !== gw || img.height !== gh) img = this._shImg = x.createImageData(gw, gh);
    var D = img.data, cr = col[0] | 0, cg = col[1] | 0, cb = col[2] | 0;
    for (i = 0; i < gw * gh; i++) {
      var al = (1 - T[i]) * 255, k = i * 4;
      D[k] = cr; D[k + 1] = cg; D[k + 2] = cb; D[k + 3] = al > 255 ? 255 : al;
    }
    x.putImageData(img, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (err) { /* ignore */ }
    ctx.drawImage(cv, 0, 0, gw, gh, ox, oy, gw * cell, gh * cell);
    return true;
  };

  /* ------------------------------------------------------------ public API */
  FP.setExercise = function (id) {
    if (this.dead) return;
    var ex = getEx(id);
    if (ex === this.ex) return;
    if (this.hasPose && this.W > 0) {
      this.from = new Float32Array(this.cur);
      this.fromMeta = { floorY: this.meta.floorY, sc: this.meta.sc, farL: this.meta.farL, farR: this.meta.farR, flat: this.meta.flat };
      this.fromGnd = this.studio ? new Float32Array(this.gnd) : null;
      this.fromOrder = this.ex.order; this.fromEx = this.ex;
      this.morphT = 0;
    } else {
      this.morphT = 1;
    }
    this.ex = ex;
    this.time = 0;
  };
  FP.setColors = function (primary, secondary) {
    if (this.dead) return;
    this.c1a = this.c1; this.c2a = this.c2;
    this.c1b = parseColor(primary, this.c1b); this.c2b = parseColor(secondary, this.c2b);
    this.colT = 0;
  };
  FP.setPlaying = function (b) { if (!this.dead) this.playing = !!b; };
  /** Stop drawing entirely (e.g. while covered by a sheet); resumes where it was. */
  FP.setSuspended = function (b) { if (!this.dead) { this.suspended = !!b; this._still = false; this._acc = 0; } };
  FP.setEnergy = function (x) { if (!this.dead) this.energyT = clamp(num(x, this.energyT), 0, 1); };
  FP.pulse = function () {
    if (this.dead) return;
    this.flash = 1;
    if (this.low || reducedMotion() || !this.hasPose) return;
    this.ring = 0;
    if (this.studio) return; // studio: rim-light brighten + a soft light sweep, no sparks
    var P = this.cur, sc = this.meta.sc, cx = P[CHEST * 3], cy = P[CHEST * 3 + 1];
    for (var i = 0; i < 44; i++) {
      var j = ((Math.random() * 20) | 0) * 3;
      var dx = P[j] - cx, dy = P[j + 1] - cy, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      var a = Math.random() * TAU, sp = sc * (0.6 + Math.random() * 1.6);
      this._spawn(P[j], P[j + 1], (dx / dl) * sp * 0.7 + Math.cos(a) * sp * 0.5,
        (dy / dl) * sp * 0.7 + Math.sin(a) * sp * 0.5 - sc * 0.6, 0.45 + Math.random() * 0.6, 1);
    }
  };
  /** Switch render style live ('neon' | 'studio', scheme 'dark' | 'light') and repaint now. */
  FP.setStyle = function (style, scheme) {
    if (this.dead) return;
    this._setStyle(style, scheme === undefined ? this.scheme : scheme);
    this._still = false; this._acc = 0;
    if (this.ctx && this.hasPose && this.W >= 4 && this.H >= 4 && !this.suspended) {
      try { this._computePose(); this._draw(); } catch (e) { this._fail(e); }
    }
  };
  FP._setStyle = function (style, scheme) {
    this.style = styleOf(style);
    this.scheme = schemeOf(scheme);
    this.studio = this.style === 'studio';
    this.mat = this.studio ? buildMat(this.scheme, this.matOpts) : null;
    this.hist.length = 0; this.sparks.length = 0; this.ring = -1;
    this.fromGnd = null;
  };
  FP.destroy = function () {
    if (this.dead) return;
    this.dead = true;
    var i = registry.indexOf(this);
    if (i >= 0) registry.splice(i, 1);
    if (this.ro) { try { this.ro.disconnect(); } catch (e) { /* ignore */ } }
    if (this.io) { try { this.io.disconnect(); } catch (e) { /* ignore */ } }
    if (this._onResize && root.removeEventListener) root.removeEventListener('resize', this._onResize);
    if (this.ctx) { try { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); } catch (e) { /* ignore */ } }
    this.hist = []; this.sparks = []; this.bloom = null; this.bctx = null; this.obuf = null; this.gbuf = null;
    if (!registry.length && rafId) { caf(rafId); rafId = 0; lastT = 0; }
  };
  Object.defineProperty(FP, 'exercise', { get: function () { return exId(this.ex); } });

  // --- dev / test hooks (not part of the app contract) ---
  // Jump the exercise clock to t seconds (morph completed), pre-rolling 0.35 s so trails
  // and sparks exist, then freeze there (freeze=false keeps it running).
  FP._debugSetTime = function (t, freeze) {
    this.morphT = 1; this.from = null;
    this._frozen = false;
    this.hist.length = 0; this.sparks.length = 0;
    var reduced = reducedMotion(), steps = 21, dt = 1 / 60;
    this.time = t - steps * dt;
    var wasPlaying = this.playing;
    this.playing = true;
    for (var i = 0; i < steps; i++) {
      this.rt += dt; this.time += dt;
      this._computePose(); this._record(dt, reduced); this._updateSparks(dt, reduced);
    }
    this.time = t;
    this.playing = wasPlaying;
    this._computePose();
    this._frozen = freeze !== false;
  };
  FP._debugStats = function () {
    var s = this._stats, r = { frames: s.frames, avgMs: s.frames ? s.ms / s.frames : 0, sparks: this.sparks.length, errors: this.errors };
    s.frames = 0; s.ms = 0;
    return r;
  };

  root.HIITFigure = {
    EXERCISES: EXERCISES.slice(),
    STYLES: STYLES.slice(),
    STUDIO: (function () {
      function hex(c) { return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1); }
      function m(k) { return { body: hex(MATS[k].body), shade: hex(MATS[k].shade), lit: hex(MATS[k].lit) }; }
      return { dark: m('dark'), light: m('light') };
    })(),
    create: function (canvas, opts) { return new Figure(canvas, opts); },
    _dev: {
      EX: EX, JN: JN, B: B,
      pose: function (id, p) { return safePose(getEx(id), p, p * getEx(id).period); },
      ikClamps: function () { var c = ikClamps; ikClamps = 0; return c; },
      instances: function () { return registry.slice(); }
    }
  };
})(typeof window !== 'undefined' ? window : this);
