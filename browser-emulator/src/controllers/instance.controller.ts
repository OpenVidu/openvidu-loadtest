import * as express from 'express';
import type { Request, Response } from 'express';
import type { RemotePersistenceService } from '../services/files/remote-persistence.service.ts';
import type { ElasticSearchService } from '../services/elasticsearch.service.ts';
import type { InstanceService } from '../services/instance.service.ts';
import type { LocalFilesService } from '../services/files/local-files.service.ts';
import type { FakeMediaDevicesService } from '../services/fake-media/fake-media-devices.service.ts';
import type {
	InitializePost,
	InitializePostRequest,
} from '../types/initialize.type.ts';
import type { ConfigService } from '../services/config.service.ts';
import type { SeleniumService } from '../services/selenium.service.ts';

export class InstanceController {
	private readonly router: express.Router;

	private readonly elasticSearchService: ElasticSearchService;
	private readonly instanceService: InstanceService;
	private readonly localFilesService: LocalFilesService;
	private readonly fakeMediaDevicesService: FakeMediaDevicesService;
	private readonly remotePersistenceService: RemotePersistenceService;
	private readonly seleniumService: SeleniumService;
	private readonly config: ConfigService;

	constructor(
		elasticSearchService: ElasticSearchService,
		instanceService: InstanceService,
		localFilesService: LocalFilesService,
		fakeMediaDevicesService: FakeMediaDevicesService,
		remotePersistenceService: RemotePersistenceService,
		configService: ConfigService,
		seleniumService: SeleniumService,
	) {
		this.elasticSearchService = elasticSearchService;
		this.instanceService = instanceService;
		this.localFilesService = localFilesService;
		this.fakeMediaDevicesService = fakeMediaDevicesService;
		this.remotePersistenceService = remotePersistenceService;
		this.config = configService;
		this.seleniumService = seleniumService;
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

	// TODO: study if browser could have its own video and audio, it would probably require multiple ffmpeg instances with multiple fake devices
	private async initialize(
		req: InitializePostRequest,
		res: Response,
	): Promise<void> {
		try {
			const request = req.body;

			this.config.setLegacyMode(!!request.legacyMode);

			console.log('Initialize browser-emulator');

			const promises = [];
			// Set up file service if possible now so that it doesn't have to be initialized later when needed
			this.setupRemotePersistenceService(request);
			promises.push(
				this.localFilesService
					.downloadBrowserMediaFiles(request.browserVideo)
					.then((fileNames: string[]) => {
						if (request.legacyMode) {
							return this.fakeMediaDevicesService.startFakeMediaDevices(
								fileNames[0],
								fileNames[1],
								request.vnc,
							);
						}
						this.seleniumService.initialize();
					}),
			);
			if (
				request.elasticSearchHost &&
				!this.elasticSearchService.isElasticSearchRunning()
			) {
				promises.push(
					this.elasticSearchService
						.initialize(
							request.elasticSearchHost,
							request.elasticSearchUserName,
							request.elasticSearchPassword,
							request.elasticSearchIndex,
						)
						.then(() =>
							this.instanceService.launchMetricBeat(
								request.elasticSearchHost,
								request.elasticSearchUserName,
								request.elasticSearchPassword,
							),
						),
				);
			}
			await Promise.all(promises);

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

	public getRouter(): express.Router {
		return this.router;
	}
}
