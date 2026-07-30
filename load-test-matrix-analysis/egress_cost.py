#!/usr/bin/env python3
"""Per-recording cost, measured over the recording window only (scenario S9).

Why this cannot be read from the report: `egress.startAfterSeconds` deliberately
puts un-recorded time inside the same test case, so the run is self-differencing.
That also means the report's window average blends a recorded and an un-recorded
phase, and the blend ratio differs at every point in the family. Measured
locally, the report average understated per-job cost by 28% (0.860 vs 1.196
cores) -- and the size of that error changes with `startAfterSeconds`, so it
cannot even be corrected by a constant factor.

This reads each job's start time and duration from the report's `Recordings:`
block, then aggregates per-container CPU from Elasticsearch over just that
interval.

    egress_cost.py --runs-dir runs/ --es http://localhost:9200
    egress_cost.py --runs-dir runs/ --es ... --es-user elastic --es-pass changeme

Requires the Metricbeat `docker` module (per-container metrics). On a node where
the SFU and the Egress service share a host, that module is the only thing that
can tell their CPU apart -- node-level CPU cannot.
"""

from __future__ import annotations

import argparse
import base64
import glob
import json
import os
import ssl
import sys
import urllib.request
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.report import find_runs, parse_recordings  # noqa: E402


def es_search(es_url, body, user=None, password=None, index="metricbeat-*"):
    req = urllib.request.Request(
        f"{es_url.rstrip('/')}/{index}/_search?size=0",
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


def container_cpu(es_url, start, end, user, password, role="medianode"):
    """{container: (avg_cores, max_cores)} over [start, end]."""
    body = {
        "query": {"bool": {"filter": [
            {"term": {"fields.node_role": role}},
            {"range": {"@timestamp": {
                "gte": start.isoformat().replace("+00:00", "Z"),
                "lte": end.isoformat().replace("+00:00", "Z")}}},
            {"exists": {"field": "docker.cpu.total.pct"}},
        ]}},
        "aggs": {"c": {"terms": {"field": "container.name", "size": 40},
                       "aggs": {"avg": {"avg": {"field": "docker.cpu.total.pct"}},
                                "max": {"max": {"field": "docker.cpu.total.pct"}}}}},
    }
    got = es_search(es_url, body, user, password)
    buckets = got.get("aggregations", {}).get("c", {}).get("buckets", [])
    return {b["key"]: (b["avg"]["value"] or 0.0, b["max"]["value"] or 0.0)
            for b in buckets}


def object_bytes(runs_dir, point, prefix_template="loadtest-{point}"):
    """Total recorded bytes for a point, if sizes.tsv was produced by storage.py.

    The match is on the key's first path segment being EXACTLY the expected
    prefix, not a substring of it. A shared bucket accumulates runs whose
    prefixes nest -- `loadtest-s9w1` is a substring of `loadtest-s9w1-v8` -- and a
    substring match silently sums both, which doubled a MiB/min figure when the
    same point had been run on two engines.
    """
    path = os.path.join(runs_dir, "sizes.tsv")
    if not os.path.exists(path):
        return None
    want = prefix_template.format(point=point)
    total = 0
    with open(path) as fh:
        for line in fh:
            parts = line.split(None, 1)
            if len(parts) == 2 and parts[0].isdigit():
                key = parts[1].strip()
                if key.split("/", 1)[0] == want:
                    total += int(parts[0])
    return total or None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--es", required=True, help="Elasticsearch base URL")
    ap.add_argument("--es-user")
    ap.add_argument("--es-pass")
    ap.add_argument("--egress-container", default="egress")
    ap.add_argument("--sfu-container", default="openvidu")
    ap.add_argument("--idle-egress", type=float, default=0.010,
                    help="cores the Egress service uses with nothing recording; "
                         "measure it with idle.py and pass it here (default 0.010)")
    ap.add_argument("--trim", type=int, default=5,
                    help="seconds ignored at each end of the recording window")
    ap.add_argument("--role", default="medianode")
    ap.add_argument("--file-prefix", default="loadtest-{point}",
                    help="egress.filePrefix template used by the configs, matched "
                         "against the object key's first path segment. Must be unique "
                         "per run set, or a shared bucket will conflate them")
    args = ap.parse_args()

    runs = find_runs(args.runs_dir)
    if not runs:
        print(f"no runs found under {args.runs_dir}", file=sys.stderr)
        return 1

    print("PER-RECORDING COST, MEASURED OVER THE RECORDING WINDOW")
    print("=" * 100)
    print(f"{'point':12}{'type':16}{'jobs':>5}{'egress avg':>12}{'egress max':>12}"
          f"{'per job':>9}{'SFU':>8}{'MiB/min':>9}")
    print("-" * 100)

    failures = []
    for point, txt_path, _ in runs:
        with open(txt_path, encoding="utf-8", errors="replace") as fh:
            jobs = parse_recordings(fh.read())
        if not jobs:
            continue
        for job in jobs:
            if not job["started"] or job["error"]:
                failures.append((point, job["raw"]))
        ran = [j for j in jobs if j["started_at"] and j["duration_s"]]
        if not ran:
            print(f"{point:12}{'-':16}{len(jobs):>5}   no job recorded a start time")
            continue

        start = min(j["started_at"] for j in ran) + timedelta(seconds=args.trim)
        end = max(j["started_at"] + timedelta(seconds=j["duration_s"])
                  for j in ran) - timedelta(seconds=args.trim)
        if end <= start:
            print(f"{point:12}{ran[0]['type']:16}{len(ran):>5}"
                  "   recording window shorter than 2x --trim")
            continue

        cpu = container_cpu(args.es, start, end, args.es_user, args.es_pass, args.role)
        eg_avg, eg_max = cpu.get(args.egress_container, (0.0, 0.0))
        sfu_avg, _ = cpu.get(args.sfu_container, (0.0, 0.0))
        per_job = (eg_avg - args.idle_egress) / len(ran)

        mib = ""
        total = object_bytes(args.runs_dir, point, args.file_prefix)
        if total:
            longest = max(j["duration_s"] for j in ran)
            mib = f"{total / 1048576 / (longest / 60):.1f}"

        print(f"{point:12}{ran[0]['type']:16}{len(ran):>5}{eg_avg:12.3f}{eg_max:12.3f}"
              f"{per_job:9.3f}{sfu_avg:8.3f}{mib:>9}")

    if failures:
        print()
        for point, raw in failures:
            print(f"  !! {point}: {raw}")
        print("  Points with a failed recording are not valid egress measurements.")

    print()
    print(f"Window trimmed {args.trim}s at each end. 'per job' subtracts the")
    print(f"{args.idle_egress:.3f}-core idle Egress service, then divides by the jobs")
    print("that actually ran. MiB/min needs sizes.tsv from storage.py.")
    print()
    print("Priors worth checking against: LiveKit documents 2-6 CPUs per")
    print("RoomComposite job, >=4 CPUs per egress instance, and hundreds of")
    print("concurrent TrackEgress jobs per instance (TrackEgress does not transcode).")
    print("If per-job cost climbs with concurrency, check whether the host was")
    print("saturated before concluding the service scales super-linearly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
