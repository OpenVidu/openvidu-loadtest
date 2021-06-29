const {
	RTCVideoSource,
	RTCAudioSource,
	rgbaToI420,
} = require('wrtc').nonstandard;
import { Canvas, createCanvas, Image, loadImage } from 'canvas';
import { MediaStreamTracksResponse } from '../../types/emulate-webrtc.type';
import { IEmulateWebrtc } from './emulate-webrtc.interface';

export class CanvasService implements IEmulateWebrtc {
	private readonly MIN_FREQUENCY = 500;
	private readonly MAX_FREQUENCY = 1000;

	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;
	private videoSource;
	private videoTrack: MediaStreamTrack | boolean = true;
	private canvas: Canvas;
	private context;
	private myimg: Image;
	private MIN = 0;
	private canvasInterval: NodeJS.Timer;
	private CANVAS_MAX_HEIGHT: number;
	private CANVAS_MAX_WIDTH: number;

	constructor() {
		this.initializeVideoCanvas();
	}

	async createMediaStreamTracks(
		video: boolean,
		audio: boolean
	): Promise<MediaStreamTracksResponse> {
		let response: MediaStreamTracksResponse = {
			videoTrack: null,
			audioTrack: null,
			audioTrackInterval: null,
		};
		if (audio) {
			const audioObject = this.initializeAudio();
			response.audioTrack = audioObject.audioTrack;
			response.audioTrackInterval = audioObject.audioTrackInterval;
		}

		if (video) {
			if (!this.canvasInterval) {
				this.startVideoCanvasInterval();
			}
			response.videoTrack = this.videoTrack;
		}

		return response;
	}

	clean() {
		if (this.canvasInterval) {
			clearInterval(this.canvasInterval);
		}
	}

	private async initializeVideoCanvas() {
		this.videoSource = new RTCVideoSource();
		this.videoTrack = this.videoSource.createTrack();
		this.canvas = createCanvas(this.WIDTH, this.HEIGHT);
		this.context = this.canvas.getContext('2d');
		this.myimg = await loadImage('src/assets/images/openvidu_logo.png');
		this.context.fillStyle = 'black';
		this.context.fillRect(0, 0, this.WIDTH, this.HEIGHT);
		this.CANVAS_MAX_WIDTH = this.WIDTH - this.myimg.width;
		this.CANVAS_MAX_HEIGHT = this.HEIGHT - this.myimg.height;
	}

	private initializeAudio(): {
		audioTrack: MediaStreamTrack;
		audioTrackInterval: NodeJS.Timer;
	} {
		const options = {
			channelCount: 1,
			sampleRate: 30000,
			frequency: Math.floor(
				Math.random() * (this.MAX_FREQUENCY - this.MIN_FREQUENCY) +
					this.MIN_FREQUENCY
			),
			time: 0,
		};
		const bitsPerSample = 16;
		const maxValue = Math.pow(2, bitsPerSample) / 2 - 1;
		const numberOfFrames = options.sampleRate / 100;
		const secondsPerSample = 1 / options.sampleRate;
		const audioSource = new RTCAudioSource();
		const samples = new Int16Array(options.channelCount * numberOfFrames);

		const data = {
			samples,
			sampleRate: options.sampleRate,
			bitsPerSample,
			channelCount: options.channelCount,
			numberOfFrames,
		};

		const audioInterval = setInterval(() => {
			for (let i = 0; i < numberOfFrames; i++) {
				options.time += secondsPerSample;
				for (let j = 0; j < options.channelCount; j++) {
					samples[i * options.channelCount + j] =
						Math.sin(
							2 * Math.PI * options.frequency * options.time
						) * maxValue;
				}
			}
			audioSource.onData(data);
		}, 50);

		return {
			audioTrack: audioSource.createTrack(),
			audioTrackInterval: audioInterval,
		};
	}

	private async startVideoCanvasInterval(timeoutMs: number = 30) {
		// Max 30 fps
		timeoutMs = timeoutMs < 30 ? 30 : timeoutMs;
		this.context.fillStyle =
			'#' + Math.floor(Math.random() * 16777215).toString(16);

		this.canvasInterval = setInterval(() => {
			const x = Math.floor(
				Math.random() * (this.CANVAS_MAX_WIDTH - this.MIN + 1) +
					this.MIN
			);
			const y = Math.floor(
				Math.random() * (this.CANVAS_MAX_HEIGHT - this.MIN + 1) +
					this.MIN
			);

			this.context.save();
			this.context.fillRect(0, 0, this.WIDTH, this.HEIGHT);
			this.context.drawImage(this.myimg, x, y);
			// this.context.font = "50px Verdana";
			// this.context.strokeText("Hello World!", 100, 100);

			this.context.restore();

			const rgbaFrame = this.context.getImageData(
				0,
				0,
				this.WIDTH,
				this.HEIGHT
			);
			const i420Frame = {
				width: this.WIDTH,
				height: this.HEIGHT,
				data: new Uint8ClampedArray(1.5 * this.WIDTH * this.HEIGHT),
			};
			rgbaToI420(rgbaFrame, i420Frame);
			this.videoSource.onFrame(i420Frame);
		}, timeoutMs);
	}
}
