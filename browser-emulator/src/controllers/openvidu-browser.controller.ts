import * as express from 'express';
import { Request, Response } from 'express';
import { BrowserManagerService } from '../services/browser-manager.service';
import { OpenViduRole, Resolution } from '../types/openvidu.type';
import { BrowserMode, LoadTestPostRequest, LoadTestPostResponse, TestProperties } from '../types/api-rest.type';

export const app = express.Router({
	strict: true,
});

app.post('/streamManager', async (req: Request, res: Response) => {
	try {
		const request: LoadTestPostRequest = req.body;

		if (areStreamManagerParamsCorrect(request)) {
			setEnvironmentParams(req);
			const browserManagerService: BrowserManagerService = BrowserManagerService.getInstance();

			request.browserMode = request.browserMode || BrowserMode.EMULATE;
			request.properties.frameRate = request.properties.frameRate || 30;
			// Setting default role for publisher properties
			request.properties.role = request.properties.role || OpenViduRole.PUBLISHER;

			if (request.properties.resolution && Object.values(Resolution).includes(request.properties.resolution)) {
				request.properties.resolution = request.properties.resolution;
			} else {
				request.properties.resolution = Resolution.DEFAULT;
			}

			if (request.browserMode === BrowserMode.REAL) {
				request.properties.showVideoElements = request.properties.showVideoElements || true;
			}

			const response: LoadTestPostResponse = await browserManagerService.createStreamManager(request);
			return res.status(200).send(response);
		} else {
			console.log('Problem with some body parameter' + JSON.stringify(request));
			return res.status(400).send('Problem with some body parameter');
		}
	} catch (error) {
		console.log('ERROR ', error);
		res.status(error?.status || 500).send({ message: error?.statusText, error: error });
	}
});

app.delete('/streamManager', async (req: Request, res: Response) => {
	const browserManagerService: BrowserManagerService = BrowserManagerService.getInstance();
	console.log('Deleting all participants');
	try {
		await browserManagerService.clean();
		res.status(200).send(`Instance ${req.headers.host} is clean`);
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

app.delete('/streamManager/connection/:connectionId', async (req: Request, res: Response) => {
	try {
		const connectionId: string = req.params.connectionId;

		if (!connectionId) {
			return res.status(400).send('Problem with connectionId parameter. IT DOES NOT EXIST');
		}
		const browserManagerService: BrowserManagerService = BrowserManagerService.getInstance();
		console.log('Deleting streams with connectionId: ' + connectionId);
		await browserManagerService.deleteStreamManagerWithConnectionId(connectionId);
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.delete('/streamManager/role/:role', async (req: Request, res: Response) => {
	try {
		let role: any = req.params.role;
		if (!role) {
			return res.status(400).send('Problem with ROLE parameter. IT DOES NOT EXIST');
		} else if (role !== OpenViduRole.PUBLISHER && role !== OpenViduRole.SUBSCRIBER) {
			return res.status(400).send(`Problem with ROLE parameter. IT MUST BE ${OpenViduRole.PUBLISHER} or ${OpenViduRole.SUBSCRIBER}`);
		}
		const browserManagerService: BrowserManagerService = BrowserManagerService.getInstance();
		role = role === OpenViduRole.PUBLISHER ? OpenViduRole.PUBLISHER : OpenViduRole.SUBSCRIBER;
		console.log('Deleting streams with ROLE:' + role);
		await browserManagerService.deleteStreamManagerWithRole(role);
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

function areStreamManagerParamsCorrect(request: LoadTestPostRequest): boolean {
	const openviduSecret: string = request.openviduSecret;
	const openviduUrl: string = request.openviduUrl;
	const token: string = request.token;
	let properties: TestProperties = request.properties;

	const tokenCanBeCreated = !!properties?.userId && !!properties?.sessionName && !!openviduUrl && !!openviduSecret;
	const tokenHasBeenReceived = !!properties?.userId && !!token;

	return tokenCanBeCreated || tokenHasBeenReceived;
}

function setEnvironmentParams(req: Request): void {
	const request: LoadTestPostRequest = req.body;
	process.env.LOCATION_HOSTNAME = req.headers.host;
	process.env.OPENVIDU_SECRET = request.openviduSecret;
	process.env.OPENVIDU_URL = request.openviduUrl;
	process.env.KURENTO_RECORDING_ENABLED = String(request.properties.recording && request.browserMode === BrowserMode.EMULATE);
}
