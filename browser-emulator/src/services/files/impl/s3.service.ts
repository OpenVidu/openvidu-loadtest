import { FilesService } from '../files.service.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import {
	S3Client,
	type S3ClientConfig,
	ListBucketsCommand,
	CreateBucketCommand,
	PutObjectCommand,
	type CreateBucketCommandOutput,
} from '@aws-sdk/client-s3';

export class S3FilesService extends FilesService {
	private bucket: string;
	private host: string | undefined;
	private accessKey: string;
	private secretAccessKey: string;
	private region: string = 'us-east-1';

	private constructor(
		accessKey: string,
		secretAccessKey: string,
		bucketName: string,
		host?: string,
	) {
		super();
		this.accessKey = accessKey;
		this.secretAccessKey = secretAccessKey;
		this.bucket = bucketName;
		this.host = host;
		console.log('S3FilesService initialized with provided credentials');
	}

	static getInstance(...args: string[]): FilesService {
		if (!FilesService.instance) {
			FilesService.instance = new S3FilesService(
				args[0]!,
				args[1]!,
				args[2]!,
				args[3],
			);
		}
		return FilesService.instance;
	}

	private getS3Client(): S3Client {
		const config: S3ClientConfig = {
			region: this.region,
			credentials: {
				accessKeyId: this.accessKey,
				secretAccessKey: this.secretAccessKey,
			},
		};

		if (this.host) {
			config.endpoint = this.host;
			config.forcePathStyle = true; // Required for MinIO and other S3-compatible services
		}

		return new S3Client(config);
	}

	async uploadFiles(): Promise<void> {
		try {
			const s3 = this.getS3Client();

			if (!(await this.isBucketCreated(this.bucket))) {
				try {
					await this.createBucket(this.bucket);
				} catch (error: any) {
					if (error && error.code === 'BucketAlreadyOwnedByYou') {
						console.log('Bucket already exists');
					} else {
						console.error('Error creating bucket', error);
					}
				}
			}

			const uploadFile = async (
				fileName: string,
				filePath: string,
			): Promise<void> => {
				let randomDelay =
					Math.floor(Math.random() * (10000 - 0 + 1)) + 0;
				console.log(
					`Uploading file ${fileName} to S3 bucket ${this.bucket} with delay ${randomDelay} ms`,
				);
				await new Promise(resolve => setTimeout(resolve, randomDelay));
				try {
					const params = {
						Bucket: this.bucket,
						Key: fileName,
						Body: fs.createReadStream(filePath),
					};
					await s3.send(new PutObjectCommand(params));
					console.log(
						`Successfully uploaded data to ${this.bucket} / ${fileName}`,
					);
				} catch (err: any) {
					if (err.name === 'SlowDown') {
						let retryDelay =
							Math.floor(Math.random() * (10000 - 5000 + 1)) +
							5000; // Random delay between 5 and 10 seconds
						console.warn(
							`Received SlowDown error. Retrying upload file ${fileName} to S3 bucket ${this.bucket} after delay ${retryDelay} ms`,
						);
						await new Promise(resolve =>
							setTimeout(resolve, retryDelay),
						);
						try {
							await uploadFile(fileName, filePath);
						} catch (retryErr) {
							console.error(retryErr);
							throw retryErr;
						}
					} else {
						console.error(err);
						throw err;
					}
				}
			};

			const uploadVideo = async (
				dir: string,
				file: string,
			): Promise<void> => {
				const filePath = `${dir}/${file}`;
				let fileName = file.split('/').pop();
				return uploadFile(fileName!, filePath);
			};

			const uploadStat = async (
				dir: string,
				s3Dir: string,
				file: string,
			): Promise<void> => {
				const filePath = `${dir}/${file}`;
				let fileName = file.split('/').pop();
				return uploadFile(s3Dir + fileName, filePath);
			};

			const promises: Promise<void[]>[] = [];
			FilesService.fileDirs.forEach(dir => {
				promises.push(
					fsPromises
						.access(dir, fs.constants.R_OK | fs.constants.W_OK)
						.then(() => fsPromises.readdir(dir))
						.then(async files => {
							let uploadPromises: Promise<void>[] = [];
							if (dir.includes('stats')) {
								const sessions = await fsPromises.readdir(dir);
								for (let session of sessions) {
									if (
										!session.includes('lock') &&
										!session.startsWith('.')
									) {
										const users = await fsPromises.readdir(
											`${dir}/${session}`,
										);
										for (let user of users) {
											const absDir = `${dir}/${session}/${user}`;
											const relDir = `stats/${session}/${user}/`;
											const userFiles =
												await fsPromises.readdir(
													absDir,
												);
											uploadPromises = userFiles.map(
												file =>
													uploadStat(
														absDir,
														relDir,
														file,
													),
											);
										}
									}
								}
							} else {
								uploadPromises = files.map(file =>
									uploadVideo(dir, file),
								);
							}
							return Promise.all(uploadPromises);
						}),
				);
			});

			await Promise.all(promises);
		} catch (error) {
			console.error('Error uploading files to S3:', error);
			throw error;
		}
	}
	async isBucketCreated(bucketName: string): Promise<boolean> {
		try {
			const s3 = this.getS3Client();
			const data = await s3.send(new ListBucketsCommand({}));
			const bucketFound = !!data.Buckets?.find(b => {
				return b.Name === bucketName;
			});
			return bucketFound;
		} catch (err) {
			console.error('Error', err);
			throw err;
		}
	}
	async createBucket(bucketName: string): Promise<CreateBucketCommandOutput> {
		try {
			const s3 = this.getS3Client();
			const bucketParams = {
				Bucket: bucketName,
			};
			const data = await s3.send(new CreateBucketCommand(bucketParams));
			console.log('Success', data.Location);
			return data;
		} catch (err) {
			console.error('Error', err);
			throw err;
		}
	}
}
