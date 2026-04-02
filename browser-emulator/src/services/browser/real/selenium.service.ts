import fsPromises from 'node:fs/promises';
import {
	Browser,
	Builder,
	Capabilities,
	WebDriver,
	logging,
} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';
import { LocalFilesRepository } from '../../../repositories/files/local-files.repository.ts';
import path from 'node:path';
import type {
	AvailableBrowsers,
	UserJoinProperties,
} from '../../../types/create-user.type.ts';
import type {
	ConfigService,
	DockerizedBrowsersConfig,
} from '../../config.service.ts';
import { DockerService } from '../../docker.service.ts';
import type { ContainerCreateOptions } from 'dockerode';
import type { ChildProcess } from 'node:child_process';
import type { ScriptRunnerService } from '../../script-runner.service.ts';

export class SeleniumService {
	private readonly chromeOptions = new chrome.Options();
	private readonly chromeCapabilities = Capabilities.chrome();
	private readonly firefoxOptions = new firefox.Options();
	private readonly firefoxCapabilities = Capabilities.firefox();

	private readonly configService: ConfigService;
	private readonly localFilesRepository: LocalFilesRepository;
	private readonly dockerService: DockerService;
	private readonly scriptRunnerService: ScriptRunnerService;

	private recordingScript: ChildProcess | undefined;
	private recordingDockerContainerId: string | undefined;
	private isRecordingFullScreen = false;

	private readonly dockerizedSessionContainers = new Map<string, string>();

	private readonly DOCKER_SELENIUM_RECORDING_IMAGE =
		'selenium/video:ffmpeg-8.0-20260222';

	public constructor(
		configService: ConfigService,
		localFilesRepository: LocalFilesRepository,
		dockerService: DockerService,
		scriptRunnerService: ScriptRunnerService,
	) {
		this.configService = configService;
		this.localFilesRepository = localFilesRepository;
		this.dockerService = dockerService;
		this.scriptRunnerService = scriptRunnerService;
	}

	public initialize() {
		const prefs = new logging.Preferences();
		logging.getLogger('webdriver');
		const logLevel = logging.Level.ALL;
		prefs.setLevel(logging.Type.BROWSER, logLevel);
		prefs.setLevel(logging.Type.DRIVER, logLevel);
		prefs.setLevel(logging.Type.CLIENT, logLevel);
		prefs.setLevel(logging.Type.PERFORMANCE, logLevel);
		prefs.setLevel(logging.Type.SERVER, logLevel);
		logging.installConsoleHandler();
		this.firefoxCapabilities.setLoggingPrefs(prefs);
		this.firefoxCapabilities.setAcceptInsecureCerts(true);
		this.firefoxOptions
			.setPreference('permissions.default.microphone', 1)
			.setPreference('permissions.default.camera', 1)
			.setPreference('devtools.console.stdout.content', true);
		this.chromeCapabilities.setLoggingPrefs(prefs);
		this.chromeCapabilities.setAcceptInsecureCerts(true);
		// Unlike firefox, chrome is maximized this way here because of this bug: https://issuetracker.google.com/issues/394760806?pli=1
		this.chromeOptions.addArguments(
			'--use-fake-ui-for-media-stream',
			'--no-sandbox',
			'--start-maximized',
		);
		if (this.configService.isLegacyMode()) {
			this.chromeOptions.addArguments(
				'--single-process',
				'--no-proxy-server',
			);
		} else {
			this.firefoxOptions
				.setPreference('media.navigator.streams.fake', true)
				.setPreference('media.devices.insecure.enabled', true)
				.setPreference('media.getusermedia.insecure.enabled', true)
				.setPreference('media.navigator.permission.disabled', true);
			if (
				this.localFilesRepository.fakevideo &&
				this.localFilesRepository.fakeaudio
			) {
				this.chromeOptions.addArguments(
					'--use-fake-device-for-media-stream',
					'--use-file-for-fake-video-capture=' +
						this.localFilesRepository.fakevideo,
					'--use-file-for-fake-audio-capture=' +
						this.localFilesRepository.fakeaudio,
				);
			} else {
				console.warn(
					'Fake media files not found, Chrome will not work correctly.',
				);
			}
		}
	}

