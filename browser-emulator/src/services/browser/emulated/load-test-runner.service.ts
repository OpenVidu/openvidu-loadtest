import type { LoggerService } from '../../logger.service.ts';
import type { WsService } from '../../ws.service.ts';
import type { WebhookRoutingService } from '../../webhook-routing.service.ts';
import type {
	EmulatedParticipantLauncher,
	ParticipantHandle,
} from './emulated-participant-launcher.ts';
import type { LoadTestRunRequest } from '../../../types/load-test.type.ts';
import { createBoundedId } from '../../../utils/id-utils.ts';
import { normalizeContainerLogs } from '../../../utils/log-normalize.ts';
import {
	ERRORS_FILE,
	addSaveStatsToFileToQueue,
} from '../../../utils/stats-files.ts';

interface LoadTestRun {
	handle: ParticipantHandle;
	room: string;
	identity: string;
}

/**
 * Launches `lk load-test` runs. Each run is a single lk process that simulates many
 * publishers/subscribers in one room, reusing the same launcher (docker/direct) as the
 * per-participant `lk room join` path.
 */
export class LoadTestRunnerService {
	private readonly runMap = new Map<string, LoadTestRun>();
	private readonly healthCheckIntervals = new Map<string, NodeJS.Timeout>();
	private readonly reportedHealthErrors = new Set<string>();
	/**
	 * Runs for which a fatal log indicator (e.g. a single user failing to
	 * connect/publish) was already reported over the websocket. A fatal
	 * indicator is a per-user failure, not necessarily a process crash, so it
	 * does not stop the run — this set only prevents re-notifying the same
	 * run on every healthcheck tick once the offending log line is seen.
	 */
	private readonly reportedFatalIndicators = new Set<string>();
	/** Length of each run's log output already scanned by {@link logUnrecognizedOutput}. */
	private readonly lastScannedLogLength = new Map<string, number>();

	private readonly emulatedParticipantLauncher: EmulatedParticipantLauncher;
	private readonly wsService: WsService;
	private readonly webhookRoutingService: WebhookRoutingService;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	private readonly CONNECTION_CHECK_ATTEMPTS = 10;
	private readonly CONNECTION_CHECK_DELAY_MS = 1000;
	private readonly HEALTHCHECK_INTERVAL_MS = 5000;
	private readonly MAX_ERROR_LOG_CHARS = 3000;
	/**
	 * Conservative assumption of connections/second when `numPerSecond` isn't set
	 * (`lk load-test` itself connects as fast as possible in that case), used only
	 * to size the wait window below — not sent to the CLI.
	 */
	private readonly ASSUMED_UNTHROTTLED_CONNECTIONS_PER_SECOND = 2;
	/**
	 * Extra time budgeted on top of the estimated connection time, covering `lk
	 * load-test` process startup and per-participant ICE/network negotiation.
	 */
	private readonly LOG_INDICATOR_WAIT_BUFFER_SECONDS = 15;
	/**
	 * Non-fatal `lk load-test` output known to be expected/benign, so it isn't
	 * logged as unrecognized. Ids, ports and counts that vary per line (e.g.
	 * "publishing audio track - sprgj_pub_1") are ignored by matching on the
	 * fixed substrings/structure around them.
	 */
	private readonly KNOWN_INFORMATIONAL_LOG_PATTERNS: (string | RegExp)[] = [
		'--- stdout ---',
		'--- stderr ---',
		'starting load test with',
		'publishing audio track - ',
		'publishing video track - ',
		'publishing simulcast video track - ',
		/subscribed to track \S+ \S+ (?:audio|video) \d+\/\d+/,
	];

	constructor(
		emulatedParticipantLauncher: EmulatedParticipantLauncher,
		wsService: WsService,
		webhookRoutingService: WebhookRoutingService,
		loggerService: LoggerService,
	) {
		this.emulatedParticipantLauncher = emulatedParticipantLauncher;
		this.wsService = wsService;
		this.webhookRoutingService = webhookRoutingService;
		this.logger = loggerService.getLogger('LoadTestRunnerService');
	}

