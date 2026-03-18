import fsPromises from 'node:fs/promises';
import type { ScriptRunnerService } from '../script-runner.service.ts';
import os from 'node:os';
import { LocalFilesRepository } from '../../repositories/files/local-files.repository.ts';
import type { ChildProcess } from 'node:child_process';
import type { ConfigService } from '../config.service.ts';

export class FakeMediaDevicesService {
	private readonly scriptRunnerService: ScriptRunnerService;
	private readonly configService: ConfigService;
	private readonly PULSEAUDIO_CONF_PATH = `${os.homedir()}/.config/pulse/client.conf`;
	private ffmpegProcess: ChildProcess | undefined;
	private xvfbProcess: ChildProcess | undefined;
	private x11vncProcess: ChildProcess | undefined;
	private fvwmProcess: ChildProcess | undefined;

	public constructor(
		scriptRunnerService: ScriptRunnerService,
		configService: ConfigService,
	) {
		this.scriptRunnerService = scriptRunnerService;
		this.configService = configService;
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
		vnc = false,
	) {
		if (!this.configService.isLegacyMode()) {
			console.log(
				'Legacy mode disabled, skipping fake media devices setup.',
			);
			return;
		}
		// Assumes ffmpeg installed, v4l2loopback installed and enabled, and pulseaudio installed,
		// check install scripts for guidance

		if (this.ffmpegProcess) {
			console.log(
				'Fake webcam & microphone already running, skipping start.',
			);
			return;
		}
		await Promise.all([
			this.startXvfb(vnc),
			this.waitForV4L2Device(),
			this.createFakeMicrophone(),
		]);
		// Start ffmpeg to read video and audio from files and write to virtual webcam and microphone
		const fakeMediaLogFd = await fsPromises.open(
			`${LocalFilesRepository.SCRIPTS_LOGS_DIR}/fake_media_devices_ffmpeg.log`,
			'a',
		);
		try {
			this.ffmpegProcess = await this.startFfmpegDeviceProcess(
				videoPath,
				audioPath,
				fakeMediaLogFd,
			);
			await fakeMediaLogFd.close();
			console.log(
				`Started ffmpeg process for fake media devices with PID ${this.ffmpegProcess?.pid}, checking if it's ready...`,
			);
			await this.isFfmpegDeviceProcessReadable();
			console.log('Fake media devices are ready and readable.');
		} catch (err) {
			this.ffmpegProcess = undefined;
			this.xvfbProcess = undefined;
			throw err;
		}
	}

	private async startXvfb(vnc = false) {
		// Start X server for browsers, assumes Xvfb installed and DISPLAY :10 free
		// TODO: launch vnc server, maybe in some debug mode
		// TODO: choose display number in config
		process.env.DISPLAY = ':10';
		if (
			!(await this.scriptRunnerService.isRunning(
				`Xvfb ${process.env.DISPLAY}`,
			))
		) {
			const xvfbLogFd = await fsPromises.open(
				`${LocalFilesRepository.SCRIPTS_LOGS_DIR}/xvfb.log`,
				'a',
			);
			// TODO: Maybe screen res should be parametrized somehow
			this.xvfbProcess = await this.scriptRunnerService.run(
				`Xvfb ${process.env.DISPLAY} -screen 0 1920x1080x24 -ac`,
				{
					detached: true,
					stdio: ['ignore', xvfbLogFd.fd, xvfbLogFd.fd],
				},
			);
			await xvfbLogFd.close();
		}
		if (vnc) {
			// Start x11vnc server to allow visual debugging, assumes x11vnc and fvwm installed
			const x11vncLogFd = await fsPromises.open(
				`${LocalFilesRepository.SCRIPTS_LOGS_DIR}/x11vnc.log`,
				'a',
			);
			this.x11vncProcess = await this.scriptRunnerService.run(
				`x11vnc -display :10 -forever -shared -nopw`,
				{
					detached: true,
					stdio: ['ignore', x11vncLogFd.fd, x11vncLogFd.fd],
				},
			);
			this.fvwmProcess = await this.scriptRunnerService.run(
				`fvwm -display :10`,
				{
					detached: true,
					stdio: ['ignore', x11vncLogFd.fd, x11vncLogFd.fd],
				},
			);
			await x11vncLogFd.close();
		}
	}

	private async startFfmpegDeviceProcess(
		videoPath: string,
		audioPath: string,
		fakeMediaLogFd: fsPromises.FileHandle,
	) {
		return this.scriptRunnerService.run(
			`ffmpeg -loglevel info -y -stream_loop -1 -re -i ${videoPath} -stream_loop -1 -re -i ${audioPath} -map 0 -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 /dev/video0 -map 1 -f s16le -ar 48000 -ac 2 -threads 0 /tmp/virtmic`,
			{
				detached: true,
				stdio: ['ignore', fakeMediaLogFd.fd, fakeMediaLogFd.fd],
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
		if (!this.configService.isLegacyMode()) {
			console.log(
				'Legacy mode disabled, skipping fake media devices cleanup.',
			);
			return;
		}
		const promises = [this.cleanFakeMicrophone()];
		if (this.xvfbProcess) {
			promises.push(
				this.scriptRunnerService
					.killDetached(this.xvfbProcess)
					.then(() => (this.xvfbProcess = undefined)),
			);
		}
		if (this.ffmpegProcess) {
			promises.push(
				this.scriptRunnerService
					.killDetached(this.ffmpegProcess)
					.then(() => (this.ffmpegProcess = undefined)),
			);
		}
		if (this.x11vncProcess) {
			promises.push(
				this.scriptRunnerService
					.killDetached(this.x11vncProcess)
					.then(() => (this.x11vncProcess = undefined)),
			);
		}
		if (this.fvwmProcess) {
			promises.push(
				this.scriptRunnerService
					.killDetached(this.fvwmProcess)
					.then(() => (this.fvwmProcess = undefined)),
			);
		}
		return Promise.all(promises);
	}

	private async cleanFakeMicrophone() {
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
