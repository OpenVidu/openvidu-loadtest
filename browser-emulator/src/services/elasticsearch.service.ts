
import { ApiResponse, Client, ClientOptions } from '@elastic/elasticsearch';
import { Index } from '@elastic/elasticsearch/api/requestParams';
import { JSONStatsResponse } from '../types/api-rest.type';

export class ElasticSearchService {

	private client: Client;
	private pingSuccess: boolean = false;
	private readonly LOAD_TEST_INDEX = 'loadtest';
	protected static instance: ElasticSearchService;

	private constructor() {	}

	static getInstance(): ElasticSearchService {
		if (!ElasticSearchService.instance) {
			ElasticSearchService.instance = new ElasticSearchService();
		}
		return ElasticSearchService.instance;
	}

	async initialize(){
		const clientOptions: ClientOptions = {
			node: process.env.ELASTICSEARCH_HOSTNAME,
			maxRetries: 5,
			requestTimeout: 10000,
			ssl: {
				rejectUnauthorized: false
			}
		};

		if(this.isSecured()) {
			clientOptions.auth = {
				username: process.env.ELASTICSEARCH_USERNAME,
				password: process.env.ELASTICSEARCH_PASSWORD
			};
		}
		try {
			console.log("Connecting with ElasticSearch ...");
			this.client = new Client(clientOptions);
			const pingSuccess = await this.client.ping();
			this.pingSuccess = pingSuccess.body;
			if(this.pingSuccess) {
				await this.createIndex(this.LOAD_TEST_INDEX);
			}
		} catch (error) {
			console.error("Error connecting with ElasticSearch: ", error);
			throw error;
		}

	}

	async sendJson(json: JSONStatsResponse) {
		if(this.isElasticSearchAvailable()) {
			console.log(`Sending webrtc stats JSON to ElasticSearch ${process.env.ELASTICSEARCH_HOSTNAME}`);
			let indexData: Index<Record<string, any>> = {
				index: this.LOAD_TEST_INDEX,
				body: {}
			};
			Object.keys(json).forEach(key => {
				indexData.body[key] = json[key];
			});
			await this.client.index(indexData);
		}
	}

	isElasticSearchAvailable(): boolean {
		return this.pingSuccess;
	}

	needToBeConfigured(): boolean {
 		return this.isHostnameAvailable() && !this.client;
	}

	private isHostnameAvailable(): boolean {
		return !!process.env.ELASTICSEARCH_HOSTNAME && process.env.ELASTICSEARCH_HOSTNAME !== 'undefined';
	}

	private isSecured(): boolean {
		return !!process.env.ELASTICSEARCH_USERNAME &&
				process.env.ELASTICSEARCH_USERNAM !== 'undefined' &&
				!!process.env.ELASTICSEARCH_PASSWORD &&
				process.env.ELASTICSEARCH_PASSWORD !== 'undefined';
	}

	private async createIndex(index: string) {
		await this.deleteIndexIfExist(index);
		await this.client.indices.create({ index });
	}

	private async deleteIndexIfExist(index: string): Promise<void> {
		const exist = await this.indexExists(index);
		if(exist.body){
			await this.deleteIndex(index);;
		}
	}

	private async deleteIndex(index: string) {
		await this.client.indices.delete({index});
	}

	private async indexExists(index: string): Promise<ApiResponse<boolean, Record<string, unknown>>> {
		return await this.client.indices.exists({index});
	}
}