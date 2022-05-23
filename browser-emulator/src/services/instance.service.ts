import fs = require('fs');
import fsPromises = fs.promises;
import * as os from 'node-os-utils';
import { ContainerCreateOptions } from 'dockerode';

import { EMULATED_USER_TYPE } from '../config';
import { EmulatedUserType } from '../types/config.type';
import { DockerService } from './docker.service';
import { LocalStorageService } from './local-storage.service';
import { WebrtcStatsService } from './config-storage.service';
import { ContainerName } from '../types/container-info.type';

import * as AWS from 'aws-sdk';

export class InstanceService {
	private static instance: InstanceService;
	private isinstanceInitialized: boolean = false;
	private readonly CHROME_BROWSER_IMAGE = 'elastestbrowsers/chrome';
	private readonly METRICBEAT_MONITORING_INTERVAL = 5;
	private readonly METRICBEAT_IMAGE = 'docker.elastic.co/beats/metricbeat-oss:7.12.0';
	private readonly METRICBEAT_YML_LOCATION = `${process.env.PWD}/src/assets/metricbeat-config/metricbeat.yml`;
	private readonly KMS_IMAGE = 'kurento/kurento-media-server:latest';
	private readonly KMS_RECORDINGS_PATH = '/home/ubuntu/recordings';
	private readonly KMS_MEDIAFILES_PATH = '/home/ubuntu/mediafiles';
	readonly AWS_CREDENTIALS_PATH = `${process.env.PWD}/.awsconfig`;

	readonly WORKER_UUID: string = new Date().getTime().toString();
	private pullImagesRetries: number = 0;

	private constructor(private dockerService: DockerService = new DockerService()) {}

	static getInstance(): InstanceService {
		if (!InstanceService.instance) {
			InstanceService.instance = new InstanceService();
		}
		return InstanceService.instance;
	}

	isInstanceInitialized() {
		return this.isinstanceInitialized;
	}

	instanceInitialized() {
		this.isinstanceInitialized = true;
	}

	async cleanEnvironment() {
		await this.dockerService.stopContainer(ContainerName.KMS);
		await this.dockerService.removeContainer(ContainerName.KMS);
		new LocalStorageService().clear(new WebrtcStatsService().getItemName());
	}

	async getCpuUsage(): Promise<number> {
		return await os.cpu.usage();
	}

	async launchMetricBeat() {
		const ELASTICSEARCH_USERNAME = !!process.env.ELASTICSEARCH_USERNAME ? process.env.ELASTICSEARCH_USERNAME : 'empty';
		const ELASTICSEARCH_PASSWORD = !!process.env.ELASTICSEARCH_PASSWORD ? process.env.ELASTICSEARCH_PASSWORD : 'empty';
		const options: ContainerCreateOptions = {
			Image: this.METRICBEAT_IMAGE,
			name: ContainerName.METRICBEAT,
			User: 'root',
			Env: [
				`ELASTICSEARCH_HOSTNAME=${process.env.ELASTICSEARCH_HOSTNAME}`,
				`ELASTICSEARCH_USERNAME=${ELASTICSEARCH_USERNAME}`,
				`ELASTICSEARCH_PASSWORD=${ELASTICSEARCH_PASSWORD}`,
				`METRICBEAT_MONITORING_INTERVAL=${this.METRICBEAT_MONITORING_INTERVAL}`,
				`WORKER_UUID=${this.WORKER_UUID}`,
			],
			Cmd: ['/bin/bash', '-c', 'metricbeat -e -strict.perms=false -e -system.hostfs=/hostfs'],
			HostConfig: {
				Binds: [
					`/var/run/docker.sock:/var/run/docker.sock`,
					`${this.METRICBEAT_YML_LOCATION}:/usr/share/metricbeat/metricbeat.yml:ro`,
					'/proc:/hostfs/proc:ro',
					'/sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro',
					'/:/hostfs:ro',
				],
				NetworkMode: 'host',
			},
		};
		await this.dockerService.startContainer(options);
	}

	async launchKMS(): Promise<void> {
		try {
			const options: ContainerCreateOptions = {
				Image: this.KMS_IMAGE,
				name: ContainerName.KMS,
				User: 'root',
				Env: ['KMS_MIN_PORT=40000', 'KMS_MAX_PORT=65535', `KURENTO_RECORDING_ENABLED=${process.env.KURENTO_RECORDING_ENABLED}`],
				HostConfig: {
					Binds: [
						`${process.env.PWD}/recordings/kms:${this.KMS_RECORDINGS_PATH}`,
						`${process.env.PWD}/src/assets/mediafiles:${this.KMS_MEDIAFILES_PATH}`,
					],
					AutoRemove: false,
					NetworkMode: 'host',
					RestartPolicy: {
						Name: 'always',
					},
				},
			};

			// Debug logging variables:
			// GST_DEBUG is used directly by the Kurento Docker image.
			if ('GST_DEBUG' in process.env) {
				options.Env.push(`GST_DEBUG=${process.env.GST_DEBUG}`);
			}
			// KMS_DOCKER_ENV_GST_DEBUG is used by .env files of OpenVidu.
			if ('KMS_DOCKER_ENV_GST_DEBUG' in process.env) {
				options.Env.push(`GST_DEBUG=${process.env.KMS_DOCKER_ENV_GST_DEBUG}`);
			}

			await this.dockerService.startContainer(options);
		} catch (error) {
			console.error(error);
			// this.dockerService.stopContainer(ContainerName.KMS);
			// this.dockerService.removeContainer(ContainerName.KMS);
		}
	}

