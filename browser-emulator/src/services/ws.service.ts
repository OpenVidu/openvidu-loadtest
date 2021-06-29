import WebSocket = require('ws');

export class WsService {
	protected static instance: WsService;
	private readonly CONNECTING = 0;
	private readonly OPEN = 1;
	private readonly CLOSING = 2;
	private readonly CLOSED = 3;
	private interval: NodeJS.Timeout;
	private ws: WebSocket;

	private constructor() {}

	static getInstance(): WsService {
		if (!WsService.instance) {
			WsService.instance = new WsService();
		}
		return WsService.instance;
	}

	setWebsocket(ws: WebSocket) {
		this.ws = ws;
		this.ws.on('message', this.handleMessage);
	}

	private handleMessage(message: string) {
		console.log('Received message: ' + message);
	}

	send(message: string) {
		try {
			if (this.ws?.readyState === this.OPEN) {
				this.ws.send(message);
				console.log('Message was sent: ', message);
			}
		} catch (error) {
			console.log('Error sending WS message');
		}
	}
}
