import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import BaseComModule from './base.ts';

type ComModuleConstructor = new () => BaseComModule;

function isBaseComModuleClass(value: unknown): value is ComModuleConstructor {
	if (typeof value !== 'function') return false;
	return value.prototype instanceof BaseComModule;
}

function getDefaultExport(moduleValue: unknown): unknown {
	if (typeof moduleValue !== 'object' || moduleValue === null)
		return undefined;
	if (!('default' in moduleValue)) return undefined;
	return moduleValue.default;
}

export async function discoverComModules(): Promise<
	Record<string, ComModuleConstructor>
> {
	const currentFilePath = fileURLToPath(import.meta.url);
	const modulesDir = path.join(path.dirname(currentFilePath), 'options');
	const files = await fs.promises.readdir(modulesDir);

	const registry: Record<string, ComModuleConstructor> = {};

	for (const file of files) {
		if (!/\.(ts|js)$/.test(file)) {
			continue; // Skip non-TypeScript/JavaScript files
		}

		const moduleUrl = pathToFileURL(path.join(modulesDir, file)).href;
		const Class = getDefaultExport((await import(moduleUrl)) as unknown);
		if (!Class) continue; // Skip if no default export
		if (!isBaseComModuleClass(Class)) continue; // Skip if not a subclass of BaseComModule

		const key = path
			.basename(file)
			.replace(/\.(ts|js)$/, '')
			.toLowerCase();
		registry[key] = Class;

		// TODO: Should probably check somewhere that there is a public dir matching the com module
	}
	return registry;
}
