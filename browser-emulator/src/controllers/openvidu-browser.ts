import * as express from 'express';
import { Request, Response } from 'express';
import { BrowserManager } from '../infrastructure/browser-manager';
import { BrowserMode, OpenViduRole, PublisherProperties } from '../extra/openvidu-browser/OpenVidu/OpenviduTypes';
import { InstanceService } from '../services/instance-service';

export const app = express.Router({
    strict: true
});

const instanceService: InstanceService = new InstanceService();
const browserManager: BrowserManager = new BrowserManager();

app.post('/streamManager', async (req: Request, res: Response) => {
	try {

		if(areStreamManagerParamsCorrect(req)) {
			let browserMode: BrowserMode = req.body.browserMode || BrowserMode.EMULATE;
			let properties: PublisherProperties = req.body.properties;
			// Setting default role for publisher properties
			properties.role = properties.role || OpenViduRole.PUBLISHER

			process.env.LOCATION_HOSTNAME = req.headers.host;
			process.env.OPENVIDU_SECRET = req.body.openviduSecret;
			process.env.OPENVIDU_URL = req.body.openviduUrl;

			const connectionId = await browserManager.createStreamManager(browserMode, properties);
			const workerCpuUsage = await instanceService.getCpuUsage();
			return res.status(200).send({connectionId, workerCpuUsage});
		}

		console.log('Problem with some body parameter' + req.body);
		return res.status(400).send('Problem with some body parameter');
	} catch (error) {
		console.log("ERROR ", error);
		res.status(500).send(error);

	}
});


app.delete('/streamManager/connection/:connectionId', (req: Request, res: Response) => {
	try {
		const connectionId: string = req.params.connectionId;

		if(!connectionId){
			return res.status(400).send('Problem with connectionId parameter. IT DOES NOT EXIST');
		}
		console.log('Deleting streams with connectionId: ' + connectionId);
		browserManager.deleteStreamManagerWithConnectionId(connectionId);
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.delete('/streamManager/role/:role', (req: Request, res: Response) => {
	try {
		const role: any = req.params.role;
		if(!role){
			return res.status(400).send('Problem with ROLE parameter. IT DOES NOT EXIST');
		}else if(role !== OpenViduRole.PUBLISHER && role !== OpenViduRole.SUBSCRIBER ){
			return res.status(400).send(`Problem with ROLE parameter. IT MUST BE ${OpenViduRole.PUBLISHER} or ${OpenViduRole.SUBSCRIBER}`);
		}

		console.log('Deleting streams with ROLE:' + role);
		browserManager.deleteStreamManagerWithRole(role);
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

function areStreamManagerParamsCorrect(req: Request): boolean {
	const openviduSecret: string = req.body.openviduSecret;
	const openviduUrl: string = req.body.openviduUrl;
	let properties: PublisherProperties = req.body.properties;

	const tokenCanBeCreated = !!properties?.userId && !!properties?.sessionName && !!openviduUrl && !!openviduSecret;
	const tokenHasBeenReceived = !!properties?.userId && !!properties?.token;

	return tokenCanBeCreated || tokenHasBeenReceived;
}
