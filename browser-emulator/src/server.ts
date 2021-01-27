import * as express from "express";
import { SERVER_PORT } from "./config";
import { Hack } from "./extra/hack";
import {app as ovBrowserController} from './controllers/openvidu-browser';
import {app as browserEmulatorController} from './controllers/browser-emulator';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/browser-emulator', browserEmulatorController);
app.use('/openvidu-browser', ovBrowserController);

app.listen(SERVER_PORT, () => {
	const hack = new Hack();

	hack.openviduBrowser();
	hack.webrtc();
	hack.websocket();

	console.log("---------------------------------------------------------");
	console.log(" ");
	console.log(`Listening in port ${SERVER_PORT}`);
	console.log(" ");
	console.log("---------------------------------------------------------");
});