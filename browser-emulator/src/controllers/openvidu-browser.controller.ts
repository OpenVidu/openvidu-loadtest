import * as express from 'express';
import type { Request, Response } from 'express';
import { getContainer } from '../container.js';
import { OpenViduRole, Resolution } from '../types/openvidu.type.js';
import type {
	CreateUserBrowser,
	CreateUserBrowserRequest,
	LoadTestPostResponse,
} from '../types/api-rest.type.js';

export const app = express.Router({
	strict: true,
});

app.post(
	'/streamManager',
	async (req: CreateUserBrowserRequest, res: Response) => {
		try {
			const container = getContainer();
			const comModuleInstance = container.resolve('comModule');
			const request: CreateUserBrowser = req.body;

			if (comModuleInstance.areParametersCorrect(request)) {
				await comModuleInstance.processNewUserRequest(request);
				const browserManagerService = container.resolve(
					'browserManagerService',
				);

				request.properties.frameRate =
					request.properties.frameRate || 30;
				// Setting default role for publisher properties
				request.properties.role =
					request.properties.role || OpenViduRole.PUBLISHER;

				if (
					!(
						request.properties.resolution &&
						Object.values(Resolution).includes(
							request.properties.resolution,
						)
					)
				) {
					request.properties.resolution = Resolution.DEFAULT;
				}

				request.properties.showVideoElements =
					request.properties.showVideoElements ?? true;

				const response: LoadTestPostResponse =
					await browserManagerService.createStreamManager(request);
				return res.status(200).send(response);
			} else {
				console.log(
					'Problem with some body parameter' +
						JSON.stringify(request),
				);
				return res.status(400).send('Problem with some body parameter');
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				res.status(500).send({
					message: error.message,
					error: error,
				});
			} else {
				res.status(500).send({
					message: 'Unknown error',
					error: error,
				});
			}
		}
	},
);

app.delete('/streamManager', async (req: Request, res: Response) => {
	const container = getContainer();
	const browserManagerService = container.resolve('browserManagerService');
	console.log('Deleting all participants');
	try {
		await browserManagerService.clean();
		res.status(200).send(`Instance ${req.headers.host} is clean`);
	} catch (error) {
		console.error(error);
		res.status(500).send(error);
	}
});

app.delete(
	'/streamManager/connection/:connectionId',
	async (req: Request, res: Response) => {
		try {
			const connectionId = req.params.connectionId;

			if (!connectionId || Array.isArray(connectionId)) {
				return res
					.status(400)
					.send(
						'Problem with connectionId parameter. IT DOES NOT EXIST',
					);
			}
			const container = getContainer();
			const browserManagerService = container.resolve(
				'browserManagerService',
			);
			console.log('Deleting streams with connectionId: ' + connectionId);
			await browserManagerService.deleteStreamManagerWithConnectionId(
				connectionId,
			);
			res.status(200).send({});
		} catch (error) {
			console.log(error);
			res.status(500).send(error);
		}
	},
);

app.delete(
	'/streamManager/session/:sessionId/user/:userId',
	async (req: Request, res: Response) => {
		try {
			const sessionId = req.params.sessionId;
			const userId = req.params.userId;

			if (
				!sessionId ||
				!userId ||
				Array.isArray(sessionId) ||
				Array.isArray(userId)
			) {
				return res
					.status(400)
					.send('Problem with userId or sessionId parameter ().');
			}
			const container = getContainer();
			const browserManagerService = container.resolve(
				'browserManagerService',
			);
			console.log(
				'Deleting streams with sessionId: ' +
					sessionId +
					' and userId: ' +
					userId,
			);
			await browserManagerService.deleteStreamManagerWithSessionAndUser(
				sessionId,
				userId,
			);
			res.status(200).send({});
		} catch (error) {
			console.log(error);
			res.status(500).send(error);
		}
	},
);
