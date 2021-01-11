import * as express from 'express';
import { Request, Response } from 'express';
import { OpenViduBrowser } from '../openvidu-browser/openvidu-browser';
import { OpenViduRole } from '../openvidu-browser/OpenVidu/OpenviduRole';

export const app = express.Router({
    strict: true
});

const ovBrowser: OpenViduBrowser = new OpenViduBrowser();


app.post("/streamManager", async (req: Request, res: Response) => {
	try {
		const userId: string = req.body.userId;
		const sessionName: string = req.body.sessionName;
		const role: string = req.body.role;
		let connectionId: string;
		if(!userId || !sessionName){
			console.log(req.body);
			return res.status(400).send("Problem with some body parameter");
		}
		if(!!role && (role === OpenViduRole.PUBLISHER || role === OpenViduRole.SUBSCRIBER)) {
			connectionId = await ovBrowser.createStreamManager(userId, sessionName, role);
		} else {
			return res.status(400).send("Problem with role body parameter. Must be 'PUBLISHER' or 'SUBSCRIBER'");
		}
		console.log('Created ' + role + ' ' +  userId + ' in session ' + sessionName);
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