	public async getDriver(
		browser: AvailableBrowsers,
		logName?: string,
	): Promise<WebDriver> {
		if (this.configService.shouldUseDockerizedBrowsers()) {
			return await this.getDockerizedDriver(browser, logName);
		}
		if (browser === 'firefox') {
			return await this.getFirefoxDriver();
		} else {
			return await this.getChromeDriver(logName);
		}
	}

	public async quitDriver(driver: WebDriver): Promise<void> {
		let sessionId: string | undefined;
		try {
			sessionId = (await driver.getSession()).getId();
		} catch {
			// Driver session may already be closed.
		}

		await driver.quit();

		if (sessionId) {
			await this.removeDockerizedBrowserContainer(sessionId);
		}
	}

	private async getDockerizedDriver(
		browser: AvailableBrowsers,
		logName?: string,
	): Promise<WebDriver> {
		const dockerizedConfig =
			this.configService.getDockerizedBrowsersConfig();
		const image =
			browser === 'firefox'
				? dockerizedConfig.firefoxImage
				: dockerizedConfig.chromeImage;
		const containerName = this.generateSeleniumContainerName(
			browser,
			logName,
		);

		await this.ensureDockerImage(image);
		// Build container create options
		await this.createBrowserContainer(
			image,
			containerName,
			dockerizedConfig,
			logName,
		);

		const seleniumServerBaseUrl = `http://${containerName}:${dockerizedConfig.seleniumPort}`;
		try {
			await this.waitForSeleniumServer(
				seleniumServerBaseUrl,
				dockerizedConfig.startupTimeoutMs,
			);
		} catch (err) {
			await this.dockerService.removeContainer(containerName);
			throw err;
		}

		return await this.buildDockerizedDriver(
			browser,
			seleniumServerBaseUrl,
			containerName,
		);
	}

	private async createBrowserContainer(
		image: string,
		containerName: string,
		dockerizedConfig: DockerizedBrowsersConfig,
		logName: string | undefined,
	) {
		const createOptions: ContainerCreateOptions = {
			Image: image,
			name: containerName,
			HostConfig: {
				NetworkMode: dockerizedConfig.networkName,
				ShmSize: 2 * 1024 * 1024 * 1024,
				PortBindings: {
					'7900/tcp': [
						{
							HostPort: '',
						},
					],
				},
				Binds: [
					`${this.configService.getMediaFilesHostDir()}:/app/mediafiles/:ro`,
					`${this.configService.getScriptsLogsHostDir()}:/app/logs/:rw`,
					`${LocalFilesRepository.FULLSCREEN_RECORDING_DIR}:/videos/:rw`,
				],
			},
			Env: [
				'SE_SCREEN_WIDTH=1920',
				'SE_SCREEN_HEIGHT=1080',
				'SE_SCREEN_DEPTH=24',
			],
		};

		await this.dockerService.startContainer(createOptions);

		// Start streaming container logs to host ./logs directory
		try {
			const hostLogsDir = this.configService.getScriptsLogsHostDir();
			const logsPath = `${hostLogsDir}/selenium-${logName ?? Date.now()}.log`;
			void this.dockerService.streamContainerLogs(
				containerName,
				logsPath,
			);
		} catch (err) {
			console.warn(
				'Failed to start streaming dockerized browser logs:',
				err,
			);
		}
	}

