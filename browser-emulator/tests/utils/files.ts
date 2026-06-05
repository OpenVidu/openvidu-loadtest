import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

export async function removeAllFilesFromDir(dirPath: string) {
	try {
		const files = await fsPromises.readdir(dirPath, {
			withFileTypes: true,
		});
		for (const file of files) {
			if (file.name !== '.gitkeep') {
				const fullPath = path.join(dirPath, file.name);
				await fsPromises.rm(fullPath, {
					recursive: true,
					force: true,
				});
			}
		}
	} catch (error) {
		// Directory doesn't exist, ignore
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
}
