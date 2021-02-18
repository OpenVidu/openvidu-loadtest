

export class LocalStorageService {

	private storage: Storage;

	constructor() {
		this.storage = globalThis.localStorage;
	}

	setItem(name: string, value: any) {
		this.storage.setItem(name, value);
	}

	exist(name: string): boolean {
		return !!this.getItem(name);
	}

	getItem(name: string): string {
		return this.storage.getItem(name);

	}
}