export interface RemotePersistenceRepository {
	initialize(
		accessKey: string,
		secretAccessKey: string,
		targetName: string,
		region?: string,
		host?: string,
	): void;
	isInitialized(): boolean;
	getBucketName(): string;
	createBucketIfNeeded(): Promise<void>;
	uploadFile(filePath: string, key: string): Promise<void>;
	clean(): void;
}
