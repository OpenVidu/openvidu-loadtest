import { isRunning, run } from '../utils/run-script.js';
import {
	Browser,
	Builder,
	Capabilities,
	WebDriver,
	logging,
} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';
import { startFakeMediaDevices } from '../utils/fake-media-devices.js';
import type { AvailableBrowsers } from '../types/api-rest.type.ts';

export class SeleniumService {
	private isInitialized = false;
	// TODO: Add this as config
	// private static readonly BROWSER_HOSTPORT = 4444;

	private readonly chromeOptions = new chrome.Options();
	private readonly chromeCapabilities = Capabilities.chrome();
	private readonly firefoxOptions = new firefox.Options();
	private readonly firefoxCapabilities = Capabilities.firefox();

	public constructor() {
		const prefs = new logging.Preferences();
		logging.getLogger('webdriver');
		prefs.setLevel(logging.Type.BROWSER, logging.Level.INFO);
		prefs.setLevel(logging.Type.DRIVER, logging.Level.INFO);
		prefs.setLevel(logging.Type.CLIENT, logging.Level.INFO);
		prefs.setLevel(logging.Type.PERFORMANCE, logging.Level.INFO);
		prefs.setLevel(logging.Type.SERVER, logging.Level.INFO);
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
			// TODO: choose display number in config
			process.env.DISPLAY = ':10';
			if (!(await isRunning(`Xvfb ${process.env.DISPLAY}`))) {
				await run(
					`Xvfb ${process.env.DISPLAY} -screen 0 1920x1080x24 -ac`,
					{
						detached: true,
						ignoreLogs: true,
					},
				);
			}
			// Start fake webcam for media capture
			await startFakeMediaDevices(videoPath, audioPath);
			this.isInitialized = true;
		}
	}

	public async getDriver(browser: AvailableBrowsers): Promise<WebDriver> {
		if (browser === 'firefox') {
			return await this.getFirefoxDriver();
		} else {
			return await this.getChromeDriver();
		}
	}

	private async getChromeDriver(): Promise<WebDriver> {
		const sb = new chrome.ServiceBuilder()
			.enableVerboseLogging()
			.loggingTo(`${process.cwd()}/selenium.log`);
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
