import { LocalFilesRepository } from '../repositories/files/local-files.repository.ts';

export interface DockerizedBrowsersConfig {
	enabled: boolean;
	networkName: string;
	browserEmulatorHost: string;
	chromeImage: string;
	firefoxImage: string;
	seleniumPort: number;
	startupTimeoutMs: number;
}

export class ConfigService {
	private readonly serverPort: number;
	private readonly websocketServerPort: number;
	private readonly comModule: string;
	private readonly runningInDocker: boolean;
	private readonly dockerizedBrowsersConfig: DockerizedBrowsersConfig;

	private readonly disableHttps: boolean;
	private readonly mediaFilesHostDir: string;
	private readonly scriptsLogsHostDir: string;
	private legacyMode = false;

	constructor() {
		this.serverPort = this.parseServerPort();
		this.websocketServerPort = this.parseWebsocketServerPort();
		this.comModule = this.parseComModule();
		this.runningInDocker = this.parseRunningInDocker();
		this.dockerizedBrowsersConfig = this.parseDockerizedBrowsersConfig();
		this.disableHttps = this.parseBoolean(process.env.DISABLE_HTTPS, false);
		this.mediaFilesHostDir = this.pickString(
			process.env.MEDIAFILES_HOST_DIR,
			LocalFilesRepository.MEDIAFILES_DIR,
		);
		this.scriptsLogsHostDir = this.pickString(
			process.env.SCRIPTS_LOGS_HOST_DIR,
			LocalFilesRepository.SCRIPTS_LOGS_DIR,
		);
		this.legacyMode = false;

		this.logConfiguration();
	}

	private parseBoolean(
		value: string | undefined,
		defaultValue: boolean,
	): boolean {
		if (value === undefined) {
			return defaultValue;
		}
		return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
	}

	private parseServerPort(): number {
		const port = process.env.SERVER_PORT;
		if (!port) {
			return 5000; // Default port
		}

		const parsedPort = Number(port);
		if (Number.isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
			throw new Error(
				`Invalid SERVER_PORT: "${port}". Must be a number between 1 and 65535.`,
			);
		}

		return parsedPort;
	}

	private parseWebsocketServerPort(): number {
		const port = process.env.WEBSOCKET_SERVER_PORT;
		if (!port) {
			return 5001; // Default WebSocket server port
		}

		const parsedPort = Number(port);
		if (Number.isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
			throw new Error(
				`Invalid WEBSOCKET_SERVER_PORT: "${port}". Must be a number between 1 and 65535.`,
			);
		}

		return parsedPort;
	}

	private parseComModule(): string {
		return process.env.COM_MODULE ?? 'livekit';
	}

	private parseRunningInDocker(): boolean {
		return this.parseBoolean(process.env.RUNNING_IN_DOCKER, false);
	}

	private pickString(value: unknown, defaultValue: string): string {
		return typeof value === 'string' && value.length > 0
			? value
			: defaultValue;
	}

