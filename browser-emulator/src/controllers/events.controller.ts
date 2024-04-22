import * as express from 'express';
import { Request, Response } from 'express';
import { ElasticSearchService } from '../services/elasticsearch.service';
import { WsService } from '../services/ws.service';
import { JSONStatsResponse } from '../types/api-rest.type';
import * as fsp from 'fs/promises';
import * as fs from 'fs';

// DEBUG: Print full objects (only uncomment for debug sessions during development)
// require("util").inspect.defaultOptions.depth = null;

export const app = express.Router({
	strict: true,
});

const elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance();

const statsBuffer: JSONStatsResponse[] = [];
let sendInterval: NodeJS.Timeout;
const STATS_DIR = `${process.cwd()}/stats`;

const statsFile = `${STATS_DIR}/stats.json`;
if (!fs.existsSync(statsFile)) {
	fs.writeFileSync(statsFile, '[]');
}

const eventsFile = `${STATS_DIR}/events.json`;
if (!fs.existsSync(eventsFile)) {
	fs.writeFileSync(eventsFile, '[]');
}

const errorsFile = `${STATS_DIR}/errors.json`;
if (!fs.existsSync(errorsFile)) {
	fs.writeFileSync(errorsFile, '[]');
}

const saveStatsToFile = async (file: string) => {
	let existingData: any[] = [];
    try {
        // Read existing data from the file
        const fileContent = await fsp.readFile(file, 'utf8');
        existingData = JSON.parse(fileContent);
    } catch (error) {
        // If the file doesn't exist or is empty, continue with an empty array
    }

    // Merge existing data with new data
    const combinedData = existingData.concat(file);

    // Write the combined data back to the file
    await fsp.writeFile(statsFile, JSON.stringify(file));
}


const saveStats = async () => {
	if (statsBuffer.length > 0) {
		const promises = [];
		// Save the stats to file
		promises.push(saveStatsToFile(statsFile));
		// Send the stats to ElasticSearch
		if (elasticSearchService.isElasticSearchRunning()) {
			promises.push(elasticSearchService.sendBulkJsons(statsBuffer));
		}
		await Promise.all(promises);
		statsBuffer.length = 0; // Clear the buffer
	}
}

const randomTimeoutSend = async () => {
	return new Promise<void>((resolve, reject) => {
		setTimeout(() => {
			try {
				saveStats();
				resolve();
			} catch (error) {
				reject(error);
			}
		}, getRandomDelay());
	});
}

const getRandomDelay = () => {
	const minDelay = 0; // Minimum delay in milliseconds
	const maxDelay = 10000; // Maximum delay in milliseconds
	return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
};

const startSendingStats = () => {
	sendInterval = setInterval(async () => {
		await randomTimeoutSend();
	}, 30000);
};

startSendingStats();

app.get('/events/forcesave', async (req: Request, res: Response) => {
	try {
		await saveStats();
		return res.status(200).send();
	} catch (error) {
		console.error('ERROR saving stats', error);
		return res.status(500).send(error);
	}
});

app.post('/webrtcStats', async (req: Request, res: Response) => {
	try {
		const statsResponse: JSONStatsResponse | JSONStatsResponse[] = req.body;
		if (Array.isArray(statsResponse)) {
			statsBuffer.push(...statsResponse);
		} else {
			statsBuffer.push(statsResponse);
		}

		return res.status(200).send();
	} catch (error) {
		console.log('ERROR saving stats', error);
		res.status(500).send(error);
	}
});

app.post('/events', async (req: Request, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);
		WsService.getInstance().send(message);

		await saveStatsToFile(eventsFile);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

app.post('/events/errors', async (req: Request, res: Response) => {
	try {
		const message: string = JSON.stringify(req.body);

		console.error("Error received from browser: ");
		console.error(message);

		await saveStatsToFile(errorsFile);

		return res.status(200).send();
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});
