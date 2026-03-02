import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:https';

export class WsService {
	private readonly OPEN = 1;
	private ws: WebSocket | undefined;
	private server: WebSocketServer | undefined;

	initializeServer(httpServer: Server): void {
		console.log('Starting WebSocket server...');
		this.server = new WebSocketServer({
			server: httpServer,
			path: '/events',
		});

		this.server.on('error', error => {
			console.error('WebSocket server error:', error);
		});

		this.server.on('connection', (ws: WebSocket) => {
			ws.on('message', this.handleMessage);
			this.ws = ws;
			console.log('WebSocket connection established');
		});

		console.log('WebSocket server attached to HTTPS server');
	}

	async close(): Promise<void> {
		return new Promise(resolve => {
			if (this.server) {
				this.server.close(() => {
					console.log('WebSocket server closed');
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	private handleMessage(this: void, message: string) {
		console.log('Received message: ' + message);
	}

	send(message: string) {
		try {
			if (!!this.ws && this.ws.readyState === this.OPEN) {
				this.ws.send(message);
				console.log('Message was sent: ', message);
			}
		} catch {
			console.log('Error sending WS message');
		}
	}
}
