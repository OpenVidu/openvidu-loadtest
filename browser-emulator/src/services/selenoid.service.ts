import path = require("path");
import fs = require("fs");
import { downloadFile } from "../utils/download-files";
import { runScript } from "../utils/run-script";
import os = require("os");
import { Browser, Builder, Capabilities, WebDriver } from "selenium-webdriver";
import chrome = require('selenium-webdriver/chrome');

export class SelenoidService {
    
    private static instance: SelenoidService;
    //TODO: Add this as config
    private static readonly downloadURL = "https://github.com/aerokube/cm/releases/download/1.8.2/cm_linux_amd64";
    private static readonly BROWSER_HOSTPORT = 4444;

    private constructor() {
    }

    static async getInstance() {
        if (!SelenoidService.instance) {
            // Download selenoid CM if it doesn't exist
            const selenoidCMPath = path.join('usr', 'local', 'bin', 'cm');
            if (!fs.existsSync(selenoidCMPath)) {
                console.log('Downloading Selenoid CM');
                await downloadFile('cm', this.downloadURL, '/usr/local/bin')
                console.log('Selenoid CM downloaded');
                fs.chmodSync(selenoidCMPath, '755');
            }
            //TODO: Add version numbers as config
            const configDir = `${process.env.PWD}/selenoid-config`;
            // Download selenoid binaries
            await runScript(`cm selenoid download --config-dir ${configDir} --version 1.10.9 --use-drivers`);
            // Configure selenoid
            await runScript(`cm selenoid configure --config-dir ${configDir} --browsers chrome:107.0 --use-drivers`);
            // Start selenoid
            const numOfCpus = (2*os.cpus().length).toString();
            const logsDir = `${process.env.PWD}/selenoid-logs`;
            const args = ["-limit", numOfCpus, "-timeout", "24h", "-disable-docker", "-log-output-dir", logsDir].join(" ");
            await runScript(`cm selenoid start --config-dir ${configDir} --use-drivers --port ${this.BROWSER_HOSTPORT} --args "${args}"`, true);
            SelenoidService.instance = new SelenoidService();
        }
        return SelenoidService.instance;
    }

    async getChromeDriver(chromeCapabilities: Capabilities, chromeOptions: chrome.Options): Promise<WebDriver> {
		return await new Builder()
			.forBrowser(Browser.CHROME)
			.withCapabilities(chromeCapabilities)
			.setChromeOptions(chromeOptions)
			.usingServer(`http://localhost:${SelenoidService.BROWSER_HOSTPORT}/wd/hub`)
			.build();
	}
}