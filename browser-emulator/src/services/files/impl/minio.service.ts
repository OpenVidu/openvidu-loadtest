import { FilesService } from "../files.service";
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

        const uploadFile = async (fileName: string, filePath: string): Promise<void> => {
            let randomDelay = Math.floor(Math.random() * (10000 - 0 + 1)) + 0;
            console.log(`Uploading file ${fileName} to MINIO bucket ${process.env.MINIO_BUCKET} with delay ${randomDelay} ms`);
            await new Promise(resolve => setTimeout(resolve, randomDelay));
            try {
                await this.minioClient.fPutObject(process.env.MINIO_BUCKET, fileName, filePath);
                console.log(`Successfully uploaded data to ${process.env.MINIO_BUCKET} / ${fileName}`);
            } catch (err) {
                if (err.code === 'SlowDown') {
                    let retryDelay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000; // Random delay between 5 and 10 seconds
                    console.warn(`Received SlowDown error. Retrying upload file ${fileName} to MINIO bucket ${process.env.MINIO_BUCKET} after delay ${retryDelay} ms`);
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

        const uploadStat = async (dir: string, minioDir: string, file: string): Promise<void> => {
            const filePath = `${dir}/${file}`;
            let fileName = file.split('/').pop();
            return uploadFile(minioDir + fileName, filePath);
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


    async isBucketCreated(bucketName: string): Promise<boolean> {
        return this.minioClient.bucketExists(bucketName);
    }

    async createBucket(bucketName: string): Promise<any> {
        await this.minioClient.makeBucket(bucketName, "");
        console.log("Success in creating MINIO bucket: " + bucketName);
        return "";
    }
}