	async startLoadTest(
		request: LoadTestRunRequest,
	): Promise<{ runId: string; handleId: string }> {
		const sanitizedRoom = request.room.replace(/[^a-zA-Z0-9_.-]/g, '_');
		const runId = createBoundedId(
			`loadtest-${sanitizedRoom}-${Date.now()}`,
			60,
		);
		// The LiveKit identity prefix is fully owned by the worker (not
		// configurable by the controller), so webhook events can be reliably
		// attributed back to the run that created them.
		const identity = runId;

		const command = this.buildLoadTestCommand(request, identity);

		this.webhookRoutingService.setCredentials(
			request.livekitApiKey,
			request.livekitApiSecret,
		);

		this.logger.info(
			{ runId, room: request.room, command: command.join(' ') },
			'Starting load-test run',
		);

		const handle = await this.emulatedParticipantLauncher.createParticipant(
			command,
			runId,
			request.room,
			identity,
		);

		this.runMap.set(runId, { handle, room: request.room, identity });
		this.webhookRoutingService.registerPrefix(identity, eventType => {
			if (this.reportedFatalIndicators.has(runId)) {
				return;
			}
			this.reportedFatalIndicators.add(runId);
			this.reportHealthError(
				{ handle, room: request.room, identity },
				runId,
				`webhook-${eventType}`,
			);
		});

		const { total: totalParticipants } =
			this.resolveParticipantCounts(request);

		try {
			await this.checkLoadTestIsAliveAndCorrect(
				runId,
				handle,
				totalParticipants,
				request.numPerSecond,
			);
		} catch (error) {
			await this.stopLoadTest(runId);
			throw error;
		}

		this.startRunHealthCheck(runId);

		this.logger.info(
			{ runId, handleId: handle.handleId },
			'Load-test run started',
		);

		return { runId, handleId: handle.handleId };
	}

	async stopLoadTest(runId: string): Promise<void> {
		this.stopRunHealthCheck(runId);

		const run = this.runMap.get(runId);
		if (!run) {
			this.logger.warn({ runId }, 'Load-test run not found');
			return;
		}
		this.webhookRoutingService.unregisterPrefix(run.identity);
		try {
			await this.emulatedParticipantLauncher.stop(run.handle.handleId);
		} catch (error) {
			this.logger.error({ runId, error }, 'Error stopping load-test run');
		}
		this.runMap.delete(runId);
		this.reportedFatalIndicators.delete(runId);
		this.lastScannedLogLength.delete(runId);
	}

	async stopAll(): Promise<void> {
		const runIds = Array.from(this.runMap.keys());
		await Promise.allSettled(runIds.map(id => this.stopLoadTest(id)));
		this.runMap.clear();
	}

	/**
	 * A publisher in NORMAL mode publishes both audio and video and also
	 * subscribes to other participants' tracks. `lk load-test` treats
	 * video/audio publishers and subscribers as separate participant counts,
	 * so mirror that behavior here: every video publisher adds one audio
	 * publisher and one subscriber, on top of whatever was requested directly.
	 */
	private resolveParticipantCounts(request: LoadTestRunRequest): {
		videoPublishers: number;
		audioPublishers: number;
		subscribers: number;
		total: number;
	} {
		const videoPublishers = request.videoPublishers ?? 0;
		const audioPublishers =
			(request.audioPublishers ?? 0) + videoPublishers;
		const subscribers = (request.subscribers ?? 0) + videoPublishers;

		return {
			videoPublishers,
			audioPublishers,
			subscribers,
			total: videoPublishers + audioPublishers + subscribers,
		};
	}

	private buildLoadTestCommand(
		request: LoadTestRunRequest,
		identity: string,
	): string[] {
		const baseUrl = request.openviduUrl
			.replace('ws://', 'http://')
			.replace('wss://', 'https://');

		const parts: string[] = [
			'load-test',
			'--url',
			baseUrl,
			'--api-key',
			request.livekitApiKey,
			'--api-secret',
			request.livekitApiSecret,
			'--room',
			request.room,
		];

		const { videoPublishers, audioPublishers, subscribers } =
			this.resolveParticipantCounts(request);

		if (videoPublishers > 0) {
			parts.push('--video-publishers', String(videoPublishers));
		}
		if (audioPublishers > 0) {
			parts.push('--audio-publishers', String(audioPublishers));
		}
		if (subscribers > 0) {
			parts.push('--subscribers', String(subscribers));
		}
		if (request.numPerSecond && request.numPerSecond > 0) {
			parts.push('--num-per-second', String(request.numPerSecond));
		}
		if (request.videoResolution) {
			parts.push('--video-resolution', request.videoResolution);
		}
		if (request.videoCodec) {
			parts.push('--video-codec', request.videoCodec);
		}
		parts.push('--identity-prefix', identity);
		// Defaults to "5x5" (lk load-test itself defaults to "speaker") so
		// subscribers receive a predictable resolution/count without requiring
		// explicit configuration.
		parts.push('--layout', request.layout ?? '5x5');
		// Simulcast is enabled by default in lk load-test.
		if (request.simulcast === false) {
			parts.push('--no-simulcast');
		}

		return parts;
	}

