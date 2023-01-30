import { isRunning, runScript } from "../utils/run-script";
require('chromedriver');
import { Browser, Builder, Capabilities, WebDriver } from "selenium-webdriver";
import chrome = require('selenium-webdriver/chrome');
import { startFakeMediaDevices } from "../utils/fake-media-devices";

export class SeleniumService {
    
    private static instance: SeleniumService;
    //TODO: Add this as config
    // private static readonly BROWSER_HOSTPORT = 4444;

    private constructor() {
    }

    static async getInstance(videoPath?: string, audioPath?: string) {
        if (!SeleniumService.instance) {
            if (!(videoPath && audioPath)) {
                throw new Error("Video and audio are needed for initializing Selenium")
            }
            // Start X server for browsers, assumes Xvfb installed and DISPLAY :10 free
            // TODO: choose display number in config
            process.env.DISPLAY=":10"
            if (!await isRunning("Xvfb :10")) {
                await runScript(`Xvfb ${process.env.DISPLAY} -screen 0 1920x1080x24 -ac`, {
                    detached: true,
                    ignoreLogs: true
                });
            }
            // Start fake webcam for media capture
            await startFakeMediaDevices(videoPath, audioPath);
            // Start selenium
            SeleniumService.instance = new SeleniumService();
        }
        return SeleniumService.instance;
    }

    async getChromeDriver(chromeCapabilities: Capabilities, chromeOptions: chrome.Options): Promise<WebDriver> {
        const sb = new chrome.ServiceBuilder().enableVerboseLogging().loggingTo(`${process.env.PWD}/selenium.log`);
		return await new Builder()
			.forBrowser(Browser.CHROME)
			.withCapabilities(chromeCapabilities)
			.setChromeOptions(chromeOptions)
            .setChromeService(sb)
			.build();
	}
}