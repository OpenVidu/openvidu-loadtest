import * as express from 'express';
import { Request, Response } from 'express';
import { OpenViduBrowser } from '../openvidu-browser/openvidu-browser';

export const app = express.Router({
    strict: true
});

const ovBrowser: OpenViduBrowser = new OpenViduBrowser();

app.post("/publisher", async (req: Request, res: Response) => {
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

app.post("/subscriber", async (req: Request, res: Response) => {
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

app.delete("/stream", (req: Request, res: Response) => {
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