import {
	Browser,
	Builder,
	Capabilities,
	WebDriver,
	logging,
} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';
import type { AvailableBrowsers } from '../types/api-rest.type.ts';
import type { ScriptRunnerService } from './script-runner.service.ts';
import type { FakeMediaDevicesService } from './fake-media/fake-media-devices.service.ts';
import { LocalFilesRepository } from '../repositories/files/local-files.repository.ts';
import fsPromises from 'node:fs/promises';

export class SeleniumService {
	private isInitialized = false;
	// TODO: Add this as config
	// private static readonly BROWSER_HOSTPORT = 4444;

	private readonly chromeOptions = new chrome.Options();
	private readonly chromeCapabilities = Capabilities.chrome();
	private readonly firefoxOptions = new firefox.Options();
	private readonly firefoxCapabilities = Capabilities.firefox();

	private readonly scriptRunnerService: ScriptRunnerService;
	private readonly fakeMediaDevicesService: FakeMediaDevicesService;

	public constructor(
		scriptRunnerService: ScriptRunnerService,
		fakeMediaDevicesService: FakeMediaDevicesService,
	) {
		this.scriptRunnerService = scriptRunnerService;
		this.fakeMediaDevicesService = fakeMediaDevicesService;
		const prefs = new logging.Preferences();
		logging.getLogger('webdriver');
		const logLevel = logging.Level.INFO;
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
			'--disable-dev-shm-usage',
			'--use-fake-ui-for-media-stream',
			'--no-sandbox',
			'--disable-gpu',
			'--start-maximized',
		);
	}

	public async initialize(
		videoPath: string,
		audioPath: string,
	): Promise<void> {
		if (!this.isInitialized) {
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
				await this.scriptRunnerService.run(
					`Xvfb ${process.env.DISPLAY} -screen 0 1920x1080x24 -ac`,
					{
						detached: true,
						stdio: ['ignore', xvfbLogFd.fd, xvfbLogFd.fd],
					},
				);
				await xvfbLogFd.close();
			}
			// Start fake webcam for media capture
			await this.fakeMediaDevicesService.startFakeMediaDevices(
				videoPath,
				audioPath,
				() => {
					this.isInitialized = false;
				},
			);
			this.isInitialized = true;
		}
	}

	public async getDriver(
		browser: AvailableBrowsers,
		logName?: string,
	): Promise<WebDriver> {
		if (browser === 'firefox') {
			return await this.getFirefoxDriver();
		} else {
			return await this.getChromeDriver(logName);
		}
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
		const sb = new firefox.ServiceBuilder()
			.enableVerboseLogging(verboseLogging)
			.setStdio('inherit');
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
}
