import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as lockfile from 'proper-lockfile';
import { dirname } from 'path';

export const STATS_DIR = `${process.cwd()}/stats/`;
export const LOCKS_DIR = `${STATS_DIR}locks/`;
export const CON_FILE = `connections.json`;
export const STATS_FILE = `stats.json`;
export const EVENTS_FILE = `events.json`;
export const ERRORS_FILE = `errors.json`;

if (!fs.existsSync(STATS_DIR)) {
	fs.mkdirSync(STATS_DIR, { recursive: true });
}

const retryOptions = {
	retries: 5,
	factor: 3,
	minTimeout: 10000,
	maxTimeout: 60000,
	randomize: true,
};

export async function createFileAndLock(userId: string, sessionId: string, fileName: string) {
  const filePath = `${STATS_DIR}${sessionId}/${userId}/${fileName}`;
  console.log("Creating file: " + filePath);
  await fsp.mkdir(dirname(filePath), { recursive: true });
  console.log("Created dir for file: " + filePath);
  try {
    await fsp.writeFile(filePath, "[]", { flag: "wx" });
  } catch (error) {
    if (error.code === 'EEXIST') {
      console.log("File already exists: " + filePath);
    } else {
      throw error;
    }
  }
}

export async function saveStatsToFile(userId: string, sessionId: string, fileName: string, data: any) {
  const statsDir = `${STATS_DIR}${sessionId}/${userId}/`;
  const filePath = `${statsDir}${fileName}`;

  try {
    const lockRelease = await lockfile.lock(filePath, retryOptions);
    let existingData: any[] = [];
    try {
      const fileContent = await fsp.readFile(filePath, 'utf8');
      existingData = JSON.parse(fileContent);
    } catch (error) {
      // Ignore errors and continue with an empty array
    }

    const combinedData = Array.isArray(data) ? existingData.concat(data) : [...existingData, data];
    await fsp.writeFile(filePath, JSON.stringify(combinedData));
    await lockRelease();
  } catch (error) {
    console.error(error);
  }
}