import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as lockfile from 'proper-lockfile';

export const STATS_DIR = `${process.cwd()}/stats/`;
export const LOCKS_DIR = `${STATS_DIR}locks/`;
export const CON_FILE = `connections.json`;
export const STATS_FILE = `stats.json`;
export const EVENTS_FILE = `events.json`;
export const ERRORS_FILE = `errors.json`;

if (!fs.existsSync(STATS_DIR)) {
	fs.mkdirSync(STATS_DIR, { recursive: true });
}

if (!fs.existsSync(LOCKS_DIR)) {
	fs.mkdirSync(LOCKS_DIR, { recursive: true });
}

export async function createFileAndLock(user: string, session: string, file: string) {
	const lockDir = LOCKS_DIR + session + "/" + user + "/";
	// create lock directory if it doesn't exist with promises
	await fsp.mkdir(lockDir, { recursive: true });
	const lockPath = lockDir + file + ".lock";
	await fsp.writeFile(lockPath, "");
	const fileDir = STATS_DIR + session + "/" + user + "/";
	const filePath = fileDir + file;
	const release = await lockfile.lock(lockPath, retryOptions);
	console.log("Creating file " + filePath);
	await fsp.mkdir(fileDir, { recursive: true });
	await fsp.writeFile(filePath, "[]");
	await release();
}

const retryOptions = {
	retries: 5,
	factor: 3,
	minTimeout: 1000,
	maxTimeout: 60000,
	randomize: true,
};

export async function saveStatsToFile(user: string, session: string, file: string, data: any) {
	const lockDir = LOCKS_DIR + session + "/" + user + "/";
	const lockPath = lockDir + file + ".lock";
	const fileDir = STATS_DIR + session + "/" + user + "/";
	const filePath = fileDir + file;
	const release = await lockfile.lock(lockPath, retryOptions);
	//console.log("Saving stats to file " + filePath);
	let existingData: any[] = [];
    try {
        // Read existing data from the file
        const fileContent = await fsp.readFile(filePath, 'utf8');
        existingData = JSON.parse(fileContent);
		//console.log("Existing data: " + existingData.length)
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
	//console.log("Combined data: " + combinedData.length);

    // Write the combined data back to the file
    await fsp.writeFile(filePath, JSON.stringify(combinedData));
	await release();
}