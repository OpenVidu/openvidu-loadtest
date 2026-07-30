#!/usr/bin/env python3
"""Decide whether a finished run is a valid measurement. Run this FIRST.

The controller's exit code says whether the process finished, not whether it
delivered the load that was asked for. Three ways a run under-delivers while
still exiting 0 have been observed:

  1. Rooms silently dropped. In emulated ("LOADTEST") mode the worker cursor
     only ever moves forward and never wraps, so a test case with N rooms needs
     at least N workers -- `distribution.usersPerWorker` will not let one worker
     host a second room. The report says
     "Stop reason: No more workers available" and the process exits 0.
     Observed: an 8-room case on one worker delivered 8 of 64 participants.

  2. Recordings aimed at rooms that were never created, as a consequence of (1).
     The report carries a "NOT STARTED" line with the Egress API error.

  3. Participants refused by the platform while the report still says
     "Stop reason: Test finished" (gap G11: in emulated mode
     `maxParticipantErrors` is only consulted between chunks, so a single-chunk
     room never re-checks after launch).

Exit status: 0 = usable point, 1 = discard and re-run, 2 = bad invocation.

    gate.py RUN_DIR [--expect-participants N]
    gate.py --runs-dir runs/ --expect-file expected.tsv

`expected.tsv` is "point<TAB>participants" per line; see geometry.py, which can
compute the expected count from a test-case config.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.report import find_runs, platform_metrics, text_report  # noqa: E402


def check(txt_path, html_path, expected=None, traffic=None):
    """[] if the run is usable, otherwise a list of reasons it is not.

    `traffic` is an optional (bits_in_per_s, bits_out_per_s) pair from
    node_traffic.py, needed to verify forwarding on engines whose own
    counters read zero.
    """
    rep = text_report(txt_path)
    problems = []
    stop = rep["stop_reason"] or "?"

    if "No more workers" in stop:
        problems.append(
            f"rooms were dropped: stop reason is '{stop}'. A multi-room test case "
            "needs at least one worker per room; usersPerWorker does not help.")

    created, completed = rep["sessions_created"], rep["sessions_completed"]
    if created and completed is not None and created > 1 and completed < created:
        # Only meaningful for multi-room cases: the ONE_SESSION_* topologies never
        # count a completed session, in either NORMAL or LOADTEST mode, so "0/1"
        # there is the reporting convention rather than a failure.
        problems.append(f"only {completed} of {created} rooms completed")

    for job in rep["recordings"]:
        if not job["started"]:
            problems.append(f"recording never started: {job['raw']}")
        elif job["error"]:
            problems.append(f"recording reported an error: {job['raw']}")

    if not rep["nodes"]:
        problems.append("no node metrics in the report: nothing to fit CPU against "
                        "(check Elasticsearch and Metricbeat)")

    # Is the SFU actually forwarding? A room can have every participant connected
    # and every subscription registered while no media flows to subscribers, in
    # which case CPU reads low because the SFU is idle -- not because it is
    # efficient. Observed with videoCodec: h264 on mediasoup: 12 tracks published,
    # 144 subscribed, and outbound traffic equal to inbound. The same geometry on
    # VP8 forwarded at the expected 8x. Nothing else in the run reports a problem:
    # no error, correct participant count, exit 0.
    metrics = platform_metrics(html_path)
    published = (metrics.get("tracks_published") or {}).get("avg") or 0
    subscribed = (metrics.get("tracks_subscribed") or {}).get("avg") or 0
    in_bw = (metrics.get("bandwidth_in") or {}).get("avg") or 0
    out_bw = (metrics.get("bandwidth_out") or {}).get("avg") or 0

    if published > 0 and in_bw == 0 and out_bw == 0:
        # mediasoup never populates these, so the fan-out check has to come from
        # node_traffic.json instead. Say so rather than skipping silently.
        problems.append(
            "platform traffic counters read zero while tracks are published: this is "
            "the mediasoup engine, where packets_*/bandwidth_* are never populated. "
            "Run node_traffic.py and pass --traffic-file, or forwarding cannot be "
            "verified and the packet regressors are unusable.")
    elif traffic is None and published > 0 and subscribed > published * 1.5:
        traffic = (in_bw, out_bw)

    if traffic and published > 0 and subscribed > published * 1.5:
        got_in, got_out = traffic
        if got_in:
            expected_fanout = subscribed / published   # streams out per stream in
            actual = got_out / got_in
            if actual < expected_fanout * 0.4:
                problems.append(
                    f"the SFU does not appear to be forwarding: {subscribed:.0f} tracks "
                    f"subscribed against {published:.0f} published implies about "
                    f"{expected_fanout:.1f}x fan-out, but outbound/inbound traffic is only "
                    f"{actual:.2f}x. Verified cause: videoCodec h264 does not forward "
                    "on mediasoup with lk load-test publishers -- the room fills, "
                    "subscriptions register, the run exits 0, and the SFU stays idle, "
                    "so its low CPU is inactivity rather than efficiency. VP8 on the "
                    "same deployment forwarded at the expected rate.")

    if expected:
        metrics = platform_metrics(html_path)
        peak = (metrics.get("participants") or {}).get("max")
        if peak is None:
            problems.append("no participants metric: platform monitoring was down, "
                            "so the run cannot be validated at all")
        elif peak < expected - 0.5:
            problems.append(f"platform saw only {peak:.0f} of {expected} participants "
                            f"({peak / expected * 100:.0f}% of the intended load)")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir", nargs="?", help="a single run directory")
    ap.add_argument("--runs-dir", help="directory of run directories, checked in bulk")
    ap.add_argument("--expect-participants", type=int,
                    help="peak platform participants this run should have reached")
    ap.add_argument("--expect-file",
                    help="TSV of 'point<TAB>expected_participants' for bulk mode")
    ap.add_argument("--traffic-file",
                    help="node_traffic.json from node_traffic.py. Required to verify "
                         "forwarding on mediasoup, whose own traffic counters read zero")
    args = ap.parse_args()

    expected_map = {}
    if args.expect_file:
        with open(args.expect_file) as fh:
            for line in fh:
                parts = line.split()
                if len(parts) >= 2 and parts[1].isdigit():
                    expected_map[parts[0]] = int(parts[1])

    traffic_map = {}
    if args.traffic_file:
        import json
        for entry in json.load(open(args.traffic_file)):
            traffic_map[entry["point"]] = (entry.get("mbps_in", 0) * 1e6,
                                           entry.get("mbps_out", 0) * 1e6)

    if args.runs_dir:
        runs = find_runs(args.runs_dir)
        if not runs:
            print(f"no runs found under {args.runs_dir}")
            return 2
        bad = 0
        for name, txt, html in runs:
            problems = check(txt, html, expected_map.get(name), traffic_map.get(name))
            if problems:
                bad += 1
                print(f"INVALID  {name}")
                for p in problems:
                    print(f"           - {p}")
            else:
                print(f"valid    {name}")
        print(f"\n{len(runs) - bad} of {len(runs)} runs usable.")
        if bad:
            print("Discard the invalid points and re-run them; do not fit them.")
        return 1 if bad else 0

    if not args.run_dir:
        ap.print_usage()
        return 2
    txts = sorted(glob.glob(os.path.join(args.run_dir, "results-*.txt")))
    htmls = sorted(glob.glob(os.path.join(args.run_dir, "report-*.html")))
    if not txts or not htmls:
        print(f"{args.run_dir}: expected results-*.txt and report-*.html")
        return 2
    problems = check(txts[-1], htmls[-1], args.expect_participants,
                     traffic_map.get(os.path.basename(args.run_dir.rstrip('/'))))
    if problems:
        print("INVALID -- discard this point:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"valid (stop reason: {text_report(txts[-1])['stop_reason']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
