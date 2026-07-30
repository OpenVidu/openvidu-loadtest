"""Parsing helpers shared by every tool in this directory.

Everything here reads the two artefacts a load-test run leaves in `results/`:

  results-<timestamp>.txt   the text report: stop reason, session counts,
                            per-node and per-container CPU/memory, recordings
  report-<timestamp>.html   the HTML report: the platform metric table
                            (min/avg/max per metric over the test-case window)

Only the standard library is used, so these scripts run anywhere the load test
does without installing anything.
"""

from __future__ import annotations

import glob
import html as htmlmod
import os
import re
from datetime import datetime, timezone

# --------------------------------------------------------------------------
# numbers
# --------------------------------------------------------------------------

# The HTML report formats large numbers with thousands separators and scales
# bit rates by unit. Both have to be undone before arithmetic.
_UNIT_SCALE = {"Gbps": 1e9, "Mbps": 1e6, "Kbps": 1e3, "bps": 1.0}


def parse_number(text):
    """'12,538 pkts/s' -> 12538.0 ; '4.59 Mbps' -> 4590000.0 ; '1.20 %' -> 1.2

    The comma removal is not cosmetic. Leaving it in makes `float()`-style
    parsing stop at the separator, so every value above 999 silently becomes a
    small one ('12,538' -> 12.0) while smaller values look perfectly correct.
    That failure mode is invisible in a spot check and corrupts exactly the
    high-load points that carry the most information.
    """
    if text is None:
        return None
    text = text.strip().replace(",", "")
    if not text or text in {"-", "N/A", "NaN"}:
        return None
    m = re.match(r"^(-?[\d.]+)\s*([A-Za-z%/]*)", text)
    if not m:
        return None
    return float(m.group(1)) * _UNIT_SCALE.get(m.group(2), 1.0)


def _strip_tags(fragment):
    return htmlmod.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


# --------------------------------------------------------------------------
# HTML report: platform metrics
# --------------------------------------------------------------------------

_METRIC_ROW = re.compile(
    r'<td class="metric-name">([a-z_0-9]+)<div[^>]*>.*?</div></td>\s*'
    r"<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>",
    re.S,
)


def platform_metrics(html_path):
    """{metric_name: {'min': x, 'avg': y, 'max': z}} for every metric in the table.

    Metric names are whatever GrafanaPrometheusClient defines, currently:
    participants, rooms, tracks_published, tracks_subscribed, participant_join_rate,
    bandwidth_in, bandwidth_out, packets_in, packets_out, packet_loss, rtt_p95,
    jitter_p95, packet_out_of_order, pli_rate, quality_score.
    """
    with open(html_path, encoding="utf-8") as fh:
        body = fh.read()
    out = {}
    for m in _METRIC_ROW.finditer(body):
        out[m.group(1)] = {
            "min": parse_number(_strip_tags(m.group(2))),
            "avg": parse_number(_strip_tags(m.group(3))),
            "max": parse_number(_strip_tags(m.group(4))),
        }
    return out


# --------------------------------------------------------------------------
# text report: summary, nodes, containers, recordings
# --------------------------------------------------------------------------

_NODE_LINE = re.compile(
    r"^\s+(\S+) \((\w+)\): CPU avg ([\d.]+)%, max ([\d.]+)%"
    r"(?: \| MEM avg ([\d.]+)%, max ([\d.]+)%)?"
)
_CONTAINER_LINE = re.compile(
    r"^\s+(\S+): CPU avg ([\d.]+) cores, max ([\d.]+) cores"
    r"(?: \| MEM avg (\d+) MB)?"
)


