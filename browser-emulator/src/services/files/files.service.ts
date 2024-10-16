export abstract class FilesService {

    protected static instance: FilesService | undefined;
    static readonly fileDirs = [`${process.cwd()}/recordings/chrome`,
        `${process.cwd()}/recordings/qoe`, `${process.cwd()}/stats`];

    static getInstance(): FilesService | undefined {
        return this.instance;
    }
    abstract uploadFiles(): Promise<void>;
    abstract isBucketCreated(bucketName: string): Promise<boolean>;
    abstract createBucket(bucketName: string): Promise<any>;
}