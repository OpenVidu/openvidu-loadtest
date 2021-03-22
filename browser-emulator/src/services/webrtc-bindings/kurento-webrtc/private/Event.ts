/**
 * Partial DOM type implementation: `Partial<Event>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

export class Event {
	/**
	 * Returns the type of event, e.g. "click", "hashchange", or "submit".
	 */
	readonly type: string;

	// https://dom.spec.whatwg.org/#event
	constructor(type: string) {
		this.type = type;
	}
}
