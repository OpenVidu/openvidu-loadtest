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
        if (!(await this.isBucketCreated(process.env.MINIO_BUCKET))) {
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
    
        const uploadFile = async (dir: string, file: string): Promise<void> => {
            const filePath = `${dir}/${file}`;
            const fileName = file.split('/').pop();
    
            return new Promise((resolve, reject) => {
                let randomDelay = Math.floor(Math.random() * (10000 - 0 + 1)) + 0;
                console.log(`Uploading file ${fileName} to MINIO bucket ${process.env.MINIO_BUCKET} with delay ${randomDelay} ms`);

                setTimeout(() => {
                    this.minioClient.fPutObject(process.env.MINIO_BUCKET, fileName, filePath, async (err, etag) => {
                        if (err) {
                            if (err.code === 'SlowDown') {
                                let retryDelay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000; // Random delay between 5 and 10 seconds
                                console.warn(`Received SlowDown error. Retrying upload file ${fileName} to MINIO bucket ${process.env.MINIO_BUCKET} after delay ${retryDelay} ms`);
    
                                setTimeout(async () => {
                                    try {
                                        await uploadFile(dir, file);
                                        resolve();
                                    } catch (retryErr) {
                                        console.error(retryErr);
                                        reject(retryErr);
                                    }
                                }, retryDelay);
                            } else {
                                console.error(err);
                                reject(err);
                            }
                        } else {
                            console.log(`Successfully uploaded data to ${process.env.MINIO_BUCKET} / ${file}`);
                            resolve();
                        }
                    });
                }, randomDelay);
            });
        };
    
        const promises = [];
        this.fileDirs.forEach((dir) => {
            promises.push(
                fsPromises.access(dir, fs.constants.R_OK | fs.constants.W_OK)
                    .then(() => fsPromises.readdir(dir))
                    .then((files) => {
                        const uploadPromises = files.map((file) => uploadFile(dir, file));
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