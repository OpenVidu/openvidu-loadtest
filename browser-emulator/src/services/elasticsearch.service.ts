import { Client, ClientOptions } from '@elastic/elasticsearch';
import { Index } from '@elastic/elasticsearch/api/requestParams';
import { APPLICATION_MODE } from '../config';
import { JSONQoEInfo, JSONStatsResponse, JSONStreamsInfo } from '../types/api-rest.type';
import { ApplicationMode } from '../types/config.type';

export class ElasticSearchService {
	indexName: string = '';

	private client: Client;
	private pingSuccess: boolean = false;
	private readonly LOADTEST_INDEX = 'loadtest-webrtc-stats';
	private mappings = {
		"properties": {
			"@timestamp": {
				"type": "date"
			},
			"node_role": {
				"type": "text",
				"fields": {
					"keyword": {
						"type": "keyword",
						"ignore_above": 256
					}
				}
			},
			"participant_id": {
				"type": "text",
				"fields": {
					"keyword": {
						"type": "keyword",
						"ignore_above": 256
					}
				}
			},
			"platform": {
				"type": "text",
				"fields": {
					"keyword": {
						"type": "keyword",
						"ignore_above": 256
					}
				}
			},
			"platform_description": {
				"type": "text",
				"fields": {
					"keyword": {
						"type": "keyword",
						"ignore_above": 256
					}
				}
			},
			"session_id": {
				"type": "text",
				"fields": {
					"keyword": {
						"type": "keyword",
						"ignore_above": 256
					}
				}
			},
			"stream": {
				"type": "text",
				"fields": {
					"keyword": {
						"type": "keyword",
						"ignore_above": 256
					}
				}
			},
			"streams": {
				"type": "long"
			},
			"webrtc_stats": {
				"properties": {
					"candidatepair": {
						"properties": {
							"availableOutgoingBitrate": {
								"type": "double"
							},
							"currentRoundTripTime": {
								"type": "double"
							}
						}
					},
					"inbound": {
						"properties": {
							"audio": {
								"properties": {
									"bytesReceived": {
										"type": "long"
									},
									"jitter": {
										"type": "double"
									},
									"jitterBufferDelay": {
										"type": "double"
									},
									"packetsLost": {
										"type": "long"
									},
									"packetsReceived": {
										"type": "long"
									}
								}
							},
							"video": {
								"properties": {
									"bytesReceived": {
										"type": "long"
									},
									"firCount": {
										"type": "long"
									},
									"frameHeight": {
										"type": "long"
									},
									"frameWidth": {
										"type": "long"
									},
									"framesDecoded": {
										"type": "long"
									},
									"framesReceived": {
										"type": "long"
									},
									"jitter": {
										"type": "double"
									},
									"jitterBufferDelay": {
										"type": "double"
									},
									"nackCount": {
										"type": "long"
									},
									"packetsLost": {
										"type": "long"
									},
									"packetsReceived": {
										"type": "long"
									},
									"pliCount": {
										"type": "long"
									}
								}
							}
						}
					},
					"outbound": {
						"properties": {
							"audio": {
								"properties": {
									"bytesSent": {
										"type": "long"
									},
									"nackCount": {
										"type": "long"
									},
									"packetsSent": {
										"type": "long"
									}
								}
							},
							"video": {
								"properties": {
									"bytesSent": {
										"type": "long"
									},
									"firCount": {
										"type": "long"
									},
									"frameHeight": {
										"type": "long"
									},
									"frameWidth": {
										"type": "long"
									},
									"framesEncoded": {
										"type": "long"
									},
									"framesSent": {
										"type": "long"
									},
									"nackCount": {
										"type": "long"
									},
									"packetsSent": {
										"type": "long"
									},
									"pliCount": {
										"type": "long"
									},
									"qpSum": {
										"type": "long"
									}
								}
							}
						}
					}
				}
			}
		}
	}
	protected static instance: ElasticSearchService;

	private constructor() { }

	static getInstance(): ElasticSearchService {
		if (!ElasticSearchService.instance) {
			ElasticSearchService.instance = new ElasticSearchService();
		}
		return ElasticSearchService.instance;
	}