	/**
	 * Verifies the `lk load-test` process is running and its logs show every
	 * requested participant has finished connecting, mirroring
	 * {@link EmulatedBrowserService}'s per-participant join check. A single
	 * process simulates many users at once, so this is a coarse, run-level check
	 * rather than a per-participant one. The wait window scales with the number
	 * of participants and `numPerSecond` (when throttled, connecting can
	 * legitimately take as long as `totalParticipants / numPerSecond` seconds).
	 */
	private async checkLoadTestIsAliveAndCorrect(
		runId: string,
		handle: ParticipantHandle,
		totalParticipants: number,
		numPerSecond?: number,
	): Promise<void> {
		const errorMsg = `Load-test run ${runId} failed to connect any participant`;
		const connectionRate =
			numPerSecond && numPerSecond > 0
				? numPerSecond
				: this.ASSUMED_UNTHROTTLED_CONNECTIONS_PER_SECOND;
		const logIndicatorWaitSeconds =
			totalParticipants / connectionRate +
			this.LOG_INDICATOR_WAIT_BUFFER_SECONDS;
		const logIndicatorCheckAttempts = Math.ceil(
			(logIndicatorWaitSeconds * 1000) / this.CONNECTION_CHECK_DELAY_MS,
		);

		const retry = async (
			fn: () => Promise<boolean>,
			attempts: number,
			delayMs = this.CONNECTION_CHECK_DELAY_MS,
		) => {
			for (let i = 0; i < attempts; i++) {
				if (await fn()) return true;
				if (i < attempts - 1) {
					await new Promise(res => setTimeout(res, delayMs));
				}
			}
			return false;
		};

		this.logger.info({ runId }, 'Checking if load-test run is running...');
		const isRunning = await retry(
			() => this.emulatedParticipantLauncher.isRunning(handle.handleId),
			this.CONNECTION_CHECK_ATTEMPTS,
		);
		if (!isRunning) {
			const logs = await this.getLogsSafely(handle.handleId);
			this.logger.error({ runId, logs }, 'Load-test run is not running');
			throw new Error(errorMsg);
		}

		this.logger.info(
			{ runId, totalParticipants, logIndicatorCheckAttempts },
			'Checking load-test logs for successful connection...',
		);
		const connectionLogsOk = await retry(async () => {
			const logs = await this.emulatedParticipantLauncher.getLogs(
				handle.handleId,
			);
			return this.hasSuccessfulLoadTestIndicators(logs);
		}, logIndicatorCheckAttempts);
		if (!connectionLogsOk) {
			const logs = await this.getLogsSafely(handle.handleId);
			this.logger.error(
				{ runId, logs },
				'Missing connection indicators in load-test logs',
			);
			throw new Error(errorMsg);
		}

		this.logger.info({ runId }, 'Logs indicate successful connection');
	}

	private startRunHealthCheck(runId: string): void {
		this.stopRunHealthCheck(runId);
		this.reportedHealthErrors.delete(runId);
		this.reportedFatalIndicators.delete(runId);
		this.lastScannedLogLength.delete(runId);

		const interval = setInterval(() => {
			void this.runHealthCheck(runId);
		}, this.HEALTHCHECK_INTERVAL_MS);

		this.healthCheckIntervals.set(runId, interval);
	}

	private stopRunHealthCheck(runId: string): void {
		const interval = this.healthCheckIntervals.get(runId);
		if (interval) {
			clearInterval(interval);
			this.healthCheckIntervals.delete(runId);
		}
	}

	private async runHealthCheck(runId: string): Promise<void> {
		if (this.reportedHealthErrors.has(runId)) {
			return;
		}

		const run = this.runMap.get(runId);
		if (!run) {
			this.stopRunHealthCheck(runId);
			return;
		}

		try {
			const isRunning = await this.emulatedParticipantLauncher.isRunning(
				run.handle.handleId,
			);
			if (!isRunning) {
				const logs = await this.getLogsSafely(run.handle.handleId);
				await this.handleUnhealthyRun(runId, 'run-not-running', logs);
				return;
			}

			const logs = await this.getLogsSafely(run.handle.handleId);
			if (logs) {
				this.logUnrecognizedOutput(runId, logs);
			}
			if (
				logs &&
				this.hasFatalLoadTestIndicators(logs) &&
				!this.reportedFatalIndicators.has(runId)
			) {
				// A fatal indicator reflects one user failing to connect/publish
				// within the run, not the whole `lk load-test` process crashing
				// (that case is caught by the isRunning check above), so the run
				// is left running and only notified over the websocket.
				this.reportedFatalIndicators.add(runId);
				this.reportHealthError(run, runId, 'fatal-log-indicator', logs);
			}
		} catch (error) {
			await this.handleUnhealthyRun(
				runId,
				'healthcheck-execution-failed',
				String(error),
			);
		}
	}

