#!/usr/bin/env python3
"""
Generate the simulator's icon set (original artwork, flat elementary-Xfce-like style).

    python3 tools/make_icons.py

Writes SVGs into assets/icons/{apps,places,mimes,status,actions,panel}/.
Edit the shapes or palette here and re-run to restyle everything consistently.
"""
import math
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "icons")

SHADOW = '<filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1" stdDeviation="0.9" flood-opacity="0.35"/></filter>'


def svg48(body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'
            f'<defs>{SHADOW}{defs}</defs>{body}</svg>')


def svg16(body, color="#4d4d4d"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" '
            f'fill="none" stroke="{color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">{body}</svg>')


def grad(gid, c1, c2, vertical=True):
    xy = 'x1="0" y1="0" x2="0" y2="1"' if vertical else 'x1="0" y1="0" x2="1" y2="0"'
    return f'<linearGradient id="{gid}" {xy}><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>'


ICONS = {}

# ----------------------------------------------------------------------------- apps
ICONS["apps/terminal"] = svg48(
    '<g filter="url(#s)"><rect x="4" y="7" width="40" height="34" rx="4" fill="url(#g)"/>'
    '<rect x="4" y="7" width="40" height="7" rx="4" fill="#5b5b5b"/><rect x="4" y="11" width="40" height="3" fill="#5b5b5b"/></g>'
    '<circle cx="9" cy="10.5" r="1.2" fill="#ef6b5d"/><circle cx="13" cy="10.5" r="1.2" fill="#f5c04a"/><circle cx="17" cy="10.5" r="1.2" fill="#6cc66c"/>'
    '<path d="M11 21l6 5-6 5" fill="none" stroke="#8ae234" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
    '<path d="M20 32h11" stroke="#e8e8e8" stroke-width="2.6" stroke-linecap="round"/>',
    grad("g", "#3a3a3a", "#1e1e1e"))

ICONS["apps/rstudio"] = svg48(
    '<g filter="url(#s)"><circle cx="24" cy="24" r="19" fill="url(#g)"/></g>'
    '<circle cx="24" cy="24" r="19" fill="none" stroke="#2c6aa5" stroke-width="1"/>'
    '<path d="M17.5 14.5h9.2c4.2 0 6.9 2.3 6.9 5.9 0 2.8-1.6 4.7-4.2 5.4l5 7.7h-5.1l-4.4-7.1h-2.8v7.1h-4.6zm4.6 3.9v5.9h4.2c2 0 3.1-1.1 3.1-3s-1.1-2.9-3.1-2.9z" fill="#fff"/>',
    grad("g", "#86b8e8", "#4a8fd0"))

ICONS["apps/spyder"] = svg48(
    '<g filter="url(#s)"><circle cx="24" cy="24" r="19" fill="url(#g)"/></g>'
    '<g fill="none" stroke="#f3f3f3" stroke-width="1.3" stroke-linecap="round">'
    '<path d="M24 7v34M7 24h34M12 12l24 24M36 12L12 36"/>'
    '<path d="M24 13l7.8 3.2 3.2 7.8-3.2 7.8-7.8 3.2-7.8-3.2-3.2-7.8 3.2-7.8z"/>'
    '<path d="M24 18.5l3.9 1.6 1.6 3.9-1.6 3.9-3.9 1.6-3.9-1.6-1.6-3.9 1.6-3.9z"/></g>'
    '<circle cx="29" cy="20" r="3.2" fill="#ee4c3b" stroke="#fff" stroke-width="1"/>',
    grad("g", "#5f6b78", "#2f3842"))

ICONS["apps/text-editor"] = svg48(
    '<g filter="url(#s)"><path d="M10 4h20l9 9v31H10z" fill="#fafafa"/><path d="M30 4v9h9z" fill="#d9d9d9"/></g>'
    '<path d="M10 4h20l9 9v31H10z" fill="none" stroke="#a8a8a8"/>'
    '<g stroke="#9aa7b4" stroke-width="1.6"><path d="M15 18h17M15 23h19M15 28h14M15 33h18M15 38h10"/></g>'
    '<g transform="rotate(40 33 33)"><rect x="30.5" y="16" width="5" height="22" rx="1" fill="#f5b83d" stroke="#b3802a" stroke-width=".8"/>'
    '<path d="M30.5 38h5l-2.5 5z" fill="#e9cfa4" stroke="#b3802a" stroke-width=".8"/><rect x="30.5" y="14" width="5" height="3" fill="#e46a6a"/></g>')

