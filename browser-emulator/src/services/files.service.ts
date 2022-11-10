export abstract class FilesService {

    protected static instance: FilesService | undefined;
    readonly fileDirs = [`${process.env.PWD}/recordings/kms`, `${process.env.PWD}/recordings/chrome`, `${process.env.PWD}/recordings/qoe`];

    static getInstance(): FilesService | undefined {
        return this.instance;
    }
    abstract uploadFiles(): Promise<void>;
    abstract isBucketCreated(bucketName: string): Promise<boolean>;
    abstract createBucket(bucketName: string): Promise<any>;
}