import WebSocket = require("ws");

export class WsService {

	protected static instance: WsService;

	private readonly RETRY_TIME_MS = 3000;
	private readonly CONNECTING = 0;
	private readonly OPEN = 1;
	private readonly CLOSING = 2;
	private readonly CLOSED = 3;
	private interval: NodeJS.Timeout;
	private ws: WebSocket;
	private wsUri: string;
	private reconnecting = false;
	private forcedClose = false;
	private constructor() {}

	static getInstance(): WsService {
		if (!WsService.instance) {
			WsService.instance = new WsService();
		}
		return WsService.instance;
	}

	startWs(wsuri: string, callback: Function) {
		if (this.ws?.readyState === this.OPEN) {
			callback();
		} else {
			this.close();
			this.wsUri = wsuri;
			this.ws = new WebSocket(this.wsUri);
			this.ws.onopen = this.onOpen.bind(this, callback);
			this.ws.onerror = this.onError.bind(this);
			this.ws.onclose = this.onClose.bind(this);
		}
	}

	send(message: string) {
		if (this.ws?.readyState === this.OPEN) {
			this.ws.send(message);
		}
	}

	private onOpen(callback: Function) {
		clearInterval(this.interval);
		this.reconnecting = false;
		this.forcedClose = false;
		console.log("WebSocket connected to " + this.wsUri);

		callback();
	}

	private onError() {
		if (!this.reconnecting) {
			this.reconnecting = true;
			this.interval = setInterval(() => {
				this.reconnect();
			}, this.RETRY_TIME_MS);
		}
	}

	private onClose() {
		if (this.forcedClose) {
			this.forcedClose = false;
		} else {
			console.debug("Connection closed unexpectecly.");
			this.reconnect();
		}
	}

	private close() {
		this.forcedClose = true;
		this.ws?.close();
	}

	private reconnect() {
		if (this.ws.readyState !== this.OPEN) {
			console.debug(`Connecting websocket to ${this.wsUri} ...`);
			this.startWs(this.wsUri, () => console.log("Reconnected"));
		}
	}
}