	async initialize(indexName: string = '') {
		if (this.needToBeConfigured()) {
			console.log('Initializing ElasticSearch');
			this.indexName = indexName;
			const clientOptions: ClientOptions = {
				node: process.env.ELASTICSEARCH_HOSTNAME,
				maxRetries: 5,
				requestTimeout: 10000,
				ssl: {
					rejectUnauthorized: false,
				},
			};

			if (this.isSecured()) {
				clientOptions.auth = {
					username: process.env.ELASTICSEARCH_USERNAME,
					password: process.env.ELASTICSEARCH_PASSWORD,
				};
			}
			try {
				console.log('Connecting with ElasticSearch ...');
				this.client = new Client(clientOptions);
				const pingSuccess = await this.client.ping();
				this.pingSuccess = pingSuccess.body;
				if (this.pingSuccess) {
					if (!this.indexName) {
						await this.createElasticSearchIndex();
					} else {
						// Create index if it doesn't exist
						let exists = await this.client.indices.exists({ index: this.indexName });
						if (!exists.body) {
							await this.client.indices.create({ 
								index: this.indexName,
								body: {
									mappings: this.mappings
								} });
						}
					}
				}
			} catch (error) {
				console.error('Error connecting with ElasticSearch: ', error);
				throw error;
			}
		}
	}

	async sendJson(json: JSONStatsResponse | JSONStreamsInfo | JSONQoEInfo) {
		if (this.isElasticSearchRunning() && APPLICATION_MODE === ApplicationMode.PROD) {
			let indexData: Index<Record<string, any>> = {
				index: this.indexName,
				body: {},
			};
			Object.keys(json).forEach((key) => {
				indexData.body[key] = json[key];
			});
			if (!!Object.keys(indexData.body).length) {
				try {
					await this.client.index(indexData);
				} catch (error) {
					console.error(error);
				}
			}
		}
	}

	async sendBulkJsons(jsons: JSONStatsResponse[] | JSONStreamsInfo[] | JSONQoEInfo[]) {
		if (this.isElasticSearchRunning() && APPLICATION_MODE === ApplicationMode.PROD) {
			try {
				const operations = jsons.flatMap((json) => [{ index: { _index: this.indexName } }, json])
				const bulkResponse = await this.client.bulk({ refresh: true, body: operations });
				if (bulkResponse.body.errors) {
					throw new Error(bulkResponse.body.items[0].index.error.reason);
				}
			} catch (error) {
				console.error(error);
			}
		}
	}

	isElasticSearchRunning(): boolean {
		return this.pingSuccess;
	}

	needToBeConfigured(): boolean {
		return this.isHostnameAvailable() && !this.client;
	}

	async clean() {
		// await this.createElasticSearchIndex();
	}

	private isHostnameAvailable(): boolean {
		return !!process.env.ELASTICSEARCH_HOSTNAME && process.env.ELASTICSEARCH_HOSTNAME !== 'undefined';
	}

	private isSecured(): boolean {
		return (
			!!process.env.ELASTICSEARCH_USERNAME &&
			process.env.ELASTICSEARCH_USERNAM !== 'undefined' &&
			!!process.env.ELASTICSEARCH_PASSWORD &&
			process.env.ELASTICSEARCH_PASSWORD !== 'undefined'
		);
	}

	private async createElasticSearchIndex(): Promise<void> {
		// await this.deleteIndexIfExist(index);
		const index = this.generateNewIndexName();
		await this.client.indices.create({ index,
			body: {
				mappings: this.mappings
			} });
	}

	// private async deleteIndexIfExist(index: string): Promise<void> {
	// 	const exist = await this.indexExists(index);
	// 	if(exist.body){
	// 		await this.client.indices.delete({index});
	// 	}
	// }

	// private async indexExists(index: string): Promise<ApiResponse<boolean, Record<string, unknown>>> {
	// 	return await this.client.indices.exists({index});
	// }

	private generateNewIndexName(): string {
		const date = new Date();
		const timestamp = `${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getDate()}-${date.getMonth() + 1
			}-${date.getFullYear()}`;
		this.indexName = this.LOADTEST_INDEX + '-' + timestamp + '-' + new Date().getTime();
		return this.indexName;
	}

	async getStartTimes(): Promise<JSONStreamsInfo[]> {
		if (this.isElasticSearchRunning() && APPLICATION_MODE === ApplicationMode.PROD) {
			const result = await this.client.search({
				index: this.indexName,
				body: {
					query: {
						exists: {
							field: 'new_participant_id'
						}
					}
				}
			})
			return result.body.hits.hits.map(hit => {
				const json: JSONStreamsInfo = {
					"@timestamp": hit._source["@timestamp"],
					new_participant_id: hit._source["new_participant_id"],
					new_participant_session: hit._source["new_participant_session"],
					node_role: hit._source["node_role"],
					streams: hit._source["streams"],
					worker_name: hit._source["worker_name"],
				}
				return json;
			})
		} else {
			return []
		}
	}
}
