import { WebSocketServer, WebSocket } from 'ws';
import { WEBSOCKET_PORT } from '../config.js';

export class WsService {
	protected static instance: WsService;
	private readonly OPEN = 1;
	private ws: WebSocket | undefined;

	private constructor() {}

	static getInstance(): WsService {
		if (!WsService.instance) {
			WsService.instance = new WsService();
		}
		return WsService.instance;
	}

    async initializeServer(): Promise<void> {
        return new Promise((resolve) => {
            console.log('Starting WebSocket server...');
            const server = new WebSocketServer({ port: WEBSOCKET_PORT, path: '/events' });
            server.on('connection', (ws: WebSocket) => {
                ws.on('message', this.handleMessage);
                this.ws = ws;
                console.log('WebSocket server created, connection established');
                resolve();
            });
        });
    }

	private handleMessage(message: string) {
		console.log('Received message: ' + message);
	}

	send(message: string) {
		try {
			if (!!this.ws && this.ws.readyState === this.OPEN) {
				this.ws.send(message);
				console.log('Message was sent: ', message);
			}
		} catch (error) {
			console.log('Error sending WS message');
		}
	}
}
