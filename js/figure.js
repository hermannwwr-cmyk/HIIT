/*!
 * HIIT athlete figure: Canvas-2D animated exercise demonstrator.
 * Classic script (no modules, no deps, works from file://).
 *
 *   window.HIITFigure = {
 *     EXERCISES: ['pushup','crunch','legraise','flutter','squat','lunge','twist','jacks','rest',
 *                 'shouldertap','jog-slow','jog-quick','pecstretch','hamstring-l','hamstring-r','calf-l','calf-r'],
 *     MATERIALS: { dark: ['stone','titanium'], light: ['graphite'] },   // the first of each is the default
 *     create(canvas, opts) -> instance
 *   }
 *   opts: { exercise:'pushup', primary:'#ff2bd6', secondary:'#ffb000', quality:'high'|'low', energy:0..1,
 *           scheme:'dark'|'light', material: preset name, used while the scheme matches its stage,
 *           body, shade (material overrides: lit body colour, core-shadow colour),
 *           fps: frame-rate cap (default 60, 'low' 30), maxDpr: resolution cap (default 2),
 *           clear: [dx, dy, r] ('low' only) a circle in from the bottom-right corner to keep the figure out of,
 *           fit: 'shared' (default: one body scale for every move) | 'fill' (each move fills the canvas) }
 *   instance.setExercise(id, {instant, time, period, ready}) / getTime() / setTime(t, ease)
 *   instance.setColors(primary, secondary, instant)
 *   instance.setPlaying(bool) / setEnergy(x, instant) / pulse() / setSuspended(bool) / destroy()
 *   instance.setStyle(style, scheme[, material]) - switch scheme (and material) live; repaints once, now
 *   instance.setMaterial(name) / getMaterial() - material preset; repaints immediately
 *
 * The figure is a 3D skeleton (forward kinematics + 2-bone IK so planted
 * hands/feet never slide), projected with a per-exercise camera, auto-fitted
 * to the canvas, and rendered as a matte, softly lit 3D mannequin with contact
 * shadows. The canvas stays transparent; the page paints the backdrop. All
 * instances share one requestAnimationFrame loop, which sleeps while every
 * figure is stopped, hidden or suspended.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var EXERCISES = ['pushup', 'crunch', 'legraise', 'flutter', 'squat', 'lunge', 'twist', 'jacks', 'rest',
    'shouldertap', 'jog-slow', 'jog-quick', 'pecstretch', 'hamstring-l', 'hamstring-r', 'calf-l', 'calf-r'];
  var MORPH_S = 0.25; // exercise change: cross-dissolve length (s)
  var COLOR_S = 0.3;

  /* ------------------------------------------------------------------ math */

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sine(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
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
    pose: function (p) {
      var J = {};
      var k = kf(p, [[0, 0], [0.07, 0], [0.5, 1], [0.56, 1], [0.93, 0], [1, 0]]);
      var al = lerp(19.3, 2, k);              // body line angle (pivot on the toes); chest ~9 cm off the floor at the bottom
      var bd = dir(al), fa = (al + 61) * DEG; // foot ~80 deg to the floor at the top, ~62 at the bottom
      var ank = [B.foot * Math.cos(fa), 0.012 + B.foot * Math.sin(fa), 0];
      var P = addS(ank, bd, B.shin + B.thigh - 0.0003);
      torso(J, P, bd, bd, dir(al + 8), Z, Z, 0);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        var a = [ank[0], ank[1], 0.06 * sg];
        var r = ik(J['hip' + s], a, B.thigh, B.shin, J.F);
        J['kn' + s] = r[0]; J['an' + s] = r[1]; J['to' + s] = [0, 0.012, 0.06 * sg];
        // shoulder blades spread at the top (push the floor away), squeezed together at the bottom
        J['sh' + s] = add(J['sh' + s], add(mul(J.F, 0.002 - 0.017 * k), mul(Z, -0.007 * k * sg)));
        // hands just outside the shoulders: under them at the top (arms straight), beside the
        // chest at the bottom, forearms ~10 deg off vertical and elbows ~45-50 deg from the body
        armIK(J, s, [0.72, 0.035, 0.16 * sg], [-0.65, 0.85, 1.0 * sg], [1, -0.35, 0]);
      }
      return J;
    }
  };

  EX.crunch = {
    period: 1.8, cam: { yaw: 14, pitch: 16 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
    pose: function (p) {
      var J = {};
      // curl up (0.6 s), pause at the top, lower slowly (0.95 s)
      var k = kf(p, [[0, 0], [0.33, 1], [0.43, 1], [0.95, 0], [1, 0]]);
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
    period: 0.8, cam: { yaw: 14, pitch: 16 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
    pose: function (p) {
      var J = {};
      var w = Math.sin(TAU * p);
      // head and shoulders down (lifting them is the harder variant), lower back pressed flat
      torso(J, [0, 0.066, 0], dir(181.5), dir(180), dir(179), Z, Z, 0);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        var th = 12 + 9 * w * sg;
        legFK(J, s, dir(th + 1.5, -0.03 * sg), dir(th - 1.5, -0.015 * sg), dir(th + 30));
        armFK(J, s, [1, -0.12, 0.2 * sg], [1, -0.02, 0.08 * sg], [1, -0.1, 0.02 * sg]);
      }
      return J;
    }
  };

  EX.squat = {
    period: 2.0, cam: { yaw: 10, pitch: 6 }, far: { L: 1, R: 0 }, order: SIDE_ORDER,
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
        // knee pole: forward like the front leg's while standing (no flip at the leg switch),
        // turning down toward the floor as the lunge deepens
        var bp = lerp3([1, 0, -0.15 * (half ? -1 : 1)], [0.35, -1, 0], low);
        var r = ik(J['hip' + bs], ank, B.thigh, B.shin, bp);
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
    period: 2.0, cam: { yaw: 20, pitch: 35 }, far: { L: 0.5, R: 0 }, order: ['LL', 'T', 'LR', 'AL', 'AR'],
    pose: function (p) {
      var J = {};
      // smooth through the centre (finite speed), a short dwell at each floor touch
      var s = Math.sin(Math.PI / 2 * Math.sin(TAU * p));
      var psi = 55 * s * DEG, bend = 12 * s * DEG, X = [1, 0, 0];
      // V-sit: back straight, leaned back ~42 deg; the ribcage rotates (and tips a little) toward the hands
      var u1 = rot(lean(-42), X, bend), u2 = rot(lean(-42), X, bend * 1.2), u3 = rot(lean(-35), X, bend * 0.8);
      var R = rot(rot(Z, X, bend * 1.2), u2, -psi);
      torso(J, [0, 0.085, 0], u1, u2, u3, R, Z, 0);
      J.face = addS(J.head, norm(cross(u3, rot(R, u2, -psi * 0.2))), B.headR);
      // clasped hands sweep a wide arc over the thighs: in front of the belly -> floor beside each hip
      var a = s * 82 * DEG, ca = Math.cos(a);
      var tgt = [-0.03 + 0.11 * ca, 0.047 + 0.223 * ca, 0.21 * Math.sin(a)];
      var F = J.F;
      // knuckles point ahead over the knees in the middle, down to the floor at each side
      var hd = lerp3([1, 0.12, 0], norm(add(mul(F, 0.4), mul(u2, -0.9))), s * s);
      for (var i = 0; i < 2; i++) {
        var sd = SIDES[i][0], sg = SIDES[i][1];
        armIK(J, sd, addS(tgt, R, 0.022 * sg), add(add(mul(u2, -0.5), mul(R, sg)), mul(F, -0.2)), hd);
        legFK(J, sd, [Math.cos(40 * DEG), Math.sin(40 * DEG), -0.12 * s - 0.03 * sg],
          [Math.cos(-8 * DEG), Math.sin(-8 * DEG), -0.07 * s - 0.035 * sg], [Math.cos(-30 * DEG), Math.sin(-30 * DEG), -0.02 * s]);
      }
      return J;
    }
  };

  EX.jacks = {
    period: 0.8, cam: { yaw: 90, pitch: 4 }, far: { L: 0, R: 0 }, order: ['LL', 'LR', 'T', 'AL', 'AR'],
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
    period: 4.0, cam: { yaw: 58, pitch: 5 }, far: { L: 0.3, R: 0 }, order: ['AL', 'LL', 'LR', 'T', 'AR'],
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

  /* ---------------------------------------------- upper body + SAF warm-up */
  // Mirrored side view for the left-side variants of the one-sided stretches: the
  // stretched leg is always the near (brighter, front-most) one. Yaw 180 - y shows the
  // figure's left side; the figure then faces screen-left.
  var SIDE_ORDER_M = ['AR', 'LR', 'T', 'LL', 'AL'];
  function sideCam(mirror, yaw, pitch) { return { yaw: mirror ? 180 - yaw : yaw, pitch: pitch }; }
  function sideFar(mirror) { return mirror ? { L: 0, R: 1 } : { L: 1, R: 0 }; }

  // Shoulder taps: high plank (pushup top), one hand at a time taps the opposite
  // shoulder; hips stay level and square (only a 1 cm weight shift onto the support hand).
  EX.shouldertap = {
    period: 2.4, cam: { yaw: 18, pitch: 20 }, far: { L: 0.45, R: 0 }, order: ['LL', 'LR', 'T', 'AL', 'AR'],
    orderAt: function (p) { return p < 0.5 ? ['LL', 'LR', 'T', 'AL', 'AR'] : ['LL', 'LR', 'T', 'AR', 'AL']; },
    pose: function (p) {
      var J = {};
      var half = p < 0.5 ? 0 : 1, q = (p - half * 0.5) * 2;
      var tapS = half ? 'L' : 'R', tg = half ? -1 : 1, othS = half ? 'R' : 'L';
      // slow, controlled taps: lift and reach (0.4 s), touch, put the hand back down (0.4 s)
      var tap = kf(q, [[0, 0], [0.08, 0], [0.43, 1], [0.55, 1], [0.92, 0], [1, 0]]);
      var al = 19.6, bd = dir(al), fa = (al + 61) * DEG; // the push-up's top position
      var ank = [B.foot * Math.cos(fa), 0.012 + B.foot * Math.sin(fa), 0];
      var P = addS(ank, bd, B.shin + B.thigh - 0.0008);
      P[2] -= tg * 0.006 * sine(clamp(tap * 1.6, 0, 1)); // weight onto the support hand
      torso(J, P, bd, bd, dir(al + 3), Z, Z, 0); // neck long, head in line with the body
      var F = J.F, up = mul(F, -1);
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        var a = [ank[0], ank[1], 0.072 * sg];
        var r = ik(J['hip' + s], a, B.thigh, B.shin, J.F);
        J['kn' + s] = r[0]; J['an' + s] = r[1]; J['to' + s] = [0, 0.012, 0.072 * sg];
        var W = [0.735, 0.035, 0.12 * sg]; // hands under the shoulders
        if (s !== tapS || tap <= 0) { armIK(J, s, W, [-1, 0.85, 0.75 * sg], [1, -0.35, 0]); continue; }
        // tapping hand: lifts off, crosses under the chin, palm lands on the front of the
        // opposite shoulder
        var sh = J['sh' + othS];
        var T = add(addS(addS(sh, F, 0.05), Z, tg * 0.035), mul(bd, 0.03));
        var e = tap, wr = lerp3(W, T, e);
        wr = addS(wr, Y, 0.04 * Math.sin(Math.PI * e));
        var pe = clamp(e * 3, 0, 1), pole = norm(add(mul([-1, 0.85, 0.75 * sg], 1 - pe), mul([-0.3, -0.6, 1 * sg], pe)));
        var hd = norm(add(mul([1, -0.35, 0], 1 - e), mul(add(mul(Z, -tg), mul(up, 0.45)), e)));
        armIK(J, s, wr, pole, hd);
      }
      return J;
    }
  };
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  // Jogging on the spot: one step per half cycle (the right foot swings in the first half).
  // Each foot lands on the ball, lets the heel sink a little to mid-stance and peels it up
  // again to push off, the toe staying put (stance: `duty` of the cycle; < 0.5 leaves a short
  // flight between steps). In the swing the toe first rises straight up (`peel` of the swing,
  // to `lift`), the knee drives up to `knee` deg with the shin `shin` deg behind vertical and
  // the foot pointed `point` deg, then the foot comes back down onto the same spot.
  // hip: pelvis height at [touchdown, mid-stance, push-off, mid-flight]; heel: deg the ankle
  // sits above the toe at [touchdown, mid-stance, push-off, early swing]. Arms swing from
  // the shoulders, contralateral: upper arm `arm` [forward, back] deg, elbow flexion `elbow`
  // [forward, back] (it closes as the arm comes forward); the forward hand drifts toward the
  // midline (`cross`). lean: trunk, rot: shoulder counter-rotation (deg).
  function jogEx(period, o) {
    var d = o.duty, u1 = o.peel;
    var PK = [[0, 0], [u1, 0], [0.5, 1], [1 - u1, 0], [1, 0]];
    return {
      period: period, cam: { yaw: 22, pitch: 6 }, far: { L: 0.45, R: 0 }, order: ['AL', 'T', 'LL', 'LR', 'AR'], center: true,
      orderAt: function (p) {
        // the lifted leg and a forward-swung far arm pass in front of the torso
        var lifted = Math.sin(TAU * p) >= 0 ? 'LR' : 'LL', standing = lifted === 'LR' ? 'LL' : 'LR';
        var up = Math.abs(Math.sin(TAU * p)) > 0.3, farFwd = Math.sin(TAU * p) > 0.2;
        var L = [];
        if (!farFwd) L.push('AL');
        L.push(standing);
        if (!up) L.push(lifted);
        L.push('T');
        if (up) L.push(lifted);
        if (farFwd) L.push('AL');
        L.push('AR');
        return L;
      },
      pose: function (p) { return jog(p, false); },
      // standing ready to go (count-in): both feet down, arms bent, nothing in the air
      readyPose: function () { return jog(0, true); }
    };
    function jog(p, still) {
      var J = {};
      var sw = still ? 0 : Math.sin(TAU * p);         // + : right knee up, left arm forward
      var q = (p * 2) % 1;
      var y = still ? o.hip[1] + 0.006 : mono(q, [[0, o.hip[3]], [0.5 - d, o.hip[0]], [0.5, o.hip[1]], [0.5 + d, o.hip[2]], [1, o.hip[3]]]);
      var rot = o.rot * sw * DEG;
      var R = rot === 0 ? Z : norm([-Math.sin(rot), 0, Math.cos(rot)]);
      var Rp = norm([Math.sin(rot * 0.4), 0, Math.cos(rot * 0.4)]);
      torso(J, [0.0, y, 0], lean(o.lean), lean(o.lean - 1), lean(o.lean - 4), R, Rp, 0.006 * Math.abs(sw));
      var th = o.knee * DEG, sh = o.shin * DEG, pt = o.point * DEG;
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1], z = 0.08 * sg;
        var T0 = [0.1095, 0.012, 0.086 * sg];
        // this foot's phase: stance centred on 0.75 (the other knee at its highest)
        var x = still ? d / 2 : ((p + (s === 'L' ? 0.5 : 0) - 0.75 + d / 2) % 1 + 1) % 1;
        var a, toe;
        if (x <= d) {
          a = mono(x / d, [[0, o.heel[0]], [0.5, o.heel[1]], [1, o.heel[2]]]) * DEG;
          toe = T0;
        } else {
          var u = (x - d) / (1 - d), hip = J['hip' + s];
          // top of the swing: ankle from the knee drive, at mid-stance height of the pelvis
          var ax = hip[0] + B.thigh * Math.sin(th) - B.shin * Math.sin(sh);
          var ay = o.hip[1] - B.thigh * Math.cos(th) - B.shin * Math.cos(sh);
          var k = mono(u, PK);
          toe = [T0[0] + (ax + B.foot * Math.cos(pt) - T0[0]) * k,
            T0[1] + mono(u, [[0, 0], [u1, o.lift], [0.5, ay - B.foot * Math.sin(pt) - T0[1]], [1 - u1, o.lift], [1, 0]]), T0[2]];
          a = mono(u, [[0, o.heel[2]], [u1, o.heel[3]], [0.5, o.point], [1 - u1, o.heel[3]], [1, o.heel[0]]]) * DEG;
        }
        var ank = [toe[0] - B.foot * Math.cos(a), toe[1] + B.foot * Math.sin(a), z];
        var r = ik(J['hip' + s], ank, B.thigh, B.shin, [1, 0, 0.1 * sg]);
        J['kn' + s] = r[0]; J['an' + s] = r[1]; J['to' + s] = toe;
        // arms: w = 1 fully forward, -1 fully back
        var w = sw * -sg, wf = 0.5 + 0.5 * w;
        var ua = (lerp(-o.arm[1], o.arm[0], wf)) * DEG, fa = ua + lerp(o.elbow[1], o.elbow[0], wf) * DEG;
        var zi = o.cross * wf;
        armFK(J, s, [Math.sin(ua), -Math.cos(ua), (0.13 - 0.05 * wf) * sg], [Math.sin(fa), -Math.cos(fa), (0.12 - 0.08 * wf - zi) * sg],
          [Math.sin(fa + 0.08), -Math.cos(fa + 0.08), -(0.05 + zi) * sg]);
      }
      return J;
    }
  }
  EX['jog-slow'] = jogEx(0.75, { knee: 38, shin: 42, point: 34, duty: 0.4, peel: 0.18, lift: 0.035,
    hip: [0.55, 0.54, 0.561, 0.567], heel: [28, 24, 34, 40], arm: [20, 26], elbow: [100, 80], cross: 0.3, lean: 3, rot: 5 });
  EX['jog-quick'] = jogEx(0.52, { knee: 64, shin: 10, point: 46, duty: 0.405, peel: 0.18, lift: 0.04,
    hip: [0.558, 0.549, 0.571, 0.575], heel: [33, 30, 40, 46], arm: [22, 40], elbow: [100, 78], cross: 0.35, lean: 6, rot: 9 });

  // Warm-up stretches, one count of 4 per loop: ease in on beat 1, hold on beat 2, ease back.
  var STRETCH_K = [[0, 0], [0.25, 1], [0.45, 1], [0.9, 0], [1, 0]];

  // Standing pectoral stretch, seen from behind (rear three-quarter) so both arms show meeting
  // at the clasp: hands clasped behind the low back, arms long, shoulder blades squeezed back
  // and down, chest lifted, trunk upright, feet shoulder-width. Each count of 4 the clasped
  // hands rise on beat 1, hold at the top on beat 2 and lower slowly over beats 3 and 4.
  EX.pecstretch = {
    // the arms are behind the back: nearer the camera than the torso, so drawn after it
    period: 4.0, cam: { yaw: -57, pitch: 8 }, far: { L: 1, R: 0 }, order: ['LL', 'LR', 'T', 'AL', 'AR'], center: true,
    pose: function (p) {
      var J = {};
      var b = kf(p, STRETCH_K);
      torso(J, [0.002 * b, 0.529, 0], lean(0), lean(-6 - b), lean(0), Z, Z, -0.006);
      var F = J.F;
      for (var i = 0; i < 2; i++) {
        var s = SIDES[i][0], sg = SIDES[i][1];
        J['sh' + s] = add(J['sh' + s], add(mul(F, -0.032 - 0.006 * b), mul(Z, -0.01 * sg))); // retracted
        legIK(J, s, [0, B.ankleH, 0.11 * sg], [1, 0, 0.2 * sg], [0.1095, -0.035, 0.025 * sg]);
      }
      // clasp behind the low back, arms long (elbows ~165 deg); the hands rise 25 -> 55 deg
      var ext = lerp(25, 55, b) * DEG, mid = mul(add(J.shL, J.shR), 0.5);
      var dv = [-Math.sin(ext), -Math.cos(ext), 0];
      for (i = 0; i < 2; i++) {
        s = SIDES[i][0]; sg = SIDES[i][1];
        var sh = J['sh' + s], lat = sh[2] - 0.024 * sg, reach = Math.sqrt(Math.max(0.01, 0.331 * 0.331 - lat * lat));
        var wr = addS(addS(mid, dv, reach), Z, 0.024 * sg);
        armIK(J, s, wr, [-0.3, 0.2, sg], [-0.25, -0.35, -sg]);
      }
      return J;
    }
  };

  // Standing hamstring stretch: stretched leg forward (heel down, toes up, knee long),
  // support knee bent slightly, flat-back hip hinge, hands resting on the support thigh.
  // The stretched leg stays long the whole time: the hips sit back along the arc it allows
  // (pivoting on the heel) instead of dropping onto a bending knee.
  function hamEx(stretch) {
    var m = stretch === 'L', fs = stretch, bs = m ? 'R' : 'L', fg = m ? -1 : 1;
    var px = -0.02, zf = 0.075 * fg, zb = -zf, LF = (B.thigh + B.shin) * 0.998;
    var dz = 0.02, py = 0.51, xf = px + Math.sqrt(LF * LF - (py - 0.05) * (py - 0.05) - dz * dz);
    return {
      period: 4.0, cam: sideCam(m, 10, 6), far: sideFar(m), order: m ? SIDE_ORDER_M : SIDE_ORDER,
      pose: function (p) {
        var J = {};
        var b = kf(p, STRETCH_K);                          // ease in on beat 1, hold on beat 2
        var hinge = 46 + 7 * b, x = px - 0.008 * b;
        var y = 0.05 + Math.sqrt(LF * LF - (xf - x) * (xf - x) - dz * dz);
        torso(J, [x, y, 0], lean(hinge), lean(hinge - 2), lean(hinge - 9), Z, Z, 0);
        // stretched leg: heel on the floor, toes pulled up
        legIK(J, fs, [xf, 0.05, zf], [1, 0.15, 0.1 * fg], [Math.cos(38 * DEG), Math.sin(38 * DEG), 0]);
        // support leg: foot flat behind the hips, knee soft
        legIK(J, bs, [px - 0.115, B.ankleH, zb], [1, 0, -0.15 * fg], [0.1095, -0.035, -0.02 * fg]);
        // hands rest on the support thigh, just above the knee
        var hp = J['hip' + bs], kn = J['kn' + bs], td = norm(sub(kn, hp));
        var front = norm(sub([1, 0, 0], mul(td, td[0])));
        var pt = addS(lerp3(hp, kn, 0.5), front, 0.058);
        for (var i = 0; i < 2; i++) {
          var s = SIDES[i][0], sg = SIDES[i][1];
          var wr = add(addS(addS(pt, Z, 0.032 * sg), td, -0.035), mul(front, 0.012));
          armIK(J, s, wr, [-0.2, 0.3, sg], norm(add(td, mul(front, -0.25))));
        }
        return J;
      }
    };
  }
  EX['hamstring-l'] = hamEx('L');
  EX['hamstring-r'] = hamEx('R');

  // Standing calf stretch (no wall): long staggered stance, back leg straight with the heel
  // pressed down (the stretched calf), front knee bent, hands resting on the front thigh.
  // The trunk leans exactly as far as the back leg, so heel, hip and head make one line,
  // and the lean deepens a little on each count (in on beat 1, held on beat 2).
  function calfEx(stretch) {
    var m = stretch === 'L', bs = stretch, fs = m ? 'R' : 'L', bg = m ? -1 : 1;
    var xb = -0.21, zb = 0.085 * bg, zf = -zb, L = B.thigh + B.shin - 0.001;
    return {
      period: 4.0, cam: sideCam(m, 10, 6), far: sideFar(m),
      order: m ? ['LR', 'AR', 'T', 'LL', 'AL'] : ['LL', 'AL', 'T', 'LR', 'AR'], // far hand rests on the far (front) thigh
      pose: function (p) {
        var J = {};
        var b = kf(p, STRETCH_K);
        var phi = 24 + 4 * b, P = [xb + L * Math.sin(phi * DEG), B.ankleH + L * Math.cos(phi * DEG), 0];
        torso(J, P, lean(phi), lean(phi), lean(phi - 3), Z, Z, 0);
        legIK(J, bs, [xb, B.ankleH, zb], [1, 0, 0.1 * bg], [0.1095, -0.035, 0.01 * bg]);
        legIK(J, fs, [xb + 0.36, B.ankleH, zf], [1, 0, -0.1 * bg], [0.1095, -0.035, -0.01 * bg]);
        // both hands on the front thigh, a hand's width apart, above the knee
        var hp = J['hip' + fs], kn = J['kn' + fs], td = norm(sub(kn, hp));
        var up = norm(sub(Y, mul(td, td[1])));
        var pt = addS(lerp3(hp, kn, 0.5), up, 0.074);
        for (var i = 0; i < 2; i++) {
          var s = SIDES[i][0], sg = SIDES[i][1];
          armIK(J, s, addS(addS(pt, Z, 0.035 * sg), td, -0.03), [0.2, 0.1, sg], norm(add(td, mul(up, -0.3))));
        }
        return J;
      }
    };
  }
  EX['calf-l'] = calfEx('L');
  EX['calf-r'] = calfEx('R');

  for (var exk in EX) if (EX.hasOwnProperty(exk)) EX[exk].id = exk;
  function getEx(id) { return (typeof id === 'string' && EX.hasOwnProperty(id)) ? EX[id] : EX.rest; }
  function exId(ex) { return (ex && ex.id) || 'rest'; }

  // Draw order of an exercise's limb groups (some vary with the phase, e.g. a lifted knee
  // or a forward-swung arm passing in front of the torso).
  function orderOf(ex, p) {
    return ex.orderAt ? ex.orderAt(p) : ex.order;
  }
  function phaseOf(ex, t) { return ((t / ex.period) % 1 + 1) % 1; }

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
  // Bounding box of the whole cycle in view space (y up), cached per exercise, with two
  // more for thumbnails: .raw (the same, not centred) and .key (the key pose alone).
  var TMPV = new Float32Array(NJ * 3);
  function growBox(b, ex, p) {
    project(safePose(ex, p, p * ex.period), ex, TMPV);
    for (var i = 0; i < NJ; i++) {
      if (i === FACE) continue;
      var x = TMPV[i * 3], y = TMPV[i * 3 + 1], r = i === HEAD ? B.headR : 0.03;
      if (x - r < b.x0) b.x0 = x - r; if (x + r > b.x1) b.x1 = x + r;
      if (y - r < b.y0) b.y0 = y - r; if (y + r > b.y1) b.y1 = y + r;
    }
    return b;
  }
  function padBox(b, ex) {
    return { x0: b.x0 - 0.05, x1: b.x1 + 0.05, y0: Math.min(b.y0, camSetup(ex).floorV) - 0.06, y1: b.y1 + 0.05 };
  }
  function exBox(ex) {
    if (ex._box) return ex._box;
    var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }, N = 72;
    for (var n = 0; n < N; n++) growBox(b, ex, n / N);
    var raw = padBox(b, ex);
    // Standing movements: frame symmetrically around the standing pose so the
    // athlete starts (and rests) in the centre, not offset by the step/hip hinge.
    if (ex.id === 'squat' || ex.id === 'lunge' || ex.id === 'jacks' || ex.id === 'rest' || ex.center) {
      var hx = 0;
      for (var m = 0; m < 24; m++) { project(safePose(ex, m / 24, m / 24 * ex.period), ex, TMPV); hx += TMPV[PELVIS * 3] / 24; }
      var half = Math.max(hx - b.x0, b.x1 - hx);
      b.x0 = hx - half; b.x1 = hx + half;
    }
    ex._box = padBox(b, ex);
    ex._box.raw = raw;
    ex._box.key = padBox(growBox({ x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }, ex, KEY_PHASE[ex.id] || 0), ex);
    return ex._box;
  }
  // The pose that best shows each move (phase 0..1): what a thumbnail frames, and shows
  // while it is not playing.
  var KEY_PHASE = { pushup: 0, shouldertap: 0.17, crunch: 0.5, legraise: 0.42, flutter: 0.17, twist: 0,
    squat: 0.5, lunge: 0.33, jacks: 0.33 };
  function keyTime(ex) { return (KEY_PHASE[exId(ex)] || 0) * ex.period; }
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
  // mix() into o (which may be a or b): no new array, for the per-sample shading
  function mixTo(o, a, b, t) {
    o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t;
    return o;
  }
  var WHITE = [255, 255, 255];
  // CSS colour of c (alpha a, default 1). Opaque colours come from a cache: a frame sets
  // ~300 gradient stops, ~90% of them a colour seen lately, and building the string each
  // time was most of the garbage a frame made.
  var RGB_STR = {}, rgbN = 0;
  function rgba(c, a) {
    if (a === undefined) {
      var r = c[0] | 0, g = c[1] | 0, b = c[2] | 0;
      if (r >= 0 && r < 256 && g >= 0 && g < 256 && b >= 0 && b < 256) {
        var k = (r << 16) | (g << 8) | b, s = RGB_STR[k];
        if (s === undefined) {
          if (++rgbN > 4096) { RGB_STR = {}; rgbN = 1; }
          s = RGB_STR[k] = 'rgba(' + r + ',' + g + ',' + b + ',1)';
        }
        return s;
      }
    }
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : +a.toFixed(3)) + ')';
  }

  /* ---------------------------------------------------------------- shapes */
  // Tapered capsule (circles at both ends joined by tangents) / circle, added to the current path.
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

  /* ------------------------------------------------------------ shared loop */
  // One requestAnimationFrame loop drives every instance, and only while some figure needs
  // frames: each _tick() says whether it does, and whatever can wake a figure (a setter, a
  // resize, the canvas scrolling into view, the tab showing again) calls ensureLoop().
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
    var list = registry.slice(), busy = false;
    for (var i = 0; i < list.length; i++) {
      try { if (list[i]._tick(dt)) busy = true; } catch (e) { list[i]._fail(e); busy = true; }
    }
    if (busy) ensureLoop();
    if (!rafId) lastT = 0; // asleep: the first frame after waking steps 1/60 s, not the whole pause
  }
  function ensureLoop() {
    if (!rafId && registry.length && !isHidden()) rafId = raf(tick);
  }
  if (doc && doc.addEventListener) {
    doc.addEventListener('visibilitychange', function () {
      if (isHidden()) { if (rafId) caf(rafId); rafId = 0; lastT = 0; } else ensureLoop();
    });
  }
  // A zoom or a move to another screen changes devicePixelRatio, which _tick checks.
  if (root.addEventListener) root.addEventListener('resize', ensureLoop);
  var reduceMQ = null;
  try { reduceMQ = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { reduceMQ = null; }
  function reducedMotion() { return !!(reduceMQ && reduceMQ.matches); }

  /* --------------------------------------------------------------- instance */
  function Figure(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = null;
    try { this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null; } catch (e) { this.ctx = null; }
    this.low = opts.quality === 'low';
    // Frame-rate cap (fps) and backing-store resolution cap (maxDpr). Thumbnails: 30 fps.
    // 2x by default: a 3x phone pays ~2.25x the fill cost (+12 ms a frame on a slow one)
    // for soft shading whose extra sharpness is hard to see.
    this.fps = clamp(num(opts.fps, this.low ? 30 : 60), 1, 240);
    this.maxDpr = clamp(num(opts.maxDpr, 2), 1, 4);
    // thumbnails: a circle [dx, dy, r] (CSS px, centre in from the bottom-right corner) kept clear
    this.clear = opts.clear && opts.clear.length === 3 ? [num(opts.clear[0], 0), num(opts.clear[1], 0), num(opts.clear[2], 0)] : null;
    // framing (see _fit): 'shared' (one body scale for every move) or 'fill' (each move fills the canvas)
    this.fill = opts.fit === 'fill';
    this.ex = getEx(opts.exercise);
    // a thumbnail that is never played shows the move's key pose
    this.time = this.low ? keyTime(this.ex) : 0;
    this.paced = false; // shown at an explicit tempo (see setExercise)
    this.playing = true;
    this.energy = this.energyT = clamp(num(opts.energy, 1), 0, 1);
    var c1 = parseColor(opts.primary, [255, 43, 214]), c2 = parseColor(opts.secondary, [255, 176, 0]);
    this.c1 = c1; this.c2 = c2; this.c1a = c1; this.c2a = c2; this.c1b = c1; this.c2b = c2; this.colT = 1;
    this.cur = new Float32Array(NJ * 3);
    this.view = new Float32Array(NJ * 3);
    this.gnd = new Float32Array(NJ * 3);
    this.meta = { floorY: 0, sc: 1, farL: 0, farR: 0, flat: 0.2 };
    this.matOpts = { body: opts.body, shade: opts.shade };
    this.material = typeof opts.material === 'string' ? opts.material : null;
    this.hasPose = false;
    this.fromEx = null; this.morphT = 1; this._xfN = 0; // dissolve: outgoing exercise, progress, number
    this.flash = 0; this.ring = -1;
    this._setScheme(opts.scheme);
    this.W = 0; this.H = 0; this.dpr = 1;
    this.visible = true;
    this.dead = false;
    this.errors = 0;
    this._frozen = false;
    this._stats = { frames: 0, ms: 0 };
    this._fitCache = null;
    var self = this;
    // Resizing the backing store clears it: repaint at once, not on the next frame.
    function resized() { if (!self.dead && self._measure()) self._paint(); }
    if (canvas && root.ResizeObserver) {
      try {
        this.ro = new root.ResizeObserver(resized);
        this.ro.observe(canvas);
      } catch (e) { this.ro = null; }
    }
    if (!this.ro) {
      this._onResize = resized;
      if (root.addEventListener) root.addEventListener('resize', this._onResize);
    }
    if (canvas && root.IntersectionObserver) {
      try {
        this.io = new root.IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var v = entries[i].isIntersecting;
            // shown again: what the canvas still holds was not on screen, so an exercise
            // change made meanwhile does not dissolve from it (see _drawStudio)
            if (v && !self.visible) self._unseen = true;
            self.visible = v;
          }
          ensureLoop();
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

  // _still: the last frame drawn was settled (see _tick), so nothing needs drawing until
  // something changes. Whatever changes something clears it (setExercise, setSuspended,
  // setStyle, a resize...), and clearing it wakes the shared loop.
  Object.defineProperty(FP, '_still', {
    get: function () { return !!this._stillF; },
    set: function (v) { this._stillF = !!v; if (!v) ensureLoop(); }
  });

  FP._fail = function (e) {
    this.errors++;
    if (this.errors === 1 && root.console && console.warn) console.warn('[HIITFigure] frame error (suppressed):', e);
  };

  // Follow the canvas's CSS size and the device pixel ratio. Returns whether either changed
  // (the backing store may have been cleared; the caller repaints).
  FP._measure = function () {
    var c = this.canvas;
    if (!c) return false;
    var w = c.clientWidth, h = c.clientHeight;
    var dpr = this._dprCap();
    var bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
    if (w === this.W && h === this.H && dpr === this.dpr && c.width === bw && c.height === bh) return false;
    if (c.width !== bw || c.height !== bh) {
      c.width = bw; c.height = bh;
      // If the canvas was sized only by its attributes, resizing the backing store would
      // change its CSS size too (feedback loop). Pin its CSS size in that case.
      if (c.clientWidth !== w || c.clientHeight !== h) {
        c.style.width = w + 'px'; c.style.height = h + 'px';
      }
    }
    // A cross-dissolve in flight carries on (a phone's URL bar collapsing resizes the
    // stage): its snapshot keeps the fit it was taken with and is mapped to the new one.
    this.W = w; this.H = h; this.dpr = dpr;
    this._fitCache = null;
    if (w < 4 || h < 4) this._freeBufs(); // hidden (display: none): give the scratch canvases back
    this._still = false; // the next tick must repaint
    return true;
  };
  // Device pixels per CSS px for the backing store.
  FP._dprCap = function () { return Math.min(this.maxDpr, root.devicePixelRatio || 1); };

  // Framing: scale (px per body unit) and origin of an exercise on this canvas, cached
  // until the canvas resizes. The box is the exercise's whole cycle (exBox).
  //
  // Shared scale (the default: workout stage, swipe preview, Up next): every exercise is
  // drawn at about the same body scale, so the athlete does not grow or shrink from one
  // move to the next. The reference is the scale that fits a standing body (the 'rest'
  // pose) with FIT_PAD padding; an exercise gets its own best fit clamped to FIT_LO..FIT_HI
  // times that. A move too wide for that (the squat's reach) gives up side padding, down to
  // FIT_EDGE, before it gives up size; the top and bottom keep FIT_PAD, since on the workout
  // stage the ring and the controls overlap the canvas there (so jacks, arms overhead, stays
  // at ~0.85). A move on the floor is lowered FLOOR_K of the way from the middle to the
  // floor a standing body stands on, so it does not float in the upper half of a square
  // canvas, nor crowd the controls under it on the stage.
  //
  // opts.fit = 'fill' (showcases that show one move at a time: the setup hero, the How-to
  // sheet): each move's box fits the canvas, centred, up to FILL_MAX times the reference.
  //
  // Thumbnails ('low') fill their canvas instead, see _fitThumb.
  var FIT_PAD = 0.06, FIT_EDGE = 0.02, FIT_LO = 0.94, FIT_HI = 1.03, FLOOR_K = 0.6, FILL_MAX = 1.25, THUMB_PAD = 0.02;
  function boxScale(b, w, h, pad, padY) {
    var px = Math.max(1, w * pad), py = Math.max(1, h * (padY === undefined ? pad : padY));
    return Math.max(1e-3, Math.min((w - 2 * px) / (b.x1 - b.x0), (h - 2 * py) / (b.y1 - b.y0)));
  }
  // Thumbnail framing: the key pose (what a card shows while it is not playing) fills the
  // canvas with THUMB_PAD padding, as far as the whole cycle still fits on the canvas once
  // it plays. opts.clear = [dx, dy, r] is a circle (CSS px, centre dx, dy in from the
  // bottom-right corner: the card's info button) the body is kept out of, in every pose of
  // the cycle (THUMB_N samples): the frame slides up and left from the centre, then
  // shrinks, until no part of the body passes under it.
  var THUMB_BONES = [[HEAD, HEAD, 0.075], [NECK, CHEST, 0.09], [CHEST, PELVIS, 0.1], [SHL, SHR, 0.06], [HIPL, HIPR, 0.07],
    [SHL, ELL, 0.05], [ELL, WRL, 0.045], [WRL, HAL, 0.04], [SHR, ELR, 0.05], [ELR, WRR, 0.045], [WRR, HAR, 0.04],
    [HIPL, KNL, 0.065], [KNL, ANL, 0.05], [ANL, TOL, 0.04], [HIPR, KNR, 0.065], [KNR, ANR, 0.05], [ANR, TOR, 0.04]];
  var THUMB_T = [0.5, 0.375, 0.25, 0.125, 0], THUMB_N = 24;
  FP._fitThumb = function (ex, box, W, H) {
    var g = 0.065 * (LOW_RK - 1); // limbs are drawn thicker here (see _stState)
    function grown(b) { return { x0: b.x0 - g, x1: b.x1 + g, y0: b.y0, y1: b.y1 + g }; }
    var kb = grown(box.key), cb = grown(box.raw);
    var px = Math.max(1, W * THUMB_PAD), py = Math.max(1, H * THUMB_PAD);
    // tx, ty: where the key pose sits in the free space (0 = left / top, 0.5 = centred)
    function place(s, tx, ty) {
      var ox = px + (W - 2 * px - (kb.x1 - kb.x0) * s) * tx - kb.x0 * s;
      var oy = py + (H - 2 * py - (kb.y1 - kb.y0) * s) * ty + kb.y1 * s;
      // keep the whole cycle on the canvas
      return { sc: s, ox: clamp(ox, 1 - cb.x0 * s, W - 1 - cb.x1 * s), oy: clamp(oy, 1 + cb.y1 * s, H - 1 + cb.y0 * s) };
    }
    var s0 = Math.min(boxScale(kb, W, H, THUMB_PAD), boxScale(cb, W, H, 0.01));
    var cl = this.clear;
    if (!cl) return place(s0, 0.5, 0.5);
    // the whole cycle (a picked card plays), key pose first since it is the likeliest to collide
    var poses = [project(safePose(ex, KEY_PHASE[ex.id] || 0, keyTime(ex)), ex, new Float32Array(NJ * 3))];
    for (var n = 0; n < THUMB_N; n++) poses.push(project(safePose(ex, n / THUMB_N, n / THUMB_N * ex.period), ex, new Float32Array(NJ * 3)));
    var qx = W - cl[0], qy = H - cl[1];
    function free(f) {
      for (var j = 0; j < poses.length; j++) {
        var V = poses[j];
        for (var i = 0; i < THUMB_BONES.length; i++) {
          var a = THUMB_BONES[i][0] * 3, b = THUMB_BONES[i][1] * 3, r = cl[2] + THUMB_BONES[i][2] * LOW_RK * f.sc;
          var ax = f.ox + V[a] * f.sc, ay = f.oy - V[a + 1] * f.sc, dx = V[b] * f.sc + f.ox - ax, dy = f.oy - V[b + 1] * f.sc - ay;
          var t = clamp(((qx - ax) * dx + (qy - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          var ex2 = ax + dx * t - qx, ey2 = ay + dy * t - qy;
          if (ex2 * ex2 + ey2 * ey2 < r * r) return false;
        }
      }
      return true;
    }
    for (var k = 0, s = s0; k < 30; k++, s *= 0.97) {
      // the most centred placement that keeps the button clear
      for (var d = 0; d <= 8; d++) {
        for (var i = Math.max(0, d - 4); i <= Math.min(4, d); i++) {
          var f = place(s, THUMB_T[i], THUMB_T[d - i]);
          if (free(f)) return f;
        }
      }
    }
    return place(s0, 0.5, 0.5);
  };
  FP._fit = function (ex) {
    var fc = this._fitCache || (this._fitCache = {});
    var id = exId(ex);
    if (fc[id]) return fc[id];
    var b = exBox(ex), W = this.W, H = this.H, f;
    if (this.low) f = this._fitThumb(ex, b, W, H);
    else {
      var ref = boxScale(exBox(EX.rest), W, H, FIT_PAD), own = boxScale(b, W, H, FIT_PAD);
      var sc = this.fill ? Math.min(own, ref * FILL_MAX) :
        Math.min(clamp(own, ref * FIT_LO, ref * FIT_HI), boxScale(b, W, H, FIT_EDGE, FIT_PAD));
      var oy = H / 2 + (b.y0 + b.y1) / 2 * sc; // centred
      // shared: lowered toward the floor a standing body stands on (FLOOR_K of the way)
      if (!this.fill) oy = lerp(oy, Math.max(oy, H - Math.max(1, H * FIT_PAD) + b.y0 * sc), FLOOR_K);
      f = { sc: sc, ox: W / 2 - (b.x0 + b.x1) / 2 * sc, oy: oy };
    }
    f.floorY = f.oy - camSetup(ex).floorV * f.sc;
    if (!this.low) shadowGrid(ex, f, W, H);
    fc[id] = f;
    return f;
  };

  FP._computePose = function () {
    var ex = this.ex, g = this._glide, t = g ? this.time + g.off * glideLeft(g) : this.time; // (a re-timed clock: setTime)
    var p = ((t / ex.period) % 1 + 1) % 1;
    var J = safePose(ex, p, t);
    project(J, ex, this.view);
    var f = this._fit(ex), v = this.view, P = this.cur, m = this.meta;
    for (var i = 0; i < NJ; i++) {
      P[i * 3] = f.ox + v[i * 3] * f.sc;
      P[i * 3 + 1] = f.oy - v[i * 3 + 1] * f.sc;
      P[i * 3 + 2] = v[i * 3 + 2];
    }
    m.floorY = f.floorY; m.sc = f.sc; m.farL = ex.far.L; m.farR = ex.far.R;
    groundProject(J, ex, f, this.gnd); m.flat = camSetup(ex).sp;
    this.hasPose = true;
  };

  // One frame of the shared loop. Returns whether this figure needs another frame.
  FP._tick = function (dt) {
    if (this.dead || !this.ctx || this.suspended) return false;
    if (this._dprCap() !== this.dpr || (!this.ro && (this._chk = (this._chk || 0) + 1) % 30 === 0)) this._measure();
    // (without a ResizeObserver the size is polled, so the loop keeps running)
    if (!this.visible || this.W < 4 || this.H < 4) return !this.ro;
    // Battery: a stopped figure with nothing in flight is drawn once and then left alone,
    // and nothing draws faster than its fps cap (a 90/120 Hz display would otherwise
    // double the cost for motion nobody can tell apart).
    var settled = !this.playing && this.morphT >= 1 && this.colT >= 1 && this.flash === 0 &&
      this.ring < 0 && Math.abs(this.energyT - this.energy) < 0.01;
    // While still, waiting time must not pile up into the first step after waking.
    if (settled && this._still) { this._acc = 0; return !this.ro; }
    this._acc = (this._acc || 0) + dt;
    // a little under the frame interval, so frame-time jitter cannot stretch a step to
    // one display frame more than needed
    if (!settled && this._acc < 1 / this.fps - 0.004) return true;
    var step = Math.min(0.1, this._acc);
    this._acc = 0;
    var t0 = now();
    this._update(step);
    this._draw();
    this._still = settled;
    var st = this._stats, ms = now() - t0;
    st.frames++; st.ms += ms;
    this._watch(ms, step);
    return !settled || !this.ro;
  };

  // Slow-device guard. While a high-quality figure's frames average more than SLOW_MS over
  // SLOW_S seconds of animation, the figures drop their costliest passes: first the
  // silhouette rim, then (still slow) the occlusion shadows. One way, for all figures alike
  // (a device is slow for all of them, and the swipe preview must keep matching the stage):
  // nothing switches back on, so the look never flickers between the two.
  // (Frames of a dissolve, which copy the canvas, and frozen dev figures don't count.)
  var SLOW_MS = 8, SLOW_S = 2, slowLevel = 0, slowGuard = true;
  FP._watch = function (ms, dt) {
    if (this.low || this._frozen || this.morphT < 1 || slowLevel >= 2 || !slowGuard) return;
    var w = this._pw || (this._pw = { n: 0, ms: 0, t: 0 });
    w.n++; w.ms += ms; w.t += dt;
    if (w.t < SLOW_S) return;
    if (w.ms / w.n > SLOW_MS) slowLevel++;
    w.n = 0; w.ms = 0; w.t = 0;
  };

  FP._update = function (dt) {
    this.energy += (this.energyT - this.energy) * (1 - Math.exp(-dt * 5));
    if (this.colT < 1) {
      this.colT = Math.min(1, this.colT + dt / COLOR_S);
      var k = sine(this.colT);
      this.c1 = mix(this.c1a, this.c1b, k); this.c2 = mix(this.c2a, this.c2b, k);
    }
    this.flash *= Math.exp(-dt * 3.2);
    if (this.flash < 0.03) this.flash = 0;
    if (this.ring >= 0) { this.ring += dt / 0.8; if (this.ring > 1) this.ring = -1; }
    var g = this._glide;
    if (g && g.d > 0 && (g.t += dt) >= g.d) g.d = 0; // a re-timing glide (setTime) runs on real time
    if (this._frozen) { this._computePose(); return; }
    // the new move already plays while it dissolves in
    if (this.morphT < 1) this.morphT = Math.min(1, this.morphT + dt / MORPH_S);
    // reduced motion: half speed, except a move shown at an explicit tempo (it follows a count)
    if (this.playing) this.time += dt * (reducedMotion() && !this.paced ? 0.5 : 1);
    this._computePose();
  };

  // Draw the current state right away, outside the loop (after a resize or a look change).
  FP._paint = function () {
    if (this.ctx && this.hasPose && this.W >= 4 && this.H >= 4 && !this.suspended) {
      try { this._computePose(); this._draw(); } catch (e) { this._fail(e); }
    }
  };

  /* ================================================================= STUDIO */
  // A matte, softly lit 3D mannequin (the only look). Each limb is a tapered capsule
  // shaded across its width from its 3D orientation: wrapped-Lambert key light
  // (upper-left-front) + sky fill, a satin Blinn highlight and a phase-tinted rim light
  // on the opposite edge. Tapers use a conic gradient centred on the cone apex, so the
  // shading follows the taper exactly. The torso is lofted from elliptical
  // cross-sections; the floor gets soft contact shadows scaled by each body part's true
  // height above it.

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

  // Material presets. Each declares the stage it is made for ('dark' | 'light'); a
  // requested material applies when the scheme matches its stage, otherwise the scheme's
  // default is used (so a theme toggle keeps working). Ramp: deep -> shade -> body -> lit
  // at I = 0, rampAt[0], rampAt[1], 1. Optional extras (absent = off): spec2 (broad
  // sheen lobe), crisp (extra gradient stops that track the highlight so a tight one is
  // not lost between samples), env ([floor, softbox] reflection colours, envK = mix),
  // rimPow (width of the faint per-piece rim, 8 = narrow), rim2 (untinted kicker on the key
  // side), spotR (head highlight size), lowRim (per-piece rim strength in thumbnails).
  // Rim light: rimK is only a faint per-piece tint at every limb edge (it also shows where
  // parts overlap, so it stays weak); the real rim is the silhouette pass (rimS = strength,
  // rimD = width in body units, rimW = how far the phase colour is mixed toward white),
  // which lights only the figure's outer edge.
  // far / farK: the tone limbs on the far side recede toward (the stage's own), farDim: how
  // much less light they get.
  var MATERIALS = {
    // dark stage: brushed mid-grey metal, crisp cool highlight, strong phase rim
    titanium: {
      stage: 'dark', rampAt: [0.32, 0.7], litTo: [226, 232, 242],
      body: [124, 131, 146], shade: [43, 47, 56], deepTo: [8, 9, 12], deepK: 0.55, lit: [211, 216, 226],
      spec: [242, 247, 255], specK: 1, shin: 48, crisp: true, spec2: [186, 196, 216], spec2K: 0.18, shin2: 6, spotR: 0.36,
      env: [[22, 25, 32], [224, 230, 242]], envK: 0.32, envSide: 0.75,
      rimK: 0.25, rimW: 0.25, rimPow: 5, rimS: 0.9, rimD: 0.0065, rim2: [196, 208, 230], rim2K: 0.18, rim2Pow: 7, lowRim: 0.7,
      far: [6, 8, 12], farK: 0.3, farDim: 0.12, ao: [4, 5, 8], aoK: 0.45,
      shadow: [0, 0, 0], shadowK: 1.4, floor: [214, 224, 244], floorK: 0.03, pool: 0.1, sweep: 0.55
    },
    // dark (warm charcoal) stage: matte warm stone / clay
    stone: {
      stage: 'dark', rampAt: [0.34, 0.74], litTo: [244, 238, 228],
      body: [172, 164, 153], shade: [84, 77, 70], deepTo: [26, 19, 13], deepK: 0.6, lit: [232, 225, 214],
      spec: [255, 246, 232], specK: 0.32, shin: 20, spec2: [250, 240, 226], spec2K: 0.14, shin2: 4,
      rimK: 0.2, rimW: 0.2, rimPow: 7, rimS: 0.8, rimD: 0.006,
      far: [16, 14, 12], farK: 0.3, farDim: 0.12, ao: [26, 18, 12], aoK: 0.45,
      shadow: [8, 5, 2], shadowK: 1.5, floor: [255, 236, 212], floorK: 0.03, pool: 0.12, sweep: 0.45
    },
    // light stage: satin graphite on warm paper
    graphite: {
      stage: 'light', rampAt: [0.22, 0.5], litTo: [132, 138, 150],
      body: [74, 79, 90], shade: [48, 52, 60], deepTo: [6, 7, 9], deepK: 0.3, lit: [132, 138, 150],
      spec: [182, 188, 200], specK: 0.55, shin: 14, rimK: 0.18, rimW: 0.5, rimS: 0.6, rimD: 0.0055,
      far: [236, 234, 228], farK: 0.2, farDim: 0.02, ao: [0, 0, 0], aoK: 0.5,
      shadow: [44, 38, 30], shadowK: 0.62, floor: [0, 0, 0], floorK: 0.03, pool: 0, sweep: 0.4
    }
  };
  var DEFAULT_MAT = { dark: 'stone', light: 'graphite' };
  // The material actually used for a requested name on a scheme.
  function materialFor(name, scheme) {
    var m = typeof name === 'string' && MATERIALS.hasOwnProperty(name) ? MATERIALS[name] : null;
    return m && m.stage === scheme ? name : DEFAULT_MAT[scheme];
  }
  function buildMat(name, o) {
    var b = MATERIALS[name], m = {}, k;
    for (k in b) if (b.hasOwnProperty(k)) m[k] = b[k];
    o = o || {};
    var body = parseColor(o.body, b.body), shade = parseColor(o.shade, b.shade);
    var lit = o.body ? mix(body, b.litTo, 0.4) : b.lit;
    m.ramp = [[0, mix(shade, b.deepTo, b.deepK)], [b.rampAt[0], shade], [b.rampAt[1], body], [1, lit]];
    m.name = name;
    return m;
  }

  // Surface colour for the camera-space unit normal in SN (x, y, z) at SN[3] = ed, how close
  // the sample is to the silhouette (|u| across a limb, 0 = no rim). M = per-frame state.
  // acc: optional accent albedo (wristbands, soles) instead of the body ramp.
  // It runs for every gradient stop of every frame, so it makes no garbage: the input comes
  // in a typed array (doubles passed as arguments are boxed) and the result is a shared
  // array, valid until the next call.
  var SN = new Float64Array(4), SC = [0, 0, 0], ST = [0, 0, 0];
  function stShade(M, acc) {
    var nx = SN[0], ny = SN[1], nz = SN[2], ed = SN[3];
    var ndl = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
    var dif = clamp((ndl + 0.4) / 1.4, 0, 1);
    var I = clamp((0.07 + 0.15 * (0.5 + 0.5 * ny) + 0.8 * dif * (0.5 + 0.5 * dif)) * M.dim, 0, 1);
    var c = SC, R = M.ramp;
    if (acc) {
      if (I < 0.6) mixTo(c, mixTo(ST, acc, BLACK, 0.6), acc, I / 0.6);
      else mixTo(c, acc, mixTo(ST, acc, WHITE, 0.3), (I - 0.6) / 0.4);
    }
    else if (I <= R[1][0]) mixTo(c, R[0][1], R[1][1], I / R[1][0]);
    else if (I <= R[2][0]) mixTo(c, R[1][1], R[2][1], (I - R[1][0]) / (R[2][0] - R[1][0]));
    else mixTo(c, R[2][1], R[3][1], (I - R[2][0]) / (R[3][0] - R[2][0]));
    if (M.envK > 0) { // reflected environment (view = +z): dark floor, softbox above, strip on the key side
      var ry = 2 * nz * ny, rx = 2 * nz * nx, et = clamp((ry + 0.15) / 0.7, 0, 1), es = clamp((-rx - 0.25) / 0.55, 0, 1);
      et = Math.max(et * et * (3 - 2 * et), M.envSide * es * es * (3 - 2 * es));
      mixTo(c, c, mixTo(ST, M.env[0], M.env[1], et), M.envK * M.dim);
    }
    var nh = nx * HALFV[0] + ny * HALFV[1] + nz * HALFV[2];
    if (M.spec2K > 0 && nh > 0) { // broad sheen (satin metal / softbox reflection)
      var s2 = Math.pow(nh, M.shin2) * M.spec2K * M.dim;
      if (s2 > 0.003) mixTo(c, c, M.spec2, clamp(s2, 0, 1));
    }
    if (nh > 0.5) {
      var sp = Math.pow(nh, M.shin) * M.specK * M.dim;
      if (sp > 0.003) mixTo(c, c, M.spec, clamp(sp, 0, 1));
    }
    if (ed > 0) {
      var pl = Math.sqrt(nx * nx + ny * ny), rr = pl > 1e-4 ? (nx * RIMX + ny * RIMY) / pl : 0;
      if (rr > 0) {
        var e2 = ed * ed, e4 = e2 * e2, rim = rr * (M.rimPow === 8 ? e4 * e4 : Math.pow(ed, M.rimPow)) * M.rimK;
        if (rim > 0.003) mixTo(c, c, M.rimC, clamp(rim, 0, 1));
      }
      if (M.rim2K > 0 && pl > 1e-4) { // kicker: untinted strip light on the opposite edge
        var r2 = (-nx * RIMX + ny * RIMY) / pl;
        if (r2 > 0) {
          var k2 = r2 * Math.pow(ed, M.rim2Pow) * M.rim2K;
          if (k2 > 0.003) mixTo(c, c, M.rim2, clamp(k2, 0, 1));
        }
      }
    }
    if (M.far > 0) mixTo(c, c, M.farC, M.far);
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

  // Sample positions across a cylinder: the standard set, plus (crisp materials) extra
  // samples around the specular peak u* so a tight highlight always shows.
  var SUX = [], SXE = [0, 0, 0, 0, 0];
  function samples(M, e1x, e1y, e2x, e2y, e2z) {
    if (!M.crisp) return M.low ? SUL : SU;
    var he1 = HALFV[0] * e1x + HALFV[1] * e1y, he2 = HALFV[0] * e2x + HALFV[1] * e2y + HALFV[2] * e2z;
    if (he2 <= 0) return SU;
    var us = he1 / Math.sqrt(he1 * he1 + he2 * he2), w = Math.max(0.05, 0.6 / Math.sqrt(M.shin));
    var X = SUX, n = 0, i, j = 0, extra = SXE;
    extra[0] = us - 1.6 * w; extra[1] = us - 0.7 * w; extra[2] = us; extra[3] = us + 0.7 * w; extra[4] = us + 1.6 * w;
    for (i = 0; i < SU.length; i++) {
      while (j < extra.length && extra[j] < SU[i]) { if (extra[j] > -1 && Math.abs(extra[j] - SU[i]) > 0.02) X[n++] = extra[j]; j++; }
      X[n++] = SU[i];
    }
    X.length = n;
    return X;
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
    var U = samples(M, e1x, e1y, e2x, e2y, e2z), n = U.length, g, i, u, cu, c;
    if (!M.low && M.conic && d > Math.max(ra, rb) && Math.abs(ra - rb) > 0.03 * rm) {
      var t = ra / (ra - rb), px = ax + dx * t, py = ay + dy * t;
      var th0 = Math.atan2(my - py, mx - px) - Math.PI;
      g = ctx.createConicGradient(th0, px, py);
      for (i = 0; i < n; i++) {
        u = U[i]; cu = Math.sqrt(Math.max(0, 1 - u * u));
        SN[0] = u * e1x + cu * e2x; SN[1] = u * e1y + cu * e2y; SN[2] = cu * e2z; SN[3] = Math.abs(u);
        c = stShade(M, acc);
        var th = Math.atan2(my + sy * u * rm - py, mx + sx * u * rm - px) - th0;
        th = ((th % TAU) + TAU) % TAU;
        g.addColorStop(th / TAU, rgba(c));
      }
      return g;
    }
    g = ctx.createLinearGradient(mx - sx * rm, my - sy * rm, mx + sx * rm, my + sy * rm);
    for (i = 0; i < n; i++) {
      u = U[i]; cu = Math.sqrt(Math.max(0, 1 - u * u));
      SN[0] = u * e1x + cu * e2x; SN[1] = u * e1y + cu * e2y; SN[2] = cu * e2z; SN[3] = Math.abs(u);
      c = stShade(M, acc);
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
    var den = d1x * d2y - d1y * d2x, U = samples(M, e1x, e1y, e2x, e2y, e2z), n = U.length, g, i, u, cu, c;
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
      SN[0] = u * e1x + cu * e2x; SN[1] = u * e1y + cu * e2y; SN[2] = cu * e2z; SN[3] = Math.abs(u);
      c = rgba(stShade(M, null));
      if (conic) {
        var th = Math.atan2(my + (py - my) * u - ay, mx + (px - mx) * u - ax) - th0;
        g.addColorStop((((th % TAU) + TAU) % TAU) / TAU, c);
      } else g.addColorStop((u + 1) / 2, c);
    }
    return g;
  }

  // Studio body: radii in body units. Limbs are built like an artist's mannequin: a piece
  // ends in a ball joint shaded with that piece, and the next piece starts flat inside the
  // ball, so no round end is drawn over the piece before it (only the thigh's rounded top,
  // the hip, sits over the pelvis).
  //   arm: deltoid ball (and how far below / inside the shoulder joint it sits), upper arm
  //        (start, end), elbow ball, forearm (start, end), wrist ball, hand [wrist, palm
  //        wide, palm thin (a flat mitten, as wide as it looks from its angle), fingertip],
  //        palm station along the hand;
  //   leg: thigh top (the hip; and how far inside the joint), thigh end, knee ball, shin
  //        start, calf (at calfAt along the shin), ankle ball.
  var ST_ARM = { delt: 0.039, deltDown: 0.026, deltIn: 0.009, up: [0.035, 0.0272], elbow: 0.029, fore: [0.0268, 0.0178],
    wrist: 0.0178, hand: [0.0152, 0.0245, 0.0125, 0.0185], palmAt: 0.5 };
  var ST_LEG = { hip: 0.063, hipIn: 0.008, thigh: 0.0375, knee: 0.039, shin: 0.0352, calf: 0.0385, calfAt: 0.28, ankle: 0.0228 };
  var ST_NECK = [0.04, 0.036]; // base, top
  // The torso is shaded as if it tilted toward or away from the viewer only this much: its
  // broad, flat front keeps facing the camera, so a torso leaning back or forward does not
  // turn into a dark vest next to the round limbs.
  var ST_TILT = 0.45;
  var ST_PELVIS = [0.082, 0.05, 0.05, 0.016]; // ellipsoid semi-axes: side, forward, up; lift of its centre
  // head: centre offset up / forward from the head joint, cranium semi-axes (up, forward,
  // side), jaw [forward, up offset from the cranium centre, semi-axes up, forward, side]
  var ST_HEAD = { up: 0.006, fwd: 0.014, skull: [0.069, 0.061, 0.053], jaw: [0.026, -0.04, 0.032, 0.034, 0.04] };
  var TORSO = [ // anchor (0 pelvis+u1*o | 1 chest+u2*o), o, half-width (R), half-depth (F), forward, hips->shoulders blend
    [0, 0.0, 0.092, 0.066, -0.008, 0],
    [0, 0.08, 0.068, 0.054, 0.004, 0.4],
    [1, 0.0, 0.093, 0.062, 0.012, 0.8],
    [1, 0.09, 0.111, 0.067, 0.016, 1],
    [1, 0.14, 0.1, 0.056, 0.006, 1],
    [1, 0.166, 0.058, 0.044, 0.0, 1]
  ];
  // Occlusion silhouettes (rough) per group, for the soft shadow a near part casts on what is behind it.
  // (H: the head, a draw group of its own (see _stOrder) whose shadow goes with the torso's.)
  var ST_OCC = {
    T: [[PELVIS, CHEST, 0.075, 0.08], [CHEST, NECK, 0.085, 0.06]],
    H: [[NECK, HEAD, 0.036, 0.066]],
    AL: [[SHL, ELL, 0.04, 0.029], [ELL, WRL, 0.028, 0.019], [WRL, HAL, 0.02, 0.018]],
    AR: [[SHR, ELR, 0.04, 0.029], [ELR, WRR, 0.028, 0.019], [WRR, HAR, 0.02, 0.018]],
    LL: [[HIPL, KNL, 0.06, 0.039], [KNL, ANL, 0.039, 0.023], [ANL, TOL, 0.025, 0.014]],
    LR: [[HIPR, KNR, 0.06, 0.039], [KNR, ANR, 0.039, 0.023], [ANR, TOR, 0.025, 0.014]]
  };
  // Joints of each limb group, root to tip (for the head's depth sort and bounding boxes).
  var ST_CHAIN = { AL: [SHL, ELL, WRL, HAL], AR: [SHR, ELR, WRR, HAR], LL: [HIPL, KNL, ANL, TOL], LR: [HIPR, KNR, ANR, TOR] };
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

  var LOW_RK = 1.3; // limb thickness in thumbnails ('low'), relative to the body scale
  FP._stState = function () {
    var M = this._M || (this._M = {}), mat = this.mat;
    M.ramp = mat.ramp; M.spec = mat.spec; M.specK = mat.specK; M.shin = mat.shin;
    M.rimC = mixTo(M.rimC || [0, 0, 0], this.c1, WHITE, mat.rimW);
    M.rimE = (0.5 + 0.5 * this.energy) * (1 + 1.4 * this.flash); // energy + cue flare
    M.acc1 = mixTo(M.acc1 || [0, 0, 0], this.c1, this.c2, 0.25); M.acc2 = mixTo(M.acc2 || [0, 0, 0], this.c2, this.c1, 0.2); // wristbands, soles
    M.rimK = mat.rimK * M.rimE * (this.low ? (mat.lowRim || 0.45) : 1);
    M.rimPow = mat.rimPow || 8;
    M.spec2 = mat.spec2; M.spec2K = mat.spec2K || 0; M.shin2 = mat.shin2 || 1;
    M.rim2 = mat.rim2; M.rim2K = (mat.rim2K || 0) * (this.low ? 0.8 : 1); M.rim2Pow = mat.rim2Pow || 6;
    M.spotR = mat.spotR || 0.55;
    M.env = mat.env; M.envK = mat.envK || 0; M.envSide = mat.envSide || 0; M.crisp = !!mat.crisp && !this.low;
    M.far = 0; M.farC = mat.far; M.dim = 1;
    M.sc = this.meta.sc; M.low = this.low;
    M.rk = M.sc * (this.low ? LOW_RK : 1); // thumbnails: thicker limbs so they read at ~52 px
    M.conic = typeof this.ctx.createConicGradient === 'function';
    M.zRef = this.cur[PELVIS * 3 + 2];
    return M;
  };

  // One frame: the pose (_drawStudio), cross-dissolved with the outgoing frame while an
  // exercise change is in flight.
  //
  // The first frame drawn after setExercise() copies what the canvas still shows (the
  // outgoing frame, or a dissolve already under way) into a buffer. Each frame then draws
  // the new pose and adds the copy over it in premultiplied space, new * k + old * (1 - k)
  // ('destination-in', then 'lighter'), so where the two bodies overlap the result stays
  // opaque, and nothing squashes or swaps draw order halfway as a joint-space morph between
  // two cameras does. On a resize the copy is mapped from the fit it was taken with to the
  // current one.
  FP._draw = function () {
    var xf = this.morphT < 1 && !!this.fromEx && this.hasPose;
    // shown again after being off screen: nothing visible to dissolve from
    if (xf && this._unseen) { this.morphT = 1; xf = false; }
    if (xf && (!this._xf || this._xf.n !== this._xfN)) xf = this._xfSnap();
    if (!xf && this._xf) { this._xf = null; drop(this, 'xbuf'); } // done: free the snapshot
    this._noOcc = !this.low && (Math.min(this.W, this.H) < OCC_MIN || slowLevel >= 2);
    this._drawStudio();
    if (xf) this._xfBlend();
    if (this.visible) this._unseen = false;
  };
  FP._xfSnap = function () {
    var c = this.canvas, s = this._buf('xbuf');
    if (!s || !c.width || !c.height) return false;
    if (s.c.width !== c.width || s.c.height !== c.height) { s.c.width = c.width; s.c.height = c.height; }
    s.x.setTransform(1, 0, 0, 1, 0, 0);
    s.x.globalCompositeOperation = 'copy';
    s.x.globalAlpha = 1;
    s.x.drawImage(c, 0, 0);
    s.x.globalCompositeOperation = 'source-over';
    var f = this._fit(this.fromEx);
    this._xf = { n: this._xfN, w: c.width, h: c.height, dpr: this.dpr, ox: f.ox, oy: f.oy, sc: f.sc };
    return true;
  };
  FP._xfBlend = function () {
    var ctx = this.ctx, X = this._xf, c = this.canvas, k = sine(this.morphT);
    var f = this._fit(this.fromEx), m = f.sc / X.sc, d = this.dpr, s = m * d / X.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = k;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - k;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(s, 0, 0, s, d * (f.ox - X.ox * m), d * (f.oy - X.oy * m));
    ctx.drawImage(this.xbuf.c, 0, 0, X.w, X.h, 0, 0, X.w, X.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.setTransform(d, 0, 0, d, 0, 0);
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
    var order = this._stOrder(orderOf(this.ex, phaseOf(this.ex, this.time)), P, M);
    var box = this._box || (this._box = [0, 0, 0, 0]); // screen box of what is drawn so far
    box[0] = box[1] = 1e9; box[2] = box[3] = -1e9;
    for (var gi = 0; gi < order.length; gi++) {
      var g = order[gi], far = g === 'T' || g === 'H' ? 0 : (g[1] === 'L' ? m.farL : m.farR);
      // soft shadow of this part on what is behind it (the head's always goes with the
      // torso's, so moving the head in the order never changes the shading)
      if (!low && gi > 0 && g !== 'H') this._stOcclude(ctx, g, P, M, box);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      M.far = far * mat.farK; M.dim = 1 - (mat.farDim === undefined ? 0.12 : mat.farDim) * far;
      if (g === 'T') this._stTorso(ctx, P, M);
      else if (g === 'H') this._stHead(ctx, P, M);
      else if (g[0] === 'A') this._stArm(ctx, g[1], P, M);
      else this._stLeg(ctx, g[1], P, M);
      if (!low) growDrawn(box, P, g, M.sc);
    }
    M.far = 0; M.dim = 1;
    if (!low && !slowLevel && Math.min(this.W, this.H) >= RIM_MIN) this._stRim(ctx, M, box);
    if (this.ring >= 0 && !low) this._stSweep(ctx, P, M);
    ctx.globalCompositeOperation = 'destination-over';
    this._stGround(ctx, P, M);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  // Draw order with the head as its own group 'H': straight after the torso, but after any
  // later limb group that it overlaps on screen and that lies behind it there (in shoulder
  // taps the far arm is drawn after the torso, yet the head is in front of it).
  FP._stOrder = function (order, P, M) {
    var out = this._ord || (this._ord = []), n = order.length, t = -1, pos, i, k;
    for (i = 0; i < n; i++) if (order[i] === 'T') t = i;
    pos = t;
    var hx = P[HEAD * 3], hy = P[HEAD * 3 + 1], hz = P[HEAD * 3 + 2], sc = M.sc;
    for (i = t + 1; i < n; i++) {
      var C = ST_CHAIN[order[i]];
      if (!C) continue;
      // closest point of the limb's bones to the head centre on screen
      var best = 1e9, bz = 0, reach = (0.085 + (order[i][0] === 'L' ? 0.065 : 0.045)) * sc;
      for (k = 0; k < 3; k++) {
        var a = C[k] * 3, b = C[k + 1] * 3, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dd = dx * dx + dy * dy;
        var u = dd > 1e-9 ? clamp(((hx - P[a]) * dx + (hy - P[a + 1]) * dy) / dd, 0, 1) : 0;
        var ex = P[a] + dx * u - hx, ey = P[a + 1] + dy * u - hy, d2 = ex * ex + ey * ey;
        if (d2 < best) { best = d2; bz = lerp(P[a + 2], P[b + 2], u); }
      }
      if (best < reach * reach && bz < hz - 0.02) pos = i;
    }
    out.length = 0;
    for (i = 0; i < n; i++) {
      out.push(order[i]);
      if (i === pos) out.push('H');
    }
    if (t < 0) out.push('H');
    return out;
  };

  // Grow the screen box b [x0, y0, x1, y1] by draw group g.
  function growDrawn(b, P, g, sc) {
    var C = ST_CHAIN[g], i, j, r;
    if (C) { r = 0.07 * sc; for (i = 0; i < 4; i++) { j = C[i] * 3; boxPt(b, P[j], P[j + 1], r); } return; }
    if (g === 'H') { boxPt(b, P[HEAD * 3], P[HEAD * 3 + 1], 0.085 * sc); return; }
    r = 0.13 * sc;
    boxPt(b, P[PELVIS * 3], P[PELVIS * 3 + 1], r); boxPt(b, P[CHEST * 3], P[CHEST * 3 + 1], r); boxPt(b, P[NECK * 3], P[NECK * 3 + 1], r);
  }
  function boxPt(b, x, y, r) {
    if (x - r < b[0]) b[0] = x - r; if (y - r < b[1]) b[1] = y - r;
    if (x + r > b[2]) b[2] = x + r; if (y + r > b[3]) b[3] = y + r;
  }

  // Below RIM_MIN CSS px (the Up-next card on a phone) there is no rim: its band is down to a
  // pixel there, and reading the canvas back makes it raster mid-frame, which is most of a
  // small figure's frame time (Up-next at 4x CPU throttle: 9.8 -> 3.8 ms without it).
  var RIM_MIN = 180;
  // Rim light on the silhouette only: the figure's coverage minus the same coverage moved
  // toward the rim light leaves a thin band along the outer edges that face it (wide where
  // an edge faces the light, vanishing where it turns away). It is built in a buffer at the
  // backing store's resolution (1:1 copies, no resampling: cheap and crisp) and laid over
  // the body with source-atop, so where parts overlap there is no edge and no coloured line.
  FP._stRim = function (ctx, M, box) {
    var mat = this.mat, a = clamp((mat.rimS || 0) * M.rimE, 0, 1);
    if (a < 0.02 || !(box[2] > box[0])) return;
    var rb = this._buf('rbuf');
    if (!rb) return;
    var dpr = this.dpr, cv = this.canvas, d = Math.max((mat.rimD || 0.006) * M.sc, 1.4) * dpr; // device px
    var x0 = Math.max(0, Math.floor(box[0] * dpr)), y0 = Math.max(0, Math.floor(box[1] * dpr));
    var x1 = Math.min(cv.width, Math.ceil(box[2] * dpr)), y1 = Math.min(cv.height, Math.ceil(box[3] * dpr));
    var w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    var c = rb.c, x = rb.x;
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
    var rl = Math.sqrt(RIMX * RIMX + RIMY * RIMY), ux = Math.round(RIMX / rl * d), uy = Math.round(-RIMY / rl * d);
    var hx = Math.round(RIMX / rl * d * 0.45), hy = Math.round(-RIMY / rl * d * 0.45);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'copy';
    x.globalAlpha = 1;
    x.fillStyle = rgba(M.rimC);
    x.fillRect(0, 0, w, h);
    // full strength near the edge, half strength further in: a light that fades inward
    x.globalCompositeOperation = 'destination-out';
    blit(x, cv, x0 + ux, y0 + uy, w, h);
    x.globalAlpha = 0.5;
    blit(x, cv, x0 + hx, y0 + hy, w, h);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = a;
    ctx.drawImage(c, 0, 0, w, h, x0, y0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // Copy the w x h region of canvas src at (sx, sy) to (0, 0) of context x, 1:1, clipped to
  // src (a source rectangle outside the image is not drawn at all by some older engines).
  function blit(x, src, sx, sy, w, h) {
    var a = Math.max(0, sx), b = Math.max(0, sy), c = Math.min(src.width, sx + w), d = Math.min(src.height, sy + h);
    if (c > a && d > b) x.drawImage(src, a, b, c - a, d - b, a - sx, b - sy, c - a, d - b);
  }

  // depth-scaled radius (near parts slightly larger, as in the projection)
  function rz(M, P, i, r) { return r * M.rk * (1 + (P[i * 3 + 2] - M.zRef) / PERSP); }

  FP._stCap = function (ctx, M, ax, ay, az, ra, bx, by, bz, rb, cap, acc) {
    var sc = M.sc;
    ctx.fillStyle = cylGrad(ctx, M, ax, ay, ra, bx, by, rb, (bx - ax) / sc, -(by - ay) / sc, bz - az, acc);
    ctx.beginPath();
    piece(ctx, ax, ay, ra, bx, by, rb, cap);
    ctx.fill();
  };
  // Depth slope of bone i -> j: depth change per unit of screen length (camera units).
  function slope(P, i, j, sc) {
    var a = i * 3, b = j * 3, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], l = Math.sqrt(dx * dx + dy * dy) / sc;
    return clamp((P[b + 2] - P[a + 2]) / Math.max(l, 1e-4), -4, 4);
  }
  // Two bones meeting at a joint are shaded as if their tilt toward the viewer were partly
  // shared (JOINT_BLEND), so the light changes by a smaller step across a knee or elbow
  // (a real limb's shading turns smoothly there).
  var JOINT_BLEND = 0.35;

  // A limb piece from (ax, ay) to joint j: path radii ri -> rj (flat ends), plus ball joints
  // of radius bi at the start and bj at j (0 = none), filled once with one gradient (gi,
  // gj = the radii the shading spans; sl = depth slope used for the shading), so the balls
  // read as the piece's own rounded ends. Radii are in pixels (see rz).
  FP._stPiece = function (ctx, M, P, ax, ay, j, ri, rj, bi, bj, gi, gj, sl) {
    var b = j * 3, dx = P[b] - ax, dy = P[b + 1] - ay;
    ctx.fillStyle = cylGrad(ctx, M, ax, ay, gi, P[b], P[b + 1], gj, dx, -dy, sl * Math.sqrt(dx * dx + dy * dy));
    ctx.beginPath();
    piece(ctx, ax, ay, ri, P[b], P[b + 1], rj, 0);
    if (bi > 0) circle(ctx, ax, ay, bi);
    if (bj > 0) circle(ctx, P[b], P[b + 1], bj);
    ctx.fill();
  };

  FP._stArm = function (ctx, s, P, M) {
    var sh = s === 'L' ? SHL : SHR, el = sh + 1, wr = sh + 2, A = ST_ARM, sc = M.sc, k = JOINT_BLEND;
    var s3 = sh * 3, o3 = (s === 'L' ? SHR : SHL) * 3, n3 = NECK * 3, c3 = CHEST * 3;
    var su = slope(P, sh, el, sc), sf = slope(P, el, wr, sc);
    // upper arm: deltoid ball, tapering arm, elbow ball. The ball sits below and a little
    // inside the joint, so its top meets the trapezius instead of standing up like an
    // epaulette; less so as the arm rises (cos of the arm to the spine, 1 = hanging).
    var e3 = el * 3, sx = P[c3] - P[n3], sy = P[c3 + 1] - P[n3 + 1], sz = P[c3 + 2] - P[n3 + 2];
    var hang = ((P[e3] - P[s3]) * sx + (P[e3 + 1] - P[s3 + 1]) * sy) / (sc * sc) + (P[e3 + 2] - P[s3 + 2]) * sz;
    hang = clamp(0.5 + 0.5 * hang / (B.uarm * B.sp2), 0, 1);
    var dk = A.deltDown * hang / B.sp2, ik = A.deltIn / (2 * B.shw);
    var bx = P[s3] + (P[c3] - P[n3]) * dk + (P[o3] - P[s3]) * ik, by = P[s3 + 1] + (P[c3 + 1] - P[n3 + 1]) * dk + (P[o3 + 1] - P[s3 + 1]) * ik;
    var rd = rz(M, P, sh, A.delt), re = rz(M, P, el, A.elbow);
    this._stPiece(ctx, M, P, bx, by, el, rz(M, P, sh, A.up[0]), rz(M, P, el, A.up[1]), rd, re, rd, re, lerp(su, sf, k));
    // forearm: starts flat inside the elbow ball, ends in the wrist ball
    var f0 = rz(M, P, el, A.fore[0]), f1 = rz(M, P, wr, A.fore[1]), e = el * 3, w = wr * 3;
    this._stPiece(ctx, M, P, P[e], P[e + 1], wr, f0, f1, 0, rz(M, P, wr, A.wrist), f0, f1, lerp(sf, su, k));
    if (!M.low) { // accent wristband
      var t0 = 0.74, t1 = 0.9;
      var x0 = lerp(P[e], P[w], t0), y0 = lerp(P[e + 1], P[w + 1], t0), z0 = lerp(P[e + 2], P[w + 2], t0);
      var x1 = lerp(P[e], P[w], t1), y1 = lerp(P[e + 1], P[w + 1], t1), z1 = lerp(P[e + 2], P[w + 2], t1);
      this._stCap(ctx, M, x0, y0, z0, lerp(f0, f1, t0) * 1.08, x1, y1, z1, lerp(f0, f1, t1) * 1.08, 0, M.acc1);
    }
    this._stHand(ctx, s, P, M);
  };

  // Hand: a flat mitten (narrow wrist, wide palm, rounded fingertips). Its width on screen
  // follows how the palm is turned: the palm faces away from the bend of the wrist (a
  // planted hand faces the floor), or the body's side when the wrist is straight; the two
  // estimates are blended by how much the wrist bends.
  function palmHalf(A, hx, hy, hz, nx, ny, nz, px, py) {
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-6) return A[1];
    nx /= l; ny /= l; nz /= l;
    var wx = hy * nz - hz * ny, wy = hz * nx - hx * nz; // wide axis = hand x palm normal
    return Math.sqrt(sq(A[1] * (wx * px + wy * py)) + sq(A[2] * (nx * px + ny * py)));
  }
  FP._stHand = function (ctx, s, P, M) {
    var sh = s === 'L' ? SHL : SHR, el = sh + 1, wr = sh + 2, ha = sh + 3, A = ST_ARM.hand, sc = M.sc;
    var e3 = el * 3, w3 = wr * 3, h3 = ha * 3, k;
    var hx = (P[h3] - P[w3]) / sc, hy = -(P[h3 + 1] - P[w3 + 1]) / sc, hz = P[h3 + 2] - P[w3 + 2];
    var hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    hx /= hl; hy /= hl; hz /= hl;
    var pl = Math.sqrt(hx * hx + hy * hy), px = pl > 1e-4 ? -hy / pl : 1, py = pl > 1e-4 ? hx / pl : 0; // screen normal of the axis
    var half = A[1];
    if (!M.low) {
      var fx = (P[w3] - P[e3]) / sc, fy = -(P[w3 + 1] - P[e3 + 1]) / sc, fz = P[w3 + 2] - P[e3 + 2];
      k = fx * hx + fy * hy + fz * hz; fx -= k * hx; fy -= k * hy; fz -= k * hz; // forearm off the hand axis
      var r3 = SHR * 3, l3 = SHL * 3, rx = (P[r3] - P[l3]) / sc, ry = -(P[r3 + 1] - P[l3 + 1]) / sc, rzz = P[r3 + 2] - P[l3 + 2];
      k = rx * hx + ry * hy + rzz * hz; rx -= k * hx; ry -= k * hy; rzz -= k * hz; // shoulder line off it
      var w = clamp((Math.sqrt(fx * fx + fy * fy + fz * fz) / B.farm - 0.12) / 0.3, 0, 1);
      half = lerp(palmHalf(A, hx, hy, hz, rx, ry, rzz, px, py), palmHalf(A, hx, hy, hz, fx, fy, fz, px, py), w);
      half = lerp(half, A[1], 0.5); // seen edge-on a hand still shows its thumb: keep it legible
    }
    var zk = M.rk * (1 + (P[w3 + 2] - M.zRef) / PERSP);
    var rw = A[0] * zk, rp = Math.max(half, A[0] * 1.05) * zk, rt = Math.min(rp, A[3] * zk);
    var t = ST_ARM.palmAt, kx = lerp(P[w3], P[h3], t), ky = lerp(P[w3 + 1], P[h3 + 1], t);
    ctx.fillStyle = cylGrad(ctx, M, P[w3], P[w3 + 1], rp, P[h3], P[h3 + 1], rp, hx, hy, hz);
    ctx.beginPath();
    piece(ctx, P[w3], P[w3 + 1], rw, kx, ky, rp, 0);
    piece(ctx, kx, ky, rp, P[h3], P[h3 + 1], rt, 2);
    ctx.fill();
  };

  FP._stLeg = function (ctx, s, P, M) {
    var hip = s === 'L' ? HIPL : HIPR, kn = hip + 1, an = hip + 2, sc = M.sc, L = ST_LEG;
    var st = slope(P, hip, kn, sc), ss = slope(P, kn, an, sc), sl;
    // thigh: rounded top (the hip, centred a little inside the joint so the hips are not
    // wider than the pelvis), tapering to the knee ball
    var rh = rz(M, P, hip, L.hip), rk = rz(M, P, kn, L.knee), h = hip * 3, k = kn * 3, a = an * 3, p3 = PELVIS * 3;
    var hin = L.hipIn / B.hipw;
    var hx = P[h] + (P[p3] - P[h]) * hin, hy = P[h + 1] + (P[p3 + 1] - P[h + 1]) * hin;
    var dx = P[k] - hx, dy = P[k + 1] - hy;
    sl = lerp(st, ss, JOINT_BLEND);
    ctx.fillStyle = cylGrad(ctx, M, hx, hy, rh, P[k], P[k + 1], rk, dx, -dy, sl * Math.sqrt(dx * dx + dy * dy));
    ctx.beginPath();
    piece(ctx, hx, hy, rh, P[k], P[k + 1], rz(M, P, kn, L.thigh), 1);
    circle(ctx, P[k], P[k + 1], rk);
    ctx.fill();
    // shin: starts flat inside the knee ball, swells at the calf, ends in the ankle ball
    var t = L.calfAt, cx = lerp(P[k], P[a], t), cy = lerp(P[k + 1], P[a + 1], t);
    var r0 = rz(M, P, kn, L.shin), rc = rz(M, P, kn, L.calf), ra = rz(M, P, an, L.ankle);
    dx = P[a] - P[k]; dy = P[a + 1] - P[k + 1];
    var dl = Math.sqrt(dx * dx + dy * dy) || 1, ov = 0.6 / dl, vz = lerp(ss, st, JOINT_BLEND) * dl;
    if (dl > rc) {
      ctx.fillStyle = cylGrad(ctx, M, P[k], P[k + 1], r0, cx, cy, rc, dx, -dy, vz);
      ctx.beginPath(); piece(ctx, P[k], P[k + 1], r0, cx + dx * ov, cy + dy * ov, rc, 0); ctx.fill();
      ctx.fillStyle = cylGrad(ctx, M, cx, cy, rc, P[a], P[a + 1], ra, dx, -dy, vz);
      ctx.beginPath(); piece(ctx, cx, cy, rc, P[a], P[a + 1], ra, 2); ctx.fill();
    } else {
      this._stPiece(ctx, M, P, P[k], P[k + 1], an, rc, ra, 0, ra, rc, ra, ss);
    }
    this._stFoot(ctx, s, P, M);
  };

  // Sneaker-like foot: heel->toe capsule + instep over an accent midsole (a copy pushed
  // toward the sole and drawn first, so only its edge shows).
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
    // same size as the foot, only pushed toward the sole: it shows as an edge on the sole
    // side and shrinks away as the sole turns toward or away from the viewer (never a ring)
    if (!M.low) cap(addS(heel, fd, 0.009), 0.0225, addS(toe, fd, 0.009), 0.0125, M.acc2);
    cap(heel, 0.0225, toe, 0.0125);
    cap(ins0, 0.024, ins1, 0.0185);
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
    // neck first (the torso's trapezius slope overlaps its base); the head is drawn as
    // its own group (_stOrder)
    var nb = addS(nek, u2, -0.03);
    var nt = add(nek, mul(sub(hd, nek), 0.6));
    this._stCap(ctx, M, nb[0] * sc, -nb[1] * sc, nb[2], rz(M, P, NECK, ST_NECK[0]), nt[0] * sc, -nt[1] * sc, nt[2], rz(M, P, NECK, ST_NECK[1]), 3);
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
    var pc = addS(addS(pel, Fh, -0.004), u1, ST_PELVIS[3]);
    var pe = projEllipse([mul(Rh2, ST_PELVIS[0]), mul(Fh, ST_PELVIS[1]), mul(u1, ST_PELVIS[2])], sc * zk * (M.low ? 1.06 : 1));
    var pw = Math.sqrt(sq(Lp[0][0] - Rp[0][0]) + sq(Lp[0][1] - Rp[0][1])) / 2;
    var ppx = pc[0] * sc, ppy = -pc[1] * sc, uu = sub(che, pel);
    var ux = uu[0] * sc, uy = -uu[1] * sc, ul = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= ul; uy /= ul;
    var tx0 = sub(nek, pel);
    ctx.fillStyle = cylGrad(ctx, M, ppx - ux * pw, ppy - uy * pw, pw, ppx + ux * pw, ppy + uy * pw, pw, tx0[0], tx0[1], tx0[2] * ST_TILT);
    ctx.beginPath();
    ctx.ellipse(ppx, ppy, pe.rx, pe.ry, pe.th, 0, TAU);
    ctx.fill();
    if (M.low) {
      var ax = sub(nek, pel), mx = 0, my = 0;
      for (i = 1; i < n - 1; i++) { mx += cx[i]; my += cy[i]; }
      mx /= (n - 2); my /= (n - 2);
      var al = len(ax) || 1, sx2 = ax[0] / al * sc, sy2 = -ax[1] / al * sc, sl = Math.sqrt(sx2 * sx2 + sy2 * sy2) || 1;
      var hl = Math.max(4, sl * al * 0.5);
      ctx.fillStyle = cylGrad(ctx, M, mx - sx2 / sl * hl, my - sy2 / sl * hl, wmax, mx + sx2 / sl * hl, my + sy2 / sl * hl, wmax, ax[0], ax[1], ax[2] * ST_TILT);
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
        if (j < n - 1 || !lastG) lastG = slabGrad(ctx, M, Lp[i], Lp[j], Rp[i], Rp[j], tax[0], tax[1], tax[2] * ST_TILT);
        ctx.fillStyle = lastG;
        ctx.beginPath(); outline(); ctx.fill();
        ctx.restore();
      }
    }
  };

  // Ellipse through 2D semi-axis vectors (x0, y0), (x1, y1), (x2, y2): o = [th, rx, ry].
  function ell2(o, x0, y0, x1, y1, x2, y2) {
    var sxx = x0 * x0 + x1 * x1 + x2 * x2, sxy = x0 * y0 + x1 * y1 + x2 * y2, syy = y0 * y0 + y1 * y1 + y2 * y2;
    var mid = (sxx + syy) / 2, dd = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) / 4 + sxy * sxy));
    o[0] = 0.5 * Math.atan2(2 * sxy, sxx - syy); o[1] = Math.sqrt(mid + dd); o[2] = Math.sqrt(Math.max(1e-9, mid - dd));
    return o;
  }

  // Head: an ellipsoid cranium set a little forward of the neck, plus a small jaw below and
  // in front of it so the facing reads in profile. Both are one outline, shaded as one
  // sphere: diffuse along the light, darker toward the edge away from it, a soft highlight.
  // (The rim light is the silhouette pass.)
  FP._stHead = function (ctx, P, M) {
    var sc = M.sc, i, Q = ST_HEAD;
    function cam(j) { return [P[j * 3] / sc, -P[j * 3 + 1] / sc, P[j * 3 + 2]]; }
    var hd = cam(HEAD), nk = cam(NECK), fc = cam(FACE);
    var u3 = norm(sub(hd, nk)), F = sub(fc, hd);
    F = sub(F, mul(u3, dot(F, u3)));
    F = len(F) > 1e-4 ? norm(F) : norm(cross(u3, [0, 0, 1]));
    var R = cross(F, u3);
    var z = 1 + (hd[2] - M.zRef) / PERSP, k = sc * z, A = Q.skull, J = Q.jaw;
    var e = projEllipse([mul(u3, A[0]), mul(F, A[1]), mul(R, A[2])], k);
    var x = (hd[0] + (u3[0] * Q.up + F[0] * Q.fwd) * z) * sc, y = -(hd[1] + (u3[1] * Q.up + F[1] * Q.fwd) * z) * sc;
    var th = e.th, rx = e.rx, ry = e.ry, ct = Math.cos(th), st = Math.sin(th);
    // screen vector (dx, dy) in the cranium's unit-circle frame
    function lx(dx, dy) { return (dx * ct + dy * st) / rx; }
    function ly(dx, dy) { return (-dx * st + dy * ct) / ry; }
    function local(dx, dy) {
      var a = lx(dx, dy), b = ly(dx, dy), l = Math.sqrt(a * a + b * b) || 1;
      return [a / l, b / l];
    }
    // jaw: centre offset and semi-axes on screen, then into the local frame
    var ox = (F[0] * J[0] + u3[0] * J[1]) * k, oy = -(F[1] * J[0] + u3[1] * J[1]) * k;
    var a0x = u3[0] * J[2] * k, a0y = -u3[1] * J[2] * k, a1x = F[0] * J[3] * k, a1y = -F[1] * J[3] * k, a2x = R[0] * J[4] * k, a2y = -R[1] * J[4] * k;
    var je = ell2(this._je || (this._je = [0, 0, 0]), lx(a0x, a0y), ly(a0x, a0y), lx(a1x, a1y), ly(a1x, a1y), lx(a2x, a2y), ly(a2x, a2y));
    var jx = lx(ox, oy), jy = ly(ox, oy);
    var L = local(KEY2[0], -KEY2[1]);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(th); ctx.scale(rx, ry);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.moveTo(jx + je[1] * Math.cos(je[0]), jy + je[1] * Math.sin(je[0]));
    ctx.ellipse(jx, jy, je[1], je[2], je[0], 0, TAU);
    // 1. diffuse along the light axis (lit edge -> dark edge)
    var g = ctx.createLinearGradient(L[0], L[1], -L[0], -L[1]);
    var S = M.low ? [1, 0.2, -0.8] : [1, 0.75, 0.45, 0.15, -0.15, -0.45, -0.75, -1];
    var sk = M.specK, s2k = M.spec2K; M.specK = 0; M.spec2K = 0;
    for (i = 0; i < S.length; i++) {
      var sv = S[i], cz = Math.sqrt(Math.max(0, 1 - sv * sv));
      SN[0] = sv * KEY2[0]; SN[1] = sv * KEY2[1]; SN[2] = cz; SN[3] = 0;
      g.addColorStop((1 - sv) / 2, rgba(stShade(M, null)));
    }
    M.specK = sk; M.spec2K = s2k;
    ctx.fillStyle = g;
    ctx.fill();
    if (!M.low) {
      // 2. silhouette fall-off, strongest away from the light (sphere, not cylinder)
      var o = 0.28, ge = ctx.createRadialGradient(L[0] * o, L[1] * o, 0, L[0] * o, L[1] * o, 1 + o);
      var dk = M.ramp[0][1];
      ge.addColorStop(0, rgba(dk, 0)); ge.addColorStop(0.55, rgba(dk, 0)); ge.addColorStop(0.8, rgba(dk, 0.12));
      ge.addColorStop(1, rgba(dk, 0.42));
      ctx.fillStyle = ge;
      ctx.fill();
      // 3. specular spot
      var H = local(HALFV[0], -HALFV[1]), hl = Math.sqrt(HALFV[0] * HALFV[0] + HALFV[1] * HALFV[1]);
      var hx = H[0] * hl, hy = H[1] * hl, gs = ctx.createRadialGradient(hx, hy, 0, hx, hy, M.spotR);
      gs.addColorStop(0, rgba(M.spec, clamp(0.75 * sk, 0, 1))); gs.addColorStop(0.4, rgba(M.spec, clamp(0.25 * sk, 0, 1)));
      gs.addColorStop(1, rgba(M.spec, 0));
      ctx.fillStyle = gs;
      ctx.fill();
      if (M.rim2K > 0.01) { // kicker crescent on the key side
        var Kd = local(-RIMX, -RIMY), ko = 0.22;
        var gk = ctx.createRadialGradient(-Kd[0] * ko, -Kd[1] * ko, 0, -Kd[0] * ko, -Kd[1] * ko, 1 + ko);
        var ks = clamp(1 - 0.16 * Math.sqrt(8 / M.rim2Pow), 0.6, 0.9);
        gk.addColorStop(0, rgba(M.rim2, 0)); gk.addColorStop(ks, rgba(M.rim2, 0));
        gk.addColorStop(1, rgba(M.rim2, clamp(0.6 * M.rim2K, 0, 1)));
        ctx.fillStyle = gk;
        ctx.fill();
      }
    }
    ctx.restore();
  };

  // Soft shadow a near part casts on what is already drawn behind it. The part's silhouette
  // is rasterised into a coarse buffer and composited upscaled (= blurred, no filter or
  // shadowBlur needed) with source-atop, so only body pixels darken. Only the overlap of
  // its bounding box with the box of what is drawn so far (D) is touched. The torso's
  // shadow includes the head's. It is the costliest pass of a frame (a smoothed upscale
  // over each part's box), and below OCC_MIN CSS px it is skipped: at that size its soft
  // edge is a pixel or two and the overlaps still read from the draw order and the rim light.
  var OCC_MIN = 200;
  FP._stOcclude = function (ctx, g, P, M, D) {
    if (this._noOcc) return;
    var sc = M.sc, mat = this.mat, i, n, L;
    var ob = this._buf('obuf');
    if (!ob) return;
    var cell = clamp(0.016 * sc, 2, 9), b = ob.c, bc = ob.x;
    var bw = Math.ceil(this.W / cell) + 4, bh = Math.ceil(this.H / cell) + 4;
    if (b.width < bw || b.height < bh) { b.width = Math.max(b.width, bw); b.height = Math.max(b.height, bh); }
    var ox = -KEY2[0] * 0.012 * sc, oy = KEY2[1] * 0.012 * sc, grow = 0.006 * sc;
    var head = g === 'T', x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (n = 0; n < 2; n++) {
      L = n ? (head ? ST_OCC.H : null) : ST_OCC[g];
      for (i = 0; L && i < L.length; i++) {
        for (var e = 0; e < 2; e++) {
          var j = L[i][e] * 3, r = L[i][2 + e] * sc * 1.1 + grow;
          x0 = Math.min(x0, P[j] - r); x1 = Math.max(x1, P[j] + r); y0 = Math.min(y0, P[j + 1] - r); y1 = Math.max(y1, P[j + 1] + r);
        }
      }
    }
    // the shadow lands offset by (ox, oy) and only darkens what is already drawn
    var pad = 3 * cell;
    x0 = Math.max(x0 - pad, D[0] - cell - ox); y0 = Math.max(y0 - pad, D[1] - cell - oy);
    x1 = Math.min(x1 + pad, D[2] + cell - ox); y1 = Math.min(y1 + pad, D[3] + cell - oy);
    // buffer origin sits 2 cells left/up of the canvas so nothing is clipped at the edges
    var o2 = 2 * cell;
    var bx0 = Math.max(0, Math.floor((x0 + o2) / cell)), by0 = Math.max(0, Math.floor((y0 + o2) / cell));
    var bx1 = Math.min(b.width, Math.ceil((x1 + o2) / cell)), by1 = Math.min(b.height, Math.ceil((y1 + o2) / cell));
    if (bx1 <= bx0 || by1 <= by0) return;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, b.width, b.height);
    bc.setTransform(1 / cell, 0, 0, 1 / cell, 2, 2);
    bc.fillStyle = rgba(mat.ao);
    bc.beginPath();
    for (n = 0; n < 2; n++) {
      L = n ? (head ? ST_OCC.H : null) : ST_OCC[g];
      for (i = 0; L && i < L.length; i++) {
        var a = L[i][0] * 3, c = L[i][1] * 3;
        capsule(bc, P[a], P[a + 1], rz(M, P, L[i][0], L[i][2]) + grow, P[c], P[c + 1], rz(M, P, L[i][1], L[i][3]) + grow);
      }
    }
    if (head) {
      capsule(bc, P[PELVIS * 3], P[PELVIS * 3 + 1], 0.085 * sc, P[NECK * 3], P[NECK * 3 + 1], 0.08 * sc);
      circle(bc, P[HEAD * 3], P[HEAD * 3 + 1], 0.066 * sc);
    }
    bc.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = mat.aoK;
    ctx.imageSmoothingEnabled = true;
    // bilinear: these fields are smooth, so 'high' (bicubic in Chrome) looks the same and costs more
    try { ctx.imageSmoothingQuality = 'low'; } catch (err) { /* ignore */ }
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

  // Scratch canvases (xbuf: dissolve snapshot, rbuf: rim, obuf: occlusion, gbuf: contact
  // shadows), created on first use.
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
  // Release scratch canvas `key` now (a zero-size backing store frees its memory at once,
  // not when the element is collected); _buf() makes a new one when it is needed again.
  function drop(o, key) {
    var b = o[key];
    if (b) { try { b.c.width = b.c.height = 0; } catch (e) { /* ignore */ } o[key] = null; }
  }
  FP._freeBufs = function () {
    drop(this, 'xbuf'); drop(this, 'rbuf'); drop(this, 'obuf'); drop(this, 'gbuf');
    this._xf = null; this._shT = null; this._shImg = null;
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
    // (every blob fades out continuously before it is dropped: a blob that vanishes at some
    // height or strength in one step makes the shadow pop from one frame to the next)
    function blob(x, y, rx, a) {
      if (a < 0.001 || rx < 0.3) return;
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
        blob(x, y, (r * 2.6 + 0.03 + h * 0.8) * sc, K * 0.1 * Math.exp(-h / 0.16) * clamp((0.4 - h) / 0.2, 0, 1));
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
      // keep the whole ellipse inside the canvas so its edge never shows as a box
      var pcx = (x0 + x1) / 2;
      pr = Math.min(pr, Math.min(pcx, this.W - pcx) * 0.9, Math.max(0, this.H - sy) / Math.max(flat, 0.05) * 0.9, sy / Math.max(flat, 0.05) * 0.9);
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

  // Shadow grid of an exercise on this canvas, stored on its fit f: one cell size for the
  // whole cycle (so the sampling never changes between frames) and the largest grid it can
  // need. The bound: the floor footprint of the joints over the cycle, widened by the
  // largest blob _stGround makes (the broad one under the body, or a raised torso part's).
  var TMPG = new Float32Array(NJ * 3);
  function shadowGrid(ex, f, W, H) {
    var sc = f.sc, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, N = 24;
    var src = ex._base || ex; // a tempo / count-in variant: sample the move itself (a count-in tracks its wait)
    for (var n = 0; n < N; n++) {
      groundProject(safePose(src, n / N, n / N * src.period), ex, f, TMPG);
      for (var i = 0; i < NJ; i++) {
        if (i === FACE) continue;
        var x = TMPG[i * 3], y = TMPG[i * 3 + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    var flat = clamp(camSetup(ex).sp * 1.25 + 0.12, 0.16, 0.5);
    var rx = Math.max((x1 - x0) / 2 + 0.16 * sc, 0.7 * sc);
    var bw = Math.min(x1 - x0 + 2 * rx, W + 16), bh = Math.min(y1 - y0 + 2 * rx * flat, H + 16);
    var cell = Math.max(clamp(0.011 * sc, 1.5, 5), Math.sqrt(bw * bh / SH_MAX));
    f.shCell = cell;
    f.shW = Math.ceil((W + 16) / cell) + 3; f.shH = Math.ceil((H + 16) / cell) + 3;
  }

  // Analytic soft shadow: transmittance product of smooth elliptical falloffs, evaluated
  // per coarse cell over the blobs' bounding box. The cells sit on a fixed lattice (origin
  // on whole cells, size fixed per exercise), so a moving blob slides across them instead
  // of the samples jumping with the box. Returns false if it could not run.
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
    var fit = this._fit(this.ex), cell = fit.shCell;
    // cell (c, r) centre = o + (c + 0.5) * cell, with one empty cell of margin all round
    var ox = (Math.floor(bx0 / cell) - 1) * cell, oy = (Math.floor(by0 / cell) - 1) * cell;
    var gw = Math.min(fit.shW, Math.ceil((bx1 - ox) / cell) + 1), gh = Math.min(fit.shH, Math.ceil((by1 - oy) / cell) + 1);
    var T = this._shT;
    if (!T || T.length < gw * gh) T = this._shT = new Float32Array(Math.max(gw * gh, 4096));
    for (i = 0; i < gw * gh; i++) T[i] = 1;
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
    // one ImageData at the largest grid this exercise can need; each frame writes its part
    var cv = buf.c, x = buf.x, img = this._shImg;
    if (!img || img.width < fit.shW || img.height < fit.shH) {
      img = this._shImg = x.createImageData(Math.max(fit.shW, img ? img.width : 0), Math.max(fit.shH, img ? img.height : 0));
    }
    if (cv.width < img.width + 2 || cv.height < img.height + 2) {
      cv.width = Math.max(cv.width, img.width + 2); cv.height = Math.max(cv.height, img.height + 2);
    }
    var D = img.data, stride = img.width * 4, cr = col[0] | 0, cg = col[1] | 0, cb = col[2] | 0;
    for (var rr = 0; rr < gh; rr++) {
      for (var cc = 0, k = rr * stride, ti = rr * gw; cc < gw; cc++, k += 4, ti++) {
        var al = (1 - T[ti]) * 255;
        D[k] = cr; D[k + 1] = cg; D[k + 2] = cb; D[k + 3] = al > 255 ? 255 : al;
      }
    }
    // The buffer is reused: clear a band beyond the part written now, or the smoothing of
    // the upscale below pulls in whatever an earlier, larger grid left there.
    x.clearRect(0, 0, gw + 2, gh + 2);
    x.putImageData(img, 0, 0, 0, 0, gw, gh);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'low'; } catch (err) { /* ignore */ } // (bilinear, as in _stOcclude)
    ctx.drawImage(cv, 0, 0, gw, gh, ox, oy, gw * cell, gh * cell);
    return true;
  };

  /* ------------------------------------------------------------ public API */
  // An exercise shown at another tempo (loop length), cached per base + period.
  function tempoOf(base, period) {
    if (Math.abs(period - base.period) < 1e-6) return base;
    exBox(base); // the variant shares the base's framing caches
    var c = base._tempo || (base._tempo = {}), k = period.toFixed(3);
    if (!c[k]) { c[k] = Object.create(base); c[k]._base = base; c[k].period = period; }
    return c[k];
  }
  // A count-in (fresh per call): while its clock is below `from` (a loop boundary just after
  // `ready` s before the go at time 0) it demonstrates the loop; from there on it waits in
  // the start pose (ex.readyPose, else the loop's first frame), breathing, until the next
  // setExercise().
  function countInOf(base, period, ready) {
    exBox(base); // the variant shares the base's framing caches
    var v = Object.create(base), w = v._wait = { from: Math.min(0, period * Math.ceil(-ready / period - 1e-9)), on: false, J: null };
    v._base = base; v.period = period;
    v.pose = function (p, t) {
      w.on = !(t < w.from);
      return (w.J = w.on ? breathe(base.readyPose ? base.readyPose() : base.pose(0, 0), t - w.from) : base.pose(p, t));
    };
    if (base.orderAt) v.orderAt = function (p) { return base.orderAt(w.on ? 0 : p); };
    return v;
  }
  // Waiting: a slow breath (BREATH_S per cycle, from rest at s = 0) lifts the chest and the
  // shoulders by up to BREATH_A (~7 mm). A bent arm keeps its hand where it is (resting on a
  // thigh, say) and bends a little less; a (nearly) straight one rises whole. Which, depends
  // on the pose held, not on the breath, so an arm never flips between the two.
  var BREATH_S = 3.6, BREATH_A = 0.004;
  function breathe(J, s) {
    var a = BREATH_A * (0.5 - 0.5 * Math.cos(TAU * s / BREATH_S)), O = {}, i;
    for (i = 0; i < NJ; i++) O[JN[i]] = J[JN[i]];
    if (!(a > 1e-6)) return O;
    var up = [0, a, 0];
    O.chest = addS(J.chest, Y, 0.6 * a);
    O.neck = add(J.neck, up); O.head = add(J.head, up); O.face = add(J.face, up);
    for (i = 0; i < 2; i++) {
      var s1 = SIDES[i][0], sh = J['sh' + s1], wr = J['wr' + s1], nsh = O['sh' + s1] = add(sh, up);
      if (len(sub(wr, sh)) < (B.uarm + B.farm) * 0.94) O['el' + s1] = ik(nsh, wr, B.uarm, B.farm, sub(J['el' + s1], sh))[0];
      else { O['el' + s1] = add(J['el' + s1], up); O['wr' + s1] = add(wr, up); O['ha' + s1] = add(J['ha' + s1], up); }
    }
    return O;
  }
  // The go after a count-in: the loop runs on its own clock from time t0 and eases out of the
  // last count-in pose J0 over its first 0.3 s (a blend of skeletons: the clock never stops).
  function goOf(base, period, J0, t0) {
    exBox(base);
    var v = Object.create(base);
    v._base = base; v.period = period;
    v.pose = function (p, t) {
      var J = base.pose(p, t), k = (t - t0) / 0.3;
      if (!(k < 1)) return J;
      k = sine(Math.max(0, k));
      var O = {};
      for (var i = 0; i < NJ; i++) O[JN[i]] = lerp3(J0[JN[i]], J[JN[i]], k);
      return O;
    };
    return v;
  }
  /**
   * Show another exercise. opts.instant: no cross-dissolve from what is shown now;
   * opts.time: start at that point of the loop (hand over from another figure; the clock
   *   runs through the dissolve, so the loop is on time all along);
   * opts.period: loop length in seconds for this showing (tempo; default: the exercise's own).
   *   A showing at an explicit tempo follows a count, so it keeps real time even where
   *   reduced motion slows the figures to half speed;
   * opts.ready: count-in, with a negative opts.time (seconds until the go): the move is
   *   demonstrated until about `ready` s before the go, then the figure waits in its start
   *   pose until setExercise(sameId, {time}) starts the loop on time, easing out of the wait.
   */
  FP.setExercise = function (id, opts) {
    if (this.dead) return;
    opts = opts || {};
    var base = getEx(id), hasT = opts.time != null, t = num(opts.time, 0);
    var per = num(opts.period, 0), paced = per > 0, ready = Math.max(0, num(opts.ready, 0));
    per = paced ? clamp(per, 0.2, 60) : base.period;
    var cur = this.ex, J0 = hasT && !opts.instant && cur && cur._wait && cur._base === base ? cur._wait.J : null;
    var ex = J0 ? goOf(base, per, J0, t) : hasT && t < 0 && ready > 0 ? countInOf(base, per, ready) : tempoOf(base, per);
    if (ex === this.ex && !hasT) return;
    if (opts.instant) {
      this.morphT = 1;
    } else if (J0) {
      // the go after a count-in: the loop eases out of the waiting pose itself (a dissolve
      // already in flight carries on)
    } else if (this.hasPose && this.W > 0) {
      this.fromEx = this.ex; this._xfN++; this.morphT = 0; // the next frame snapshots what is shown
    } else {
      this.morphT = 1;
    }
    this.ex = ex;
    this.paced = paced;
    this.time = t;
    if (this._glide) this._glide.d = 0;
    this._still = false;
  };
  /**
   * Move the loop's clock to t seconds, at once (no dissolve): for keeping a figure on a
   * count its own clock has drifted from (a stalled frame, a jump). With ease (seconds) the
   * clock still moves at once, but the pose shown catches up instead of popping: it runs a
   * little faster or slower, over at least `ease` and long enough that it never runs
   * backwards (see _computePose).
   */
  FP.setTime = function (t, ease) {
    t = +t;
    if (this.dead || !isFinite(t) || t === this.time) return;
    ease = num(ease, 0);
    var g = this._glide || (this._glide = { off: 0, t: 0, d: 0 });
    // how far the pose shown is from the new clock, as the nearest phase of the loop
    var per = this.ex.period, sh = this.time + g.off * glideLeft(g), off = (sh - t) / per;
    off = (off - Math.round(off)) * per;
    g.d = 0;
    if (ease > 0 && this.hasPose && this.morphT >= 1 && off) { g.off = off; g.t = 0; g.d = Math.max(ease, Math.abs(off) * 1.6); }
    this.time = t;
    this._still = false;
  };
  // What is left (1 -> 0) of a glide's offset.
  function glideLeft(g) { return g.d > 0 && g.t < g.d ? 1 - sine(g.t / g.d) : 0; }
  /** Seconds into the current exercise's loop (to hand over to another figure). */
  FP.getTime = function () { return this.time; };
  /** New accent colours; instant skips the cross-fade. */
  FP.setColors = function (primary, secondary, instant) {
    if (this.dead) return;
    this.c1a = this.c1; this.c2a = this.c2;
    this.c1b = parseColor(primary, this.c1b); this.c2b = parseColor(secondary, this.c2b);
    this.colT = instant ? 1 : 0;
    if (instant) { this.c1 = this.c1b; this.c2 = this.c2b; }
    this._still = false;
  };
  FP.setPlaying = function (b) { if (!this.dead) { this.playing = !!b; ensureLoop(); } };
  /** Stop drawing entirely (e.g. while covered by a sheet); resumes where it was. */
  FP.setSuspended = function (b) { if (!this.dead) { this.suspended = !!b; this._still = false; this._acc = 0; } };
  /** Rim-light energy 0..1; eases there unless instant (a hand-over from another figure). */
  FP.setEnergy = function (x, instant) {
    if (this.dead) return;
    this.energyT = clamp(num(x, this.energyT), 0, 1);
    if (instant) { this.energy = this.energyT; this._still = false; }
    ensureLoop();
  };
  /** A cue: the rim light flares and (high quality, full motion) a soft band of light sweeps across. */
  FP.pulse = function () {
    if (this.dead) return;
    this.flash = 1;
    if (!this.low && !reducedMotion() && this.hasPose) this.ring = 0;
    ensureLoop();
  };
  /**
   * Switch the scheme ('dark' | 'light') live, and the material too if one is given (as for
   * setMaterial), then repaint once, now. The style is always 'studio'.
   */
  FP.setStyle = function (style, scheme, material) {
    if (this.dead) return;
    if (material !== undefined) this.material = typeof material === 'string' ? material : null;
    this._setScheme(scheme === undefined ? this.scheme : scheme);
    this._still = false; this._acc = 0;
    this._paint();
  };
  /**
   * Pick a material preset by name (see HIITFigure.MATERIALS) and repaint now. It applies
   * while the scheme matches the preset's stage; otherwise (or for an unknown name / null)
   * the scheme's default is used. The choice survives setStyle().
   */
  FP.setMaterial = function (name) {
    if (!this.dead) this.setStyle('studio', this.scheme, typeof name === 'string' ? name : null);
  };
  /** Name of the material in use. */
  FP.getMaterial = function () { return this.mat.name; };
  FP._setScheme = function (scheme) {
    this.scheme = schemeOf(scheme);
    this.mat = buildMat(materialFor(this.material, this.scheme), this.matOpts);
    this.ring = -1;
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
    this._freeBufs();
    if (!registry.length && rafId) { caf(rafId); rafId = 0; lastT = 0; }
  };
  Object.defineProperty(FP, 'exercise', { get: function () { return exId(this.ex); } });

  // --- dev / test hooks (not part of the app contract) ---
  // Jump the exercise clock to t seconds (morph completed) and freeze there (freeze=false
  // keeps it running).
  FP._debugSetTime = function (t, freeze) {
    this.morphT = 1;
    this.time = t;
    if (this._glide) this._glide.d = 0;
    this._computePose();
    this._frozen = freeze !== false;
    this._still = false;
  };
  FP._debugStats = function () {
    var s = this._stats, r = { frames: s.frames, avgMs: s.frames ? s.ms / s.frames : 0, errors: this.errors };
    s.frames = 0; s.ms = 0;
    return r;
  };

  root.HIITFigure = {
    EXERCISES: EXERCISES.slice(),
    // material presets by stage; the first of each list is the default
    MATERIALS: { dark: ['stone', 'titanium'], light: ['graphite'] },
    create: function (canvas, opts) { return new Figure(canvas, opts); },
    _dev: {
      EX: EX, JN: JN, B: B,
      pose: function (id, p) { return safePose(getEx(id), p, p * getEx(id).period); },
      ikClamps: function () { var c = ikClamps; ikClamps = 0; return c; },
      // slow-device level (0: all passes, 1: no rim, 2: no occlusion either): a number sets it,
      // false also turns the guard off (steady captures on a busy machine)
      slow: function (v) {
        if (v === false) { slowGuard = false; v = 0; }
        if (v != null) { slowLevel = v | 0; registry.forEach(function (f) { f._still = false; }); }
        return slowLevel;
      },
      instances: function () { return registry.slice(); }
    }
  };
})(typeof window !== 'undefined' ? window : this);
