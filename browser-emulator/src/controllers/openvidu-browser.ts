import * as express from 'express';
import { Request, Response } from 'express';
import { BrowserManagerService } from '../services/browser-manager.service';
import { OpenViduRole } from '../types/openvidu.type';
import { BrowserMode, LoadTestPostRequest, LoadTestPostResponse, TestProperties } from '../types/api-rest.type';

export const app = express.Router({
    strict: true
});

const browserManagerService: BrowserManagerService = new BrowserManagerService();

app.post('/streamManager', async (req: Request, res: Response) => {
	try {

		if(areStreamManagerParamsCorrect(req.body)) {
			const request: LoadTestPostRequest = req.body;
			let browserMode: BrowserMode = request.browserMode || BrowserMode.EMULATE;
			let properties: TestProperties = request.properties;
			const token = request.token;
			// Setting default role for publisher properties
			properties.role = properties.role || OpenViduRole.PUBLISHER

			process.env.LOCATION_HOSTNAME = req.headers.host;
			process.env.OPENVIDU_SECRET = request.openviduSecret;
			process.env.OPENVIDU_URL = request.openviduUrl;

			const response: LoadTestPostResponse = await browserManagerService.createStreamManager(browserMode, token, properties);

			return res.status(200).send(response);
		}

		console.log('Problem with some body parameter' + req.body);
		return res.status(400).send('Problem with some body parameter');
	} catch (error) {
		console.log("ERROR ", error);
		res.status(500).send(error);

	}
});


app.delete('/streamManager/connection/:connectionId', async (req: Request, res: Response) => {
	try {
		const connectionId: string = req.params.connectionId;

		if(!connectionId){
			return res.status(400).send('Problem with connectionId parameter. IT DOES NOT EXIST');
		}
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
		const role: any = req.params.role;
		if(!role){
			return res.status(400).send('Problem with ROLE parameter. IT DOES NOT EXIST');
		}else if(role !== OpenViduRole.PUBLISHER && role !== OpenViduRole.SUBSCRIBER ){
			return res.status(400).send(`Problem with ROLE parameter. IT MUST BE ${OpenViduRole.PUBLISHER} or ${OpenViduRole.SUBSCRIBER}`);
		}

		console.log('Deleting streams with ROLE:' + role);
		await browserManagerService.deleteStreamManagerWithRole(role);
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.post('/webrtcStats', async (req: Request, res: Response) => {
	try {

		console.log("Client Stats received: ", req.body);
		// TODO: Send them to ES

		return res.status(200).send();
	} catch (error) {
		console.log("ERROR ", error);
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
