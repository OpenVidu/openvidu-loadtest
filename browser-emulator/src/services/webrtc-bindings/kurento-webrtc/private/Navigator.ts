/**
 * Partial DOM type implementation: `Partial<Navigator>`.
 * TypeScript DOM types can be found in `typescript/lib/lib.dom.d.ts`.
 */

import { MediaDevices } from './MediaDevices';

export class Navigator {
	// interface NavigatorID
	// =====================
	public readonly userAgent: string = 'KurentoWebRTC';

	// interface Navigator
	// ===================
	public readonly mediaDevices = new MediaDevices();
}