	async removeContainer(containerNameOrId: string) {
		await this.dockerService.removeContainer(containerNameOrId);
	}

	async pullImagesNeeded(): Promise<void> {
		try {
			if (!(await this.dockerService.imageExists(this.METRICBEAT_IMAGE))) {
				await this.dockerService.pullImage(this.METRICBEAT_IMAGE);
			}
			if (!(await this.dockerService.imageExists(this.CHROME_BROWSER_IMAGE))) {
				await this.dockerService.pullImage(this.CHROME_BROWSER_IMAGE);
			}
			if (!(await this.dockerService.imageExists(this.KMS_IMAGE)) && EMULATED_USER_TYPE === EmulatedUserType.KMS) {
				await this.dockerService.pullImage(this.KMS_IMAGE);
			}
		} catch (err) {
			console.error("Error pulling images: ");
			console.error(err);
			console.log("Retrying...");
			// retry 5 times
			if (this.pullImagesRetries < 5) {
				this.pullImagesRetries++;
				await this.pullImagesNeeded();
			} else {
				this.pullImagesRetries = 0;
				throw err;
			}
		}
	}

	// async uploadQoeAnalysisToS3(file: string): Promise<void> {
	// 	return new Promise(async (resolve, reject) => {
	// 		if (fs.existsSync(`${this.AWS_CREDENTIALS_PATH}/config.json`)) {
	// 			AWS.config.loadFromPath(`${this.AWS_CREDENTIALS_PATH}/config.json`);
	// 			const s3 = new AWS.S3();
	// 			if(!(await this.isBucketCreated(process.env.S3_BUCKET))) {
	// 				await this.createS3Bucket(process.env.S3_BUCKET);
	// 			}
	// 			const filePath = `${process.env.PWD}/${file}`;
	// 			const params = {
	// 				Bucket: process.env.S3_BUCKET,
	// 				Key: file,
	// 				Body: fs.createReadStream(filePath)
	// 			};
	// 			s3.putObject(params, (err, data) => {
	// 				if (err) {
	// 					console.error(err);
	// 					return reject(err);
	// 				} else {
	// 					console.log(`Successfully uploaded Qoe Analysis to ${process.env.S3_BUCKET} / ${file}`);
	// 					return resolve(fsPromises.rm(filePath, { force: true }));
	// 				}
	// 			});
	// 		}
	// 	});
		
		
	// }

	async uploadFilesToS3(): Promise<void> {
		if (fs.existsSync(`${this.AWS_CREDENTIALS_PATH}/config.json`)) {
			AWS.config.loadFromPath(`${this.AWS_CREDENTIALS_PATH}/config.json`);
			const s3 = new AWS.S3();
			const dirs = [`${process.env.PWD}/recordings/kms`, `${process.env.PWD}/recordings/chrome`];

			if(!(await this.isBucketCreated(process.env.S3_BUCKET))) {
				await this.createS3Bucket(process.env.S3_BUCKET);
			}
			const promises = [];
			dirs.forEach((dir) => {
				promises.push(
					fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
					.then(() => fsPromises.readdir(dir))
					.then((files) => {
						const uploadPromises = [];
						files.forEach((file) => {
							const filePath = `${dir}/${file}`;
							const fileName = file.split('/').pop();
							const params = {
								Bucket: process.env.S3_BUCKET,
								Key: fileName,
								Body: fs.createReadStream(filePath)
							};
							uploadPromises.push(new Promise((resolve, reject) => {
								s3.putObject(params, (err, data) => {
									if (err) {
										console.error(err);
										return reject(err);
									} else {
										console.log(`Successfully uploaded data to ${process.env.S3_BUCKET} / ${file}`);
										return resolve(fsPromises.rm(filePath, { recursive: true, force: true }));
									}
								});
							}));
						});
						return Promise.all(uploadPromises);
					})
				);
			});
			await Promise.all(promises);
		} else {
			console.log(`ERROR uploading videos to S3. AWS is not configured. ${this.AWS_CREDENTIALS_PATH}/config.json not found`);
		}
	}

	private isBucketCreated(s3BucketName: string): Promise<boolean> {

		return new Promise((resolve, reject) => {
			const s3 = new AWS.S3();
			let bucketFound: boolean = false;
			// Call S3 to list the buckets

			s3.listBuckets((err, data) => {
				if (err) {
					console.log("Error", err);
					return reject(err);
				}
				bucketFound = !!data.Buckets.find(b => {return b.Name === s3BucketName});
				resolve(bucketFound);
			});
		});
	}

	private createS3Bucket(bucketName: string): Promise<any> {

		return new Promise((resolve, reject) => {
			const s3 = new AWS.S3();

			const bucketParams = {
				Bucket : bucketName
			};

			// call S3 to create the bucket
			s3.createBucket(bucketParams, function(err, data) {
				if (err) {
				  console.log("Error", err);
				  return reject(err);
				}

				console.log("Success", data.Location);
				resolve('');

			});
		});

	}
}