ICONS["apps/file-manager"] = svg48(
    '<g filter="url(#s)"><path d="M4 11a2 2 0 0 1 2-2h11l4 4h21a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#6b8fb8"/>'
    '<path d="M4 17h40v21a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="url(#g)"/></g>'
    '<path d="M24 20l-8 6.5h2.4V34h11.2v-7.5H32z" fill="#fff" opacity=".92"/><rect x="22" y="28.5" width="4" height="5.5" fill="#7fa6d3"/>',
    grad("g", "#a9c7ea", "#7fa6d3"))

ICONS["apps/web-browser"] = svg48(
    '<g filter="url(#s)"><circle cx="24" cy="24" r="19" fill="url(#g)"/></g>'
    '<g fill="none" stroke="#fff" stroke-width="1.5" opacity=".9"><ellipse cx="24" cy="24" rx="8" ry="19"/>'
    '<path d="M5 24h38M8 14h32M8 34h32M24 5v38"/></g>'
    '<path d="M15 11c4 1 5 4 3 7s1 5 4 4 5 1 4 4-3 6-1 10" fill="none" stroke="#7bd88f" stroke-width="3" stroke-linecap="round" opacity=".85"/>',
    grad("g", "#5fb3f0", "#1f6fc2"))

ICONS["apps/labkeeper"] = svg48(
    '<g filter="url(#s)"><path d="M8 11c0-3.3 7.2-6 16-6s16 2.7 16 6v26c0 3.3-7.2 6-16 6S8 40.3 8 37z" fill="url(#g)"/></g>'
    '<ellipse cx="24" cy="11" rx="16" ry="6" fill="#c9e7e1"/>'
    '<path d="M8 20c0 3.3 7.2 6 16 6s16-2.7 16-6M8 29c0 3.3 7.2 6 16 6s16-2.7 16-6" fill="none" stroke="#e8f6f3" stroke-width="1.4" opacity=".8"/>'
    '<g transform="translate(25 25)"><circle cx="7" cy="7" r="6.5" fill="#f7c948" stroke="#b58a1b" stroke-width="1"/>'
    '<circle cx="7" cy="7" r="2.2" fill="#b58a1b"/><path d="M1.6 10.6l-6 6M-1.4 13.6l2 2M-3.4 15.6l2 2" stroke="#b58a1b" stroke-width="2.2" stroke-linecap="round"/></g>',
    grad("g", "#3aa894", "#1f7564"))

def helix_icon(cx=14.5, r=6.0, y0=7.5, y1=40.5, turn=27.0, phi=0.36 * 2 * math.pi, rise=4.6):
    """A small DNA double helix, right-handed as B-DNA is: each strand at height h has angle a = 2*pi*h/turn and lies at
    x = cx + r*cos(a), nearer the viewer the larger -sin(a) is; the second strand is turned by phi, which leaves the
    minor and major grooves between them. A strand in front of the axis climbs from lower left to upper right.
    Returns, for each strand, its stretches in front and behind (path data), and the base pairs."""
    def at(y, off):
        a = 2 * math.pi * (y0 - y) / turn + off
        return cx + r * math.cos(a), -math.sin(a)

    def stretches(off):
        out, cur, side, n = {True: [], False: []}, [], None, 120
        for i in range(n + 1):
            y = y0 + (y1 - y0) * i / n
            x, f = at(y, off)
            if side is None:
                side = f > 0
            if (f > 0) != side:
                out[side].append(cur)
                cur, side = [cur[-1]], f > 0
            cur.append((x, y))
        out[side].append(cur)
        d = lambda pts: 'M' + ' '.join(f'{x:.2f} {y:.2f}' for x, y in pts)
        return ' '.join(d(p) for p in out[True]), ' '.join(d(p) for p in out[False])

    pairs, y = [], y0 + rise / 2
    while y < y1:
        xa, xb = at(y, 0)[0], at(y, phi)[0]
        if abs(xa - xb) > 1.2:
            pairs.append(f'M{xa:.2f} {y:.2f}H{xb:.2f}')
        y += rise
    return stretches(0.0), stretches(phi), ' '.join(pairs)


