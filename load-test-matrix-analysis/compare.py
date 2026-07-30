#!/usr/bin/env python3
"""Compare points that were designed to differ in exactly one thing.

Several matrix families answer their question by holding geometry constant and
varying one input: quality (S5), simulcast (S6), codec (S8), engine (S10),
recording output resolution (S9-b). For those, the answer is a ratio between two
runs, not a regression -- and taking the ratio is more robust than fitting,
because the shared geometry cancels.

    compare.py rows.json --pairs s5l:s5h,s6off55:s655
    compare.py rows.json --group s5l,s5m,s5h        # ladder, each vs the first
    compare.py rows.json --pairs a:b --check-geometry

--check-geometry warns when the two runs do not actually share track counts, which
is the assumption the whole comparison rests on. Use it: a pair that differs in
geometry as well as in the variable under test measures nothing in particular.

Statistical caution built in: with two runs there is no scatter estimate, so a
ratio close to 1 cannot be distinguished from noise. Local run-to-run spread was
around 0.03 cores at working loads, so a difference smaller than that is not a
result. Repeat a pair to measure your own noise floor before believing a small
ratio.
"""

from __future__ import annotations

import argparse
import json
import sys

# Columns that must match for a "same geometry, one variable" comparison to hold.
GEOMETRY = ("tracks_pub", "tracks_sub", "participants")
# Columns worth showing for every comparison.
SHOWN = ("tracks_sub", "mbps_in", "mbps_out", "pkts_in", "pkts_out", "sfu_cores")


def ratio(a, b):
    if a in (None, 0) or b is None:
        return None
    return b / a


def compare(base, other, check_geometry, noise):
    print(f"\n{base['point']}  ->  {other['point']}")
    print("-" * 72)
    print(f"   {'column':16}{base['point']:>14}{other['point']:>14}{'ratio':>10}")
    for col in SHOWN:
        x, y = base.get(col), other.get(col)
        r = ratio(x, y)
        xs = f"{x:14.3f}" if isinstance(x, (int, float)) else f"{'-':>14}"
        ys = f"{y:14.3f}" if isinstance(y, (int, float)) else f"{'-':>14}"
        rs = f"{r:10.2f}x" if r else f"{'-':>11}"
        print(f"   {col:16}{xs}{ys}{rs}")

    if check_geometry:
        mismatched = [c for c in GEOMETRY
                      if base.get(c) and other.get(c)
                      and abs(base[c] - other[c]) / max(base[c], 1e-9) > 0.05]
        if mismatched:
            print(f"   !! geometry differs in {', '.join(mismatched)} -- this pair does")
            print("      not isolate a single variable, so the ratio is not attributable")

    ca, cb = base.get("sfu_cores"), other.get("sfu_cores")
    if isinstance(ca, (int, float)) and isinstance(cb, (int, float)):
        delta = cb - ca
        if abs(delta) < noise:
            print(f"   verdict: {delta:+.3f} cores is within the {noise:.3f}-core noise")
            print("      floor, so no effect is demonstrated by this pair")
        else:
            print(f"   verdict: {delta:+.3f} cores ({ratio(ca, cb):.2f}x), which exceeds")
            print(f"      the {noise:.3f}-core noise floor")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rows")
    ap.add_argument("--pairs", default="", help="comma-separated base:other pairs")
    ap.add_argument("--group", default="", help="comma-separated ladder, each vs the first")
    ap.add_argument("--check-geometry", action="store_true")
    ap.add_argument("--noise", type=float, default=0.03,
                    help="cores below which a difference is not a result "
                         "(measure it by repeating one point; default 0.03)")
    args = ap.parse_args()

    with open(args.rows) as fh:
        rows = {r["point"]: r for r in json.load(fh)}

    todo = []
    for pair in (p for p in args.pairs.split(",") if p):
        if ":" not in pair:
            print(f"bad pair '{pair}', expected base:other", file=sys.stderr)
            return 2
        todo.append(tuple(pair.split(":", 1)))
    group = [g for g in args.group.split(",") if g]
    todo += [(group[0], other) for other in group[1:]]

    if not todo:
        ap.error("give --pairs or --group")

    missing = {p for pair in todo for p in pair if p not in rows}
    if missing:
        print(f"not in {args.rows}: {', '.join(sorted(missing))}", file=sys.stderr)
        return 1

    for base, other in todo:
        compare(rows[base], rows[other], args.check_geometry, args.noise)
    return 0


if __name__ == "__main__":
    sys.exit(main())
