import { FilesService } from "./files.service";
import fs = require('fs');
const fsPromises = fs.promises;
import * as Minio from "minio";

export class MinioFilesService extends FilesService {
    private minioClient: Minio.Client;

    private constructor(minioAccessKey: string, minioSecretAccessKey: string) {
        super();
        this.minioClient = new Minio.Client({
            endPoint: process.env.MINIO_HOST,
            port: parseInt(process.env.MINIO_PORT),
            useSSL: true,
            accessKey: minioAccessKey,
            secretKey: minioSecretAccessKey
        })
    }
    
    static getInstance(...args: string[]): FilesService {
        if (!FilesService.instance) {
            FilesService.instance = new MinioFilesService(args[0], args[1]);
        }
        return FilesService.instance;
    }

    async uploadFiles(): Promise<void> {
        if(!(await this.isBucketCreated(process.env.MINIO_BUCKET))) {
            try {
                await this.createBucket(process.env.MINIO_BUCKET);
            } catch (error) {
                if (error && error.code === 'BucketAlreadyOwnedByYou') {
                    console.log("Bucket already exists");
                } else {
                    console.error("Error creating bucket", error);
                }
            }
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
							uploadPromises.push(new Promise((resolve, reject) => {
                                const randomDelay = Math.floor(Math.random() * (20000 - 0 + 1)) + 0;
                                console.log(`Uploading file ${fileName} to MINIO bucket ${process.env.MINIO_BUCKET} with delay ${randomDelay} ms`);
                                setTimeout(() => {
                                    this.minioClient.fPutObject(process.env.MINIO_BUCKET, fileName, filePath, (err, etag) => {
                                        if (err) {
                                            console.error(err);
                                            return reject(err);
                                        } else {
                                            console.log(`Successfully uploaded data to ${process.env.MINIO_BUCKET} / ${file}`);
                                            return resolve("");
                                        }
                                    });
                                }, randomDelay);
							}));
						});
						return Promise.all(uploadPromises);
					})
				);
			});
			await Promise.all(promises);
    }

    async isBucketCreated(bucketName: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.minioClient.bucketExists(bucketName, (err, exists) => {
                if (err) {
                    return reject(err);
                }
                return resolve(exists);
            })
		});
    }

    async createBucket(bucketName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.minioClient.makeBucket(bucketName, "", (err) => {
                if (err) {
                    return reject(err);
                }
                console.log("Success in creating MINIO bucket: " + bucketName);
                return resolve('');
            })
		});
    }
}