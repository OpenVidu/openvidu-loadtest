import { Client } from '@elastic/elasticsearch';
import fs from 'node:fs';
import type { ClientOptions } from '@elastic/elasticsearch/lib/client';
import type {
	JSONQoEInfo,
	JSONStatsResponse,
	JSONStreamsInfo,
} from '../types/json.type.ts';

export class ElasticSearchService {
	indexName = '';

	private client: Client | undefined;
	private pingSuccess = false;
	private readonly LOADTEST_INDEX = 'loadtest-webrtc-stats';
	private readonly mappings: Record<string, unknown>;

	constructor() {
		this.mappings = JSON.parse(
			fs.readFileSync(
				`${process.cwd()}/src/services/index-mappings.json`,
				'utf8',
			),
		) as Record<string, unknown>;
	}

	public async initialize(
		hostname: string,
		username?: string,
		password?: string,
		indexName = '',
	) {
		if (this.needsToBeConfigured()) {
			console.log('Initializing ElasticSearch');
			this.indexName = indexName;
			const clientOptions: ClientOptions = this.buildClientOptions(
				hostname,
				username,
				password,
			);
			try {
				console.log('Connecting with ElasticSearch ...');
				this.client = new Client(clientOptions);
				this.pingSuccess = await this.client.ping();
				console.log(
					'ElasticSearch connection success: ',
					this.pingSuccess,
				);
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
	): ClientOptions {
		const clientOptions: ClientOptions = {
			node: hostname,
			maxRetries: 5,
			requestTimeout: 10000,
			tls: {
				rejectUnauthorized: false,
			},
			...(username && password
				? {
						auth: {
							username,
							password,
						},
					}
				: {}),
		};

		return clientOptions;
	}

	private async ensureIndexExists(): Promise<void> {
		if (this.indexName) {
			const exists = await this.client!.indices.exists({
				index: this.indexName,
			});
			if (exists) {
				console.log(`Index ${this.indexName} already exists.`);
			} else {
				console.log(
					`Index ${this.indexName} does not exist. Creating it...`,
				);
				await this.client!.indices.create({
					index: this.indexName,
					body: this.mappings,
				});
				console.log(`Index ${this.indexName} created successfully.`);
			}
		} else {
			await this.createElasticSearchIndex();
		}
	}

	public async sendJson(
		json: JSONStatsResponse | JSONStreamsInfo | JSONQoEInfo,
	) {
		if (this.isElasticSearchRunning()) {
			if (Object.keys(json).length) {
				const finalData = this.normalizeWeirdValues(json);
				try {
					await this.client!.index({
						index: this.indexName,
						document: finalData,
					});
				} catch (error) {
					console.error(error);
				}
			}
		} else {
			console.warn(
				'ElasticSearch is not running. Cannot send JSON data.',
			);
		}
	}

	private normalizeWeirdValues(
		json: JSONStatsResponse | JSONStreamsInfo | JSONQoEInfo,
	): Record<string, unknown> {
		const normalizedJson = { ...json } as Record<string, unknown>;
		const maybeStats = normalizedJson.webrtcStats;
		if (Array.isArray(maybeStats)) {
			const stats = maybeStats as unknown[];
			for (const element of stats) {
				if (element && typeof element === 'object') {
					const el = element as Record<string, unknown>;
					const data = el.data;
					if (typeof data === 'string') {
						el.data = {
							stringValue: data,
						};
					}
				}
			}
		}
		return normalizedJson;
	}

	public async sendBulkJsons(
		jsons: JSONStatsResponse[] | JSONStreamsInfo[] | JSONQoEInfo[],
	) {
		if (this.isElasticSearchRunning()) {
			try {
				const operations = jsons.flatMap(json => [
					{ index: { _index: this.indexName } },
					this.normalizeWeirdValues(json),
				]);
				const bulkResponse = await this.client!.bulk({
					refresh: true,
					operations: operations,
				});
				if (bulkResponse.errors) {
					const item = bulkResponse.items?.[0];
					const error = item?.index?.error;
					console.error('Error in bulk insert: ', error);
					throw new Error(
						`Error in bulk insert: ${JSON.stringify(error)}`,
					);
				}
			} catch (error) {
				console.error(error);
			}
		} else {
			console.warn(
				'ElasticSearch is not running. Cannot send JSON data.',
			);
		}
	}

	public isElasticSearchRunning(): boolean {
		return !!this.client && this.pingSuccess;
	}

	private needsToBeConfigured(): boolean {
		return !this.client;
	}

	private async createElasticSearchIndex(): Promise<void> {
		if (this.isElasticSearchRunning()) {
			const index = this.generateNewIndexName();
			await this.client!.indices.create({
				index,
				body: this.mappings,
			});
		} else {
			console.warn('ElasticSearch is not running. Cannot create index.');
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

	public async getStartTimes(): Promise<JSONStreamsInfo[]> {
		if (this.isElasticSearchRunning()) {
			const result = await this.client!.search<JSONStreamsInfo>({
				index: this.indexName,
				query: {
					exists: {
						field: 'new_participant_id',
					},
				},
				size: 10000,
			});
			return (
				result.hits?.hits?.flatMap(hit => {
					if (!hit._source) {
						return [];
					}
					const json: JSONStreamsInfo = {
						'@timestamp': hit._source['@timestamp'],
						new_participant_id: hit._source.new_participant_id,
						new_participant_session:
							hit._source.new_participant_session,
						node_role: hit._source.node_role,
						streams: hit._source.streams,
						worker_name: hit._source.worker_name,
					};
					return [json];
				}) ?? []
			);
		} else {
			console.warn(
				'ElasticSearch is not running. Cannot retrieve start times.',
			);
			return [];
		}
	}
}
