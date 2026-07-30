#!/usr/bin/env python3
"""Media traffic per node, from Metricbeat instead of the platform's own counters.

WHY THIS EXISTS

On the mediasoup RTC engine, LiveKit's traffic counters report nothing:
`livekit_packet_total` and `livekit_packet_bytes` stay at zero while 42
participants exchange media, because mediasoup moves RTP in its own workers and
those counters only see what passes through the Go layer. Verified live:

    sum(livekit_participant_total)                            42
    sum(livekit_track_subscribed_total)                        82
    sum(rate(livekit_packet_total{direction="incoming"}[1m]))   0.0
    sum(rate(livekit_packet_bytes{direction="outgoing"}[1m]))   0.0

That is worse than a missing metric, because the report still lists
`packets_in`, `packets_out`, `bandwidth_in` and `bandwidth_out` -- as zeros. A
zero-variance column silently enters the fit as a valid regressor.

Since the SFU's cost is fundamentally per-packet, losing those columns removes
the ability to model bitrate at all, and bitrate is what "video quality" means in
the cost model. This tool substitutes the node's own NIC counters, which are
engine-agnostic: Metricbeat's `system.network` metricset is already enabled in
`server-resources/metricbeat-configs/metricbeat.yml`.

    node_traffic.py --es http://es:9200 --runs-dir runs/
    node_traffic.py --es http://es:9200 --start 2026-07-30T09:00:00Z \\
                    --end 2026-07-30T09:05:00Z

WHAT TO WATCH OUT FOR

  * These are CUMULATIVE counters, so a window value is max - min, not an
    average. Averaging them is meaningless.
  * They carry every byte the node sends, not just media: Metricbeat shipping to
    Elasticsearch, Prometheus scrapes, control plane, recording uploads. Subtract
    an idle baseline (`--idle-bps`, from a no-traffic window) before attributing
    the rest to media.
  * Direction is from the node's point of view, so `in` is what publishers send
    to the SFU and `out` is what the SFU forwards to subscribers -- the same
    sense as g_in and g_out.
  * It cannot attribute traffic to a track or a participant. For that, use the
    per-participant WebRTC stats the browser-emulator indexes into Elasticsearch.
"""

from __future__ import annotations

import argparse
import base64
import glob
import json
import os
import re
import ssl
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.report import find_runs  # noqa: E402

FIELDS = {
    "in_bytes": "system.network.in.bytes",
    "out_bytes": "system.network.out.bytes",
    "in_packets": "system.network.in.packets",
    "out_packets": "system.network.out.packets",
}