(_va_front, _va_back), (_vb_front, _vb_back), _v_pairs = helix_icon()
ICONS["apps/variant-interpreter"] = svg48(
    '<g filter="url(#s)"><rect x="5" y="5" width="38" height="38" rx="8" fill="url(#g)"/></g>'
    '<g fill="none" stroke-linecap="round" stroke-linejoin="round">'
    f'<path d="{_va_back}" stroke="#ffd36b" stroke-width="2" opacity=".55"/><path d="{_vb_back}" stroke="#ffffff" stroke-width="2" opacity=".55"/>'
    f'<path d="{_v_pairs}" stroke="#ffffff" stroke-width="1.3" opacity=".7"/>'
    f'<path d="{_va_front}" stroke="#ffd36b" stroke-width="2.2"/><path d="{_vb_front}" stroke="#ffffff" stroke-width="2.2"/></g>'
    '<circle cx="31" cy="23" r="7" fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width="2.4"/><path d="M36 28l5 5" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
    grad("g", "#a56be0", "#6a35b5"))

ICONS["apps/igv"] = svg48(
    '<g filter="url(#s)"><rect x="4" y="6" width="40" height="36" rx="3" fill="#fdfdfd"/></g>'
    '<rect x="4" y="6" width="40" height="36" rx="3" fill="none" stroke="#9c9c9c"/>'
    '<rect x="4" y="6" width="40" height="7" rx="3" fill="#4b6c9c"/><rect x="4" y="10" width="40" height="3" fill="#4b6c9c"/>'
    '<path d="M8 21h4v-3h3v6h3v-8h3v5h3v-2h3v7h3v-4h3v3h4v-1" fill="none" stroke="#7d7d7d" stroke-width="1.2"/>'
    '<g fill="#b0b0b0"><rect x="8" y="27" width="14" height="2"/><rect x="14" y="30.5" width="16" height="2"/><rect x="24" y="27" width="12" height="2"/>'
    '<rect x="9" y="34" width="13" height="2"/><rect x="25" y="34" width="14" height="2"/><rect x="18" y="37.5" width="17" height="2"/></g>'
    '<rect x="19" y="27" width="2" height="2" fill="#e53935"/><rect x="19" y="30.5" width="2" height="2" fill="#e53935"/><rect x="19" y="37.5" width="2" height="2" fill="#1e88e5"/>')

ICONS["apps/airlock"] = svg48(
    '<g filter="url(#s)"><rect x="6" y="6" width="36" height="36" rx="5" fill="url(#g)"/></g>'
    '<circle cx="24" cy="24" r="12" fill="#e9eef3" stroke="#5c6b7a" stroke-width="2"/>'
    '<circle cx="24" cy="24" r="4.5" fill="#5c6b7a"/>'
    '<g stroke="#5c6b7a" stroke-width="2.4" stroke-linecap="round"><path d="M24 12.5v5M24 30.5v5M12.5 24h5M30.5 24h5"/></g>'
    '<path d="M37 9l4 4-4 4" fill="none" stroke="#ffcc4d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    '<path d="M30 13h11" stroke="#ffcc4d" stroke-width="2.4" stroke-linecap="round"/>',
    grad("g", "#7a8b9c", "#4c5b6a"))

ICONS["apps/research-registry"] = svg48(
    '<g filter="url(#s)"><rect x="9" y="7" width="30" height="37" rx="3" fill="#b98352"/><rect x="12" y="11" width="24" height="30" rx="1" fill="#fdfdfd"/></g>'
    '<rect x="17" y="4.5" width="14" height="6" rx="2" fill="#8d9aa6" stroke="#5f6b76"/>'
    '<g stroke="#b0b8c1" stroke-width="1.6"><path d="M22 18h10M22 24h10M22 30h10M16 36h16"/></g>'
    '<path d="M15.5 18l1.5 1.5 2.5-3M15.5 24l1.5 1.5 2.5-3M15.5 30l1.5 1.5 2.5-3" fill="none" stroke="#3c9a3c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')

