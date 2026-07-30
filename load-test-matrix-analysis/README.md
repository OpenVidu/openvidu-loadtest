# Load-test matrix analysis

Tooling that turns the reports of a load-test matrix into the coefficients of the
OpenVidu PRO cost model.

PRO is billed at `$0.0006` per available core per minute, so pricing reduces to
one measured question: **how many cores does a given workload force you to
provision?** These scripts answer it from the reports the loadtest controller
already writes, and — just as importantly — tell you which coefficients the data
actually pins down and which it does not.

Everything here is pure Python 3 standard library. No install step, no
dependencies.

---

## The model being fitted

```
cores_sfu = C_idle
          + k_room · rooms
          + k_part · participants
          + k_sub  · tracks_subscribed
          + g_in   · packets_in
          + g_out  · packets_out

cores_egress = Σ c_egress(type, output_resolution) · concurrent_jobs

cores_provisioned = n_nodes · vCPU_node,
    n_nodes = ceil(cores_work / (vCPU_node · u_target))

licence $/h = (cores_provisioned + cores_master) · 0.0006 · 60
```

The SFU never transcodes, so its cost is per-packet and per-stream. Egress always
transcodes, so it is a separate, much larger term — a single 1080p composite can
cost more cores than the whole room it records.

---

## Pipeline

Run in this order. Each step assumes the previous one passed.

```bash
cd load-test-matrix-analysis

# 0. Lay out one directory per matrix point, each holding that point's reports
#    runs/
#      s3a/  results-<ts>.txt  report-<ts>.html
#      s3b/  results-<ts>.txt  report-<ts>.html

# 1. Which runs are valid measurements at all?  ALWAYS FIRST.
python3 geometry.py --runs-dir runs/ --configs ../config --emit-expected expected.tsv
python3 gate.py --runs-dir runs/ --expect-file expected.tsv

# 2. Recording object sizes (storage cost, and proof the recordings happened)
python3 storage.py --runs-dir runs/ --s3 s3://your-recordings-bucket/prefix

# 3. Regressors, one row per point. On mediasoup also run node_traffic.py, whose
#    columns replace the zero-valued packets_*/bandwidth_* ones.
python3 extract.py --runs-dir runs/ --out rows.json --csv rows.csv

# 4. The idle intercept, measured rather than fitted (deployment must be quiet)
python3 idle.py --es http://es:9200 --window 20m \
    --grafana https://host/grafana --grafana-user admin --grafana-pass secret

# 5. Fit the SFU model. Exclude anything gate.py rejected.
python3 fit.py rows.json --exclude s4x2,s4x8 --holdout s7a,s7b

# 6. Per-recording cost, from the recording sub-window (NOT the report average)
python3 egress_cost.py --runs-dir runs/ --es http://es:9200 --idle-egress 0.010

# 7. Single-variable families answered by ratio, not regression
python3 compare.py rows.json --group s5l,s5m,s5h          # quality ladder
python3 compare.py rows.json --pairs s6off55:s655 --check-geometry   # simulcast
python3 compare.py rows.json --pairs s3c:s8vp8 --check-geometry      # codec
```

---

## The tools

| Script | Answers |
|---|---|
| `geometry.py` | Did each run's geometry actually reach the platform? Emits the expected participant count per point. |
| `gate.py` | Is this run a valid measurement? **Run before anything else.** |
| `extract.py` | One row of regressors per point → `rows.json` / `rows.csv`. |
| `fit.py` | Fits candidate model forms; reports residuals, leave-one-out stability, out-of-sample error. |
| `idle.py` | `C_idle` measured on a quiet deployment. |
| `egress_cost.py` | Cores per recording job, over the recording window only. |
| `storage.py` | Recorded bytes per object → `sizes.tsv`, and MiB/min per egress type. |
| `compare.py` | Ratio between two points that differ in one variable. |
| `node_traffic.py` | Traffic per node from Metricbeat. **Required on mediasoup**, where the platform's own packet and byte counters read zero. |
| `lib/report.py` | Shared parsing of the text and HTML reports. |

