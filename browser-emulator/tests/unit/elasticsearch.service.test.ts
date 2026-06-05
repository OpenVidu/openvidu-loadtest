import { vi, describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { MOCK_CWD } from '../setup/unit/global-fs-setup.ts';

const mockClientConstructor = vi.fn();
const mockHttpConnection = vi.fn();

vi.mock('@elastic/elasticsearch', () => ({
	Client: mockClientConstructor,
	HttpConnection: mockHttpConnection,
}));

// Must import after mocks are set up
const { ElasticSearchService } =
	await import('../../src/services/elasticsearch.service.ts');

describe('ElasticSearchService - path prefix handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vol.reset();
		vol.mkdirSync(MOCK_CWD, { recursive: true });
		// The constructor reads index-mappings.json from cwd
		vol.writeFileSync(
			`${MOCK_CWD}/index-mappings.json`,
			JSON.stringify({ mappings: { properties: {} } }),
		);
	});

	it('should use HttpConnection when URL has a path prefix', async () => {
		const service = new ElasticSearchService();

		// initialize will try to ping, which will throw because Client is mocked
		// We just verify that Client was constructed with Connection: HttpConnection
		await expect(
			service.initialize('https://host/elasticsearch'),
		).rejects.toThrow();

		expect(mockClientConstructor).toHaveBeenCalledTimes(1);
		const calledWith = mockClientConstructor.mock.calls[0][0];
		expect(calledWith).toHaveProperty('Connection', mockHttpConnection);
		expect(calledWith).toHaveProperty('node', 'https://host/elasticsearch');
	});

	it('should not use HttpConnection when URL has no path prefix', async () => {
		const service = new ElasticSearchService();

		await expect(service.initialize('https://host:9200')).rejects.toThrow();

		expect(mockClientConstructor).toHaveBeenCalledTimes(1);
		const calledWith = mockClientConstructor.mock.calls[0][0];
		expect(calledWith).not.toHaveProperty('Connection');
		expect(calledWith).toHaveProperty('node', 'https://host:9200');
	});

	it('should not use HttpConnection when URL path is just "/"', async () => {
		const service = new ElasticSearchService();

		await expect(
			service.initialize('https://host:9200/'),
		).rejects.toThrow();

		expect(mockClientConstructor).toHaveBeenCalledTimes(1);
		const calledWith = mockClientConstructor.mock.calls[0][0];
		expect(calledWith).not.toHaveProperty('Connection');
		expect(calledWith).toHaveProperty('node', 'https://host:9200/');
	});

	it('should pass auth options alongside HttpConnection', async () => {
		const service = new ElasticSearchService();

		await expect(
			service.initialize(
				'https://host/elasticsearch',
				'user',
				'password',
			),
		).rejects.toThrow();

		expect(mockClientConstructor).toHaveBeenCalledTimes(1);
		const calledWith = mockClientConstructor.mock.calls[0][0];
		expect(calledWith).toHaveProperty('Connection', mockHttpConnection);
		expect(calledWith).toHaveProperty('auth', {
			username: 'user',
			password: 'password',
		});
	});

	it('should handle deep path prefixes', async () => {
		const service = new ElasticSearchService();

		await expect(
			service.initialize('https://host/proxy/path/es'),
		).rejects.toThrow();

		expect(mockClientConstructor).toHaveBeenCalledTimes(1);
		const calledWith = mockClientConstructor.mock.calls[0][0];
		expect(calledWith).toHaveProperty('Connection', mockHttpConnection);
		expect(calledWith).toHaveProperty('node', 'https://host/proxy/path/es');
	});
});
