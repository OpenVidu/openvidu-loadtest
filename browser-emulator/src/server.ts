import * as express from "express";
import { Request, Response } from 'express';

import { SERVER_PORT, OPENVIDU_URL, OPENVIDU_SECRET } from "./config";
import { Hack } from "./extra/hack";
import { OpenViduBrowser } from "./openvidu-browser/openvidu-browser";

const bodyParser = require("body-parser");
const app = express();

let ovBrowser: OpenViduBrowser;

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());


app.post("/openvidu-browser/publisher", async (req: Request, res: Response) => {
	try {
		console.log("UID", req.body);
		const uid = req.body.uid;
		await ovBrowser.createPublisher(uid);
		res.status(200).send({uid});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.post("/openvidu-browser/subscriber", async (req: Request, res: Response) => {
	try {
		const uid = req.body.uid;
		console.log("uid", uid)
		await ovBrowser.createSubscriber(uid);
		res.status(200).send({uid});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.delete("/openvidu-browser/stream", (req: Request, res: Response) => {
	try {
		const uid = req.query.uid;
		const role = req.query.role;
		if(!!uid) {
			ovBrowser.deleteStreamManagerWithUid(uid);
		}else {
			ovBrowser.deleteStreamManagerWithRole(role);
		}
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.listen(SERVER_PORT, () => {
	const hack = new Hack();

	hack.openviduBrowser();
	hack.webrtc();
	hack.websocket();
	ovBrowser = new OpenViduBrowser();

	console.log("---------------------------------------------------------");
	console.log(" ");
	console.log(`OPENVIDU URL: ${OPENVIDU_URL}`);
	console.log(`OPENVIDU SECRET: ${OPENVIDU_SECRET}`);
	console.log(`Listening in port ${SERVER_PORT}`);
	console.log(" ");
	console.log("---------------------------------------------------------");
});