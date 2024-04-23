import * as express from 'express';
import { Request, Response } from 'express';
import { BrowserManagerService } from '../services/browser-manager.service';
import { OpenViduRole, Resolution } from '../types/openvidu.type';
import { BrowserMode, LoadTestPostRequest, LoadTestPostResponse } from '../types/api-rest.type';
import BaseComModule from '../com-modules/base';
import { saveStats } from './events.controller'

export const app = express.Router({
	strict: true,
});

app.post('/streamManager', async (req: Request, res: Response) => {
	try {
		const comModuleInstance: BaseComModule = BaseComModule.getInstance();
		const request: LoadTestPostRequest = req.body;

		if (comModuleInstance.areParametersCorrect(request)) {
			comModuleInstance.setEnvironmentParams(req);
			comModuleInstance.processNewUserRequest(request);
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
		await saveStats();
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

app.delete('/streamManager/session/:sessionId/user/:userId', async (req: Request, res: Response) => {
	try {
		const sessionId: string = req.params.sessionId;
		const userId: string = req.params.userId;

		if (!sessionId || !userId) {
			return res.status(400).send('Problem with userId or sessionId parameter. IT DOES NOT EXIST');
		}
		const browserManagerService: BrowserManagerService = BrowserManagerService.getInstance();
		console.log('Deleting streams with sessionId: ' + sessionId + ' and userId: ' + userId);
		await browserManagerService.deleteStreamManagerWithSessionAndUser(sessionId, userId);
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