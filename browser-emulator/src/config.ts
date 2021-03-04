import { EmulatedUserType } from './types/emulated-user.type';

export const SERVER_PORT = process.env.SERVER_PORT || 5000;
export const EMULATED_USER_TYPE = process.env.EMULATED_USER_TYPE || EmulatedUserType.NODE_WEBRTC;