	private async buildDockerizedDriver(
		browser: AvailableBrowsers,
		seleniumServerBaseUrl: string,
		containerName: string,
	): Promise<WebDriver> {
		try {
			let builder = new Builder().usingServer(
				`${seleniumServerBaseUrl}/wd/hub`,
			);
			if (browser === 'firefox') {
				builder = this.createDockerizedFirefoxBuilder(builder);
			} else {
				builder = this.createDockerizedChromeBuilder(builder);
			}

			const driver = await builder.build();
			const sessionId = (await driver.getSession()).getId();
			this.dockerizedSessionContainers.set(sessionId, containerName);
			return driver;
		} catch (error) {
			await this.dockerService.removeContainer(containerName);
			throw error;
		}
	}
	private createDockerizedChromeBuilder(builder: Builder) {
		// For dockerized chrome, construct options that reference in-container
		// media file paths (/app/mediafiles/*) so the browser inside the
		// selenium container can access the fake media files.
		let chromeOptionsForContainer = this.chromeOptions;
		if (
			this.localFilesRepository.fakevideo &&
			this.localFilesRepository.fakeaudio
		) {
			chromeOptionsForContainer = new chrome.Options();
			chromeOptionsForContainer.addArguments(
				'--use-fake-ui-for-media-stream',
				'--no-sandbox',
				'--start-maximized',
				'--use-fake-device-for-media-stream',
				`--use-file-for-fake-video-capture=/app/mediafiles/${path.basename(
					this.localFilesRepository.fakevideo,
				)}`,
				`--use-file-for-fake-audio-capture=/app/mediafiles/${path.basename(
					this.localFilesRepository.fakeaudio,
				)}`,
			);

			// Treat the emulator origin as secure so getUserMedia is available
			// when serving over HTTP inside the docker network.
			try {
				const protocol = this.configService.isHttpsDisabled()
					? 'http'
					: 'https';
				const host =
					this.configService.getBrowserEmulatorHostForBrowsers();
				const port = this.configService.getServerPort();
				const origin = `${protocol}://${host}:${port}`;
				chromeOptionsForContainer.addArguments(
					`--unsafely-treat-insecure-origin-as-secure=${origin}`,
					'--allow-insecure-localhost',
				);
			} catch (err) {
				// Best-effort only; if config calls fail, continue without the flags.
				console.warn(
					'Failed to add insecure-origin flags for dockerized Chrome',
					err,
				);
			}
		}
		builder = builder
			.forBrowser(Browser.CHROME)
			.withCapabilities(this.chromeCapabilities)
			.setChromeOptions(chromeOptionsForContainer);
		return builder;
	}

	private createDockerizedFirefoxBuilder(builder: Builder) {
		builder = builder
			.forBrowser(Browser.FIREFOX)
			.withCapabilities(this.firefoxCapabilities)
			.setFirefoxOptions(this.firefoxOptions);
		return builder;
	}

	private generateSeleniumContainerName(
		browser: AvailableBrowsers,
		logName?: string,
	): string {
		const suffix = Math.random().toString(36).slice(2, 8);
		const baseName = (logName ?? 'session').replaceAll(
			/[^a-zA-Z0-9_.-]/g,
			'-',
		);
		return `selenium-${browser}-${baseName}-${suffix}`.slice(0, 63);
	}

	private async ensureDockerImage(image: string): Promise<void> {
		if (!(await this.dockerService.imageExists(image))) {
			await this.dockerService.pullImage(image);
		}
	}

