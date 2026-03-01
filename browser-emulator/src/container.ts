import { createContainer, asClass, InjectionMode } from 'awilix';
import type { AwilixContainer } from 'awilix';

// Services
import { BrowserManagerService } from './services/browser-manager.service.js';
import { RealBrowserService } from './services/real-browser.service.js';
import { InstanceService } from './services/instance.service.js';
import { ElasticSearchService } from './services/elasticsearch.service.js';
import { WsService } from './services/ws.service.js';
import { SeleniumService } from './services/selenium.service.js';
import { DockerService } from './services/docker.service.js';
import { LocalStorageService } from './services/local-storage.service.js';
import { QoeAnalyzerService } from './services/qoe-analyzer.service.js';
import { S3FilesService } from './services/files/s3files.service.js';
import type BaseComModule from './com-modules/base.js';

// Define the container interface for type safety
export interface DIContainer {
	browserManagerService: BrowserManagerService;
	realBrowserService: RealBrowserService;
	instanceService: InstanceService;
	elasticSearchService: ElasticSearchService;
	wsService: WsService;
	seleniumService: SeleniumService;
	dockerService: DockerService;
	localStorageService: LocalStorageService;
	qoeAnalyzerService: QoeAnalyzerService;
	s3FilesService: S3FilesService;
	comModule: BaseComModule;
}

/**
 * Creates and configures the application's dependency injection container
 */
export function configureContainer(): AwilixContainer<DIContainer> {
	const container = createContainer<DIContainer>({
		injectionMode: InjectionMode.CLASSIC,
		strict: true,
	});

	// Register all services as singletons
	container.register({
		// Core services - singleton pattern
		dockerService: asClass(DockerService).singleton(),
		instanceService: asClass(InstanceService).singleton(),
		elasticSearchService: asClass(ElasticSearchService).singleton(),
		wsService: asClass(WsService).singleton(),
		localStorageService: asClass(LocalStorageService).singleton(),
		qoeAnalyzerService: asClass(QoeAnalyzerService).singleton(),

		// Browser management services
		seleniumService: asClass(SeleniumService).singleton(),
		realBrowserService: asClass(RealBrowserService).singleton(),
		browserManagerService: asClass(BrowserManagerService).singleton(),

		// File services
		s3FilesService: asClass(S3FilesService).singleton(),
	});

	return container;
}

// Global container instance
let container: AwilixContainer<DIContainer> | null = null;

/**
 * Gets or creates the global DI container
 */
export function getContainer(): AwilixContainer<DIContainer> {
	container ??= configureContainer();
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
