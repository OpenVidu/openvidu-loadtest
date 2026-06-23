# Performance Tests with Docker Compose

The browser-emulator includes a suite of **benchmark** and **saturation** performance tests that measure participant creation latency, CPU/memory usage, and system ceilings under load. These tests can be run inside Docker using the provided `docker-compose.test.yml`.

## Test Structure

- **Benchmarks**: Create a fixed number of participants and measure latency percentiles (p50, p95, p99, avg), container resource usage, and error counts.
- **Saturation tests**: Incrementally add participants until the system fails or CPU sustains above 99% for 3 consecutive samples, identifying the ceiling where the system cannot handle more load.

Tests are defined in `tests/perf/emulated-browsers.perf.test.ts` using the Vitest project `perf` (configured in `vitest.config.ts` with a 1-hour timeout per test).

## Prerequisites

- A running platform (LiveKit or OpenVidu) reachable from the container.
- Docker and Docker Compose installed.
- The `browser-emulator` directory as the working context.

## Running Performance Tests via Docker Compose

### Basic usage

```bash
TEST_LIVEKIT_URL=http://<livekit-host>:7880 \
  TEST_SCRIPT=test:perf \
  docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

This builds the test image, runs the perf tests, and exits with the container's exit code.

### Using the npm shortcut (defaults to e2e tests)

```bash
TEST_LIVEKIT_URL=http://<livekit-host>:7880 \
  TEST_SCRIPT=test:perf \
  pnpm run test:docker
```

The `test:docker` script is defined in `package.json` as:
```
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from browser-emulator-tests
```

### Required environment variables

| Variable | Description | Default |
|---|---|---|
| `TEST_LIVEKIT_URL` | LiveKit server URL (required for perf tests) | — |
| `TEST_SCRIPT` | Vitest project to run: `test:perf`, `test:e2e`, `test:integration`, `test:unit` | `test:e2e` |

### Optional environment variables

| Variable | Description | Default |
|---|---|---|
| `SERVER_PORT` | HTTP server port | `5000` |
| `WEBSOCKET_PORT` | WebSocket server port | `5001` |
| `COM_MODULE` | Communication module (`livekit` or `openvidu`) | `livekit` |
| `DOCKER_DEBUG` | Set to `true` to enable Node inspector on port 9229 | `false` |
| `HOST_UID` / `HOST_GID` | Host user/group IDs for file ownership | `1000` |
| `DOCKER_GID` | Docker group ID for socket access | `1001` |

### What the test compose does

1. Builds the image from `Dockerfile.test` (Node 24, installs deps, copies source).
2. Mounts volumes for recordings, stats, logs, mediafiles, and the Docker socket.
3. Overrides the container command to run `pnpm run test:perf` (or the script you specify).
4. The test container connects to the `browseremulator` Docker network.

The perf tests then:
- Start the browser-emulator Express server.
- Ping the instance and verify the platform is reachable.
- Run each benchmark/saturation scenario sequentially.
- Collect CPU, memory, and Docker container metrics at each phase.
- Save results to `stats/perf-results/run-<timestamp>.json`.

## Viewing Results

Results are saved as JSON files in `stats/perf-results/`.

### Analyze a single run

```bash
pnpm run analyze:perf stats/perf-results/run-<timestamp>.json
```

Output includes:
- Benchmark pass/fail, latency percentiles, error counts.
- Saturation ceiling, sustained participant count, CPU/memory peaks.
- Container group summary at peak load.

### Compare two runs

```bash
pnpm run compare:perf stats/perf-results/baseline.json stats/perf-results/comparison.json
```

Shows per-benchmark latency deltas and saturation ceiling differences between a baseline and comparison run.

## Running Perf Tests Natively (Without Docker)

```bash
TEST_LIVEKIT_URL=http://<livekit-host>:7880 pnpm run test:perf
```

Requires all Node dependencies installed locally and a running platform.

## Notes

- Perf tests are sequential (`fileParallelism: false`) and have a 1-hour timeout per test file.
- The `docker-compose.test.yml` mounts `/var/run/docker.sock`, which the perf tests use via `dockerode` to sample container-level CPU/memory metrics.
- Saturation tests will stop when CPU sustains above 99% for 3 consecutive samples or when participant creation fails.
- Results are written to the host-mounted `./stats/perf-results/` directory.
