import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

const isProduction = process.env.NODE_ENV === 'production';

const baseLogger = pino({
	level,
	transport:
		isProduction || process.env.PINO_PRETTY === 'false'
			? undefined
			: {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:standard',
						ignore: 'pid,hostname',
					},
				},
});

export class LoggerService {
	public getLogger(name?: string): pino.Logger {
		return name ? baseLogger.child({ name }) : baseLogger;
	}

	public setLevel(newLevel: string): void {
		baseLogger.level = newLevel;
	}

	public getLevel(): string {
		return baseLogger.level;
	}
}

export default baseLogger;