ICONS["apps/documentation"] = svg48(
    '<g filter="url(#s)"><path d="M8 8a3 3 0 0 1 3-3h27v34H11a3 3 0 0 0-3 3z" fill="url(#g)"/><path d="M8 42a3 3 0 0 1 3-3h27v4H11a3 3 0 0 1-3-1z" fill="#e8e8e8"/></g>'
    '<path d="M19.5 17a4.5 4.5 0 1 1 6.3 4.1c-1.2.6-1.8 1.4-1.8 2.7v1.2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="30" r="1.7" fill="#fff"/>',
    grad("g", "#e85d8f", "#b23667"))

ICONS["apps/settings"] = svg48(
    '<g filter="url(#s)"><path d="M21 4h6l1 5 3.6 1.5 4.3-2.9 4.2 4.2-2.9 4.3L38.8 20l5.2 1v6l-5.2 1-1.6 3.9 2.9 4.3-4.2 4.2-4.3-2.9L28 39l-1 5h-6l-1-5-3.6-1.5-4.3 2.9-4.2-4.2 2.9-4.3L9.2 28 4 27v-6l5.2-1 1.6-3.9-2.9-4.3 4.2-4.2 4.3 2.9L20 9z" fill="url(#g)"/></g>'
    '<circle cx="24" cy="24" r="7" fill="#e9e9e9" stroke="#666" stroke-width="1.2"/>',
    grad("g", "#9a9a9a", "#666666"))

ICONS["apps/application"] = svg48(
    '<g filter="url(#s)"><rect x="6" y="8" width="36" height="32" rx="3" fill="#f2f2f2" stroke="#a5a5a5"/></g>'
    '<rect x="6" y="8" width="36" height="7" rx="3" fill="#7d93ad"/><rect x="6" y="12" width="36" height="3" fill="#7d93ad"/>'
    '<rect x="11" y="20" width="26" height="15" rx="1" fill="#dfe6ee"/>')

ICONS["apps/participant-explorer"] = svg48(
    '<g filter="url(#s)"><circle cx="24" cy="24" r="19" fill="url(#g)"/></g>'
    '<circle cx="21" cy="19" r="5" fill="#fff"/><path d="M11.5 33c1-5 5-8 9.5-8s8.5 3 9.5 8z" fill="#fff"/>'
    '<circle cx="31" cy="29" r="5" fill="none" stroke="#ffd36b" stroke-width="2.4"/><path d="M34.5 32.5l4 4" stroke="#ffd36b" stroke-width="2.8" stroke-linecap="round"/>',
    grad("g", "#f08a5d", "#c85a2e"))

ICONS["apps/re-logo"] = svg48(
    '<circle cx="24" cy="24" r="21" fill="url(#g)"/>'
    '<g fill="none" stroke-width="2.6" stroke-linecap="round"><path d="M17 9c12 7 12 15 0 22s-0 8 0 8" stroke="#ffffff"/>'
    '<path d="M31 9c-12 7-12 15 0 22s0 8 0 8" stroke="#8fd3ff"/></g>'
    '<g stroke="#ffffff" stroke-width="1.6" opacity=".75"><path d="M19.5 13h9M20 27h8M18.5 35h11"/></g>',
    grad("g", "#3d7fd1", "#1c4f9a"))

# ----------------------------------------------------------------------------- places
def folder(gid, c1, c2, emblem=""):
    return svg48(
        f'<g filter="url(#s)"><path d="M4 11a2 2 0 0 1 2-2h11l4 4h21a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="{c2}"/>'
        f'<path d="M4 17h40v21a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="url(#{gid})"/></g>{emblem}',
        grad(gid, c1, c2))

