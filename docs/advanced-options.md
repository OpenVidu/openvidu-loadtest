# Advanced Configuration Options

This document covers advanced configuration options for specialized use cases. For basic configuration, see the main [README.md](README.md).

## Table of Contents

1. [QoE Analysis](#qoe-analysis)
2. [Recording Options](#recording-options)
3. [Custom Video Sources](#custom-video-sources)
4. [Storage Configuration](#storage-configuration)

---

## QoE Analysis

Quality of Experience (QoE) analysis measures video and audio quality by comparing recorded streams against reference files.

### Configuration

```yaml
qoe:
  # Enable recording of media streams for QoE analysis
  recordStreams: true

  # Perform analysis in the worker (true) or upload to S3 for later processing (false)
  analyzeInSitu: false

  # Video metadata - must match the pre-processed video
  paddingDuration: 1
  fragmentDuration: 5
```

### How It Works

1. During the load test, each participant's sent and received streams are recorded
2. When the test completes, recordings are uploaded to S3
3. QoE metrics are calculated by comparing recordings against the original video

### Supported Metrics

- **VMAF**: Video Multimethod Assessment Fusion (Netflix)
- **ViSQOL**: Virtual Speech Quality Objective Listener (Google)
- **PESQ**: Perceptual Evaluation of Speech Quality
- **VQMT**: Video Quality Measurement Tool

### Prerequisites

For in-situ analysis, install dependencies on workers:

```bash
./prepare_scripts/install_qoe.sh
```

### Pre-processed Video Files

The default videos (BUNNY, INTERVIEW, GAME) come pre-processed with padding for QoE analysis:

| Video     | Padding Duration | Fragment Duration |
| --------- | ---------------- | ----------------- |
| BUNNY     | 1 second         | 5 seconds         |
| INTERVIEW | 1 second         | 15 seconds        |
| GAME      | 1 second         | 30 seconds        |

---

## Recording Options

### Browser Recording

Record participant browser sessions using ffmpeg:

```yaml
testcases:
  - topology: N:N
    participants:
      - "10"
    browserRecording: true
```

### Media Node Recording

Automatically start recording when media node load exceeds threshold:

```yaml
recording:
  # Start recording when CPU load exceeds this value (0 = disabled)
  mediaNodeLoadThreshold: 0

  # Group sessions for recording
  # 0 = disabled, 1 = each session, 2 = every 2 sessions, etc.
  sessionsGroupSize: 0

  # Number of dedicated recording workers
  workersAtStart: 0
```

---

## Custom Video Sources

Use your own video files for testing:

```yaml
video:
  type: CUSTOM

  # Provide URLs to video and audio files (must be downloadable via HTTP)
  customVideoUrl: https://example.com/my-video.y4m
  customAudioUrl: https://example.com/my-audio.wav

  # Video dimensions and frame rate
  width: 640
  height: 480
  fps: 30
```

### Supported Formats

- **Video**: Y4M (recommended), MP4, WebM
- **Audio**: WAV

### QoE Considerations

For QoE analysis, videos should:

- Have dimensions that are multiples of 16
- Be pre-processed with padding (see QoE Analysis section)

---

## Storage Configuration

### S3 Compatible Storage

```yaml
storage:
  bucket: your-bucket
  region: us-east-1

  # For MinIO or other S3-compatible services:
  endpoint: https://your-minio-endpoint.com
  accessKey: your_access_key
  secretKey: your_secret_key
```
