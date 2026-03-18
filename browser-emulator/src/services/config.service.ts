export class ConfigService {
	private readonly serverPort: number;
	private readonly comModule: string;
	private legacyMode = false;

	constructor() {
		this.serverPort = this.parseServerPort();
		this.comModule = this.parseComModule();
		this.legacyMode = false;

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

	private parseComModule(): string {
		return process.env.COM_MODULE ?? 'openvidu';
	}

	private logConfiguration(): void {
		console.log('Configuration loaded:');
		console.log(`  SERVER_PORT: ${this.serverPort}`);
		console.log(`  COM_MODULE: ${this.comModule}`);
		if (this.legacyMode) {
			console.log('  LEGACY_MODE: enabled');
		}
	}

	public getServerPort(): number {
		return this.serverPort;
	}

	public getComModule(): string {
		return this.comModule;
	}

	public isLegacyMode(): boolean {
		return this.legacyMode;
	}

	public setLegacyMode(legacyMode: boolean): void {
		this.legacyMode = legacyMode;
	}
}
