export interface Storage {
	clear(): void;

	getItem(key: string): string | null;

	key(index: number): string | null;

	removeItem(key: string): void;

	setItem(key: string, value: string): void;
}

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

	clear(name: string): void {
		this.storage.removeItem(name);
	}
}
