import fsPromises from 'node:fs/promises';
import type { ScriptRunnerService } from '../script-runner.service.ts';
import os from 'node:os';
import { LocalFilesRepository } from '../../repositories/files/local-files.repository.ts';

export class FakeMediaDevicesService {
	private readonly scriptRunnerService: ScriptRunnerService;
	private readonly PULSEAUDIO_CONF_PATH = `${os.homedir()}/.config/pulse/client.conf`;

	public constructor(scriptRunnerService: ScriptRunnerService) {
		this.scriptRunnerService = scriptRunnerService;
	}

	private async createPulseaudioDevice() {
		await this.scriptRunnerService.run(
			'pulseaudio --start --disallow-exit --exit-idle-time=-1',
		);
		await this.scriptRunnerService.run(
			`pactl load-module module-pipe-source source_name=virtmic file=/tmp/virtmic format=s16le rate=48000 channels=2`,
		);
		await this.scriptRunnerService.run(`pactl set-default-source virtmic`);
		await fsPromises.writeFile(
			this.PULSEAUDIO_CONF_PATH,
			'default-source = virtmic\n',
		);
		console.log('Fake microphone created.');
	}

	public async startFakeMediaDevices(
		videoPath: string,
		audioPath: string,
		subprocessStopsCallback: () => void,
	) {
		// Assumes ffmpeg installed, v4l2loopback installed and enabled, and pulseaudio installed,
		// check install scripts for guidance

		if (
			await this.scriptRunnerService.isRunning(
				'ffmpeg /dev/video0 /tmp/virtmic',
			)
		) {
			console.log(
				'Fake webcam & microphone already running, skipping start.',
			);
			return;
		}
		await Promise.all([
			this.waitForV4L2Device(),
			this.createFakeMicrophone(),
		]);
		// Start ffmpeg to read video and audio from files and write to virtual webcam and microphone
		const fakeMediaLogFd = await fsPromises.open(
			`${LocalFilesRepository.SCRIPTS_LOGS_DIR}/fake_media_devices_ffmpeg.log`,
			'a',
		);
		const child = await this.startFfmpegDeviceProcess(
			videoPath,
			audioPath,
			fakeMediaLogFd,
			subprocessStopsCallback,
		);
		await fakeMediaLogFd.close();
		console.log(
			`Started ffmpeg process for fake media devices with PID ${child.pid}, checking if it's ready...`,
		);
		await this.isFfmpegDeviceProcessReadable();
		console.log('Fake media devices are ready and readable.');
	}

	private async startFfmpegDeviceProcess(
		videoPath: string,
		audioPath: string,
		fakeMediaLogFd: fsPromises.FileHandle,
		subprocessStopsCallback: () => void,
	) {
		return this.scriptRunnerService.run(
			`ffmpeg -loglevel info -y -stream_loop -1 -re -i ${videoPath} -stream_loop -1 -re -i ${audioPath} -map 0 -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 /dev/video0 -map 1 -f s16le -ar 48000 -ac 2 -threads 0 /tmp/virtmic`,
			{
				detached: true,
				stdio: ['ignore', fakeMediaLogFd.fd, fakeMediaLogFd.fd],
				onErrorCallback: err => {
					console.error(
						`Error in ffmpeg process for fake media devices: ${err}`,
					);
					subprocessStopsCallback();
				},
				onCloseCallback: code => {
					console.log(
						`ffmpeg process for fake media devices exited with code ${code}`,
					);
					subprocessStopsCallback();
				},
			},
		);
	}

	private async isFfmpegDeviceProcessReadable() {
		// initial delay to allow process to start and create devices
		// Without this wait, on doing v4l2-ctl, the original ffmpeg process might crash with "Invalid argument"
		await new Promise(resolve => setTimeout(resolve, 2000));
		return this.retryPromise(
			this.validateV4L2Output(),
			5,
			1000,
			'Fake media devices ffmpeg process failed to start or is not readable',
			'Waiting for fake media devices ffmpeg process to be ready...',
		);
	}

	private async validateV4L2Output() {
		return new Promise<void>((resolve, reject) => {
			void this.scriptRunnerService
				.run(`v4l2-ctl -d /dev/video0 --get-fmt-video`, {
					stdoutCallback(data: string) {
						const hasDims =
							/Width\/Height\s*:\s*(\d+)\s*\/\s*(\d+)/.test(data);
						const hasPix =
							/Pixel Format\s*:\s*'?[A-Z0-9]{4}'?/.test(data);
						if (hasDims && hasPix) {
							resolve();
						} else {
							reject(
								new Error(
									'Unexpected v4l2-ctl output: \n' + data,
								),
							);
						}
					},
					onErrorCallback(err) {
						reject(err);
					},
				})
				.catch(reject);
		});
	}

	private async createFakeMicrophone() {
		let loadedModules = '';
		try {
			await this.scriptRunnerService.run('pactl list modules short', {
				stdoutCallback(chunk: string) {
					loadedModules += chunk;
				},
			});
			if (
				!(
					loadedModules.includes('module-pipe-source') &&
					loadedModules.includes('source_name=virtmic')
				)
			) {
				await this.createPulseaudioDevice();
			}
		} catch {
			await this.createPulseaudioDevice();
		}
		return loadedModules;
	}

	private async waitForV4L2Device() {
		return this.retryPromise(
			fsPromises.access('/dev/video0'),
			5,
			1000,
			"Can't start V4L2 device",
			'Waiting for V4L2 device to be ready...',
		);
	}

	private async retryPromise(
		promise: Promise<void>,
		retries = 5,
		delayMs = 1000,
		errorMsg = 'Promise failed after retries',
		logMsg = 'Promise failed, retrying...',
	): Promise<void> {
		let ready = false;
		let attempts = 0;
		while (!ready) {
			try {
				await promise;
				ready = true;
			} catch {
				if (attempts > retries) {
					console.error(errorMsg);
					throw new Error(errorMsg);
				}
				console.log(logMsg);
				await new Promise(resolve => setTimeout(resolve, delayMs));
				attempts++;
			}
		}
	}

	public async cleanupFakeMediaDevices() {
		// Check if module is loaded before trying to unload
		let loadedModules = '';
		try {
			await this.scriptRunnerService.run('pactl list modules short', {
				stdoutCallback(chunk: string) {
					loadedModules += chunk;
				},
			});
			// Only unload if the module is actually loaded
			if (loadedModules.includes('module-pipe-source')) {
				await this.scriptRunnerService.run(
					'pactl unload-module module-pipe-source',
				);
			}
		} catch (err) {
			// PulseAudio might not be running, skip cleanup
			console.warn(err);
		} finally {
			// Remove config file if it exists
			try {
				await fsPromises.unlink(this.PULSEAUDIO_CONF_PATH);
			} catch (err) {
				// File might not exist, ignore
				console.warn(err);
			}
			console.log('Fake microphone cleaned up.');
		}
	}
}