ICONS["places/folder"] = folder("g", "#a9c7ea", "#7fa6d3")
ICONS["places/folder-home"] = ICONS["apps/file-manager"]
ICONS["places/folder-desktop"] = folder("g", "#a9c7ea", "#7fa6d3", '<rect x="16" y="22" width="16" height="11" rx="1" fill="#fff" opacity=".9"/><path d="M21 36h6" stroke="#fff" stroke-width="2" opacity=".9"/>')
ICONS["places/folder-documents"] = folder("g", "#a9c7ea", "#7fa6d3", '<path d="M18 21h9l4 4v10H18z" fill="#fff" opacity=".92"/><path d="M20.5 28h8M20.5 31h8" stroke="#7fa6d3" stroke-width="1.2"/>')
ICONS["places/folder-downloads"] = folder("g", "#a9c7ea", "#7fa6d3", '<path d="M24 20v11M19 26.5l5 5 5-5M17 35h14" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>')
ICONS["places/folder-remote"] = folder("g", "#b9c6d4", "#8c9eb2", '<rect x="16" y="22" width="16" height="9" rx="1.5" fill="#fff" opacity=".92"/><circle cx="20" cy="26.5" r="1.4" fill="#6cc66c"/><path d="M24 31v3M18 35h12" stroke="#fff" stroke-width="2" opacity=".92"/>')
ICONS["places/folder-locked"] = folder("g", "#b9c6d4", "#8c9eb2", '<rect x="18" y="26" width="12" height="9" rx="1.5" fill="#fff"/><path d="M20.5 26v-2.5a3.5 3.5 0 0 1 7 0V26" fill="none" stroke="#fff" stroke-width="2.2"/>')
ICONS["places/user-trash"] = svg48(
    '<g filter="url(#s)"><path d="M11 14h26l-2.2 27a2 2 0 0 1-2 1.8H15.2a2 2 0 0 1-2-1.8z" fill="url(#g)"/></g>'
    '<rect x="8" y="9" width="32" height="5" rx="1.5" fill="#9aa3ad"/><rect x="19" y="5.5" width="10" height="4" rx="1.5" fill="none" stroke="#9aa3ad" stroke-width="2"/>'
    '<g stroke="#fff" stroke-width="1.8" opacity=".6"><path d="M18 19l1 18M24 19v18M30 19l-1 18"/></g>',
    grad("g", "#c3cad2", "#8e98a3"))
ICONS["places/drive-harddisk"] = svg48(
    '<g filter="url(#s)"><rect x="5" y="15" width="38" height="20" rx="3" fill="url(#g)"/></g>'
    '<rect x="9" y="28" width="22" height="2.5" rx="1" fill="#6f7a85"/><circle cx="37" cy="29.3" r="1.8" fill="#6cc66c"/>',
    grad("g", "#d9dee3", "#a9b3bd"))

# ----------------------------------------------------------------------------- mimes
def doc(gid, c1, c2, label="", label_color="#fff", lines=True):
    lines_svg = '<g stroke="#c5ccd3" stroke-width="1.5"><path d="M15 18h16M15 22h18M15 26h13"/></g>' if lines else ''
    lab = (f'<rect x="10" y="30" width="28" height="10" rx="2" fill="url(#{gid})"/>'
           f'<text x="24" y="37.6" font-family="DejaVu Sans, Arial, sans-serif" font-size="7.2" font-weight="700" '
           f'fill="{label_color}" text-anchor="middle">{label}</text>') if label else ''
    return svg48(
        '<g filter="url(#s)"><path d="M10 4h20l9 9v31H10z" fill="#fbfbfb"/><path d="M30 4v9h9z" fill="#dedede"/></g>'
        f'<path d="M10 4h20l9 9v31H10z" fill="none" stroke="#a8a8a8"/>{lines_svg}{lab}',
        grad(gid, c1, c2))

