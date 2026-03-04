export abstract class BaseLocalStorageConfig {
	protected readonly itemName: string;
	protected readonly endpoint: string;
	protected readonly hostname: string;

	constructor(itemName: string, endpoint: string, hostname: string) {
		this.itemName = itemName;
		this.endpoint = endpoint;
		this.hostname = hostname;
	}

	protected abstract buildConfig(): unknown;

	public getConfig(): string {
		return JSON.stringify(this.buildConfig());
	}

	public getItemName(): string {
		return this.itemName;
	}

	protected getEndpointUrl(): string {
		return `${this.hostname}${this.endpoint}`;
	}
}
