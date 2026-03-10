import * as express from 'express';
import type { Request, Response } from 'express';
import type BaseComModule from '../com-modules/base.js';
import type { BrowserManagerService } from '../services/browser-manager.service.js';
import {
	type CreateUserBrowserResponse,
	type CreateUserBrowserRequest,
	Role,
	Resolution,
} from '../types/create-user.type.ts';

export class OpenViduBrowserController {
	private readonly router: express.Router;
	private readonly comModule: BaseComModule;
	private readonly browserManagerService: BrowserManagerService;

	constructor(
		comModule: BaseComModule,
		browserManagerService: BrowserManagerService,
	) {
		this.comModule = comModule;
		this.browserManagerService = browserManagerService;
		this.router = express.Router({ strict: true });
		this.setupRoutes();
	}

	private setupRoutes(): void {
		this.router.post(
			'/streamManager',
			this.handleStreamManagerPost.bind(this),
		);
		this.router.delete(
			'/streamManager',
			this.handleStreamManagerDelete.bind(this),
		);
		this.router.delete(
			'/streamManager/connection/:connectionId',
			this.handleStreamManagerConnectionDelete.bind(this),
		);
		this.router.delete(
			'/streamManager/session/:sessionId/user/:userId',
			this.handleStreamManagerSessionUserDelete.bind(this),
		);
	}

	private async handleStreamManagerPost(
		req: CreateUserBrowserRequest,
		res: Response,
	): Promise<void> {
		try {
			const request = req.body;

			if (this.comModule.areParametersCorrect(request)) {
				await this.comModule.processNewUserRequest(request);

				request.properties.frameRate =
					request.properties.frameRate || 30;
				// Setting default role for publisher properties
				request.properties.role =
					request.properties.role || Role.PUBLISHER;

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

				const response: CreateUserBrowserResponse =
					await this.browserManagerService.createStreamManager(
						request,
					);
				res.status(200).send(response);
			} else {
				console.log(
					'Problem with some body parameter' +
						JSON.stringify(request),
				);
				res.status(400).send('Problem with some body parameter');
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
	}

	private async handleStreamManagerDelete(
		req: Request,
		res: Response,
	): Promise<void> {
		console.log('Deleting all participants');
		try {
			await this.browserManagerService.clean();
			res.status(200).send(`Instance ${req.headers.host} is clean`);
		} catch (error) {
			console.error(error);
			res.status(500).send(error);
		}
	}

	private async handleStreamManagerConnectionDelete(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			const connectionId = req.params.connectionId;

			if (!connectionId || Array.isArray(connectionId)) {
				res.status(400).send(
					'Problem with connectionId parameter. IT DOES NOT EXIST',
				);
				return;
			}
			console.log('Deleting streams with connectionId: ' + connectionId);
			await this.browserManagerService.deleteStreamManagerWithConnectionId(
				connectionId,
			);
			res.status(200).send({});
		} catch (error) {
			console.log(error);
			res.status(500).send(error);
		}
	}

	private async handleStreamManagerSessionUserDelete(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			const sessionId = req.params.sessionId;
			const userId = req.params.userId;

			if (
				!sessionId ||
				!userId ||
				Array.isArray(sessionId) ||
				Array.isArray(userId)
			) {
				res.status(400).send(
					'Problem with userId or sessionId parameter ().',
				);
				return;
			}
			console.log(
				'Deleting streams with sessionId: ' +
					sessionId +
					' and userId: ' +
					userId,
			);
			await this.browserManagerService.deleteStreamManagerWithSessionAndUser(
				sessionId,
				userId,
			);
			res.status(200).send({});
		} catch (error) {
			console.log(error);
			res.status(500).send(error);
		}
	}

	public getRouter(): express.Router {
		return this.router;
	}
}
