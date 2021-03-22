/**
 * Partial DOM type implementation: `Partial<MediaStreamTrack>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

// https://www.w3.org/TR/mediacapture-streams/#mediastreamtrack
export class MediaStreamTrack {
	public readonly kind: string;

	constructor(initDict: Partial<MediaStreamTrack>) {
		Object.assign(this, initDict);
	}

	public stop(): void {}
}
