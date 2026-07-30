#!/usr/bin/env python3
"""Compare two engines (or any two deployments) point by point — scenario S10.

OpenVidu publishes a ~2x capacity claim for mediasoup over Pion. A pricing
calculator cannot straddle a 2x difference silently, so the question this answers
is not "which is faster" but: **is the difference a single scalar, or does it vary
by term?** If one multiplier suffices the calculator carries one number; if not,
the core matrix has to be run twice.

Method: run the same configs on both engines, then compare per point. The ratio is
more robust than two separate fits, because the shared geometry cancels.

    engines.py --a runs-pion --a-label pion --b runs-mediasoup --b-label mediasoup
    engines.py --a runs-pion --b runs-mediasoup --traffic     # use NIC columns

WHY --traffic MATTERS

On mediasoup, `packets_in/out` and `bandwidth_in/out` from the platform read
**zero** (see the README). So a cross-engine comparison of per-packet cost must
use `node_traffic.py` output on BOTH sides — never platform counters on one side
and NIC counters on the other, which are different vantage points.

Track and participant counts come from the platform on both engines and are
directly comparable without any of this.

Interpreting the result: if `cores` ratios cluster tightly across points whose
composition differs a lot (inbound-dominated vs outbound-dominated vs mixed), one
scalar is enough. If the inbound-heavy and outbound-heavy points disagree, the
ratio is term-dependent.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.report import find_runs, platform_metrics, text_report  # noqa: E402

# Columns that mean the same thing on any engine.
PORTABLE = ("participants", "tracks_pub", "tracks_sub")
TRAFFIC = ("mbps_in", "mbps_out", "pps_in", "pps_out")


def collect(runs_dir, sfu, use_traffic):
    """{point: {...}} from the reports, optionally merging node_traffic.json."""
    out = {}
    for point, txt_path, html_path in find_runs(runs_dir):
        metrics = platform_metrics(html_path)
        rep = text_report(txt_path)
        media = rep["containers"].get("medianode", {})
        row = {
            "participants": (metrics.get("participants") or {}).get("avg"),
            "participants_peak": (metrics.get("participants") or {}).get("max"),
            "tracks_pub": (metrics.get("tracks_published") or {}).get("avg"),
            "tracks_sub": (metrics.get("tracks_subscribed") or {}).get("avg"),
            "cores": (media.get(sfu) or {}).get("cores_avg"),
            "stop_reason": rep["stop_reason"],
        }
        out[point] = row

    if use_traffic:
        path = os.path.join(runs_dir, "node_traffic.json")
        if not os.path.exists(path):
            print(f"  !! {path} not found: run node_traffic.py --runs-dir {runs_dir}",
                  file=sys.stderr)
        else:
            for entry in json.load(open(path)):
                if entry["point"] in out:
                    for col in TRAFFIC:
                        out[entry["point"]][col] = entry.get(col)
    return out


def ratio(a, b):
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) or not a:
        return None
    return b / a


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--a", required=True, help="baseline runs directory")
    ap.add_argument("--b", required=True, help="comparison runs directory")
    ap.add_argument("--a-label", default="A")
    ap.add_argument("--b-label", default="B")
    ap.add_argument("--sfu-container", default="openvidu")
    ap.add_argument("--traffic", action="store_true",
                    help="include NIC traffic columns from node_traffic.json")
    ap.add_argument("--noise", type=float, default=0.03,
                    help="cores below which a difference is not a result")
    args = ap.parse_args()

    left = collect(args.a, args.sfu_container, args.traffic)
    right = collect(args.b, args.sfu_container, args.traffic)
    shared = sorted(set(left) & set(right))
    if not shared:
        print("no points in common between the two directories", file=sys.stderr)
        return 1

    cols = list(PORTABLE) + (list(TRAFFIC) if args.traffic else []) + ["cores"]
    print(f"ENGINE COMPARISON: {args.a_label} -> {args.b_label}")
    print("=" * 78)
    print(f"{len(shared)} points in common: {', '.join(shared)}")
    print()

    core_ratios = {}
    for point in shared:
        a, b = left[point], right[point]
        # A run that did not deliver its load is not comparable to one that did.
        bad = [lbl for lbl, row in ((args.a_label, a), (args.b_label, b))
               if "No more workers" in (row.get("stop_reason") or "")]
        print(f"{point}" + (f"   !! truncated on {', '.join(bad)}" if bad else ""))
        print(f"   {'column':14}{args.a_label:>13}{args.b_label:>13}{'ratio':>9}")
        for col in cols:
            x, y = a.get(col), b.get(col)
            r = ratio(x, y)
            xs = f"{x:13.3f}" if isinstance(x, (int, float)) else f"{'-':>13}"
            ys = f"{y:13.3f}" if isinstance(y, (int, float)) else f"{'-':>13}"
            print(f"   {col:14}{xs}{ys}" + (f"{r:8.2f}x" if r else f"{'-':>9}"))
        if not bad:
            r = ratio(a.get("cores"), b.get("cores"))
            if r:
                core_ratios[point] = r
        print()

    if len(core_ratios) >= 2:
        values = list(core_ratios.values())
        med = statistics.median(values)
        spread = (max(values) - min(values)) / med * 100 if med else float("nan")
        print("=" * 78)
        print("SFU CORE RATIO ACROSS POINTS")
        print("=" * 78)
        for point, r in sorted(core_ratios.items(), key=lambda kv: kv[1]):
            print(f"   {point:14}{r:6.2f}x")
        print(f"\n   median {med:.2f}x, range {min(values):.2f}..{max(values):.2f}, "
              f"spread {spread:.0f}% of the median")
        print()
        if spread < 25:
            print(f"   Tight enough to treat as ONE scalar: {args.b_label} costs about")
            print(f"   {med:.2f}x {args.a_label} regardless of composition, so the")
            print("   calculator can carry a single engine multiplier.")
        else:
            print("   Too spread to be one scalar. The ratio depends on what the load is")
            print("   made of, so either quote one engine only, or run the core matrix")
            print("   on both. Check whether the inbound-heavy and outbound-heavy points")
            print("   sit at opposite ends -- that identifies which term differs.")
        print()
        print(f"   Differences below {args.noise:.3f} cores are inside run-to-run noise;")
        print("   a ratio computed from two small numbers can be mostly noise even when")
        print("   it looks dramatic.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
