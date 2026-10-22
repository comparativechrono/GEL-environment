#!/usr/bin/env python3
"""
Draw the DNA double helix of the desktop wallpaper (assets/wallpaper/re-wallpaper.svg).

    python3 tools/wallpaper_helix.py

The helix is B-DNA seen from the side: right-handed, with the major and minor grooves, and ten and a half base
pairs to a turn. The script replaces the helix group of the wallpaper (from its comment to the end of the file's
last group) and leaves the rest of the SVG as it is.

Geometry, in the group's own coordinates (SVG y grows downwards; the helix axis is vertical at x = CX):
  strand A at height h = -y has angle a = 2*pi*h/P; it is at x = CX + R*cos(a), and nearer the viewer the larger
  -sin(a) is. Strand B is A turned by PHI, which leaves the minor groove (PHI of a turn along the axis) and the
  major groove (the rest of the turn) between the two backbones.
This is right-handed: where a strand passes in front of the axis it climbs from lower left to upper right ("/"),
as the near strand of B-DNA does when seen from the side. Each backbone fades where it is far from the viewer (a
gradient along the axis), and is cut where the other backbone passes in front of it (a mask).
"""
import math
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SVG = os.path.join(ROOT, 'assets', 'wallpaper', 're-wallpaper.svg')
MARK = '  <!-- B-DNA'

P = 480.0                  # one turn, px: the 720 px drawn are one and a half turns
R = 60.0                   # radius, px
CX = 60.0                  # the axis
H = 720.0                  # height drawn
PHI = 0.36 * 2 * math.pi   # B-DNA: minor groove ~12 A and major ~22 A, of a 34 A turn
BP_PER_TURN = 10.5
STEP = 3.0                 # px between the points of a backbone
NEAR, FAR = 1.0, 0.3       # a backbone's stroke opacity nearest the viewer, and farthest
PLACE = 'translate(1180 160)'
OPACITY = 0.2              # the whole helix, on the wallpaper


def at(y, off):
    a = 2 * math.pi * (-y) / P + off
    return CX + R * math.cos(a), -math.sin(a)


def points(off, y0=0.0, y1=H):
    n = max(1, round((y1 - y0) / STEP))
    return [(at(y0 + (y1 - y0) * i / n, off)[0], y0 + (y1 - y0) * i / n) for i in range(n + 1)]


def path(pts):
    return 'M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts)


def front(off):
    """the stretches of a backbone in front of the axis (-sin(a) > 0); -sin(a) changes sign where a = k*pi"""
    turns = sorted(y for k in range(-10, 10) for y in [(off - k * math.pi) * P / (2 * math.pi)] if 0 < y < H)
    edges = [0.0] + turns + [H]
    return ' '.join(path(points(off, y0, y1)) for y0, y1 in zip(edges, edges[1:]) if at((y0 + y1) / 2, off)[1] > 0)


def gradient(gid, off):
    stops = ''.join(
        f'<stop offset="{i / 60:.4f}" stop-color="#a8d4ff" stop-opacity="{FAR + (NEAR - FAR) * (at(H * i / 60, off)[1] + 1) / 2:.2f}"/>'
        for i in range(61))
    return f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="{H:.0f}">{stops}</linearGradient>'


def base_pairs():
    rise = P / BP_PER_TURN
    out, y = [], rise / 2
    while y < H:
        xa, xb = at(y, 0.0)[0], at(y, PHI)[0]
        if abs(xa - xb) > 3:
            out.append(f'M{xa:.1f} {y:.1f}H{xb:.1f}')
        y += rise
    return ' '.join(out)


def helix():
    box = 'x="-40" y="-40" width="200" height="800"'
    return f'''{MARK}, right-handed: two antiparallel backbones winding round one axis, with the major and minor grooves
       between them and base pairs across. A backbone fades where it is far from the viewer, and is cut where the
       other passes in front of it. Drawn by tools/wallpaper_helix.py. -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="{OPACITY}" transform="{PLACE}">
    <defs>
      {gradient('strandA', 0.0)}
      {gradient('strandB', PHI)}
      <mask id="behindB" maskUnits="userSpaceOnUse" {box}><rect {box} fill="#fff"/><path d="{front(0.0)}" stroke="#000" stroke-width="9"/></mask>
      <mask id="behindA" maskUnits="userSpaceOnUse" {box}><rect {box} fill="#fff"/><path d="{front(PHI)}" stroke="#000" stroke-width="9"/></mask>
    </defs>
    <path d="{base_pairs()}" stroke="#a8d4ff" stroke-width="1.6" stroke-opacity="0.6"/>
    <path d="{path(points(0.0))}" stroke="url(#strandA)" stroke-width="2.6" mask="url(#behindA)"/>
    <path d="{path(points(PHI))}" stroke="url(#strandB)" stroke-width="2.6" mask="url(#behindB)"/>
  </g>'''


def main():
    src = open(SVG, encoding='utf-8').read()
    # the helix group: from its comment (or, in the first wallpaper, its <g>) to the end of the file's last group
    start = src.find(MARK)
    if start < 0:
        start = src.index('  <g fill="none" stroke="#a8d4ff"')
    end = src.rindex('  </g>') + len('  </g>')
    with open(SVG, 'w', encoding='utf-8') as fh:
        fh.write(src[:start] + helix() + src[end:])
    print(f'{os.path.relpath(SVG, ROOT)}: helix drawn ({os.path.getsize(SVG):,} bytes)')


if __name__ == '__main__':
    main()
