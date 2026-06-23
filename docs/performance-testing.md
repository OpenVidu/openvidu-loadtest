# Performance Testing & Profiling

This document covers the performance testing and profiling infrastructure for emulated browser tests.

## Table of Contents

1. [Overview](#overview)
2. [Perf Test Suites](#perf-test-suites)
3. [Running Tests](#running-tests)
4. [Profiling with `perf record`](#profiling-with-perf-record)
5. [Comparing Results](#comparing-results)
6. [Architecture](#architecture)

---

## Overview

The performance testing framework measures browser-emulator throughput using `lk` (LiveKit CLI) participants running in either **direct mode** (same container) or **docker mode** (separate Docker containers). Optional `perf record` profiling captures CPU hot spots.

## Perf Test Suites

Two standalone vitest projects under `tests/perf/`:

| Suite | File | Tests | Description |
|-------|------|-------|-------------|
| Benchmark | `benchmarks.perf.test.ts` | 4 | Steady-state throughput: one-room-publishers, one-room-mixed, multi-room-publishers, multi-room-mixed |
| Saturation | `saturation.perf.test.ts` | 4 | Max load: same patterns but scaled to find breaking point |

The old monolithic `emulated-browsers.perf.test.ts` has been removed.

## Running Tests

```bash
# Direct mode (default, runs inside the test container)
pnpm run test:perf:benchmarks
pnpm run test:perf:saturation

# Docker mode (launches separate lk-profiling containers)
EMULATED_LAUNCHER_MODE=docker pnpm run test:perf:benchmarks

# Docker mode via docker-compose (used in CI/production)
docker compose -f docker-compose.test.yml run --rm \
  -e TEST_SCRIPT=test:perf:benchmarks \
  -e EMULATED_LAUNCHER_MODE=docker \
  -e TEST_LIVEKIT_URL=https://your-instance:7443 \
  -e PERF_RESULTS_SUFFIX=my-run \
  browser-emulator-tests
```

### Comparison Script

```bash
# Run both modes and compare results
./dev_scripts/run-perf-compare.sh benchmarks
./dev_scripts/run-perf-compare.sh saturation
```

The script:
1. Runs docker mode, captures results
2. Runs direct mode, captures results
3. Calls `compare-perf.ts` to generate a diff table

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_LIVEKIT_URL` | `http://localhost:7880` | LiveKit server URL |
| `TEST_LIVEKIT_API_KEY` | — | API key |
| `TEST_LIVEKIT_API_SECRET` | — | API secret |
| `EMULATED_LAUNCHER_MODE` | `direct` | `direct` or `docker` |
| `PERF_RESULTS_SUFFIX` | — | Suffix for result files |
| `PROFILER_STEADY_WAIT_MS` | `3000` | Wait time before profiling |
| `PROFILER_DURATION_MS` | `15000` | Perf record duration |
| `PERF_REBUILD` | `true` | Rebuild docker image before run |
| `LK_PROFILE_DIR` | — | Directory for lk cpu/mem pprof files |

## Profiling with `perf record`

When a `LK_PROFILE_DIR` env var is set, the test framework runs `perf record -g -p <pids>` during participant execution.

### Perf Data Output

Files are written to `stats/perf-results/perf-<test-name>-<timestamp>-<suffix>.data`.

```bash
# Analyze with perf report
perf report -i <file>.data --stdio

# Filter to lk binary symbols only
perf report -i <file>.data --stdio --dsos=lk
```

### Docker Mode Specifics

Docker-mode profiling requires two additional mechanisms:

1. **PID namespace**: `PidMode: 'host'` and `Privileged: true` are set on lk containers when `LK_PROFILE_DIR` is present (configured in `docker-launcher.ts:106-108`).

2. **Binary capabilities**: The test container's `perf` binary has `cap_perfmon,cap_sys_admin+ep` set via `setcap` in `Dockerfile.test` so the non-root `node` user can trace cross-container processes.

3. **Build ID cache**: The `lk` binary is extracted from the `lk-profiling:latest` image (using `--entrypoint` override to handle the image's `ENTRYPOINT ["lk"]`) and registered in perf's build ID cache before `perf record` runs. This allows symbol resolution for binaries in different container filesystems.

### Debug Symbols

The `lk` binary is compiled with `-ldflags=-s=false` (Dockerfile.test:11, Dockerfile.lk-profiling) to retain DWARF debug symbols for function name resolution in `perf report`. Debug symbols have zero runtime performance cost as they are never loaded during execution.

## Comparing Results

Comparison output from `pnpm run compare:perf <docker.json> <direct.json>` shows a table like:

```
 Participant Count │ Docker (ms) │ Direct (ms) │ Delta │
───────────────────┼─────────────┼─────────────┼───────│
               4   │ 19200       │ 16500       │ +16%  │
               …   │ …           │ …           │ …     │
```

## Architecture

```
                   ┌──────────────────────────────┐
                   │     browser-emulator-tests     │
                   │  (privileged, pid: host)       │
                   │                                │
                   │  perf record -p <pids>         │
                   │  (setcap cap_perfmon+ep)       │
                   └──────┬───────────────────────-─┘
                          │ docker socket
          ┌───────────────┼───────────────────┐
          │               │                    │
 ┌────────▼────────┐ ┌───▼──────────────┐ ┌───▼──────────────┐
 │ lk-profiling    │ │ lk-profiling     │ │ lk-profiling     │
 │ container #1    │ │ container #2     │ │ container #N     │
 │ PidMode: host   │ │ PidMode: host    │ │ PidMode: host    │
 │ lk room join    │ │ lk room join     │ │ lk room join     │
 └─────────────────┘ └──────────────────┘ └──────────────────┘
                          │
                    ┌─────▼─────┐
                    │ LiveKit   │
                    │ Server    │
                    └───────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `tests/perf/perf-test-utils.ts` | Shared perf test helpers (`runProfilingTest`, `runPerfRecord`, `findLkPids`, `ensureBuildIdCache`) |
| `tests/perf/benchmarks.perf.test.ts` | Benchmark test definitions |
| `tests/perf/saturation.perf.test.ts` | Saturation test definitions |
| `src/services/browser/emulated/docker-launcher.ts` | Docker container launch with conditional `PidMode: host` |
| `src/services/browser/emulated/direct-launcher.ts` | Direct process launch |
| `Dockerfile.test` | Test image with `setcap`, `linux-perf`, `lk` binary |
| `Dockerfile.lk-profiling` | Profiling image with debug-symbol `lk` binary, `debian:trixie-slim` base |
| `dev_scripts/run-perf-compare.sh` | Orchestrator: docker → direct → compare |
| `dev_scripts/compare-perf.ts` | JSON comparison table generator |
| `dev_scripts/analyze-perf.ts` | Perf.data analyzer |
