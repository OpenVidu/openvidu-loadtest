import baseLogger from '../../src/services/logger.service.js';
import {
	ElasticsearchContainer,
	StartedElasticsearchContainer,
} from '@testcontainers/elasticsearch';

const logger = baseLogger.child({
	module: 'elasticsearch-testcontainer-utils',
});

export async function startElasticSearchTestContainer(): Promise<StartedElasticsearchContainer> {
	logger.info('Starting ElasticSearch container...');
	const container = await new ElasticsearchContainer(
		'docker.elastic.co/elasticsearch/elasticsearch:9.3.2',
	)
		.withEnvironment({
			'discovery.type': 'single-node',
			'xpack.security.enabled': 'false',
			'http.cors.enabled': 'true',
			'http.cors.allow-origin': String.raw`\*`,
			'http.cors.allow-headers':
				'X-Requested-With, Content-Type, Content-Length, Authorization',
			'http.cors.allow-credentials': 'true',
		})
		.withLogConsumer(stream => {
			stream.on('data', line => logger.info(line));
			stream.on('err', line => logger.error(line));
			stream.on('end', () => logger.info('Stream closed'));
		})
		.start();
	logger.info(`ElasticSearch container started`);
	return container;
}

export async function stopElasticSearchTestContainer(
	elasticSearchContainer: StartedElasticsearchContainer,
): Promise<void> {
	try {
		const maxRetries = 3;
		let lastError: unknown;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				await elasticSearchContainer.stop();
				logger.info(`ElasticSearch container stopped`);
				return;
			} catch (error) {
				lastError = error;
				if (attempt < maxRetries) {
					logger.info(
						`Retry ${attempt}/${maxRetries - 1} stopping ElasticSearch container...`,
					);
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
		}

		logger.error('Error stopping ElasticSearch container:', lastError);
	} catch (error) {
		logger.error('Error stopping ElasticSearch container:', error);
	}
}
