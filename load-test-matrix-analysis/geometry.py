#!/usr/bin/env python3
"""Did the geometry each test case asked for actually reach the platform?

Emulated mode does not build the room its topology name suggests. The controller
asks for P video publishers and S subscribers; the worker mirrors every video
publisher into an audio publisher, and `lk load-test` keeps publishers and
subscribers as separate participants that never overlap. So

    participants  = 2P + S
    inbound       = P video + P audio        (publishers never subscribe)

`ONE_SESSION_NXN: "30"` is therefore 60 participants, not 30. That is a perfectly
good load point -- it is simply not the geometry the name implies, which is why
the analysis regresses on measured counters and why this check exists.

What it catches: a run whose peak platform participant count is short of the
formula did not deliver its load, whatever the report's stop reason says. That is
the recommended validity test for gap G11 (a run can report "Test finished" while
the platform refused participants) and it also catches rooms dropped through
worker exhaustion.

    geometry.py --runs-dir runs/ --configs ../config
    geometry.py --runs-dir runs/ --configs ../config --emit-expected expected.tsv

The peak is used, not the average: the report window includes ramp-up (gap G7),
so the average is always short and proves nothing.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.report import find_runs, platform_metrics  # noqa: E402


def expected_participants(config_path):
    """(expected_peak, shape) for a single-test-case config, or (None, shape).

    Returns None when the count is unbounded ("infinite"), since a
    push-to-failure run has no target to compare against.
    """
    with open(config_path) as fh:
        cfg = fh.read()
    topo = re.search(r"topology:\s*(\S+)", cfg)
    parts = re.search(r'participants:\s*\[\s*"([^"]+)"', cfg)
    if not topo or not parts:
        return None, None
    sessions = re.search(r"^\s*sessions:\s*(\S+)", cfg, re.M)
    topo, spec = topo.group(1), parts.group(1)
    rooms_raw = sessions.group(1) if sessions else "1"
    if rooms_raw == "infinite" or spec == "infinite" or "infinite" in spec:
        return None, f"{topo} {spec} x{rooms_raw}"
    rooms = int(rooms_raw)
    shape = f"{topo} {spec} x{rooms}"

    if ":" in spec:
        a, b = (int(x) for x in spec.split(":"))
        if topo == "TEACHING":
            # The designated publisher plus the audio-only ones are all
            # publishers, each mirrored by a subscriber tester: 2(a+b).
            # Matches the documented "1:3 -> 8 participants".
            return 2 * (a + b) * rooms, shape
        return (2 * a + b) * rooms, shape
    return 2 * int(spec) * rooms, shape


def find_config(configs_dir, point):
    for name in (f"tmp-{point}.yaml", f"{point}.yaml", f"config-{point}.yaml"):
        path = os.path.join(configs_dir, name)
        if os.path.exists(path):
            return path
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--configs", required=True,
                    help="directory holding the per-point test-case configs")
    ap.add_argument("--emit-expected",
                    help="write a TSV of point/expected for gate.py --expect-file")
    args = ap.parse_args()

    runs = find_runs(args.runs_dir)
    if not runs:
        print(f"no runs found under {args.runs_dir}", file=sys.stderr)
        return 1

    print("GEOMETRY VALIDITY: platform peak participants vs the 2P+S formula")
    print("=" * 88)
    print(f"{'point':12}{'shape':28}{'expected':>10}{'peak':>8}{'delta':>9}   verdict")
    print("-" * 88)

    emitted, short = [], 0
    for point, _, html in runs:
        peak = (platform_metrics(html).get("participants") or {}).get("max")
        cfg = find_config(args.configs, point)
        expected, shape = expected_participants(cfg) if cfg else (None, None)
        if peak is None:
            print(f"{point:12}{(shape or '?'):28}{'-':>10}{'-':>8}{'-':>9}   "
                  "NO METRICS (monitoring down)")
            short += 1
            continue
        if expected is None:
            print(f"{point:12}{(shape or 'config not found'):28}{'-':>10}"
                  f"{peak:>8.0f}{'-':>9}   (unbounded or unknown)")
            continue
        delta = peak - expected
        verdict = "ok" if abs(delta) < 0.5 else ("SHORT" if delta < 0 else "over")
        if verdict == "SHORT":
            short += 1
        print(f"{point:12}{shape:28}{expected:>10}{peak:>8.0f}{delta:>+9.0f}   {verdict}")
        emitted.append((point, expected))

    if args.emit_expected:
        with open(args.emit_expected, "w") as fh:
            for point, expected in emitted:
                fh.write(f"{point}\t{expected}\n")
        print(f"\nwrote {args.emit_expected} ({len(emitted)} points)")

    if short:
        print(f"\n{short} run(s) did not reach their intended load. Discard them: a")
        print("short run is a different, unknown load point, not a noisy version of")
        print("the one requested. If the cause is 'No more workers available', the")
        print("worker fleet is smaller than the room count -- one worker per room.")
        return 1
    print("\nEvery run reached its intended geometry.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
