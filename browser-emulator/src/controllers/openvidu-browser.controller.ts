import * as express from 'express';
import type { Request, Response } from 'express';
import type BaseComModule from '../com-modules/base.js';
import type { LoggerService } from '../services/logger.service.ts';
import type { BrowserManagerService } from '../services/browser/browser-manager.service.ts';
import {
	type CreateUserBrowserResponse,
	type CreateUserBrowserRequest,
	Role,
	Resolution,
} from '../types/create-user.type.ts';
import type {
	LoadTestRunRequestExpress,
	LoadTestRunResponse,
} from '../types/load-test.type.ts';

export class OpenViduBrowserController {
	private readonly router: express.Router;
	private readonly comModule: BaseComModule;
	private readonly browserManagerService: BrowserManagerService;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(
		comModule: BaseComModule,
		browserManagerService: BrowserManagerService,
		loggerService: LoggerService,
	) {
		this.comModule = comModule;
		this.browserManagerService = browserManagerService;
		this.logger = loggerService.getLogger('OpenViduBrowserController');
		this.router = express.Router({ strict: true });
		this.setupRoutes();
	}

	private setupRoutes(): void {
		this.router.post(
			'/streamManager',
			this.handleStreamManagerPost.bind(this),
		);
		this.router.post('/load-test', this.handleLoadTestPost.bind(this));
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

			if (
				!request.properties?.browser ||
				!['chrome', 'firefox', 'emulated'].includes(
					request.properties.browser,
				)
			) {
				res.status(400).send({
					message:
						'browser is required and must be "chrome", "firefox", or "emulated"',
				});
				return;
			}

			if (this.comModule.areParametersCorrect(request)) {
				await this.comModule.processNewUserRequest(request);

				request.properties.frameRate =
					request.properties.frameRate || 30;
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
				this.logger.warn(
					'Problem with some body parameter %s',
					JSON.stringify(request),
				);
				res.status(400).send('Problem with some body parameter');
			}
		} catch (error: unknown) {
			this.logger.error(error);
			res.status(500).send({
				message: 'Internal server error',
			});
		}
	}

	private async handleLoadTestPost(
		req: LoadTestRunRequestExpress,
		res: Response,
	): Promise<void> {
		try {
			const request = req.body;

			if (
				!request.openviduUrl ||
				!request.livekitApiKey ||
				!request.livekitApiSecret ||
				!request.room
			) {
				res.status(400).send({
					message:
						'openviduUrl, livekitApiKey, livekitApiSecret and room are required',
				});
				return;
			}

			const totalUsers =
				(request.videoPublishers ?? 0) +
				(request.audioPublishers ?? 0) +
				(request.subscribers ?? 0);
			if (totalUsers <= 0) {
				res.status(400).send({
					message:
						'At least one of videoPublishers, audioPublishers or subscribers must be greater than 0',
				});
				return;
			}

			const response: LoadTestRunResponse =
				await this.browserManagerService.runLoadTest(request);
			res.status(200).send(response);
		} catch (error: unknown) {
			this.logger.error(error);
			res.status(500).send({
				message: 'Internal server error',
			});
		}
	}

	private async handleStreamManagerDelete(
		req: Request,
		res: Response,
	): Promise<void> {
		this.logger.info('Deleting all participants');
		try {
			await this.browserManagerService.clean();
			res.status(200).send(`Instance ${req.headers.host} is clean`);
		} catch (error) {
			this.logger.error(error);
			res.status(500).send('Internal server error');
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
			this.logger.info(
				'Deleting streams with connectionId: %s',
				connectionId,
			);
			await this.browserManagerService.deleteStreamManagerWithConnectionId(
				connectionId,
			);
			res.status(200).send({});
		} catch (error) {
			this.logger.error(error);
			res.status(500).send('Internal server error');
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
			this.logger.info(
				'Deleting streams with sessionId: %s and userId: %s',
				sessionId,
				userId,
			);
			await this.browserManagerService.deleteStreamManagerWithSessionAndUser(
				sessionId,
				userId,
			);
			res.status(200).send({});
		} catch (error) {
			this.logger.error(error);
			res.status(500).send('Internal server error');
		}
	}

	public getRouter(): express.Router {
		return this.router;
	}
}