	private parseDockerizedBrowsersConfig(): DockerizedBrowsersConfig {
		const defaultConfig: DockerizedBrowsersConfig = {
			enabled: this.runningInDocker,
			networkName: 'browseremulator',
			browserEmulatorHost: 'browser-emulator',
			chromeImage: 'selenium/standalone-chrome:latest',
			firefoxImage: 'selenium/standalone-firefox:latest',
			seleniumPort: 4444,
			startupTimeoutMs: 30000,
		};

		// Use individual DOCKERIZED_BROWSERS_* environment variables only
		const enabled = this.parseBoolean(
			process.env.DOCKERIZED_BROWSERS_ENABLED,
			defaultConfig.enabled,
		);

		const networkName = this.pickString(
			process.env.DOCKER_NETWORK_NAME,
			defaultConfig.networkName,
		);

		const browserEmulatorHost = this.pickString(
			process.env.DOCKER_BROWSER_EMULATOR_HOST,
			defaultConfig.browserEmulatorHost,
		);

		const chromeImage = this.pickString(
			process.env.DOCKERIZED_BROWSERS_CHROME_IMAGE,
			defaultConfig.chromeImage,
		);

		const firefoxImage = this.pickString(
			process.env.DOCKERIZED_BROWSERS_FIREFOX_IMAGE,
			defaultConfig.firefoxImage,
		);

		const seleniumPortEnv = process.env.DOCKERIZED_BROWSERS_SELENIUM_PORT;
		let seleniumPort = defaultConfig.seleniumPort;
		if (seleniumPortEnv !== undefined && seleniumPortEnv.length > 0) {
			const parsed = Number(seleniumPortEnv);
			if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
				throw new Error(
					`Invalid DOCKERIZED_BROWSERS_SELENIUM_PORT: "${seleniumPortEnv}". Must be a number between 1 and 65535.`,
				);
			}
			seleniumPort = parsed;
		}

		const startupTimeoutEnv =
			process.env.DOCKERIZED_BROWSERS_STARTUP_TIMEOUT_MS;
		let startupTimeoutMs = defaultConfig.startupTimeoutMs;
		if (startupTimeoutEnv !== undefined && startupTimeoutEnv.length > 0) {
			const parsed = Number(startupTimeoutEnv);
			if (Number.isNaN(parsed) || parsed < 0) {
				throw new Error(
					`Invalid DOCKERIZED_BROWSERS_STARTUP_TIMEOUT_MS: "${startupTimeoutEnv}". Must be a non-negative number.`,
				);
			}
			startupTimeoutMs = parsed;
		}

		return {
			enabled,
			networkName,
			browserEmulatorHost,
			chromeImage,
			firefoxImage,
			seleniumPort,
			startupTimeoutMs,
		};
	}

	private logConfiguration(): void {
		console.log('Configuration loaded:');
		console.log(`  SERVER_PORT: ${this.serverPort}`);
		console.log(`  COM_MODULE: ${this.comModule}`);
		console.log(`  RUNNING_IN_DOCKER: ${this.runningInDocker}`);
		console.log(
			`  DOCKERIZED_BROWSERS: ${this.shouldUseDockerizedBrowsers()}`,
		);
		if (this.disableHttps) {
			console.log(`  DISABLE_HTTP: ${this.disableHttps}`);
		}
		console.log(`  MEDIAFILES_HOST_DIR: ${this.mediaFilesHostDir}`);
		console.log(`  SCRIPTS_LOGS_HOST_DIR: ${this.scriptsLogsHostDir}`);

		if (this.legacyMode) {
			console.log('  LEGACY_MODE: enabled');
		}
	}

	public getServerPort(): number {
		return this.serverPort;
	}

	public getWebsocketServerPort(): number {
		return this.websocketServerPort;
	}

	public getComModule(): string {
		return this.comModule;
	}

	public shouldUseDockerizedBrowsers(): boolean {
		return this.runningInDocker && this.dockerizedBrowsersConfig.enabled;
	}

	public getDockerizedBrowsersConfig(): DockerizedBrowsersConfig {
		return this.dockerizedBrowsersConfig;
	}

	public getBrowserEmulatorHostForBrowsers(): string {
		if (this.shouldUseDockerizedBrowsers()) {
			return this.dockerizedBrowsersConfig.browserEmulatorHost;
		}
		return 'localhost';
	}

	public isLegacyMode(): boolean {
		return this.legacyMode;
	}

	public getMediaFilesHostDir(): string {
		return this.mediaFilesHostDir;
	}

	public getScriptsLogsHostDir(): string {
		return this.scriptsLogsHostDir;
	}

	public isHttpsDisabled(): boolean {
		return this.disableHttps;
	}

	public setLegacyMode(legacyMode: boolean): void {
		this.legacyMode = legacyMode;
	}
}
