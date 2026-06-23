export interface ParticipantHandle {
	participantId: string;
	handleId: string;
	sessionName: string;
	userName: string;
	videoSocket?: string;
	audioSocket?: string;
	createdAt: Date;
}

export interface EmulatedParticipantLauncher {
	readonly mode: 'docker' | 'direct';

	createParticipant(
		command: string[],
		participantId: string,
		sessionName: string,
		userName: string,
		videoSocket?: string,
		audioSocket?: string,
	): Promise<ParticipantHandle>;

	isRunning(handleId: string): Promise<boolean>;

	getLogs(handleId: string): Promise<string>;

	stop(handleId: string): Promise<void>;
}
