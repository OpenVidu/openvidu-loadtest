
/*
 *
 *	KMS: This kind of user will get the media through Kurento Media Server, reading an mp4 video file as input and sending it with WebRTC.
 *			This strategy will reduce the CPU usage because of avoid the transcoding
 *
 *	NODE_WEBRTC_FFMPEG: This kind of user will get the media from a video file through ffmpeg, using node-wrtc therefore transcoding will be used for sending the media
 *
 *
 *  NODE_WEBRTC_CANVAS: This kind of user will get the media through node-canvas, using node-wrtc therefore transcoding will be used for sending the media
 *
 * */

export enum EmulatedUserType {

	KMS = 'KMS',
	NODE_WEBRTC_CANVAS = 'NODE_WEBRTC_CANVAS',
	NODE_WEBRTC_FFMPEG = 'NODE_WEBRTC_FFMPEG'
}

export enum ApplicationMode {
	PROD = 'PRODUCTION',
	DEV = 'DEVELOPMENT'
}