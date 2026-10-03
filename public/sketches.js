import { arc, astroid, bezier, heart, roundRect, spline, wave } from './ink.js';

const ICON = [160, 120];
const HERO = [520, 320];

function arrowHead(pen, color, width, tip, from, size = 9) {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  pen.line(color, width, [
    [tip[0] - size * Math.cos(angle - 0.5), tip[1] - size * Math.sin(angle - 0.5)],
    tip,
    [tip[0] - size * Math.cos(angle + 0.5), tip[1] - size * Math.sin(angle + 0.5)]
  ], { wobble: 0.3 });
}

function sparkle(pen, x, y, r) {
  pen.line(7, 2.2, astroid(x, y, r), { closed: true, wobble: 0.3, step: 2 });
}

function dashed(pen, color, points, dash = 11, gap = 8) {
  let segment = [points[0]];
  let run = 0;
  let drawing = true;
  for (let i = 1; i < points.length; i++) {
    run += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (drawing) segment.push(points[i]);
    if (drawing && run >= dash) {
      pen.line(color, 1.8, segment, { wobble: 0.2, step: 2 });
      drawing = false;
      run = 0;
    } else if (!drawing && run >= gap) {
      drawing = true;
      run = 0;
      segment = [points[i]];
    }
  }
  if (drawing && segment.length > 1) pen.line(color, 1.8, segment, { wobble: 0.2, step: 2 });
}

function coin(pen, cx, cy, r) {
  pen.line(7, 2.4, arc(cx, cy, r, r, -Math.PI / 2, 1.5 * Math.PI, 32), { closed: true, wobble: 0.3 });
  const s = r / 18;
  pen.line(7, 2.2, [[cx - 4 * s, cy + 10 * s], [cx - 4 * s, cy - 10 * s]], { wobble: 0.1 });
  pen.line(7, 2.2, spline([[cx - 4 * s, cy - 10 * s], [cx + 5 * s, cy - 10 * s], [cx + 8 * s, cy - 5 * s], [cx + 5 * s, cy], [cx - 4 * s, cy]], false, 6), { wobble: 0.1 });
  pen.line(7, 2.2, [[cx - 8 * s, cy + 5 * s], [cx + 4 * s, cy + 5 * s]], { wobble: 0.1 });
}

function shop(pen) {
  pen.line(2, 2.4, [[44, 62], [236, 62], [230, 86], [50, 86], [44, 62]], { closed: true, wobble: 0.5 });
  [82, 118, 154, 190].forEach(x => pen.line(2, 2, [[x, 62], [x + 1, 86]], { wobble: 0.2 }));
  for (let i = 0; i < 6; i++) pen.line(2, 2.2, arc(65 + i * 30, 86, 15, 11, 0, Math.PI, 12), { wobble: 0.2 });
  pen.line(0, 2.4, roundRect(58, 100, 164, 138, 6), { closed: true });
  pen.line(0, 2.4, roundRect(122, 168, 38, 70, 5), { closed: true, wobble: 0.4 });
  pen.dot(0, 5, 152, 204);
  pen.line(1, 2.2, roundRect(72, 118, 38, 34, 4), { closed: true, wobble: 0.3 });
  pen.line(1, 1.8, [[91, 118], [91, 152]], { wobble: 0.1 });
  pen.line(1, 2.2, roundRect(172, 118, 38, 34, 4), { closed: true, wobble: 0.3 });
  pen.line(1, 1.8, [[172, 135], [210, 135]], { wobble: 0.1 });
  pen.line(0, 2, wave(28, 250, 242, 1.4, 40), { wobble: 0.3 });
}

function cart(pen) {
  pen.line(0, 2.4, [[270, 146], [288, 150], [296, 164]], { wobble: 0.3 });
  pen.line(0, 2.4, [[296, 164], [396, 164], [382, 202], [308, 202], [296, 164]], { closed: true, wobble: 0.4 });
  pen.line(0, 2, [[312, 202], [316, 210]], { wobble: 0.1 });
  pen.line(0, 2, [[378, 202], [374, 210]], { wobble: 0.1 });
  pen.line(0, 2.4, arc(318, 219, 8, 8, 0, 2 * Math.PI, 18), { closed: true, wobble: 0.2 });
  pen.line(0, 2.4, arc(372, 219, 8, 8, 0, 2 * Math.PI, 18), { closed: true, wobble: 0.2 });
  pen.line(3, 2.4, roundRect(308, 138, 30, 26, 4), { closed: true, wobble: 0.3 });
  pen.line(2, 2.4, roundRect(344, 126, 34, 38, 4), { closed: true, wobble: 0.3 });
  pen.line(2, 1.8, [[344, 140], [378, 140]], { wobble: 0.1 });
}

function parcel(pen) {
  pen.line(5, 2.4, roundRect(428, 152, 62, 56, 4), { closed: true });
  pen.line(5, 2.2, [[428, 152], [448, 134], [510, 134], [490, 152]], { wobble: 0.3 });
  pen.line(5, 2.2, [[510, 134], [510, 190], [490, 208]], { wobble: 0.3 });
  pen.line(4, 2.2, [[459, 152], [459, 208]], { wobble: 0.1 });
  pen.line(4, 2.2, [[438, 143], [500, 143]], { wobble: 0.1 });
  pen.line(4, 2.2, spline([[469, 138], [458, 124], [450, 132], [469, 138], [484, 124], [490, 134], [469, 138]], false, 6), { wobble: 0.2 });
}

function pencil(pen) {
  const a = [124, 16];
  const b = [52, 88];
  const tip = [38, 102];
  const n = [0.707, 0.707];
  const w = 9;
  const side = (point, sign) => [point[0] + n[0] * w * sign, point[1] + n[1] * w * sign];
  pen.line(7, 2.4, [side(a, 1), side(b, 1)], { wobble: 0.4 });
  pen.line(7, 2.4, [side(a, -1), side(b, -1)], { wobble: 0.4 });
  pen.line(0, 2.4, [side(b, 1), tip, side(b, -1)], { wobble: 0.3 });
  pen.dot(0, 5, tip[0] + 2, tip[1] - 2);
  pen.line(4, 2.4, [side(a, 1), side([a[0] + 9, a[1] - 9], 1), side([a[0] + 9, a[1] - 9], -1), side(a, -1)], { wobble: 0.3 });
  pen.line(1, 2, spline([[36, 106], [18, 98], [12, 110], [26, 116], [52, 110], [74, 116], [96, 108]], false, 8), { wobble: 0.5 });
}

export const SKETCHES = {
  'market-hero': {
    size: HERO,
    jitter: 1.2,
    paint(pen) {
      shop(pen);
      dashed(pen, 5, bezier([228, 206], [248, 238], [262, 196], [266, 160], 32));
      cart(pen);
      dashed(pen, 5, bezier([398, 172], [404, 128], [410, 104], [422, 94], 28));
      arrowHead(pen, 5, 2, [424, 92], [414, 104], 8);
      coin(pen, 446, 80, 20);
      dashed(pen, 5, bezier([462, 98], [470, 108], [472, 114], [468, 126], 16));
      arrowHead(pen, 5, 2, [467, 128], [470, 114], 8);
      parcel(pen);
      pen.line(4, 2.2, heart(212, 34, 20), { closed: true, wobble: 0.3, step: 2 });
      sparkle(pen, 280, 60, 11);
      sparkle(pen, 500, 58, 9);
      sparkle(pen, 342, 262, 7);
    }
  },
  pencil: { size: ICON, paint: pencil }
};
