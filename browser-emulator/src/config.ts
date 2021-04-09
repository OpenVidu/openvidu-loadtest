import { ApplicationMode, EmulatedUserType } from './types/config.type';

export const SERVER_PORT = Number(process.env.SERVER_PORT) || 5000;
export const EMULATED_USER_TYPE = process.env.EMULATED_USER_TYPE || EmulatedUserType.NODE_WEBRTC_CANVAS;
export const APPLICATION_MODE = process.env.APPLICATION_MODE || ApplicationMode.PROD;