def es_search(es_url, body, user=None, password=None):
    req = urllib.request.Request(
        f"{es_url.rstrip('/')}/metricbeat-*/_search?size=0",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    if user:
        token = base64.b64encode(f"{user}:{password or ''}".encode()).decode()
        req.add_header("Authorization", "Basic " + token)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
        return json.load(resp)


def window_traffic(es_url, role, start, end, user, password, iface=None):
    """Bytes and packets moved during [start, end], as counter deltas."""
    filters = [
        {"term": {"fields.node_role": role}},
        {"range": {"@timestamp": {"gte": start, "lte": end}}},
        {"exists": {"field": FIELDS["in_bytes"]}},
    ]
    if iface:
        filters.append({"term": {"system.network.name": iface}})
    aggs = {}
    for name, field in FIELDS.items():
        aggs[f"{name}_min"] = {"min": {"field": field}}
        aggs[f"{name}_max"] = {"max": {"field": field}}
    body = {"query": {"bool": {"filter": filters}},
            "aggs": {"iface": {"terms": {"field": "system.network.name", "size": 10},
                               "aggs": aggs}}}
    got = es_search(es_url, body, user, password)
    out = {}
    for bucket in got.get("aggregations", {}).get("iface", {}).get("buckets", []):
        deltas = {}
        for name in FIELDS:
            lo = bucket[f"{name}_min"]["value"]
            hi = bucket[f"{name}_max"]["value"]
            # A counter reset (node restart) makes the delta meaningless; report
            # None rather than a negative or absurd number.
            deltas[name] = (hi - lo) if (lo is not None and hi is not None
                                         and hi >= lo) else None
        out[bucket["key"]] = deltas
    return out


def run_window(txt_path):
    """(start, end) of a run, from the report's own timestamps."""
    with open(txt_path, encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    header = re.search(r"----- Test Case Report (.+?) -----", text)
    duration = re.search(r"Test duration:\s*(\d+)h (\d+)m (\d+)s", text)
    if not header or not duration:
        return None, None
    try:
        start = datetime.strptime(header.group(1).strip(), "%a %b %d %H:%M:%S %Z %Y")
    except ValueError:
        return None, None
    start = start.replace(tzinfo=timezone.utc)
    h, m, s = (int(x) for x in duration.groups())
    return start, start + timedelta(hours=h, minutes=m, seconds=s)


def fmt(value, seconds, per_second=False, scale=1.0):
    if value is None:
        return f"{'-':>12}"
    v = value / scale
    if per_second and seconds > 0:
        v = v / seconds
    return f"{v:12,.1f}"


def report(label, traffic, seconds, idle_bps):
    for iface, d in sorted(traffic.items()):
        in_bps = (d["in_bytes"] * 8 / seconds) if d["in_bytes"] and seconds else 0
        out_bps = (d["out_bytes"] * 8 / seconds) if d["out_bytes"] and seconds else 0
        in_bps = max(0.0, in_bps - idle_bps)
        out_bps = max(0.0, out_bps - idle_bps)
        print(f"  {label:12}{iface:8}{in_bps / 1e6:10.2f}{out_bps / 1e6:11.2f}"
              f"{fmt(d['in_packets'], seconds, True)}{fmt(d['out_packets'], seconds, True)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--es", required=True)
    ap.add_argument("--es-user")
    ap.add_argument("--es-pass")
    ap.add_argument("--runs-dir", help="derive each run's window from its report")
    ap.add_argument("--start", help="ISO-8601, for a single ad-hoc window")
    ap.add_argument("--end")
    ap.add_argument("--role", default="medianode")
    ap.add_argument("--iface", help="restrict to one interface, e.g. eth0")
    ap.add_argument("--idle-bps", type=float, default=0.0,
                    help="bits/s of non-media overhead to subtract, measured on a "
                         "no-traffic window (Metricbeat shipping, scrapes, ...)")
    args = ap.parse_args()

    print("NODE TRAFFIC FROM METRICBEAT  (engine-agnostic substitute for the")
    print("platform packet counters, which read zero on mediasoup)")
    print("=" * 84)
    print(f"  {'point':12}{'iface':8}{'Mbps in':>10}{'Mbps out':>11}{'pps in':>12}{'pps out':>12}")
    print("-" * 84)

    if args.start and args.end:
        traffic = window_traffic(args.es, args.role, args.start, args.end,
                                 args.es_user, args.es_pass, args.iface)
        start = datetime.fromisoformat(args.start.replace("Z", "+00:00"))
        end = datetime.fromisoformat(args.end.replace("Z", "+00:00"))
        report("(window)", traffic, (end - start).total_seconds(), args.idle_bps)
        return 0

    if not args.runs_dir:
        ap.error("give --runs-dir, or both --start and --end")

    rows = {}
    for point, txt, _ in find_runs(args.runs_dir):
        start, end = run_window(txt)
        if not start:
            print(f"  {point:12} could not read the window from its report")
            continue
        traffic = window_traffic(args.es, args.role,
                                 start.isoformat().replace("+00:00", "Z"),
                                 end.isoformat().replace("+00:00", "Z"),
                                 args.es_user, args.es_pass, args.iface)
        seconds = (end - start).total_seconds()
        report(point, traffic, seconds, args.idle_bps)
        for iface, d in traffic.items():
            if d["in_bytes"] is not None and seconds:
                rows[point] = {
                    "point": point, "iface": iface, "window_s": seconds,
                    "mbps_in": max(0.0, d["in_bytes"] * 8 / seconds - args.idle_bps) / 1e6,
                    "mbps_out": max(0.0, d["out_bytes"] * 8 / seconds - args.idle_bps) / 1e6,
                    "pps_in": (d["in_packets"] or 0) / seconds,
                    "pps_out": (d["out_packets"] or 0) / seconds,
                }

    if rows and args.runs_dir:
        path = os.path.join(args.runs_dir, "node_traffic.json")
        with open(path, "w") as fh:
            json.dump(list(rows.values()), fh, indent=1)
        print(f"\nwrote {path}")
        print("Merge these columns over the zero-valued platform ones before fitting")
        print("on a mediasoup deployment.")
    print()
    print("Counters are cumulative, so each figure is a delta over the run's window")
    print("and includes non-media node traffic. Measure --idle-bps on a quiet window")
    print("first, or the small points will be mostly monitoring overhead.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
