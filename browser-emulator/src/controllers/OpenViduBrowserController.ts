import * as express from 'express';
import { Request, Response } from 'express';
import { OpenViduBrowser } from '../openvidu-browser/openvidu-browser';

export const app = express.Router({
    strict: true
});

const ovBrowser: OpenViduBrowser = new OpenViduBrowser();

app.post("/publisher", async (req: Request, res: Response) => {
	try {
		const uid = req.body.uid;
		const sessionName = req.body.sessionName;
		if(!uid || !sessionName){
			res.status(400).send("Problem with some body parameter");
		}
		await ovBrowser.createPublisher(uid, sessionName);
		res.status(200).send('Created PUBLISHER ' +  uid + ' in session ' + sessionName);
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.post("/subscriber", async (req: Request, res: Response) => {
	try {
		const uid = req.body.uid;
		const sessionName = req.body.sessionName;
		if(!uid || !sessionName){
			res.status(400).send("Problem with some body parameter");
		}
		await ovBrowser.createSubscriber(uid, sessionName);
		res.status(200).send('Created SUBSCRIBER ' +  uid + ' in session ' + sessionName);
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.delete("/stream", (req: Request, res: Response) => {
	try {
		const uid = req.query.uid;
		const role = req.query.role;
		if(!uid && !role){
			res.status(400).send("Problem with some query parameter");
		}

		if(!!uid) {
			ovBrowser.deleteStreamManagerWithUid(uid);
		} else {
			ovBrowser.deleteStreamManagerWithRole(role);
		}
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});