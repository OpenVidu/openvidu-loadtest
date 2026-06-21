import { WebSocketServer, WebSocket } from 'ws';
import type { ConfigService } from './config.service.ts';
import type { LoggerService } from './logger.service.ts';
export class WsService {
	private readonly OPEN = 1;
	private ws: WebSocket | undefined;
	private server: WebSocketServer | undefined;
	private readonly configService: ConfigService;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(configService: ConfigService, loggerService: LoggerService) {
		this.configService = configService;
		this.logger = loggerService.getLogger('WsService');
	}

	initializeServer(): void {
		this.logger.info('Starting WebSocket server...');
		this.server = new WebSocketServer({
			port: this.configService.getWebsocketServerPort(),
			path: '/events',
		});

		this.server.on('error', error => {
			this.logger.error({ error }, 'WebSocket server error');
		});

		this.server.on('connection', (ws: WebSocket) => {
			ws.on('message', (data: Buffer) =>
				this.handleMessage(data.toString()),
			);
			this.ws = ws;
			this.logger.info('WebSocket connection established');
		});

		this.logger.info(
			'WebSocket server started on port %d',
			this.configService.getWebsocketServerPort(),
		);
	}

	async close(): Promise<void> {
		return new Promise(resolve => {
			if (this.server) {
				this.server.close(() => {
					this.logger.info('WebSocket server closed');
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	private handleMessage(message: string) {
		this.logger.info('Received message: %s', message);
	}

	send(message: string) {
		try {
			if (!!this.ws && this.ws.readyState === this.OPEN) {
				this.ws.send(message);
				this.logger.info('Message was sent: %s', message);
			}
		} catch {
			this.logger.info('Error sending WS message');
		}
	}
}
