import { Role, type UserJoinProperties } from '../../types/create-user.type.ts';

export interface ParticipantInfo {
	connectionId: string;
	sessionName: string;
	userName: string;
	role: Role;
}

interface SessionConnections {
	publishers: string[];
	subscribers: string[];
}

/**
 * Centralized tracker for managing participants and their stream information.
 * This class handles tracking participants across sessions and calculating
 * stream counts for reporting.
 */
export class ParticipantTracker {
	private readonly participants = new Map<string, ParticipantInfo>();
	private readonly sessionConnections = new Map<string, SessionConnections>();

	/**
	 * Track a new participant connection
	 */
	storeConnection(
		connectionId: string,
		properties: UserJoinProperties,
	): void {
		const { sessionName, userId, role } = properties;

		// Store participant info
		this.participants.set(connectionId, {
			connectionId,
			sessionName,
			userName: userId,
			role,
		});

		// Track in session connections
		let sessionConn = this.sessionConnections.get(sessionName);
		if (!sessionConn) {
			sessionConn = { publishers: [], subscribers: [] };
			this.sessionConnections.set(sessionName, sessionConn);
		}

		if (role === Role.PUBLISHER) {
			sessionConn.publishers.push(connectionId);
		} else {
			sessionConn.subscribers.push(connectionId);
		}
	}

	/**
	 * Remove a participant connection from tracking
	 */
	deleteConnection(connectionId: string): void {
		const participant = this.participants.get(connectionId);
		if (!participant) {
			return;
		}

		const { sessionName, role } = participant;
		const sessionConn = this.sessionConnections.get(sessionName);
		if (sessionConn) {
			if (role === Role.PUBLISHER) {
				const index = sessionConn.publishers.indexOf(connectionId);
				if (index >= 0) {
					sessionConn.publishers.splice(index, 1);
				}
			} else {
				const index = sessionConn.subscribers.indexOf(connectionId);
				if (index >= 0) {
					sessionConn.subscribers.splice(index, 1);
				}
			}

			// Clean up empty session
			if (
				sessionConn.publishers.length === 0 &&
				sessionConn.subscribers.length === 0
			) {
				this.sessionConnections.delete(sessionName);
			}
		}

		this.participants.delete(connectionId);
	}

	/**
	 * Check if a participant is tracked
	 */
	hasConnection(connectionId: string): boolean {
		return this.participants.has(connectionId);
	}

	/**
	 * Get participant info by connection ID
	 */
	getParticipant(connectionId: string): ParticipantInfo | undefined {
		return this.participants.get(connectionId);
	}

	/**
	 * Get all connection IDs for a session and user
	 */
	getConnectionsForSessionAndUser(
		sessionId: string,
		userId: string,
	): string[] {
		const result: string[] = [];
		for (const [connectionId, participant] of this.participants) {
			if (
				participant.sessionName === sessionId &&
				participant.userName === userId
			) {
				result.push(connectionId);
			}
		}
		return result;
	}

	/**
	 * Get all connection IDs for a specific role
	 */
	getConnectionsForRole(role: Role): string[] {
		const result: string[] = [];
		for (const [connectionId, participant] of this.participants) {
			if (participant.role === role) {
				result.push(connectionId);
			}
		}
		return result;
	}

	/**
	 * Get total number of participants
	 */
	getParticipantsCreated(): number {
		return this.participants.size;
	}

	/**
	 * Get total number of publishers across all sessions
	 */
	getTotalPublishers(): number {
		let total = 0;
		for (const sessionConn of this.sessionConnections.values()) {
			total += sessionConn.publishers.length;
		}
		return total;
	}

	/**
	 * Get number of publishers in a specific session
	 */
	getPublishersInSession(sessionName: string): number {
		return this.sessionConnections.get(sessionName)?.publishers.length ?? 0;
	}

	/**
	 * Get number of subscribers in a specific session
	 */
	getSubscribersInSession(sessionName: string): number {
		return (
			this.sessionConnections.get(sessionName)?.subscribers.length ?? 0
		);
	}

	/**
	 * Get the session connections info for a specific session
	 */
	getSessionConnections(sessionName: string): SessionConnections | undefined {
		return this.sessionConnections.get(sessionName);
	}

	/**
	 * Get all tracked connection IDs
	 */
	getAllConnectionIds(): string[] {
		return Array.from(this.participants.keys());
	}

	/**
	 * Clear all tracked participants and sessions
	 */
	clear(): void {
		this.participants.clear();
		this.sessionConnections.clear();
	}

	/**
	 * Calculate total streams created across all sessions.
	 *
	 * Stream calculation logic:
	 * - Each publisher sends 1 stream
	 * - Each publisher receives streams from all other publishers in the same session
	 * - Each subscriber receives streams from all publishers
	 *
	 * @param totalPublishersAcrossAllSessions Total publishers across all sessions
	 */
	getStreamsCreated(): number {
		const totalPublishersAcrossAllSessions = this.getTotalPublishers();
		let result = 0;

		for (const [, sessionConn] of this.sessionConnections) {
			const publishersInSession = sessionConn.publishers.length;
			const subscribersInSession = sessionConn.subscribers.length;

			// Streams sent by publishers in this session
			const streamsSent = publishersInSession;

			// External publishers (publishers not in this session)
			const externalPublishers = Math.max(
				0,
				totalPublishersAcrossAllSessions - publishersInSession,
			);

			// Streams received by publishers (from other publishers)
			const streamsReceivedByPublishers =
				publishersInSession * externalPublishers +
				publishersInSession * Math.max(0, publishersInSession - 1);

			// Streams received by subscribers (from all publishers)
			const streamsReceivedBySubscribers =
				subscribersInSession * totalPublishersAcrossAllSessions;

			result +=
				streamsSent +
				streamsReceivedByPublishers +
				streamsReceivedBySubscribers;
		}

		return result;
	}
}
