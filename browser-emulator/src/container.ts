import { createContainer, asClass, InjectionMode } from 'awilix';
import type { AwilixContainer } from 'awilix';

// Services
import { ConfigService } from './services/config.service.js';
import { BrowserManagerService } from './services/browser-manager.service.js';
import { RealBrowserService } from './services/real-browser.service.js';
import { InstanceService } from './services/instance.service.js';
import { ElasticSearchService } from './services/elasticsearch.service.js';
import { WsService } from './services/ws.service.js';
import { SeleniumService } from './services/selenium.service.js';
import { DockerService } from './services/docker.service.js';
import { LocalStorageService } from './services/local-storage.service.js';
import { QoeAnalyzerService } from './services/qoe-analyzer.service.js';
import { RemotePersistenceService } from './services/files/remote-persistence.service.ts';
import type BaseComModule from './com-modules/base.js';
import { LocalFilesRepository } from './repositories/files/local-files.repository.ts';
import { S3Repository } from './repositories/files/s3.repository.js';
import { InstanceController } from './controllers/instance.controller.js';
import { EventsController } from './controllers/events.controller.js';
import { OpenViduBrowserController } from './controllers/openvidu-browser.controller.js';
import { QoeController } from './controllers/qoe.controller.js';
import { discoverComModules } from './com-modules/discoverComModules.ts';
import { LocalFilesService } from './services/files/local-files.service.ts';
import { ScriptRunnerService } from './services/script-runner.service.ts';
import { FakeMediaDevicesService } from './services/fake-media/fake-media-devices.service.ts';

// Define the container interface for type safety
export interface DIContainer {
	configService: ConfigService;
	browserManagerService: BrowserManagerService;
	realBrowserService: RealBrowserService;
	instanceService: InstanceService;
	elasticSearchService: ElasticSearchService;
	wsService: WsService;
	seleniumService: SeleniumService;
	dockerService: DockerService;
	localStorageService: LocalStorageService;
	qoeAnalyzerService: QoeAnalyzerService;
	scriptRunnerService: ScriptRunnerService;
	fakeMediaDevicesService: FakeMediaDevicesService;
	s3Repository: S3Repository;
	comModule: BaseComModule;
	filesRepository: LocalFilesRepository;
	filesService: LocalFilesService;
	remotePersistenceService: RemotePersistenceService;
	instanceController: InstanceController;
	eventsController: EventsController;
	openViduBrowserController: OpenViduBrowserController;
	qoeController: QoeController;
}

/**
 * Creates and configures the application's dependency injection container
 */
export async function configureContainer(): Promise<
	AwilixContainer<DIContainer>
> {
	const container = createContainer<DIContainer>({
		injectionMode: InjectionMode.CLASSIC,
		strict: true,
	});

	// Register all services as singletons
	container.register({
		// Configuration
		configService: asClass(ConfigService).singleton(),

		// Core services - singleton pattern
		dockerService: asClass(DockerService).singleton(),
		instanceService: asClass(InstanceService).singleton(),
		elasticSearchService: asClass(ElasticSearchService).singleton(),
		wsService: asClass(WsService).singleton(),
		localStorageService: asClass(LocalStorageService).singleton(),
		qoeAnalyzerService: asClass(QoeAnalyzerService).singleton(),
		localFilesService: asClass(LocalFilesService).singleton(),
		remotePersistenceService: asClass(RemotePersistenceService).singleton(),
		scriptRunnerService: asClass(ScriptRunnerService).singleton(),
		fakeMediaDevicesService: asClass(FakeMediaDevicesService).singleton(),

		// Browser management services
		seleniumService: asClass(SeleniumService).singleton(),
		realBrowserService: asClass(RealBrowserService).singleton(),
		browserManagerService: asClass(BrowserManagerService).singleton(),

		// Repositories
		filesRepository: asClass(LocalFilesRepository).singleton(),
		remotePersistenceRepository: asClass(S3Repository).singleton(), // Registering S3Repository as the implementation for RemotePersistenceRepository

		// Controllers
		instanceController: asClass(InstanceController).singleton(),
		eventsController: asClass(EventsController).singleton(),
		openViduBrowserController: asClass(
			OpenViduBrowserController,
		).singleton(),
		qoeController: asClass(QoeController).singleton(),
	});

	const comModuleRegistry = await discoverComModules();

	const moduleKey = container.resolve('configService').getComModule();

	if (!comModuleRegistry[moduleKey]) {
		throw new Error(
			`Unknown COM_MODULE="${moduleKey}". Valid options: ${Object.keys(comModuleRegistry).join(', ')}`,
		);
	}

	container.register({
		// Communication module (dynamic based on environment variable)
		comModule: asClass(comModuleRegistry[moduleKey]).singleton(),
	});

	return container;
}

// Global container instance
let container: AwilixContainer<DIContainer> | null = null;

/**
 * Gets or creates the global DI container
 */
export async function getContainer(): Promise<AwilixContainer<DIContainer>> {
	container ??= await configureContainer();
	return container;
}

/**
 * Resets the container (useful for testing)
 */
export async function resetContainer(): Promise<void> {
	if (container) {
		await container.dispose();
		container = null;
	}
}