---

## Things that will bite you

Each of these cost real debugging time. They are encoded in the tools, but you
need to know them to read the output.

### The exit code does not mean the run was valid

The controller's exit code says the process finished, not that it delivered the
load. Three observed ways a run under-delivers while exiting `0`:

1. **Rooms silently dropped.** In emulated mode the worker cursor only moves
   forward and never wraps, so **a test case with N rooms needs at least N
   workers**. `distribution.usersPerWorker` does not let one worker host a second
   room. An 8-room case on one worker delivered **8 of 64 participants** and
   exited 0.
2. **Recordings aimed at rooms that were never created**, as a consequence of the
   above — a `NOT STARTED` line with a `404 requested room does not exist`.
3. **Participants refused by the platform** while the report still says
   `Stop reason: Test finished` (gap G11).

`gate.py` catches all three. Wrap every run in it; do not fit a point it rejects.
A short run is a *different, unknown* load point, not a noisy version of the one
you asked for.

### Size the worker fleet by room count, not by capacity

Directly from the point above:

| Family | Rooms requested | Workers needed |
|---|---|---|
| S4 room count | 5 / 15 / 40 / 80 | **up to 80** |
| S9 recording | 8 | ≥ 8 |
| S11 join rate | 40 | ≥ 40 |
| S2, S3, S5, S6 (`ONE_SESSION_*`) | 1 | 1 |

### `infinite` needs AWS prod mode with ramp-up

Any `participants: ["infinite"]` or `sessions: infinite` test case is **rejected
outright** when `workers.urls` is set, with

```
Test case requires infinite participants but workers are limited
(no ramp-up or manual workers configured)
```

Push-to-failure means "add workers until the platform breaks", so it needs the
ability to add workers: prod mode with `workers.rampUpWorkers > 0`. This affects
S2's saturation run, S3-sat, S4's `sessions: infinite`, S7's `1:infinite`, and
therefore S12, which needs the knee they find.

Make sure the worker fleet can outgrow the platform. If workers exhaust first,
the "knee" you measure is the load generator's, not OpenVidu's, and `u_target`
will be wrong.

### Regress on measured counters, never on the config

Emulated mode does not build the room the topology name suggests:

```
participants = 2P + S          publishers never subscribe
inbound      = P video + P audio
```

`ONE_SESSION_NXN: "30"` is 60 participants, not 30. Confirmed exactly across
`ONE_SESSION_NXN`, `ONE_SESSION_NXM` and `TEACHING` (where `1:N` gives
`2(1+N)` participants).

### Node-level CPU is per-node only if each node is a separate machine

Metricbeat's `system` module reads `/hostfs`, so its CPU percentage describes the
**host the agent runs on**. On real AWS instances that is the node. On any host
running several nodes as containers (the OpenVidu Playground, any single-box rig)
every role reports the *same host-wide* figure and the roles are
indistinguishable — verified: `masternode 28.78%` and `medianode 28.76%`, both
reporting 16 cores.

**Per-container metrics do not have this problem**, because each node runs its own
Docker daemon and only sees its own containers. So:

- Use `sfu_cores` / `egress_cores` (container-derived) for everything that matters.
- Treat `medianode_cpu_pct` / `masternode_cpu_pct` as host figures unless you know
  each node is its own instance.
- `master_container_cores` (summed master containers) is the honest master-tier
  number on a shared host.

This also means the master/media tier split **cannot** be measured on a shared
host at all — S11's cluster-width runs and `base(deployment_type)` need real
separate instances.

### Recording cost cannot be read from the report

`egress.startAfterSeconds` deliberately puts un-recorded time inside the same test
case, so the report's window average blends a recorded and an un-recorded phase —
and the blend ratio differs at every point in the family, so no constant
correction exists. Measured locally: report average **0.860** cores against
**1.196** in the recording window, a **28%** understatement.

