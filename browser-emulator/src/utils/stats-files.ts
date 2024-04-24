import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as lockfile from 'proper-lockfile';

export const STATS_DIR = `${process.cwd()}/stats/`;
export const LOCKS_DIR = `${STATS_DIR}locks/`;

if (!fs.existsSync(STATS_DIR)) {
	fs.mkdirSync(STATS_DIR);
}

if (!fs.existsSync(LOCKS_DIR)) {
	fs.mkdirSync(LOCKS_DIR);
}

export async function createFileAndLock(file: string) {
	if (!fs.existsSync(STATS_DIR + file)) {
		fs.writeFileSync(STATS_DIR + file, '[]');
	}
	if (!fs.existsSync(LOCKS_DIR + file + ".lock")) {
		fs.writeFileSync(LOCKS_DIR + file + ".lock", '');
	}
}

const retryOptions = {
	retries: 5,
	factor: 3,
	minTimeout: 1000,
	maxTimeout: 60000,
	randomize: true,
};

export async function saveStatsToFile(file: string, data: any) {
	// lock is in STATS_DIR/locks/filename.lock
	const release = await lockfile.lock(LOCKS_DIR + file + ".lock", retryOptions);
	console.log("Saving stats to file " + file);
	let existingData: any[] = [];
    try {
        // Read existing data from the file
        const fileContent = await fsp.readFile(file, 'utf8');
        existingData = JSON.parse(fileContent);
		console.log("Existing data: " + existingData.length)
    } catch (error) {
        // If the file doesn't exist or is empty, continue with an empty array
    }

    // Merge existing data with new data
	let combinedData: any[];
	if (Array.isArray(data)) {
		combinedData = existingData.concat(data);
	} else {
		existingData.push(data);
		combinedData = existingData;
	}
	console.log("Combined data: " + combinedData.length);

    // Write the combined data back to the file
    await fsp.writeFile(STATS_DIR + file, JSON.stringify(combinedData));
	await release();
}