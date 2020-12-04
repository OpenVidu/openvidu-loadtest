import * as express from "express";
import { SERVER_PORT, OPENVIDU_URL, OPENVIDU_SECRET } from "./config";
import { Hack } from "./extra/hack";
import { OpenViduBrowser } from "./openvidu-browser/openvidu-browser";

const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(bodyParser.json());

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

app.post("/", async (req, res) => {
	const ovBrowser = new OpenViduBrowser();
	await ovBrowser.createPublisher();
});