Use `egress_cost.py`, which reads each job's start time and duration from the
report and aggregates container CPU over just that interval.

### `jobsPerRoom` doubles for `type: TRACK`

`jobsPerRoom` caps the number of *participants* recorded. For `TRACK`, each
participant yields up to **two** egress jobs (video + audio), so `jobsPerRoom: 4`
produced **8** jobs. Computing cores-per-job from the config rather than the
report is 2× wrong, and TRACK is exactly where job counts are largest.

### Thousands separators, and other silent number traps

The HTML report formats large numbers with commas. Naive parsing turns
`12,538 pkts/s` into `12.0` — which corrupts only the values above 999, so small
runs look perfectly correct while the high-load points that carry the most
information collapse. `lib/report.parse_number` handles it; if you write your own
parser, handle it too.

### Metricbeat emits one document per metricset

A query that filters `exists(system.cpu...)` and also averages memory returns
**nothing** for memory — the memory samples are in different documents. This
produced "0 MB" for every container in an early version of the controller's own
collector. Query each field separately.

### Statistics discipline

The matrix is small and the effects are not all large. Rules that were learned the
hard way:

- **No slope from two points.** A two-point trend in this data reversed when the
  third point arrived: a per-room cost that looked like `+0.041 cores/room` across
  2→4 rooms became `+0.0066` with 8 rooms included, inside the noise.
- **Always report scatter next to a slope.** `fit.py` prints max and RMS residual
  and leave-one-out spread; `compare.py` takes a `--noise` floor and refuses to
  call a smaller difference a result.
- **Measure your noise floor.** Repeat one point. Locally, two byte-identical
  configurations differed by 4.6% in `pps_out`, and the residual scatter at
  working loads was **0.030 cores** — larger than several terms the matrix is
  meant to measure.
- **R² is not evidence.** A form fitted on points that all shared one bitrate
  reached R² = 0.998 and then missed by 15% on the first point at a different
  bitrate. Judge on max residual and out-of-sample error, which is what
  `--holdout` is for.
- **A dropped term is not a zero-cost term.** `fit.py` constrains coefficients
  non-negative and drops any that go negative. That means "not identifiable from
  these points" — add a design point that varies it alone.
- **Measure the intercept, don't fit it.** A point set that never approaches idle
  inflates `C_idle`: fitted 0.057 vs 0.030 measured with a 2-participant room, and
  0.017 when refitted on an independent set. The inflated value overcharges tiny
  deployments ~2×, and those are what price-sensitive prospects type in first.

### Inbound bitrate is noisy in emulated mode

Emulated publishers replay one of six pre-encoded clips chosen round-robin, and
the clips differ in bitrate. With only 6 publishers, inbound varied **1.5×** across
runs that should have been identical on the inbound side (3.05 / 2.10 / 2.01 Mbps
with simulcast off, where there are no layers to explain it).

Consequences: the inbound coefficients (`g_in`, `k_pub`) are the least reliable in
the model — they disagreed by **3.4×** between two independent fits — and any
family whose signal is inbound needs **many publishers** so clip assignment
averages out, plus repeated runs. Outbound is far less exposed, because fan-out
averages many subscribers over the same publishers.

### On mediasoup, only 6 of the 15 platform metrics are usable

This is the single biggest trap in the whole document. Measured on the same
deployment before and after switching `OPENVIDU_RTC_ENGINE`:

| metric | Pion | mediasoup |
|---|---|---|
| `participants`, `rooms` | ✓ | ✓ |
| `tracks_published`, `tracks_subscribed` | ✓ | ✓ |
| `participant_join_rate`, `quality_score` | ✓ | ✓ |
| `bandwidth_in`, `bandwidth_out` | ✓ | **always 0** |
| `packets_in`, `packets_out` | ✓ | **always 0** |
| `packet_loss`, `rtt_p95`, `jitter_p95` | ✓ | **no series** |
| `packet_out_of_order`, `pli_rate` | ✓ | **no series** |

