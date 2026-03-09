import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { FakeMediaDevicesService } from '../../src/services/fake-media/fake-media-devices.service.js';
import { ScriptRunnerService } from '../../src/services/script-runner.service.js';
import { LocalFilesService } from '../../src/services/files/local-files.service.js';
import { LocalFilesRepository } from '../../src/repositories/files/local-files.repository.js';

// IMPORTANT: This test assumes it is running in a Linux machine that has installed the base dependencies (see install scripts).
// Using the vagrant box available in this project should suffice.
describe('FakeMediaDevicesService', () => {
	let fakeMediaService: FakeMediaDevicesService;
	let scriptRunnerService: ScriptRunnerService;
	let videoPath: string;
	let audioPath: string;

	beforeAll(async () => {
		// Download test media files if they don't exist
		[videoPath, audioPath] = await new LocalFilesService(
			new LocalFilesRepository(),
		).downloadBrowserMediaFiles({
			videoType: 'bunny',
			videoInfo: {
				width: 640,
				height: 480,
				fps: 30,
			},
		});
	}, 600000); // allow extra time for downloading

	beforeEach(() => {
		scriptRunnerService = new ScriptRunnerService();
		fakeMediaService = new FakeMediaDevicesService(scriptRunnerService);
	});

	afterEach(async () => {
		await scriptRunnerService.killAllDetached();
		await fakeMediaService.cleanupFakeMediaDevices();
	});

	it('should start readable fake media devices without errors', async () => {
		let fakeMediaStopped = false;
		await fakeMediaService.startFakeMediaDevices(
			videoPath,
			audioPath,
			() => {
				fakeMediaStopped = true;
			},
		);
		// Check if the devices are readable by another process
		// Read from the devices using another ffmpeg process.
		const duration = 5; // seconds
		let stderr = '';
		let lastOutTimeMs = 0;
		let maxFrame = 0;
		let sawVideoInput = false;
		let sawAudioInput = false;
		const ffmpegCheckProcess = await scriptRunnerService.run(
			`ffmpeg -hide_banner -loglevel info -progress pipe:2 -stats -fflags +genpts -thread_queue_size 4096 -f v4l2 -rtbufsize 100M -use_wallclock_as_timestamps 1 -i /dev/video0 -thread_queue_size 4096 -f s16le -ar 48000 -ac 2 -use_wallclock_as_timestamps 1 -i /tmp/virtmic -map 0:v:0 -map 1:a:0 -vf setpts=PTS-STARTPTS -af aresample=async=1:min_hard_comp=0.1:first_pts=0,asetpts=PTS-STARTPTS -fps_mode vfr -t ${duration} -f null -`,
			{
				stdio: ['ignore', 'ignore', 'pipe'],
				stderrCallback: (chunk: string) => {
					console.log(chunk);
					stderr += chunk;

					// Quick input detection heuristics
					if (
						chunk.includes('Input #0') &&
						chunk.includes('video4linux2')
					)
						sawVideoInput = true;
					if (chunk.includes('Input #1') && chunk.includes('s16le'))
						sawAudioInput = true;

					// Parse -progress key=value lines
					for (const line of chunk.split(/\r?\n/)) {
						const mFrame = /^frame=(\d+)/.exec(line);
						if (mFrame) {
							const f = Number.parseInt(mFrame[1], 10);
							if (!Number.isNaN(f))
								maxFrame = Math.max(maxFrame, f);
						}
						const mTime = /^out_time_ms=(\d+)/.exec(line);
						if (mTime) {
							const t = Number.parseInt(mTime[1], 10);
							if (!Number.isNaN(t))
								lastOutTimeMs = Math.max(lastOutTimeMs, t);
						}
					}
				},
			},
		);

		// The consumer should exit cleanly
		expect(ffmpegCheckProcess.exitCode).toBe(0);

		// Both inputs detected
		expect(sawVideoInput).toBe(true);
		expect(sawAudioInput).toBe(true);

		// Progress reached roughly the requested duration (5s)
		expect(lastOutTimeMs).toBeGreaterThanOrEqual(duration * 1000 - 500); // allow slack for scheduling

		// We saw some frames (video is alive)
		expect(maxFrame).toBeGreaterThanOrEqual(duration * 30 - 50); // at 30fps over ~5s you'd expect ~150; allow slack

		// No red-flag errors
		const redFlags = [
			/non monotonically increasing dts/i,
			/Thread message queue blocking/i,
			/Conversion failed/i,
			/Error while/i,
			/Could not/i,
			/No such file or directory/i,
			/Device not found/i,
		];
		for (const re of redFlags) {
			expect(re.test(stderr)).toBe(false);
		}

		// Speed close to realtime (avoid stalls)
		const speeds = Array.from(stderr.matchAll(/speed=([0-9.]+)x/g)).map(m =>
			Number.parseFloat(m[1]),
		);
		if (speeds.length) {
			const median = speeds.toSorted((a, b) => a - b)[
				Math.floor(speeds.length / 2)
			];
			expect(median).toBeGreaterThan(0.7);
			expect(median).toBeLessThan(1.3);
		}
		expect(fakeMediaStopped).toBe(false);
	});
});
