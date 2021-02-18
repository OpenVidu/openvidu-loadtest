
import { ApiResponse, Client, ClientOptions } from '@elastic/elasticsearch';
import { Index } from '@elastic/elasticsearch/api/requestParams';
import { JSONStats } from '../types/stats-config.type';

export class ElasticSearchService {

	private client: Client;
	private pingSuccess: boolean = false;
	private readonly LOAD_TEST_INDEX = 'loadtest';
	private readonly ELASTICSEARCH_CUSTOM_TYPE_FIELD = 'elastic_type';
	private readonly ELASTICSEARCH_TIMESTAMP_FIELD = 'timestamp';

	constructor() {	}

	async initialize(){
		if(this.isHostnameAvailable() && !this.client) {
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
				this.client = new Client(clientOptions);
				const pingSuccess = await this.client.ping();
				this.pingSuccess = pingSuccess.body;
				if(this.pingSuccess) {
					await this.createIndex(this.LOAD_TEST_INDEX);
				}
			} catch (error) {
				console.error(error);
			}
		}
	}

	async sendJson(json: JSONStats){
		if(this.isHostnameAvailable()){
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
		// await this.client.indices.putMapping({
		// 	index: index,
		// 	body: {
		// 		properties: {
		// 			timestamp: {
		// 				type: 'date',
		// 				format: 'epoch_millis',
		// 			}
		// 		}
		// 	}
		// });
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