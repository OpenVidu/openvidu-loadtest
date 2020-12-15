import * as express from "express";
import { SERVER_PORT, OPENVIDU_URL, OPENVIDU_SECRET } from "./config";
import { Hack } from "./extra/hack";
import {app as ovBrowserController} from './controllers/OpenViduBrowserController';
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.use('/openvidu-browser', ovBrowserController);

app.listen(SERVER_PORT, () => {
	const hack = new Hack();

	hack.openviduBrowser();
	hack.webrtc();
	hack.websocket();

	console.log("---------------------------------------------------------");
	console.log(" ");
	console.log(`OPENVIDU URL: ${OPENVIDU_URL}`);
	console.log(`OPENVIDU SECRET: ${OPENVIDU_SECRET}`);
	console.log(`Listening in port ${SERVER_PORT}`);
	console.log(" ");
	console.log("---------------------------------------------------------");
});