import BaseComModule from '../../com-modules/base.ts';

export abstract class BaseLocalStorageConfig {
	protected readonly itemName: string;
	protected readonly endpoint: string;

	constructor(itemName: string, endpoint: string) {
		this.itemName = itemName;
		this.endpoint = endpoint;
	}

	protected abstract buildConfig(): unknown;

	public getConfig(): string {
		return JSON.stringify(this.buildConfig());
	}

	public getItemName(): string {
		return this.itemName;
	}

	protected getEndpointUrl(path: string): string {
		return `https://${BaseComModule.locationHostname}${path}`;
	}
}