ICONS["mimes/text-plain"] = doc("g", "#999", "#777")
ICONS["mimes/text-x-r"] = doc("g", "#5d9be0", "#2c6aa5", "R")
ICONS["mimes/text-x-python"] = doc("g", "#4f86c6", "#2f5d94", "PY")
ICONS["mimes/text-x-script"] = doc("g", "#5a5a5a", "#333", "SH")
ICONS["mimes/text-csv"] = doc("g", "#4caf50", "#2e7d32", "TSV")
ICONS["mimes/text-html"] = doc("g", "#f08a3a", "#c4621a", "HTML")
ICONS["mimes/text-markdown"] = doc("g", "#777", "#444", "MD")
ICONS["mimes/application-json"] = doc("g", "#8e6bbf", "#5f3f91", "JSON")
ICONS["mimes/application-pdf"] = doc("g", "#e53935", "#b71c1c", "PDF")
ICONS["mimes/application-archive"] = doc("g", "#a1887f", "#6d4c41", "GZ")
ICONS["mimes/genomic-vcf"] = doc("g", "#ab47bc", "#7b1fa2", "VCF")
ICONS["mimes/genomic-bam"] = doc("g", "#26a69a", "#00796b", "BAM")
ICONS["mimes/genomic-fasta"] = doc("g", "#ef6c00", "#bf360c", "FA")
ICONS["mimes/genomic-bed"] = doc("g", "#5c6bc0", "#303f9f", "BED")
ICONS["mimes/genomic-index"] = doc("g", "#90a4ae", "#546e7a", "IDX")
ICONS["mimes/image"] = svg48(
    '<g filter="url(#s)"><rect x="5" y="8" width="38" height="32" rx="2" fill="#fbfbfb" stroke="#a8a8a8"/></g>'
    '<rect x="9" y="12" width="30" height="24" fill="#9ed0f5"/><path d="M9 36l9-11 6 7 5-5 10 9z" fill="#4caf50"/><circle cx="31" cy="18" r="3" fill="#ffd54f"/>')
ICONS["mimes/unknown"] = doc("g", "#bbb", "#999", lines=False)
ICONS["mimes/executable"] = doc("g", "#455a64", "#263238", "EXE")
ICONS["mimes/spreadsheet"] = doc("g", "#43a047", "#1b5e20", "ODS")
ICONS["mimes/document"] = doc("g", "#1e88e5", "#0d47a1", "ODT")

# ----------------------------------------------------------------------------- status (48px dialog icons)
def round_icon(gid, c1, c2, glyph):
    return svg48(f'<g filter="url(#s)"><circle cx="24" cy="24" r="20" fill="url(#{gid})"/></g>{glyph}', grad(gid, c1, c2))