def text_report(txt_path):
    """Everything the text report carries, as a dict.

    Returns keys: stop_reason, sessions_created, sessions_completed,
    participants_created, workers_used, nodes {role: {...}},
    containers {role: {name: {...}}}, recordings [ ... ].

    IMPORTANT about `nodes`: the per-node CPU percentage comes from Metricbeat's
    `system` module reading /hostfs, so it describes the HOST the Metricbeat
    agent runs on. On a deployment where each OpenVidu node is its own machine
    (any real AWS deployment) that is the node. On a host running several nodes
    as containers -- the OpenVidu Playground, or any single-box test rig -- every
    role reports the same host-wide figure, and the roles are indistinguishable.
    `containers` does not have this problem: each node runs its own Docker daemon
    and only sees its own containers, so per-container CPU is always per-node.
    Prefer `containers` whenever the two could disagree.
    """
    with open(txt_path, encoding="utf-8", errors="replace") as fh:
        text = fh.read()

    def find_int(pattern):
        m = re.search(pattern, text)
        return int(m.group(1)) if m else None

    stop = re.search(r"Stop reason:\s*(.+)", text)
    out = {
        "stop_reason": stop.group(1).strip() if stop else None,
        "sessions_created": find_int(r"Number of sessions created:\s*(\d+)"),
        "sessions_completed": find_int(r"Number of sessions completed:\s*(\d+)"),
        "participants_created": find_int(r"Number of participants created:\s*(\d+)"),
        "workers_used": find_int(r"Number of workers used:\s*(\d+)"),
        "nodes": {},
        "containers": {},
        "recordings": parse_recordings(text),
    }

    role = None
    for line in text.splitlines():
        n = _NODE_LINE.match(line)
        if n:
            role = n.group(2)
            out["nodes"][role] = {
                "name": n.group(1),
                "cpu_pct_avg": float(n.group(3)),
                "cpu_pct_max": float(n.group(4)),
                "mem_pct_avg": float(n.group(5)) if n.group(5) else None,
            }
            out["containers"].setdefault(role, {})
            continue
        c = _CONTAINER_LINE.match(line)
        if c and role:
            out["containers"][role][c.group(1)] = {
                "cores_avg": float(c.group(2)),
                "cores_max": float(c.group(3)),
                "mem_mb": int(c.group(4)) if c.group(4) else None,
            }
    return out


def parse_recordings(text):
    """One dict per line of the report's `Recordings:` block.

    Lines look like either

      ROOM_COMPOSITE | room M1 | EG_x | started <date> | duration 150s
      TRACK | room M1 | TR_VCx | EG_y | started <date> | duration 153s
      ROOM_COMPOSITE | room M2 | NOT STARTED | error: ...

    A NOT STARTED line means the recording never ran; the run is not a valid
    egress measurement no matter what the process exit code was.
    """
    block = re.search(r"Recordings:\s*\n(.*?)(?=\nOpenVidu nodes|\nTest duration|\Z)",
                      text, re.S)
    if not block:
        return []
    jobs = []
    for line in block.group(1).splitlines():
        line = line.strip()
        if not line:
            continue
        room = re.search(r"room (\S+)", line)
        started = re.search(r"started (.+?) \| duration (\d+)s", line)
        err = re.search(r"error: (.+)$", line)
        job = {
            "type": line.split("|")[0].strip(),
            "room": room.group(1) if room else None,
            "started": "NOT STARTED" not in line,
            "started_at": None,
            "duration_s": None,
            "error": err.group(1).strip() if err else None,
            "raw": line,
        }
        if started:
            # e.g. "Thu Jul 30 08:29:40 GMT 2026"
            try:
                stamp = datetime.strptime(started.group(1).strip(), "%a %b %d %H:%M:%S %Z %Y")
                job["started_at"] = stamp.replace(tzinfo=timezone.utc)
            except ValueError:
                pass
            job["duration_s"] = int(started.group(2))
        jobs.append(job)
    return jobs


# --------------------------------------------------------------------------
# run directories
# --------------------------------------------------------------------------

def find_runs(runs_dir):
    """[(name, txt_path, html_path)] for each subdirectory holding both reports.

    The expected layout is one directory per matrix point:

      runs/
        s3a/  results-<ts>.txt  report-<ts>.html
        s3b/  results-<ts>.txt  report-<ts>.html

    A point whose test case produced several scenarios has several report files;
    the newest of each is used, so copy one point per directory.
    """
    found = []
    for entry in sorted(glob.glob(os.path.join(runs_dir, "*"))):
        if not os.path.isdir(entry):
            continue
        txts = sorted(glob.glob(os.path.join(entry, "results-*.txt")))
        htmls = sorted(glob.glob(os.path.join(entry, "report-*.html")))
        if txts and htmls:
            found.append((os.path.basename(entry), txts[-1], htmls[-1]))
    return found
