import { Client } from '@elastic/elasticsearch';
import { APPLICATION_MODE } from '../config.js';
import type {
	JSONQoEInfo,
	JSONStatsResponse,
	JSONStreamsInfo,
} from '../types/api-rest.type.js';
import { ApplicationMode } from '../types/config.type.js';
import fs from 'node:fs';

export class ElasticSearchService {
	indexName: string = '';

	private client: Client | undefined;
	private pingSuccess: boolean = false;
	private readonly LOADTEST_INDEX = 'loadtest-webrtc-stats';
	private readonly mappings = JSON.parse(
		fs.readFileSync(
			`${process.cwd()}/src/services/index-mappings.json`,
			'utf8',
		),
	);
	protected static instance: ElasticSearchService;

	private constructor() {}

	static getInstance(): ElasticSearchService {
		if (!ElasticSearchService.instance) {
			ElasticSearchService.instance = new ElasticSearchService();
		}
		return ElasticSearchService.instance;
	}

	async initialize(
		hostname: string,
		username?: string,
		password?: string,
		indexName: string = '',
	) {
		if (this.needsToBeConfigured()) {
			console.log('Initializing ElasticSearch');
			this.indexName = indexName;
			const clientOptions = this.buildClientOptions(
				hostname,
				username,
				password,
			);
			try {
				console.log('Connecting with ElasticSearch ...');
				this.client = new Client(clientOptions);
				const pingSuccess = await this.client.ping();
				this.pingSuccess = !!pingSuccess;
				if (this.pingSuccess) {
					await this.ensureIndexExists();
				}
			} catch (error) {
				console.error('Error connecting with ElasticSearch: ', error);
				throw error;
			}
		}
	}

	private buildClientOptions(
		hostname: string,
		username?: string,
		password?: string,
	) {
		const clientOptions: Record<string, any> = {
			node: hostname,
			maxRetries: 5,
			requestTimeout: 10000,
			ssl: {
				rejectUnauthorized: false,
			},
		};

		if (username && password) {
			clientOptions['auth'] = {
				username: username,
				password: password,
			};
		}
		return clientOptions;
	}

	private async ensureIndexExists(): Promise<void> {
		if (this.indexName) {
			const exists = await this.client!.indices.exists({
				index: this.indexName,
			});
			if (!exists) {
				await this.client!.indices.create({
					index: this.indexName,
					mappings: this.mappings,
				});
			}
		} else {
			await this.createElasticSearchIndex();
		}
	}

	async sendJson(json: JSONStatsResponse | JSONStreamsInfo | JSONQoEInfo) {
		if (
			this.isElasticSearchRunning() &&
			APPLICATION_MODE === ApplicationMode.PROD
		) {
			const jsonRecord = json as Record<string, any>;
			if (Object.keys(jsonRecord).length) {
				try {
					await this.client!.index({
						index: this.indexName,
						document: jsonRecord,
					});
				} catch (error) {
					console.error(error);
				}
			}
		}
	}

	async sendBulkJsons(
		jsons: JSONStatsResponse[] | JSONStreamsInfo[] | JSONQoEInfo[],
	) {
		if (
			this.isElasticSearchRunning() &&
			APPLICATION_MODE === ApplicationMode.PROD
		) {
			try {
				const operations = jsons.flatMap(json => [
					{ index: { _index: this.indexName } },
					json,
				]);
				const bulkResponse = await this.client!.bulk({
					refresh: true,
					operations: operations,
				});
				if (bulkResponse.errors) {
					throw new Error(
						(bulkResponse.items?.[0] as any)?.index?.error
							?.reason || 'Bulk operation failed',
					);
				}
			} catch (error) {
				console.error(error);
			}
		}
	}

	isElasticSearchRunning(): boolean {
		return !!this.client && this.pingSuccess;
	}

	needsToBeConfigured(): boolean {
		return !this.client;
	}

	private async createElasticSearchIndex(): Promise<void> {
		if (this.isElasticSearchRunning()) {
			const index = this.generateNewIndexName();
			await this.client!.indices.create({
				index,
				mappings: this.mappings,
			});
		}
	}

	private generateNewIndexName(): string {
		const date = new Date();
		const timestamp = `${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getDate()}-${
			date.getMonth() + 1
		}-${date.getFullYear()}`;
		this.indexName =
			this.LOADTEST_INDEX + '-' + timestamp + '-' + Date.now();
		return this.indexName;
	}

	async getStartTimes(): Promise<JSONStreamsInfo[]> {
		if (
			this.isElasticSearchRunning() &&
			APPLICATION_MODE === ApplicationMode.PROD
		) {
			const result = await this.client!.search({
				index: this.indexName,
				query: {
					exists: {
						field: 'new_participant_id',
					},
				},
				size: 10000,
			});
			return (result.hits?.hits?.map((hit: any) => {
				const json: JSONStreamsInfo = {
					'@timestamp': hit._source['@timestamp'],
					new_participant_id: hit._source['new_participant_id'],
					new_participant_session:
						hit._source['new_participant_session'],
					node_role: hit._source['node_role'],
					streams: hit._source['streams'],
					worker_name: hit._source['worker_name'],
				};
				return json;
			}) ?? []) as JSONStreamsInfo[];
		} else {
			return [];
		}
	}
}
