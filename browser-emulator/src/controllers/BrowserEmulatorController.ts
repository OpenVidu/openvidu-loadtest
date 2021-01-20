import * as express from 'express';
import { Request, Response } from 'express';
var osu = require('node-os-utils');
export const app = express.Router({
    strict: true
});

app.get("/cpu", async (req: Request, res: Response) => {
	try {
		const cpuUsage = await osu.cpu.usage();
		console.log('CPU usage: ' + cpuUsage + '%');
		res.status(200).send({cpuUsage});
	} catch (error) {
		console.log(error);
		res.status(500).send(error);
	}
});

app.get("/capacity", (req: Request, res: Response) => {

		const typology: string = req.query.typology.toString();
		let capacity: number = 0;

		if(typology === 'N:N'){
			capacity = 10;
		}

		console.log('Capacity of ' + typology + ' sessions is: ' + capacity);
		res.status(200).send({capacity});
});

