import type { JsonValue } from './json.type.ts';
import type { Request } from 'express';

export interface BrowserEventRequest extends Request {
	body: BrowserEvent;
}

export interface BrowserEvent {
	participant: string;
	session: string;
	timestamp: Date;
	[key: string]: JsonValue;
}
