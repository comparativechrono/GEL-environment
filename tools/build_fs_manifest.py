#!/usr/bin/env python3
"""
Build data/fs/manifest.json — the read-only data mounted in the simulated RE.

    python3 tools/build_fs_manifest.py

Everything under data/fs/<mount>/ appears at /<mount>/ inside the simulator:

    data/fs/genomes/...                    -> /genomes/...
    data/fs/gel_data_resources/...         -> /gel_data_resources/...
    data/fs/pgen_public_data_resources/... -> /pgen_public_data_resources/...

* Names beginning with "dot." become dotfiles (dot.netrc -> .netrc), because some
  web hosts do not serve files whose names start with a dot.
* Small text files (<= 16 KB) are also put inside the manifest; every file is
  fetched from the site ("src") when R, Python or a tool first reads it.
* A ".keep" file keeps an otherwise empty folder.
* data/fs/extra.json may list more entries in the same format, e.g. large files
  hosted elsewhere:  {"entries": [{"path": "/genomes/.../x.bam", "src": "https://…", "size": 123}]}
"""
import json
import os
import sys
import datetime as dt

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(ROOT, "data", "fs")
MOUNTS = ["genomes", "gel_data_resources", "pgen_public_data_resources"]
INLINE_MAX = 16 * 1024
TEXT_EXT = {".txt", ".md", ".csv", ".tsv", ".r", ".py", ".sh", ".json", ".yml", ".yaml", ".netrc", ".renviron", ".rprofile",
            ".nf", ".wdl", ".cfg", ".conf", ".ini", ".vcf", ".bed", ".fai", ".gff3", ".gtf", ".log", ".sql", ""}


def is_text(path, data):
    ext = os.path.splitext(path)[1].lower()
    if ext not in TEXT_EXT and not os.path.basename(path).startswith("dot."):
        return False
    if b"\x00" in data[:8192]:
        return False
    try:
        data.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def virtual_name(name):
    return "." + name[4:] if name.startswith("dot.") else name


def main():
    entries = []
    for mount in MOUNTS:
        base = os.path.join(DATA, mount)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames.sort()
            rel_dir = os.path.relpath(dirpath, DATA).replace(os.sep, "/")
            vdir = "/" + "/".join(virtual_name(p) for p in rel_dir.split("/"))
            entries.append({"path": vdir, "type": "dir", "mtime": "2024-10-31T09:00:00Z"})
            for fn in sorted(filenames):
                if fn == ".keep" or fn.startswith(".DS_Store"):
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
                vpath = vdir + "/" + virtual_name(fn)
                size = os.path.getsize(full)
                mtime = dt.datetime.fromtimestamp(os.path.getmtime(full), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                e = {"path": vpath, "type": "file", "size": size, "mtime": mtime}
                with open(full, "rb") as fh:
                    data = fh.read(INLINE_MAX + 1)
                # Small text files are put in the manifest (the desktop reads them at once); every file also keeps
                # its "src", from which R and Python (and the web browser) read it.
                if size <= INLINE_MAX and is_text(fn, data):
                    e["text"] = data.decode("utf-8")
                e["src"] = rel
                entries.append(e)
    extra = os.path.join(DATA, "extra.json")
    if os.path.exists(extra):
        with open(extra) as fh:
            entries.extend(json.load(fh).get("entries", []))
    out = {"generatedBy": "tools/build_fs_manifest.py", "generatedAt": dt.date.today().isoformat(), "entries": entries}
    with open(os.path.join(DATA, "manifest.json"), "w") as fh:
        json.dump(out, fh, indent=0, ensure_ascii=False)
    nfiles = sum(1 for e in entries if e.get("type") != "dir")
    total = sum(e.get("size", 0) for e in entries if e.get("type") != "dir")
    print(f"data/fs/manifest.json: {nfiles} files ({total/1e6:.1f} MB), {len(entries) - nfiles} folders")


if __name__ == "__main__":
    sys.exit(main())