ICONS["status/dialog-information"] = round_icon("g", "#64a9ef", "#2a76c9", '<circle cx="24" cy="14.5" r="2.8" fill="#fff"/><rect x="21.5" y="20" width="5" height="16" rx="2" fill="#fff"/>')
ICONS["status/dialog-question"] = round_icon("g", "#64a9ef", "#2a76c9", '<path d="M18.5 18.5a5.5 5.5 0 1 1 7.7 5c-1.4.7-2.2 1.6-2.2 3.2v1.3" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="34" r="2.4" fill="#fff"/>')
ICONS["status/dialog-error"] = round_icon("g", "#ef6b5d", "#c7362a", '<path d="M16.5 16.5l15 15M31.5 16.5l-15 15" stroke="#fff" stroke-width="4" stroke-linecap="round"/>')
ICONS["status/dialog-success"] = round_icon("g", "#6cc66c", "#3a8f3a", '<path d="M15 24.5l6.5 6.5L33.5 18" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
ICONS["status/dialog-warning"] = svg48(
    '<g filter="url(#s)"><path d="M21.4 6.5a3 3 0 0 1 5.2 0l17 30A3 3 0 0 1 41 41H7a3 3 0 0 1-2.6-4.5z" fill="url(#g)"/></g>'
    '<rect x="21.5" y="15" width="5" height="15" rx="2" fill="#4a3a00"/><circle cx="24" cy="35" r="2.6" fill="#4a3a00"/>',
    grad("g", "#ffd65c", "#f0a800"))
ICONS["status/security-high"] = svg48(
    '<g filter="url(#s)"><path d="M24 4l17 6v12c0 11-7.5 19-17 22C14.5 41 7 33 7 22V10z" fill="url(#g)"/></g>'
    '<path d="M16 24l6 6 11-12" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>',
    grad("g", "#6cc66c", "#3a8f3a"))
ICONS["status/mail"] = svg48(
    '<g filter="url(#s)"><rect x="5" y="11" width="38" height="27" rx="2" fill="url(#g)"/></g>'
    '<path d="M5.5 12l18.5 15 18.5-15" fill="none" stroke="#7d93ad" stroke-width="2"/>',
    grad("g", "#ffffff", "#e3e9ef"))

# ----------------------------------------------------------------------------- actions (16px symbolic)
A = {
    "go-previous": '<path d="M10 3L5 8l5 5"/>',
    "go-next": '<path d="M6 3l5 5-5 5"/>',
    "go-up": '<path d="M3 10l5-5 5 5"/>',
    "go-down": '<path d="M3 6l5 5 5-5"/>',
    "go-home": '<path d="M2.5 8L8 3l5.5 5M4.5 7v6.5h7V7"/><path d="M7 13.5V10h2v3.5"/>',
    "view-refresh": '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M12 1.8v3h-3"/>',
    "process-stop": '<path d="M4 4l8 8M12 4l-8 8"/>',
    "list-add": '<path d="M8 3v10M3 8h10"/>',
    "list-remove": '<path d="M3 8h10"/>',
    "edit-find": '<circle cx="6.8" cy="6.8" r="4.2"/><path d="M10 10l3.8 3.8"/>',
    "edit-copy": '<rect x="5.5" y="5.5" width="8" height="8.5" rx="1"/><path d="M3 10.5V3a1 1 0 0 1 1-1h6.5"/>',
    "edit-cut": '<circle cx="4.5" cy="12" r="2"/><circle cx="11.5" cy="12" r="2"/><path d="M5.8 10.6L12 2M10.2 10.6L4 2"/>',
    "edit-paste": '<rect x="3" y="3" width="10" height="11.5" rx="1"/><path d="M6 3V1.8h4V3"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3"/>',
    "edit-undo": '<path d="M5 3L2 6l3 3"/><path d="M2.5 6H10a3.5 3.5 0 0 1 0 7H6"/>',
    "edit-redo": '<path d="M11 3l3 3-3 3"/><path d="M13.5 6H6a3.5 3.5 0 0 0 0 7h4"/>',
    "edit-delete": '<path d="M3 4.5h10M6 4.5V2.5h4v2M4.5 4.5l.8 9.5h5.4l.8-9.5"/>',
    "document-new": '<path d="M4 1.5h5.5L12.5 4.5v10h-8.5z"/><path d="M9.5 1.5v3h3"/>',
    "document-open": '<path d="M1.5 4.5V3a1 1 0 0 1 1-1h3.5l1.5 1.5h5a1 1 0 0 1 1 1V6"/><path d="M1.5 13.5l1.8-7h11.2l-1.8 7z"/>',
    "document-save": '<path d="M2.5 2.5h9l2 2v9h-11z"/><path d="M5 2.5v3.5h5V2.5M5 13.5V9.5h6v4"/>',
    "document-save-as": '<path d="M2.5 2.5h9l2 2v4M7 13.5H2.5v-11"/><path d="M5 2.5v3.5h5V2.5"/><path d="M9 14l1-3 4-4 2 2-4 4z" stroke-width="1.2"/>',
    "document-print": '<path d="M4 6V2h8v4M4 11.5H2.5v-5h11v5H12"/><rect x="4" y="9.5" width="8" height="5"/>',
    "folder-new": '<path d="M1.5 4V3a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/><path d="M8 7v4M6 9h4"/>',
    "view-list": '<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.5" cy="4" r=".6"/><circle cx="2.5" cy="8" r=".6"/><circle cx="2.5" cy="12" r=".6"/>',
    "view-grid": '<rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/>',
    "view-more": '<circle cx="8" cy="3.5" r=".8"/><circle cx="8" cy="8" r=".8"/><circle cx="8" cy="12.5" r=".8"/>',
    "open-menu": '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
    "media-playback-start": '<path d="M5 3l8 5-8 5z" fill="#4d4d4d"/>',
    "media-run": '<path d="M5 3l8 5-8 5z"/>',
    "media-playback-stop": '<rect x="3.5" y="3.5" width="9" height="9" rx="1"/>',
    "bookmark": '<path d="M4 2h8v12l-4-3-4 3z"/>',
    "star": '<path d="M8 1.8l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.4l-3.9 2.2.9-4.3-3.2-3 4.3-.5z"/>',
    "zoom-in": '<circle cx="6.8" cy="6.8" r="4.2"/><path d="M10 10l3.8 3.8M6.8 4.8v4M4.8 6.8h4"/>',
    "zoom-out": '<circle cx="6.8" cy="6.8" r="4.2"/><path d="M10 10l3.8 3.8M4.8 6.8h4"/>',
    "window-close": '<path d="M4 4l8 8M12 4l-8 8"/>',
    "system-lock-screen": '<rect x="3.5" y="7" width="9" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    "system-log-out": '<path d="M9.5 2.5h-6v11h6M7 8h7M11.5 5.5L14 8l-2.5 2.5"/>',
    "system-shutdown": '<path d="M8 1.8v6"/><path d="M4.6 3.8a5.5 5.5 0 1 0 6.8 0"/>',
    "system-restart": '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M12 1.8v3h-3"/>',
    "preferences-system": '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
    "user": '<circle cx="8" cy="5.5" r="3"/><path d="M2.5 14.5c.6-3 2.8-5 5.5-5s4.9 2 5.5 5"/>',
    "dialog-ok": '<path d="M3 8.5l3 3 7-7"/>',
    "upload": '<path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 13.5h11"/>',
    "download": '<path d="M8 2.5V11M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11"/>',
    "attach": '<path d="M12.5 7.5l-5 5a3 3 0 0 1-4.2-4.2l5.6-5.6a2 2 0 0 1 2.8 2.8L6.2 11a1 1 0 0 1-1.4-1.4l4.8-4.8"/>',
    "terminal": '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8 10.5h4"/>',
    "plot": '<path d="M2 2v12h12"/><path d="M4.5 11l3-4 2.5 2.5L14 4"/>',
    "broom": '<path d="M10.5 1.5L7 7M4 7.5l5 2.5-1.5 4.5c-2-.3-4.3-1.6-5.5-3.5z"/>',
    "table": '<rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M1.5 6h13M1.5 9.5h13M6 6v7.5M10.5 6v7.5"/>',
    "filter": '<path d="M2 3h12l-4.5 5.5v4.5l-3-1.5v-3z"/>',
    "sort-ascending": '<path d="M4 12.5V3M1.8 5.2L4 3l2.2 2.2M8.5 4h5M8.5 7.5h4M8.5 11h3"/>',
    "sort-descending": '<path d="M4 3v9.5M1.8 10.3L4 12.5l2.2-2.2M8.5 4h3M8.5 7.5h4M8.5 11h5"/>',
    "export": '<path d="M9 2.5h4.5V7M13.5 2.5L7 9"/><path d="M11.5 9.5v4h-9v-9h4"/>',
    "info": '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4"/><circle cx="8" cy="4.8" r=".6"/>',
    "help": '<circle cx="8" cy="8" r="6.2"/><path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.2v.5"/><circle cx="8" cy="11.6" r=".5"/>',
    "lock": '<rect x="3.5" y="7" width="9" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
}
for name, body in A.items():
    ICONS[f"actions/{name}"] = svg16(body)

# Light (panel) versions of a few symbolic icons for the dark top panel.
P = {
    "network-wired": '<rect x="5.5" y="1.5" width="5" height="4" rx=".5"/><rect x="1.5" y="10.5" width="5" height="4" rx=".5"/><rect x="9.5" y="10.5" width="5" height="4" rx=".5"/><path d="M8 5.5v2.5M4 10.5V8h8v2.5"/>',
    "audio-volume-high": '<path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6.3 6.3 0 0 1 0 9"/>',
    "system-shutdown": A["system-shutdown"],
    "notifications": '<path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11z"/><path d="M6.5 14a1.6 1.6 0 0 0 3 0"/>',
    "user": A["user"],
    "workspace": '<rect x="1.5" y="3.5" width="5.5" height="4" rx=".5"/><rect x="9" y="3.5" width="5.5" height="4" rx=".5"/><rect x="1.5" y="9" width="5.5" height="4" rx=".5"/><rect x="9" y="9" width="5.5" height="4" rx=".5"/>',
    "show-desktop": '<rect x="1.5" y="2.5" width="13" height="9.5" rx="1"/><path d="M5.5 14h5"/>',
    "applications": '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
    "edit-find": A["edit-find"],
}
for name, body in P.items():
    ICONS[f"panel/{name}"] = svg16(body, color="#ececec")


def main():
    count = 0
    for name, svg in ICONS.items():
        path = os.path.join(ROOT, name + ".svg")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(svg)
        count += 1
    print(f"wrote {count} icons to {os.path.normpath(ROOT)}")


if __name__ == "__main__":
    main()
