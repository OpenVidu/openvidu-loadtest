import * as express from 'express';
import { Request, Response } from 'express';
import { OpenViduBrowser } from '../openvidu-browser/openvidu-browser';
import { OpenViduRole, PublisherProperties } from '../openvidu-browser/OpenVidu/OpenviduTypes';

export const app = express.Router({
    strict: true
});

const ovBrowser: OpenViduBrowser = new OpenViduBrowser();


app.post("/streamManager", async (req: Request, res: Response) => {
	try {
		const openviduSecret: string = req.body.openviduSecret;
		const openviduUrl: string = req.body.openviduUrl;
		const userId: string = req.body.userId;
		const sessionName: string = req.body.sessionName;
		const properties: PublisherProperties = req.body.properties;
		process.env.OPENVIDU_URL = openviduUrl;
		process.env.OPENVIDU_SECRET = openviduSecret;
		let connectionId: string;
		if(!userId || !sessionName || !openviduUrl || !openviduSecret){
			console.log(req.body);
			return res.status(400).send("Problem with some body parameter");
		}
		if(!!properties && (properties.role === OpenViduRole.PUBLISHER || properties.role === OpenViduRole.SUBSCRIBER)) {
			connectionId = await ovBrowser.createStreamManager(userId, sessionName, properties);
		} else {
			return res.status(400).send("Problem with properties body parameter. Must contain 'PUBLISHER' or 'SUBSCRIBER' role property");
		}
		console.log('Created ' + properties.role + ' ' +  userId + ' in session ' + sessionName);
		res.status(200).send({connectionId});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.delete("/streamManager/connection/:connectionId", (req: Request, res: Response) => {
	try {
		const connectionId: string = req.params.connectionId;

		if(!connectionId){
			return res.status(400).send("Problem with connectionId parameter. IT DOES NOT EXIST");
		}
		console.log("Deleting streams with connectionId: " + connectionId);
		ovBrowser.deleteStreamManagerWithConnectionId(connectionId);
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.delete("/streamManager/role/:role", (req: Request, res: Response) => {
	try {
		const role: any = req.params.role;
		if(!role){
			return res.status(400).send("Problem with ROLE parameter. IT DOES NOT EXIST");
		}else if(role !== OpenViduRole.PUBLISHER && role !== OpenViduRole.SUBSCRIBER ){
			return res.status(400).send("Problem with ROLE parameter. IT MUST BE 'PUBLISHER' or 'SUBSCRIBER'");
		}

		console.log("Deleting streams with ROLE:" + role);
		ovBrowser.deleteStreamManagerWithRole(role);
		res.status(200).send({});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});