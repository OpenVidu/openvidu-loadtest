import * as express from 'express';
import { Request, Response } from 'express';
import { exec } from 'child_process';

export const app = express.Router({
    strict: true
});

app.post('/restart', async (req: Request, res: Response) => {
	try {
		console.log('Restarting browser-emulator');
		res.status(200).send();
		exec('forever restartall');
	} catch (error) {
		res.status(500).send(error);
	}
});

app.get('/ping', (req: Request, res: Response) => {
	res.status(200).send('Pong');
});