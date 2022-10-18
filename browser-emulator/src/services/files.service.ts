export abstract class FilesService {

    protected static instance: FilesService;
    readonly fileDirs = [`${process.env.PWD}/recordings/kms`, `${process.env.PWD}/recordings/chrome`, `${process.env.PWD}/recordings/qoe`];

    static getInstance() {

        if (!this.instance) {
            throw new Error('FilesService not initialized');
        }

        return this.instance;
    }
    abstract uploadFiles(): Promise<void>;
    abstract isBucketCreated(bucketName: string): Promise<boolean>;
    abstract createBucket(bucketName: string): Promise<any>;
}