The traffic counters are the dangerous ones, because the report still *lists*
them — as zeros. Verified live with 42 participants exchanging media:

```
sum(livekit_participant_total)                             42
sum(livekit_track_subscribed_total)                        82
sum(rate(livekit_packet_total{direction="incoming"}[1m]))   0.0
sum(rate(livekit_packet_bytes{direction="outgoing"}[1m]))   0.0
```

mediasoup moves RTP in its own workers, so LiveKit's counters only see what
crosses the Go layer. A zero-variance column silently enters a regression as a
valid regressor, and since the SFU's cost is fundamentally per-packet, losing
those columns removes the ability to model bitrate — which is what "video
quality" means in the cost model.

**Use `node_traffic.py`**, which reads the node's own NIC counters from
Metricbeat's `system.network` metricset. Engine-agnostic, and already enabled in
the shipped Metricbeat config. Observed on mediasoup, with exactly the right
shape:

```
point       iface      Mbps in   Mbps out      pps in     pps out
s2p         eth0          3.93       0.07       785.9        22.7   publish-only
s2c         eth0          0.65       2.16       323.5     1,822.8   1:40 fan-out
```

Two rules when you do:

- **Pick one basis and keep it.** NIC counters and platform counters do not agree
  numerically (different vantage point, encapsulation, pacing), so never mix them
  in one regression. For a cross-engine comparison, run `node_traffic.py` on both
  engines' runs and compare that.
- **Subtract an idle baseline.** NIC counters carry Metricbeat shipping, Prometheus
  scrapes, control plane and recording uploads too. Measure `--idle-bps` on a
  no-traffic window, or small points will be mostly monitoring overhead.

The QoS gap has a separate consequence: **S12 cannot be run as specified on
mediasoup**, since it asks you to watch packet loss, RTT p95 and NACK/PLI rate,
none of which exist. What mediasoup does expose, with live series, is
`livekit_quality_score_*`, `livekit_quality_rating_*`,
`livekit_forward_latency_ns_*` and `livekit_session_join_latency_ms_*`. Since
`u_target` multiplies the entire fleet size, decide that substitution
deliberately rather than discovering it mid-run. The per-participant WebRTC stats
the browser-emulator indexes into Elasticsearch are engine-independent and are
arguably the better source for `u_target` anyway, because they measure what a
participant experiences rather than what the SFU reports about itself.

### Record which RTC engine you measured

`OPENVIDU_RTC_ENGINE` is `pion` or `mediasoup`, it is an install-time setting, and
OpenVidu publishes a ~2× capacity difference between them. Coefficients are not
transferable. Check the media node's effective config, not the deployment
template:

```bash
grep engine /opt/openvidu/data/runtime/config/openvidu/livekit.yaml
```

Label every fitted coefficient with the engine it came from.

---

## What the tools cannot do for you

- **`u_target`** — the utilisation you are willing to sell — comes from S12's
  endurance run, not from any fit. It multiplies the whole fleet size and
  therefore the whole quoted price.
- **Provisioned-core rounding.** PRO bills every available core. The fit gives
  work; turning work into a bill means rounding up to whole instances and adding
  the master tier (1 master for Elastic, 4 for HA) whether busy or not.
- **4K.** The tool caps at 1080p, so 4K must be extrapolated from the fitted
  bitrate coefficient and labelled as extrapolated wherever it is shown.

---

## Conventions

- One directory per matrix point under `runs/`, named after the point (`s3a`,
  `s9b`, …). `extract.py` uses the directory name as the point name, and
  `storage.py` matches objects to points by that name appearing in the object key
  — so keep tagging each point's output with `egress.filePrefix`.
- If a point's test case produced several scenarios, the newest report of each
  kind is read. Copy one point per directory.
- `--sfu-container` / `--egress-container` default to `openvidu` and `egress`;
  override them if the deployment names them differently.
