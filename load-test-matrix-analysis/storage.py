#!/usr/bin/env python3
"""Recorded object sizes, for the storage line of the infrastructure cost.

Two purposes. It gives bytes-per-minute per egress type, which is the only source
for the recording-storage cost, and it is independent evidence that a recording
really happened: container CPU shows something was encoding, but only an object
shows it was stored.

Writes `sizes.tsv` ("bytes<TAB>key") into the runs directory, which
egress_cost.py picks up to report MiB/min.

Two backends:

    # objects still in the deployment's MinIO, reached over a node's shell
    storage.py --minio-exec "docker exec master-node-1" \\
               --minio-path /opt/openvidu/data/minio_data/data/openvidu-appdata \\
               --runs-dir runs/

    # objects already pulled to a local directory, or a real S3 bucket via awscli
    storage.py --local-dir ./recordings --runs-dir runs/
    storage.py --s3 s3://my-bucket/prefix --runs-dir runs/

MinIO note: it stores each object as a DIRECTORY of parts
(`object.mp4/<uuid>/part.N`), so `find -type f -name '*.mp4'` finds nothing and a
naive check concludes no recording was made. The object's size is the sum of its
parts, which is what the MinIO backend below does.
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys


def run(cmd, timeout=300):
    got = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                         timeout=timeout)
    if got.returncode != 0 and not got.stdout:
        print(got.stderr.strip()[:400], file=sys.stderr)
    return got.stdout


def from_minio(exec_prefix, base):
    """[(bytes, key)] summing the part files under each object directory."""
    script = f'''
      base={shlex.quote(base)}
      [ -d "$base" ] || {{ echo "__MISSING__"; exit 0; }}
      find "$base" -maxdepth 2 -mindepth 2 \\
        \\( -name "*.mp4" -o -name "*.ogg" -o -name "*.webm" -o -name "*.ts" \\) \\
        | sort | while read -r obj; do
            bytes=$(find "$obj" -type f -name "part.*" -exec du -cb {{}} + 2>/dev/null \\
                      | tail -1 | cut -f1)
            printf "%s\\t%s\\n" "${{bytes:-0}}" "${{obj#$base/}}"
          done
    '''
    out = run(f'{exec_prefix} sh -c {shlex.quote(script)}')
    if "__MISSING__" in out:
        print(f"MinIO path not found: {base}", file=sys.stderr)
        return []
    return parse_tsv(out)


def from_local(directory):
    found = []
    for root, _, files in os.walk(directory):
        for name in files:
            if name.endswith((".mp4", ".ogg", ".webm", ".ts")):
                path = os.path.join(root, name)
                found.append((os.path.getsize(path),
                              os.path.relpath(path, directory)))
    return sorted(found, key=lambda kv: kv[1])


def from_s3(uri):
    out = run(f"aws s3 ls --recursive {shlex.quote(uri)}")
    found = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 4 and parts[2].isdigit():
            key = parts[3]
            if key.endswith((".mp4", ".ogg", ".webm", ".ts")):
                found.append((int(parts[2]), key))
    return sorted(found, key=lambda kv: kv[1])


def parse_tsv(text):
    found = []
    for line in text.splitlines():
        parts = line.split("\t") if "\t" in line else line.split(None, 1)
        if len(parts) == 2 and parts[0].strip().isdigit():
            found.append((int(parts[0].strip()), parts[1].strip()))
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-dir", help="where to write sizes.tsv")
    ap.add_argument("--minio-exec", help='e.g. "docker exec master-node-1"')
    ap.add_argument("--minio-path",
                    default="/opt/openvidu/data/minio_data/data/openvidu-appdata")
    ap.add_argument("--local-dir")
    ap.add_argument("--s3")
    args = ap.parse_args()

    if args.minio_exec:
        objects = from_minio(args.minio_exec, args.minio_path)
    elif args.local_dir:
        objects = from_local(args.local_dir)
    elif args.s3:
        objects = from_s3(args.s3)
    else:
        ap.error("give one of --minio-exec, --local-dir or --s3")

    if not objects:
        print("no recording objects found. If a run reported a started egress job,")
        print("check the bucket name and that the upload completed.")
        return 1

    total = 0
    print(f"{'bytes':>14}  {'MiB':>8}  key")
    print("-" * 78)
    for size, key in objects:
        total += size
        print(f"{size:>14}  {size / 1048576:>8.1f}  {key}")
    print("-" * 78)
    print(f"{total:>14}  {total / 1048576:>8.1f}  {len(objects)} objects")

    if args.runs_dir:
        path = os.path.join(args.runs_dir, "sizes.tsv")
        with open(path, "w") as fh:
            for size, key in objects:
                fh.write(f"{size}\t{key}\n")
        print(f"\nwrote {path}; egress_cost.py will read it for MiB/min")
        print("(matching is by point name appearing in the key, so keep using")
        print(" egress.filePrefix to tag each point's output)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
