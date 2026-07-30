#!/usr/bin/env python3
"""C_idle: the no-traffic baseline, read straight out of Elasticsearch (scenario S1-a).

Worth its own tool for two reasons.

First, the controller cannot express a zero-participant test case, so the idle
baseline is not something a run produces -- it has to be sampled from a window
when the deployment is up and nothing is connected.

Second, the fitted intercept is not a substitute. On a set of points that never
approaches idle, the intercept absorbs load: locally it came out at 0.057 cores
against 0.030 measured with a 2-participant room, and refitting on an independent
set gave 0.017. A calculator carrying the inflated value overcharges a tiny
deployment by ~2x, and tiny deployments are exactly what price-sensitive
prospects type in first.

    idle.py --es http://localhost:9200 --window 20m
    idle.py --es ... --grafana https://host/grafana --grafana-user admin --grafana-pass x

Run it when the deployment is genuinely quiet. The Grafana check is optional but
recommended: it confirms the platform holds zero participants rather than a stale
room, which is the difference between an idle baseline and a wrong one.
"""

from __future__ import annotations

import argparse
import base64
import json
import ssl
import sys
import urllib.parse
import urllib.request


def _open(req):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return urllib.request.urlopen(req, timeout=60, context=ctx)


def es_search(es_url, body, user=None, password=None):
    req = urllib.request.Request(
        f"{es_url.rstrip('/')}/metricbeat-*/_search?size=0",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    if user:
        token = base64.b64encode(f"{user}:{password or ''}".encode()).decode()
        req.add_header("Authorization", "Basic " + token)
    with _open(req) as resp:
        return json.load(resp)


def field_avg(es_url, role, field, window, user, password):
    """Average of one field for one node role.

    Each metric gets its own query on purpose. Metricbeat emits ONE DOCUMENT PER
    METRICSET, so a query that filters on exists(system.cpu...) and also asks for
    a memory average silently returns nothing for memory -- the memory samples are
    in different documents. That mistake produced "0 MB" for every container in an
    early version of the controller's own collector, and it is easy to repeat.
    """
    body = {
        "query": {"bool": {"filter": [
            {"term": {"fields.node_role": role}},
            {"range": {"@timestamp": {"gte": f"now-{window}"}}},
            {"exists": {"field": field}},
        ]}},
        "aggs": {"v": {"avg": {"field": field}}},
    }
    got = es_search(es_url, body, user, password)
    return got["aggregations"]["v"]["value"], got["hits"]["total"]["value"]


def containers(es_url, role, window, user, password):
    body = {
        "query": {"bool": {"filter": [
            {"term": {"fields.node_role": role}},
            {"range": {"@timestamp": {"gte": f"now-{window}"}}},
            {"exists": {"field": "docker.cpu.total.pct"}},
        ]}},
        "aggs": {"c": {"terms": {"field": "container.name", "size": 40},
                       "aggs": {"cpu": {"avg": {"field": "docker.cpu.total.pct"}}}}},
    }
    got = es_search(es_url, body, user, password)
    buckets = got.get("aggregations", {}).get("c", {}).get("buckets", [])
    return sorted(((b["key"], b["cpu"]["value"] or 0.0) for b in buckets),
                  key=lambda kv: -kv[1])


def platform_participants(grafana, user, password, datasource, window_seconds):
    """Peak participants across the SAME window the CPU average covers.

    An instantaneous check is not enough: querying "right now" between two runs
    reports zero while the averaging window still contains the tail of the run
    that just finished, which silently turns a loaded window into a bogus idle
    baseline. The maximum over the window is what has to be zero.
    """
    query = urllib.parse.urlencode({
        "query": f"max_over_time(sum(livekit_participant_total)[{window_seconds}s:15s])"})
    url = (f"{grafana.rstrip('/')}/api/datasources/proxy/uid/{datasource}"
           f"/api/v1/query?{query}")
    req = urllib.request.Request(url)
    token = base64.b64encode(f"{user}:{password or ''}".encode()).decode()
    req.add_header("Authorization", "Basic " + token)
    with _open(req) as resp:
        data = json.load(resp)
    result = data.get("data", {}).get("result", [])
    return result[0]["value"][1] if result else "0"


def window_to_seconds(window):
    """'20m' -> 1200. Accepts the s/m/h suffixes Elasticsearch date math uses."""
    units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    if window and window[-1] in units and window[:-1].isdigit():
        return int(window[:-1]) * units[window[-1]]
    return 1200


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--es", required=True)
    ap.add_argument("--es-user")
    ap.add_argument("--es-pass")
    ap.add_argument("--window", default="20m",
                    help="Elasticsearch date-math window, e.g. 20m (S1-a asks for 20 min)")
    ap.add_argument("--roles", default="medianode,masternode")
    ap.add_argument("--grafana")
    ap.add_argument("--grafana-user", default="admin")
    ap.add_argument("--grafana-pass")
    ap.add_argument("--grafana-datasource", default="openvidu-prometheus")
    ap.add_argument("--sfu-container", default="openvidu")
    args = ap.parse_args()

    print(f"IDLE BASELINE  (no traffic, last {args.window})")
    print("=" * 72)

    if args.grafana:
        try:
            peak = platform_participants(args.grafana, args.grafana_user,
                                        args.grafana_pass, args.grafana_datasource,
                                        window_to_seconds(args.window))
            print(f"peak platform participants over the window: {peak}")
            if peak not in ("0", "0.0"):
                print("  ^^ NOT IDLE. The window still contains traffic, so the numbers")
                print("     below are not an idle baseline. Let every room drain, wait")
                print(f"     the full {args.window}, then re-run.")
        except Exception as exc:
            print(f"peak platform participants: could not check ({exc})")
        print()

    sfu_idle = None
    for role in [r.strip() for r in args.roles.split(",") if r.strip()]:
        cpu, samples = field_avg(args.es, role, "system.cpu.total.norm.pct",
                                 args.window, args.es_user, args.es_pass)
        mem, _ = field_avg(args.es, role, "system.memory.actual.used.pct",
                           args.window, args.es_user, args.es_pass)
        print(f"{role}: host CPU {(cpu or 0) * 100:.2f}%  "
              f"MEM {(mem or 0) * 100:.1f}%  ({samples} samples)")
        per_container = containers(args.es, role, args.window,
                                   args.es_user, args.es_pass)
        total = sum(v for _, v in per_container)
        for name, cores in per_container[:10]:
            if cores >= 0.001:
                print(f"      {name:26} {cores:.3f} cores")
        print(f"      {'-- total containers':26} {total:.3f} cores")
        if role == "medianode":
            sfu_idle = dict(per_container).get(args.sfu_container)
        print()

    if sfu_idle is not None:
        print(f"C_idle for the media-node model is the SFU container: {sfu_idle:.3f} cores.")
    print("Everything else on a node is deployment overhead that the node carries")
    print("whether or not it serves traffic; it belongs in the per-node constant,")
    print("not in a per-stream coefficient.")
    print()
    print("If two roles report the SAME host CPU and the same core count, they are")
    print("sharing one machine and the node-level figures are host-wide, not")
    print("per-node. The per-container numbers stay correct either way, because each")
    print("node's Docker daemon only sees its own containers.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
