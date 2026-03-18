import {
	Browser,
	Builder,
	Capabilities,
	WebDriver,
	logging,
} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';
import { LocalFilesRepository } from '../repositories/files/local-files.repository.ts';
import type { AvailableBrowsers } from '../types/create-user.type.ts';
import type { ConfigService } from './config.service.ts';

export class SeleniumService {
	// TODO: Add this as config
	// private static readonly BROWSER_HOSTPORT = 4444;

	private readonly chromeOptions = new chrome.Options();
	private readonly chromeCapabilities = Capabilities.chrome();
	private readonly firefoxOptions = new firefox.Options();
	private readonly firefoxCapabilities = Capabilities.firefox();

	private readonly configService: ConfigService;
	private readonly localFilesRepository: LocalFilesRepository;

	public constructor(
		configService: ConfigService,
		localFilesRepository: LocalFilesRepository,
	) {
		this.configService = configService;
		this.localFilesRepository = localFilesRepository;
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
			'--single-process',
			'--no-proxy-server',
		);
		if (!this.configService.isLegacyMode()) {
			this.firefoxOptions.setPreference(
				'media.navigator.streams.fake',
				true,
			);
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
}
