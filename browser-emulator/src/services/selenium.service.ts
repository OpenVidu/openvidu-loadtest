import { isRunning, runScript } from '../utils/run-script.js';
import { Browser, Builder, Capabilities, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';
import { startFakeMediaDevices } from '../utils/fake-media-devices.js';

export class SeleniumService {
	private isInitialized = false;
	//TODO: Add this as config
	// private static readonly BROWSER_HOSTPORT = 4444;

	async initialize(videoPath: string, audioPath: string): Promise<void> {
		if (!this.isInitialized) {
			// Start X server for browsers, assumes Xvfb installed and DISPLAY :10 free
			// TODO: choose display number in config
			process.env.DISPLAY = ':10';
			if (!(await isRunning(`Xvfb ${process.env.DISPLAY}`))) {
				await runScript(
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

	async getChromeDriver(
		chromeCapabilities: Capabilities,
		chromeOptions: chrome.Options,
	): Promise<WebDriver> {
		const sb = new chrome.ServiceBuilder()
			.enableVerboseLogging()
			.loggingTo(`${process.cwd()}/selenium.log`);
		return await new Builder()
			.forBrowser(Browser.CHROME)
			.withCapabilities(chromeCapabilities)
			.setChromeOptions(chromeOptions)
			.setChromeService(sb)
			.build();
	}

	async getFirefoxDriver(
		firefoxCapabilities: Capabilities,
		firefoxOptions: firefox.Options,
		verboseLogging = false,
	): Promise<WebDriver> {
		const sb = new firefox.ServiceBuilder()
			.enableVerboseLogging(verboseLogging)
			.setStdio('inherit');
		return await new Builder()
			.forBrowser(Browser.FIREFOX)
			.withCapabilities(firefoxCapabilities)
			.setFirefoxOptions(firefoxOptions)
			.setFirefoxService(sb)
			.build();
	}
}
