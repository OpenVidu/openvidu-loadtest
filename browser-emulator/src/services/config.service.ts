import { ApplicationMode } from '../types/config.type.js';

export class ConfigService {
	private readonly serverPort: number;
	private readonly applicationMode: ApplicationMode;
	private readonly dockerName: string;
	private readonly comModule: string;

	constructor() {
		this.serverPort = this.parseServerPort();
		this.applicationMode = this.parseApplicationMode();
		this.dockerName = this.parseDockerName();
		this.comModule = this.parseComModule();

		this.logConfiguration();
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

	private parseApplicationMode(): ApplicationMode {
		const mode = process.env.APPLICATION_MODE;
		if (!mode) {
			return ApplicationMode.PROD; // Default to production
		}

		const validModes = Object.values(ApplicationMode);
		if (!validModes.includes(mode as ApplicationMode)) {
			throw new Error(
				`Invalid APPLICATION_MODE: "${mode}". Must be one of: ${validModes.join(', ')}`,
			);
		}

		return mode as ApplicationMode;
	}

	private parseDockerName(): string {
		const name = process.env.DOCKER_NAME;
		if (!name || name.trim() === '') {
			return 'browser-emulator'; // Default name
		}

		// Validate Docker container name (alphanumeric, hyphens, underscores)
		if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
			throw new Error(
				`Invalid DOCKER_NAME: "${name}". Must start with alphanumeric character and contain only alphanumeric, hyphens, underscores, and dots.`,
			);
		}

		return name;
	}

	private parseComModule(): string {
		return process.env.COM_MODULE ?? 'openvidu';
	}

	private logConfiguration(): void {
		console.log('Configuration loaded:');
		console.log(`  SERVER_PORT: ${this.serverPort}`);
		console.log(`  APPLICATION_MODE: ${this.applicationMode}`);
		console.log(`  DOCKER_NAME: ${this.dockerName}`);
		console.log(`  COM_MODULE: ${this.comModule}`);
	}

	public getServerPort(): number {
		return this.serverPort;
	}

	public getApplicationMode(): ApplicationMode {
		return this.applicationMode;
	}

	public isProdMode(): boolean {
		return this.applicationMode === ApplicationMode.PROD;
	}

	public isDevMode(): boolean {
		return this.applicationMode === ApplicationMode.DEV;
	}

	public getDockerName(): string {
		return this.dockerName;
	}

	public getComModule(): string {
		return this.comModule;
	}
}