	private async handleUnhealthyRun(
		runId: string,
		reason: string,
		logs?: string,
	): Promise<void> {
		if (this.reportedHealthErrors.has(runId)) {
			return;
		}

		this.reportedHealthErrors.add(runId);
		this.stopRunHealthCheck(runId);

		const run = this.runMap.get(runId);
		if (run) {
			this.reportHealthError(run, runId, reason, logs);
		}

		await this.stopLoadTest(runId).catch(error => {
			this.logger.error(
				{ runId, error },
				'Error cleaning up unhealthy load-test run',
			);
		});
	}

	private reportHealthError(
		run: LoadTestRun,
		runId: string,
		reason: string,
		logs?: string,
	): void {
		const payload: Record<string, string> = {
			event: 'LOAD_TEST_RUN_HEALTH_ERROR',
			source: 'lk-load-test-healthcheck',
			participant: run.identity,
			session: run.room,
			timestamp: new Date().toISOString(),
			runId,
			handleId: run.handle.handleId,
			reason,
		};

		if (logs) {
			payload.logs = this.truncateLogs(logs);
		}

		this.wsService.send(JSON.stringify(payload));
		addSaveStatsToFileToQueue(run.identity, run.room, ERRORS_FILE, payload);
		this.logger.error(
			{ runId, reason, logs },
			'Load-test healthcheck error reported',
		);
	}

	private async getLogsSafely(handleId: string): Promise<string | undefined> {
		try {
			return await this.emulatedParticipantLauncher.getLogs(handleId);
		} catch (error) {
			this.logger.warn(
				{ handleId, error: String(error) },
				'Failed to read logs',
			);
			return undefined;
		}
	}

	private truncateLogs(logs: string): string {
		if (logs.length <= this.MAX_ERROR_LOG_CHARS) {
			return logs;
		}

		return logs.slice(-this.MAX_ERROR_LOG_CHARS);
	}

	/**
	 * Logs any new `lk load-test` output line that doesn't match a known
	 * success/fatal/informational pattern, so unexpected output is surfaced
	 * instead of silently ignored. Only lines appended since the previous
	 * healthcheck are considered, so the same line isn't logged repeatedly.
	 */
	private logUnrecognizedOutput(runId: string, logs: string): void {
		const previouslyScannedLength =
			this.lastScannedLogLength.get(runId) ?? 0;
		const newOutput = logs.slice(previouslyScannedLength);
		this.lastScannedLogLength.set(runId, logs.length);

		const newLines = newOutput
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0);

		for (const line of newLines) {
			if (!this.isRecognizedLoadTestLogLine(line)) {
				this.logger.info(
					{ runId, line },
					'Unrecognized lk load-test log line',
				);
			}
		}
	}

	private isRecognizedLoadTestLogLine(line: string): boolean {
		if (
			this.hasSuccessfulLoadTestIndicators(line) ||
			this.hasFatalLoadTestIndicators(line)
		) {
			return true;
		}

		const normalizedLine = normalizeContainerLogs(line);

		return this.KNOWN_INFORMATIONAL_LOG_PATTERNS.some(pattern =>
			typeof pattern === 'string'
				? normalizedLine.includes(pattern)
				: pattern.test(normalizedLine),
		);
	}

	/**
	 * Detects that every requested participant in this `lk load-test` run has
	 * finished connecting. `lk load-test` only logs "finished connecting to room,
	 * waiting ..." once, after its whole connect phase completes (i.e. once all
	 * requested publishers/subscribers have joined) — earlier lines like
	 * "publishing audio track - sprgj_pub_1" only prove a single participant
	 * connected, so they are intentionally not treated as sufficient on their own.
	 */
	private hasSuccessfulLoadTestIndicators(logs: string): boolean {
		const normalizedLogs = normalizeContainerLogs(logs);

		return normalizedLogs.includes('finished connecting to room, waiting');
	}

	/**
	 * Detects load-test-specific connection/disconnection failures. Ids, ports and
	 * timestamps that vary per attempt (e.g. "turnc ERROR: 2026/07/02 10:39:11 Fail
	 * to refresh permissions...", "could not connect Pub 0:") are ignored by matching
	 * on the fixed substrings around them.
	 */
	private hasFatalLoadTestIndicators(logs: string): boolean {
		const normalizedLogs = normalizeContainerLogs(logs);
		const fatalPatterns = [
			'fail to refresh permissions: transaction closed',
			'fail to refresh permissions: all retransmissions failed',
			'could not connect pub',
			'could not connect sub',
			'panic:',
			'fatal',
			'caught panic in consumetrack',
		];

		return fatalPatterns.some(pattern => normalizedLogs.includes(pattern));
	}
}
