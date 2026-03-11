import {
	S3Client,
	ListObjectsV2Command,
	NoSuchBucket,
} from '@aws-sdk/client-s3';
import {
	S3MockContainer,
	StartedS3MockContainer,
} from '@testcontainers/s3mock';

export async function startS3MockTestContainer(): Promise<StartedS3MockContainer> {
	console.log('Starting S3Mock container...');
	const s3MockContainer = await new S3MockContainer('adobe/s3mock:4.11.0')
		.withLogConsumer(stream => {
			stream.on('data', line => console.log(line));
			stream.on('err', line => console.error(line));
			stream.on('end', () => console.log('Stream closed'));
		})
		.start();

	console.log(`S3Mock container started`);
	return s3MockContainer;
}

export async function stopS3MockTestContainer(
	s3MockContainer: StartedS3MockContainer,
): Promise<void> {
	try {
		const maxRetries = 3;
		let lastError: unknown;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				await s3MockContainer.stop();
				console.log(`S3Mock container stopped`);
				return;
			} catch (error) {
				lastError = error;
				if (attempt < maxRetries) {
					console.log(
						`Retry ${attempt}/${maxRetries - 1} stopping S3Mock container...`,
					);
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
		}

		console.error('Error stopping S3Mock container:', lastError);
	} catch (error) {
		console.error('Error stopping S3Mock container:', error);
	}
}

/**
 * Helper function to list all objects in a bucket
 */
export async function listBucketObjects(
	s3Client: S3Client,
	bucket: string,
): Promise<string[]> {
	const keys: string[] = [];
	let continuationToken: string | undefined;

	try {
		do {
			const response = await s3Client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					ContinuationToken: continuationToken,
				}),
			);

			if (response.Contents) {
				keys.push(...response.Contents.map(obj => obj.Key ?? ''));
			}

			continuationToken = response.NextContinuationToken;
		} while (continuationToken);
	} catch (error: unknown) {
		// If bucket doesn't exist, return empty array
		if (error instanceof NoSuchBucket) {
			return [];
		}
		throw error;
	}

	return keys;
}
