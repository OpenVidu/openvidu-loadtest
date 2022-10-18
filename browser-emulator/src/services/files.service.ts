import { MinioFilesService } from "./minio.service";
import { S3FilesService } from "./s3.service";

export abstract class FilesService {

    private static instance: FilesService;

    fileDirs = [`${process.env.PWD}/recordings/kms`, `${process.env.PWD}/recordings/chrome`, `${process.env.PWD}/recordings/qoe`];

    static getInstance(type?: FilesService.Type, ...args: string[]): FilesService {
        if (!FilesService.instance) {
            if (type == FilesService.Type.MINIO) {
                FilesService.instance = new MinioFilesService(args[0], args[1]);
            } else if (type == FilesService.Type.S3) {
                FilesService.instance = new S3FilesService(args[0], args[1]);
            }
            else {
                throw new Error("FilesService type not implemented or undefined");
            }
        }
        return FilesService.instance;
    }

    abstract uploadFiles(): Promise<void>;
    abstract isBucketCreated(bucketName: string): Promise<boolean>;
    abstract createBucket(bucketName: string): Promise<any>;
}

export namespace FilesService {
    export enum Type {
        S3 = "s3",
        MINIO = "minio"
    }
}