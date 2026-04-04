import * as net from 'node:net';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createReadStream, type ReadStream } from 'node:fs';

const OGG_CAPTURE_PATTERN = 'OggS';
const OGG_PAGE_HEADER_SIZE = 27;
const OGG_PAGE_SEGMENT_COUNT_OFFSET = 26;
const OGG_PACKET_PREFIX_SIZE = 8;
const OPUS_HEADER_PACKET = 'OpusHead';
const OPUS_TAGS_PACKET = 'OpusTags';

interface OggPageLayout {
	start: number;
	end: number;
	segmentCount: number;
	segmentTableStart: number;
	payloadStart: number;
}

interface OggPageScanResult {
	packetCount: number;
	hasAudioPacket: boolean;
}

function readOggPageLayout(
	buffer: Buffer,
	pageStart: number,
): OggPageLayout | null {
	if (
		buffer.toString('ascii', pageStart, pageStart + 4) !==
		OGG_CAPTURE_PATTERN
	) {
		return null;
	}

	const segmentCount = buffer[pageStart + OGG_PAGE_SEGMENT_COUNT_OFFSET];
	const segmentTableStart = pageStart + OGG_PAGE_HEADER_SIZE;
	const payloadStart = segmentTableStart + segmentCount;
	if (payloadStart > buffer.length) {
		return null;
	}

	let payloadLength = 0;
	for (let i = 0; i < segmentCount; i++) {
		payloadLength += buffer[segmentTableStart + i];
	}

	const pageEnd = payloadStart + payloadLength;
	if (pageEnd > buffer.length) {
		return null;
	}

	return {
		start: pageStart,
		end: pageEnd,
		segmentCount,
		segmentTableStart,
		payloadStart,
	};
}

function scanPacketsInPage(
	buffer: Buffer,
	page: OggPageLayout,
	packetCount: number,
): OggPageScanResult | null {
	let packetStart = page.payloadStart;
	let packetLength = 0;

	for (let i = 0; i < page.segmentCount; i++) {
		const lacingValue = buffer[page.segmentTableStart + i];
		packetLength += lacingValue;

		// In Ogg, a value of 255 means "this packet continues in the next segment".
		if (lacingValue === 255) {
			continue;
		}

		const packetEnd = packetStart + packetLength;
		if (packetEnd > buffer.length) {
			return null;
		}

		const packetPrefix = buffer.toString(
			'ascii',
			packetStart,
			packetStart + OGG_PACKET_PREFIX_SIZE,
		);

		if (packetCount === 0 && packetPrefix === OPUS_HEADER_PACKET) {
			packetCount++;
		} else if (packetCount === 1 && packetPrefix === OPUS_TAGS_PACKET) {
			packetCount++;
		} else if (packetCount >= 2) {
			return {
				packetCount,
				hasAudioPacket: true,
			};
		}

		packetStart = packetEnd;
		packetLength = 0;
	}

	return {
		packetCount,
		hasAudioPacket: false,
	};
}

export function findOggAudioDataOffset(buffer: Buffer): number {
	// We only need one thing: where real audio starts.
	//
	// Opus-in-Ogg files start with two metadata packets:
	// 1) OpusHead (codec setup)
	// 2) OpusTags (text metadata)
	//
	// Everything after those two packets is audio content. We return the start
	// byte of the Ogg page that contains that first audio packet.
	//
	// Returning a page start (instead of a packet start) keeps Ogg checksums and
	// page framing valid when we loop the file for LiveKit.
	let pageOffset = 0;
	let packetCount = 0;

	while (pageOffset + OGG_PAGE_HEADER_SIZE <= buffer.length) {
		const page = readOggPageLayout(buffer, pageOffset);
		if (!page) {
			break;
		}

		const scanResult = scanPacketsInPage(buffer, page, packetCount);
		if (!scanResult) {
			return 0;
		}

		packetCount = scanResult.packetCount;
		if (scanResult.hasAudioPacket) {
			return page.start;
		}

		pageOffset = page.end;
	}

	return 0;
}

export interface SocketWriter {
	server: net.Server;
	socketPath: string;
	participantId: string;
	type: 'video' | 'audio';
}

export class SocketWriterService {
	private readonly baseDir = '/tmp/openvidu-loadtest';
	private readonly activeWriters = new Map<string, SocketWriter>();

