import * as fs from 'node:fs/promises';
import logger from '../logger.service.ts';

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
		logger.info(
			'Started health check for %s (interval: %dms)',
			key,
			this.checkInterval,
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
			logger.info('Stopped health check for %s', key);
		}
	}

	/**
	 * Stop all health checks
	 */
	stopAllChecks(): void {
		for (const [key, intervalId] of this.checks) {
			clearInterval(intervalId);
			logger.info('Stopped health check for %s', key);
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
			logger.error(
				'Health check failed for %s: socket not accessible',
				key,
			);
			this.stopCheck(key);
			onUnhealthy();
		}
	}
}
