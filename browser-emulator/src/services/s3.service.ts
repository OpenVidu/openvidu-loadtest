import { FilesService } from "./files.service";
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

			if(!(await this.isBucketCreated(process.env.S3_BUCKET))) {
				await this.createBucket(process.env.S3_BUCKET);
			}
			const promises = [];
			this.fileDirs.forEach((dir) => {
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
										return resolve("");
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

    // async uploadQoeAnalysisToS3(file: string): Promise<void> {
    // 	return new Promise(async (resolve, reject) => {
    // 		if (fs.existsSync(`${this.AWS_CREDENTIALS_PATH}/config.json`)) {
    // 			AWS.config.loadFromPath(`${this.AWS_CREDENTIALS_PATH}/config.json`);
    // 			const s3 = new AWS.S3();
    // 			if(!(await this.isBucketCreated(process.env.S3_BUCKET))) {
    // 				await this.createS3Bucket(process.env.S3_BUCKET);
    // 			}
    // 			const filePath = `${process.cwd()}/${file}`;
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
}