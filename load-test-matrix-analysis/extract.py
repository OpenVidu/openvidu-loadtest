#!/usr/bin/env python3
"""Turn a directory of runs into one row of regressors per matrix point.

This is the bridge between reports and the fit: everything downstream reads the
JSON/CSV this writes.

The first rule of the analysis is to regress on MEASURED COUNTERS, never on the
config. Emulated mode's geometry is not what the topology name suggests
(`ONE_SESSION_NXN: "30"` is 60 participants, not 30), so the config is not a
description of the load that reached the server. Every column here comes from
the platform's own counters or from Metricbeat.

    extract.py --runs-dir runs/ [--out rows.json] [--csv rows.csv]
               [--sfu-container openvidu] [--egress-container egress]

Window averages include ramp-up (gap G7), so a column reads lower than the
steady state it is named after. That is acceptable for fitting because the
regressors and the CPU they explain are diluted together, which largely cancels
in the slopes -- but it is NOT acceptable for reading an absolute value out of a
single run. For per-recording cost specifically, use egress_cost.py, which
queries the recording sub-window instead.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.report import find_runs, platform_metrics, text_report  # noqa: E402

# platform metric name -> column name. bandwidth_* are stored in bits/s as the
# report gives them; fit.py works in whatever units it is handed.
METRICS = {
    "participants": "participants",
    "rooms": "rooms",
    "tracks_published": "tracks_pub",
    "tracks_subscribed": "tracks_sub",
    "participant_join_rate": "join_rate",
    "bandwidth_in": "bits_in",
    "bandwidth_out": "bits_out",
    "packets_in": "pkts_in",
    "packets_out": "pkts_out",
    "packet_loss": "loss_pct",
    "rtt_p95": "rtt_p95_ms",
    "jitter_p95": "jitter_p95_ms",
    "quality_score": "quality",
}

COLUMNS = [
    "point", "rooms", "participants", "participants_peak", "tracks_pub", "tracks_sub",
    "mbps_in", "mbps_out", "pkts_in", "pkts_out", "sfu_cores", "sfu_cores_max",
    "egress_cores", "egress_cores_max", "loss_pct", "quality",
    "medianode_cpu_pct", "masternode_cpu_pct", "master_container_cores",
    "sessions_created", "sessions_completed", "recordings_started",
    "recordings_failed", "stop_reason",
]


def build_row(name, txt_path, html_path, sfu, egress):
    metrics = platform_metrics(html_path)
    rep = text_report(txt_path)
    row = {"point": name}

    for metric, column in METRICS.items():
        row[column] = (metrics.get(metric) or {}).get("avg")
    row["participants_peak"] = (metrics.get("participants") or {}).get("max")
    # Report bit rates as Mbps, which is what everyone reads them in.
    for src, dst in (("bits_in", "mbps_in"), ("bits_out", "mbps_out")):
        row[dst] = row.pop(src) / 1e6 if row.get(src) else row.pop(src, None)

    media = rep["containers"].get("medianode", {})
    row["sfu_cores"] = (media.get(sfu) or {}).get("cores_avg")
    row["sfu_cores_max"] = (media.get(sfu) or {}).get("cores_max")
    row["egress_cores"] = (media.get(egress) or {}).get("cores_avg")
    row["egress_cores_max"] = (media.get(egress) or {}).get("cores_max")

    row["medianode_cpu_pct"] = (rep["nodes"].get("medianode") or {}).get("cpu_pct_avg")
    row["masternode_cpu_pct"] = (rep["nodes"].get("masternode") or {}).get("cpu_pct_avg")
    # Summed master containers, which IS per-node even on a shared host, unlike
    # the node-level percentage. This is the honest master-tier figure.
    master = rep["containers"].get("masternode", {})
    row["master_container_cores"] = round(
        sum(c["cores_avg"] for c in master.values()), 4) if master else None

    row["sessions_created"] = rep["sessions_created"]
    row["sessions_completed"] = rep["sessions_completed"]
    row["recordings_started"] = sum(1 for j in rep["recordings"]
                                    if j["started"] and not j["error"])
    row["recordings_failed"] = sum(1 for j in rep["recordings"]
                                   if not j["started"] or j["error"])
    row["stop_reason"] = rep["stop_reason"]
    return row


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--out", default="rows.json")
    ap.add_argument("--csv")
    ap.add_argument("--sfu-container", default="openvidu",
                    help="container carrying the SFU (default: openvidu)")
    ap.add_argument("--egress-container", default="egress")
    args = ap.parse_args()

    runs = find_runs(args.runs_dir)
    if not runs:
        print(f"no runs found under {args.runs_dir}", file=sys.stderr)
        return 1

    rows = [build_row(n, t, h, args.sfu_container, args.egress_container)
            for n, t, h in runs]

    with open(args.out, "w") as fh:
        json.dump(rows, fh, indent=1)
    if args.csv:
        with open(args.csv, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=COLUMNS, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)

    hdr = ("point", "rooms", "parts", "T_pub", "T_sub", "Mbps_in", "Mbps_out",
           "pps_in", "pps_out", "SFU", "egress")
    widths = (11, 6, 7, 7, 8, 8, 9, 8, 9, 7, 8)
    print("".join(f"{h:>{w}}" if i else f"{h:<{w}}"
                  for i, (h, w) in enumerate(zip(hdr, widths))))
    print("-" * sum(widths))
    keys = ("rooms", "participants", "tracks_pub", "tracks_sub", "mbps_in",
            "mbps_out", "pkts_in", "pkts_out", "sfu_cores", "egress_cores")
    prec = (1, 1, 1, 1, 2, 2, 0, 0, 3, 3)
    for r in rows:
        line = f"{r['point']:<11}"
        for key, w, p in zip(keys, widths[1:], prec):
            v = r.get(key)
            line += f"{v:>{w}.{p}f}" if isinstance(v, (int, float)) else f"{'-':>{w}}"
        print(line)
    print(f"\n{len(rows)} points -> {args.out}"
          + (f" and {args.csv}" if args.csv else ""))
    bad = [r["point"] for r in rows if r["recordings_failed"]
           or (r["stop_reason"] or "").startswith("No more workers")]
    if bad:
        print(f"WARNING: these points look invalid, run gate.py: {', '.join(bad)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