	private async waitForSeleniumServer(
		seleniumServerBaseUrl: string,
		timeoutMs: number,
	): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			try {
				const response = await fetch(
					`${seleniumServerBaseUrl}/wd/hub/status`,
					{
						signal: AbortSignal.timeout(3000),
					},
				);
				if (response.ok) {
					const body = (await response.json()) as {
						value?: { ready?: boolean };
					};
					if (body.value?.ready === true) {
						console.log(
							'Dockerized Selenium server ' +
								seleniumServerBaseUrl +
								' is ready',
						);
						return;
					} else {
						console.warn(
							`Selenium server at ${seleniumServerBaseUrl} responded but is not ready yet, retrying...`,
						);
						console.warn('Response body:', body);
					}
				} else {
					console.warn(
						`Selenium server responded with status ${response.status}, retrying...`,
					);
					console.warn('Response body:', await response.text());
				}
			} catch {
				console.warn(
					'Failed to connect to dockerized Selenium, retrying...',
				);
			}
			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		throw new Error(
			`Timed out waiting for dockerized Selenium at ${seleniumServerBaseUrl}`,
		);
	}

	private async removeDockerizedBrowserContainer(
		sessionId: string,
	): Promise<void> {
		const containerName = this.dockerizedSessionContainers.get(sessionId);
		if (!containerName) {
			return;
		}
		await this.dockerService.removeContainer(containerName);
		this.dockerizedSessionContainers.delete(sessionId);
	}

	private async getChromeDriver(logName?: string): Promise<WebDriver> {
		const sb = new chrome.ServiceBuilder()
			.enableVerboseLogging()
			.loggingTo(
				`${LocalFilesRepository.SCRIPTS_LOGS_DIR}/selenium-${logName ?? Date.now()}.log`,
			);
		return await new Builder()
			.forBrowser(Browser.CHROME)
			.withCapabilities(this.chromeCapabilities)
			.setChromeOptions(this.chromeOptions)
			.setChromeService(sb)
			.build();
	}

	private async getFirefoxDriver(verboseLogging = false): Promise<WebDriver> {
		const sb = new firefox.ServiceBuilder();
		if (verboseLogging) {
			sb.enableVerboseLogging(verboseLogging).setStdio('inherit');
		}
		return await new Builder()
			.forBrowser(Browser.FIREFOX)
			.withCapabilities(this.firefoxCapabilities)
			.setFirefoxOptions(this.firefoxOptions)
			.setFirefoxService(sb)
			.build();
	}

	public setHeadless() {
		this.chromeOptions.addArguments('--headless');
		this.firefoxOptions.addArguments('--headless');
	}

	public async recordFullScreen(properties: UserJoinProperties) {
		if (this.isRecordingFullScreen) {
			console.warn(
				'Already recording full screen, only one recording is supported at a time',
			);
			return;
		}
		if (this.configService.shouldUseDockerizedBrowsers()) {
			const dateNow = Date.now();
			if (
				!(await this.dockerService.imageExists(
					this.DOCKER_SELENIUM_RECORDING_IMAGE,
				))
			) {
				await this.dockerService.pullImage(
					this.DOCKER_SELENIUM_RECORDING_IMAGE,
				);
			}
			const createOptions: ContainerCreateOptions = {
				Image: this.DOCKER_SELENIUM_RECORDING_IMAGE,
				name: 'selenium-recording-' + dateNow,
				HostConfig: {
					NetworkMode:
						this.configService.getDockerizedBrowsersConfig()
							.networkName,
					Binds: [
						`${LocalFilesRepository.FULLSCREEN_RECORDING_DIR}:/videos/:rw`,
					],
				},
				Env: [`FILE_NAME=session_${dateNow}.mp4`],
			};

			this.recordingDockerContainerId =
				await this.dockerService.startContainer(createOptions);
		} else {
			const ffmpegCommand = [
				'ffmpeg -hide_banner -loglevel warning -nostdin -y',
				` -video_size 1920x1080 -framerate ${properties.frameRate} -f x11grab -i :10`,
				` -f pulse -i 0 `,
				`${LocalFilesRepository.FULLSCREEN_RECORDING_DIR}/session_${Date.now()}.mp4`,
			].join('');
			const logFileFd = await fsPromises.open(
				`${LocalFilesRepository.SCRIPTS_LOGS_DIR}/fullscreen_recording_ffmpeg.log`,
				'a',
			);
			this.recordingScript = await this.scriptRunnerService.run(
				ffmpegCommand,
				{
					detached: true,
					stdio: ['ignore', logFileFd.fd, logFileFd.fd],
					onCloseCallback: code => {
						console.log(
							`Recording process exited with code ${code}`,
						);
						this.isRecordingFullScreen = false;
					},
				},
			);
			await logFileFd.close();
		}
	}

	async stopFullScreenRecording() {
		if (this.recordingScript) {
			console.log('Stopping full screen recording');
			await this.scriptRunnerService.killDetached(this.recordingScript);
		}
		if (this.recordingDockerContainerId) {
			console.log('Stopping full screen recording container');
			await this.dockerService.removeContainer(
				this.recordingDockerContainerId,
			);
		}
	}
}
