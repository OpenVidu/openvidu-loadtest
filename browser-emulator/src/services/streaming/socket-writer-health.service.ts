import * as fs from 'node:fs/promises';

export class SocketWriterHealthService {
	private readonly checks = new Map<string, NodeJS.Timeout>();
	private readonly checkInterval = 5000; // 5 seconds

	/**
	 * Start health checking a socket writer
	 * @param key Unique key for the check (e.g., "participantId_video")
	 * @param socketPath Path to socket file
	 * @param onUnhealthy Callback when health check fails
	 */
	startCheck(key: string, socketPath: string, onUnhealthy: () => void): void {
		// Stop existing check if any
		this.stopCheck(key);

		const intervalId = setInterval(() => {
			void this.checkHealth(socketPath, key, onUnhealthy);
		}, this.checkInterval);

		this.checks.set(key, intervalId);
		console.log(
			`Started health check for ${key} (interval: ${this.checkInterval}ms)`,
		);
	}

	/**
	 * Stop health checking for a specific key
	 */
	stopCheck(key: string): void {
		const intervalId = this.checks.get(key);
		if (intervalId) {
			clearInterval(intervalId);
			this.checks.delete(key);
			console.log(`Stopped health check for ${key}`);
		}
	}

	/**
	 * Stop all health checks
	 */
	stopAllChecks(): void {
		for (const [key, intervalId] of this.checks) {
			clearInterval(intervalId);
			console.log(`Stopped health check for ${key}`);
		}
		this.checks.clear();
	}

	/**
	 * Check if a health check is active
	 */
	hasCheck(key: string): boolean {
		return this.checks.has(key);
	}

	private async checkSocketAlive(socketPath: string): Promise<boolean> {
		try {
			await fs.access(socketPath);
			return true;
		} catch {
			return false;
		}
	}

	private async checkHealth(
		socketPath: string,
		key: string,
		onUnhealthy: () => void,
	): Promise<void> {
		const alive = await this.checkSocketAlive(socketPath);
		if (!alive) {
			console.error(
				`Health check failed for ${key}: socket not accessible`,
			);
			this.stopCheck(key);
			onUnhealthy();
		}
	}
}
