import { FilesService } from "../files.service";
import fs = require('fs');
const fsPromises = fs.promises;

import * as AWS from 'aws-sdk';

export class S3FilesService extends FilesService {
	readonly AWS_CREDENTIALS_PATH = `${process.cwd()}/.awsconfig`;

    private constructor(awsAccessKey: string, awsSecretAccessKey: string) {
        super();
        this.createAWSConfigFile(awsAccessKey, awsSecretAccessKey);
    }

    static getInstance(...args: string[]): FilesService {
        if (!FilesService.instance) {
            FilesService.instance = new S3FilesService(args[0], args[1]);
        }
        return FilesService.instance;
    }
    
    private createAWSConfigFile(awsAccessKey: string, awsSecretAccessKey: string) {
        const awsConfig = { accessKeyId: awsAccessKey, secretAccessKey: awsSecretAccessKey, region: 'us-east-1' };
        if (fs.existsSync(this.AWS_CREDENTIALS_PATH)) {
            fs.rmSync(this.AWS_CREDENTIALS_PATH, { recursive: true, force: true });
        }
        fs.mkdirSync(this.AWS_CREDENTIALS_PATH, {recursive: true});
        fs.writeFileSync(`${this.AWS_CREDENTIALS_PATH}/config.json`, JSON.stringify(awsConfig));
        console.log('Created aws credentials file');
    }

    async uploadFiles(): Promise<void> {
		if (fs.existsSync(`${this.AWS_CREDENTIALS_PATH}/config.json`)) {
			AWS.config.loadFromPath(`${this.AWS_CREDENTIALS_PATH}/config.json`);
			const s3 = new AWS.S3();

			if (!(await this.isBucketCreated(process.env.S3_BUCKET))) {
				try {
					await this.createBucket(process.env.S3_BUCKET);
				} catch (error) {
					if (error && error.code === 'BucketAlreadyOwnedByYou') {
						console.log("Bucket already exists");
					} else {
						console.error("Error creating bucket", error);
					}
				}
			}

			const uploadFile = async (fileName: string, filePath: string): Promise<void> => {
				let randomDelay = Math.floor(Math.random() * (10000 - 0 + 1)) + 0;
				console.log(`Uploading file ${fileName} to S3 bucket ${process.env.S3_BUCKET} with delay ${randomDelay} ms`);
				await new Promise(resolve => setTimeout(resolve, randomDelay));
				try {
					const params = {
						Bucket: process.env.S3_BUCKET,
						Key: fileName,
						Body: fs.createReadStream(filePath)
					}
					await s3.putObject(params).promise();
					console.log(`Successfully uploaded data to ${process.env.S3_BUCKET} / ${fileName}`);
				} catch (err) {
					if (err.code === 'SlowDown') {
						let retryDelay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000; // Random delay between 5 and 10 seconds
						console.warn(`Received SlowDown error. Retrying upload file ${fileName} to S3 bucket ${process.env.S3_BUCKET} after delay ${retryDelay} ms`);
						await new Promise(resolve => setTimeout(resolve, retryDelay));
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
			}

			const uploadVideo = async (dir: string, file: string): Promise<void> => {
				const filePath = `${dir}/${file}`;
				let fileName = file.split('/').pop();
				return uploadFile(fileName, filePath);
			};

			const uploadStat = async (dir: string, s3Dir: string, file: string): Promise<void> => {
				const filePath = `${dir}/${file}`;
				let fileName = file.split('/').pop();
				return uploadFile(s3Dir + fileName, filePath);
			};

			const promises = [];
			FilesService.fileDirs.forEach((dir) => {
				promises.push(
					fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
						.then(() => fsPromises.readdir(dir))
						.then(async (files) => {
							let uploadPromises = [];
							if (dir.includes('stats')) {
								const sessions = await fsPromises.readdir(dir);
								for (let session of sessions) {
									if (!session.includes('lock') && !session.startsWith('.')) {
										const users = await fsPromises.readdir(`${dir}/${session}`);
										for (let user of users) {
											const absDir = `${dir}/${session}/${user}`;
											const relDir = `stats/${session}/${user}/`;
											const userFiles = await fsPromises.readdir(absDir);
											uploadPromises = userFiles.map((file) => uploadStat(absDir, relDir, file));
										}
									}
								}
							} else {
								uploadPromises = files.map((file) => uploadVideo(dir, file));
							}
							return Promise.all(uploadPromises);
						})
				);
			});

			await Promise.all(promises);
		}
    }
    async isBucketCreated(bucketName: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
			const s3 = new AWS.S3();
			let bucketFound: boolean = false;
			// Call S3 to list the buckets

			s3.listBuckets((err, data) => {
				if (err) {
					console.log("Error", err);
					return reject(err);
				}
				bucketFound = !!data.Buckets.find(b => {return b.Name === bucketName});
				resolve(bucketFound);
			});
		});
    }
    async createBucket(bucketName: string): Promise<any> {
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