	/**
	 * Start a socket writer that streams a file to a Unix socket
	 * @param participantId Unique participant identifier
	 * @param type 'video' or 'audio'
	 * @param filePath Path to pre-encoded file
	 * @returns Socket path for LiveKit CLI (e.g., /tmp/openvidu-loadtest/p1/video.sock)
	 */
	async startWriter(
		participantId: string,
		type: 'video' | 'audio',
		filePath: string,
	): Promise<string> {
		const socketPath = this.getSocketPath(participantId, type);
		const audioLoopStartOffset =
			type === 'audio' ? await this.getAudioLoopStartOffset(filePath) : 0;

		// Ensure directory exists
		await fs.mkdir(path.dirname(socketPath), { recursive: true });

		// Clean up any existing socket
		await this.unlinkSafe(socketPath);

		return new Promise((resolve, reject) => {
			const server = net.createServer(socket => {
				let currentStream: ReadStream | null = null;
				let isStopped = false;
				let streamIteration = 0;

				const cleanupStream = () => {
					if (currentStream) {
						currentStream.removeAllListeners();
						currentStream.destroy();
						currentStream = null;
					}
				};

				const cleanupSocket = () => {
					socket.removeAllListeners();
				};

				const streamFile = () => {
					if (isStopped) return;

					cleanupStream();
					cleanupSocket();
					const startAt =
						type === 'audio' && streamIteration > 0
							? audioLoopStartOffset
							: 0;
					currentStream = createReadStream(filePath, {
						start: startAt,
					});
					streamIteration++;

					const handleStreamError = (err: Error) => {
						console.error(
							`Read error for ${participantId}/${type}:`,
							err.message,
						);
					};

					const handleStreamEnd = () => {
						if (isStopped) return;
						if (!socket.destroyed) {
							setTimeout(() => {
								if (!isStopped && !socket.destroyed) {
									streamFile();
								}
							}, 100);
						}
					};

					const handleSocketError = (err: Error) => {
						console.error(
							`Socket error for ${participantId}/${type}:`,
							err.message,
						);
						cleanupStream();
					};

					const handleSocketClose = () => {
						isStopped = true;
						cleanupStream();
					};

					currentStream.on('error', handleStreamError);
					currentStream.on('end', handleStreamEnd);
					socket.on('error', handleSocketError);
					socket.on('close', handleSocketClose);

					currentStream.pipe(socket, { end: false });
				};

				streamFile();
			});

			server.on('error', err => {
				this.activeWriters.delete(this.getKey(participantId, type));
				reject(err);
			});

			server.listen(socketPath, () => {
				const writer: SocketWriter = {
					server,
					socketPath,
					participantId,
					type,
				};

				this.activeWriters.set(
					this.getKey(participantId, type),
					writer,
				);
				console.log(
					`Started socket writer for ${participantId}/${type} at ${socketPath}`,
				);
				resolve(socketPath);
			});
		});
	}

	/**
	 * Stop a specific writer
	 */
	async stopWriter(
		participantId: string,
		type: 'video' | 'audio',
	): Promise<void> {
		const key = this.getKey(participantId, type);
		const writer = this.activeWriters.get(key);

		if (!writer) return;

		await new Promise<void>(resolve => {
			writer.server.close(() => {
				void this.unlinkSafe(writer.socketPath).then(() => {
					this.activeWriters.delete(key);
					console.log(
						`Stopped socket writer for ${participantId}/${type}`,
					);
					resolve();
				});
			});
		});

		// Clean up participant directory if empty
		await this.cleanParticipantDir(participantId);
	}

	/**
	 * Stop all writers (for cleanup/shutdown)
	 */
	async stopAllWriters(): Promise<void> {
		const promises = Array.from(this.activeWriters.keys()).map(
			async key => {
				const [participantId, type] = key.split(':');
				await this.stopWriter(participantId, type as 'video' | 'audio');
			},
		);

		await Promise.allSettled(promises);

		// Clean up base directory
		try {
			await fs.rm(this.baseDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}

	/**
	 * Check if a writer is active
	 */
	hasWriter(participantId: string, type: 'video' | 'audio'): boolean {
		return this.activeWriters.has(this.getKey(participantId, type));
	}

	/**
	 * Get the socket path for a participant
	 */
	getSocketPath(participantId: string, type: string): string {
		return path.join(this.baseDir, participantId, `${type}.sock`);
	}

	private getKey(participantId: string, type: string): string {
		return `${participantId}:${type}`;
	}

	private async unlinkSafe(filePath: string): Promise<void> {
		try {
			await fs.unlink(filePath);
		} catch {
			// Ignore if doesn't exist
		}
	}

	private async cleanParticipantDir(participantId: string): Promise<void> {
		const dir = path.join(this.baseDir, participantId);
		try {
			const files = await fs.readdir(dir);
			if (files.length === 0) {
				await fs.rmdir(dir);
			}
		} catch {
			// Ignore cleanup errors
		}
	}

	private async getAudioLoopStartOffset(filePath: string): Promise<number> {
		if (!filePath.toLowerCase().endsWith('.ogg')) {
			return 0;
		}

		try {
			const buffer = await fs.readFile(filePath);
			const offset = findOggAudioDataOffset(buffer);
			return Math.max(offset, 0);
		} catch (error) {
			console.warn(
				`Failed to inspect Ogg headers for ${filePath}: ${String(error)}`,
			);
			return 0;
		}
	}
}
