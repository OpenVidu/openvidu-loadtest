import * as express from 'express';
import type { Request, Response } from 'express';
import type {
	BrowserVideo,
	InitializePost,
	InitializePostRequest,
} from '../types/api-rest.type.js';
import type { ConfigService } from '../services/config.service.js';
import { SeleniumService } from '../services/selenium.service.js';
import type { RemotePersistenceService } from '../services/files/remote-persistence.service.ts';
import type { ElasticSearchService } from '../services/elasticsearch.service.ts';
import type { InstanceService } from '../services/instance.service.ts';
import type { LocalFilesService } from '../services/files/local-files.service.ts';
import type { QoeAnalyzerService } from '../services/qoe-analyzer.service.ts';

export class InstanceController {
	private readonly router: express.Router;

	private readonly configService: ConfigService;
	private readonly elasticSearchService: ElasticSearchService;
	private readonly instanceService: InstanceService;
	private readonly localFilesService: LocalFilesService;
	private readonly seleniumService: SeleniumService;
	private readonly remotePersistenceService: RemotePersistenceService;
	private readonly qoeAnalyzerService: QoeAnalyzerService;

	constructor(
		configService: ConfigService,
		elasticSearchService: ElasticSearchService,
		instanceService: InstanceService,
		localFilesService: LocalFilesService,
		seleniumService: SeleniumService,
		remotePersistenceService: RemotePersistenceService,
		qoeAnalyzerService: QoeAnalyzerService,
	) {
		this.configService = configService;
		this.elasticSearchService = elasticSearchService;
		this.instanceService = instanceService;
		this.localFilesService = localFilesService;
		this.seleniumService = seleniumService;
		this.remotePersistenceService = remotePersistenceService;
		this.qoeAnalyzerService = qoeAnalyzerService;
		this.router = express.Router({ strict: true });
		this.setupRoutes();
	}

	private setupRoutes(): void {
		this.router.get('/ping', this.ping.bind(this));
		this.router.post('/initialize', this.initialize.bind(this));
	}

	private ping(_: Request, res: Response): void {
		if (this.instanceService.isInstanceReady()) {
			res.status(200).send('Pong');
		} else {
			res.status(500).send();
		}
	}

	// TODO: this should be divided into multiple endpoints, as it is doing multiple things (initializing different services, downloading media files, etc)
	// TODO: study if browser could have its own video and audio, it would probably require multiple ffmpeg instances with multiple fake devices
	private async initialize(
		req: InitializePostRequest,
		res: Response,
	): Promise<void> {
		try {
			const request: InitializePost = req.body;
			const isProdMode = this.configService.isProdMode();

			console.log('Initialize browser-emulator');

			const promises = [];
			if (isProdMode) {
				// Set up file service if possible now so that it doesn't have to be initialized later when needed
				this.setupRemotePersistenceService(request);
				promises.push(
					this.downloadMediaFilesAndStartSeleniumService(
						request.browserVideo,
					),
				);
				if (
					request.elasticSearchHost &&
					!this.elasticSearchService.isElasticSearchRunning()
				) {
					promises.push(
						this.elasticSearchService.initialize(
							request.elasticSearchHost,
							request.elasticSearchUserName,
							request.elasticSearchPassword,
							request.elasticSearchIndex,
						),
						this.instanceService.launchMetricBeat(
							request.elasticSearchHost,
							request.elasticSearchUserName,
							request.elasticSearchPassword,
						),
					);
				}
				await Promise.all(promises);
			}
			// TODO: this QOE_ANALYSIS should not be an env variable, there should be two separate properties: one to enable MediaRecorders in browser creation request and another one to actually do the QoE Analysis in situ
			if (request.qoeAnalysis?.enabled) {
				process.env.QOE_ANALYSIS =
					request.qoeAnalysis.enabled.toString();
				this.qoeAnalyzerService.setDurations(
					request.qoeAnalysis.fragment_duration,
					request.qoeAnalysis.padding_duration,
				);
			}
			res.status(200).send(
				`Instance ${req.headers.host} has been initialized`,
			);
		} catch (error) {
			console.error(error);
			res.status(500).send(error);
		}
	}

	private setupRemotePersistenceService(request: InitializePost) {
		let accessKey: string | undefined;
		let secretAccessKey: string | undefined;
		const bucketName = request.s3BucketName;
		let host: string | undefined;
		if (request.awsAccessKey && request.awsSecretAccessKey) {
			accessKey = request.awsAccessKey;
			secretAccessKey = request.awsSecretAccessKey;
		}
		if (request.s3Host) {
			host = request.s3Host;
			if (request.s3HostAccessKey && request.s3HostSecretAccessKey) {
				// Overwrite accessKey and secretAccessKey if s3Host is provided with its own credentials,
				// as they should be used instead of AWS credentials to connect to the provided s3Host
				accessKey = request.s3HostAccessKey;
				secretAccessKey = request.s3HostSecretAccessKey;
			}
		}
		if (bucketName && accessKey && secretAccessKey) {
			this.remotePersistenceService.initialize(
				accessKey,
				secretAccessKey,
				bucketName,
				request.s3Region,
				host,
			);
		}
	}

	private async downloadMediaFilesAndStartSeleniumService(
		videoType: BrowserVideo,
	): Promise<SeleniumService> {
		const fileNames =
			await this.localFilesService.downloadBrowserMediaFiles(videoType);
		await this.seleniumService.initialize(fileNames[0], fileNames[1]);
		return this.seleniumService;
	}

	public getRouter(): express.Router {
		return this.router;
	}
}
