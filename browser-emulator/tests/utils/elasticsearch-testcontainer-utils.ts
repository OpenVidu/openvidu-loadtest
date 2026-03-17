import {
	ElasticsearchContainer,
	StartedElasticsearchContainer,
} from '@testcontainers/elasticsearch';

export async function startElasticSearchTestContainer(): Promise<StartedElasticsearchContainer> {
	console.log('Starting ElasticSearch container...');
	const container = await new ElasticsearchContainer('elasticsearch:9.3.1')
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
			stream.on('data', line => console.log(line));
			stream.on('err', line => console.error(line));
			stream.on('end', () => console.log('Stream closed'));
		})
		.start();
	console.log(`ElasticSearch container started`);
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
				console.log(`ElasticSearch container stopped`);
				return;
			} catch (error) {
				lastError = error;
				if (attempt < maxRetries) {
					console.log(
						`Retry ${attempt}/${maxRetries - 1} stopping ElasticSearch container...`,
					);
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
		}

		console.error('Error stopping ElasticSearch container:', lastError);
	} catch (error) {
		console.error('Error stopping ElasticSearch container:', error);
	}
}
