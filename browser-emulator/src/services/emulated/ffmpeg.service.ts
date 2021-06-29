const ffmpeg = require('fluent-ffmpeg');
const chunker = require('stream-chunker');
import { StreamOutput } from 'fluent-ffmpeg-multistream';
import wrtc = require('wrtc');
import { MediaStreamTracksResponse } from '../../types/emulate-webrtc.type';
import { IEmulateWebrtc } from './emulate-webrtc.interface';

interface CustomMediaStream {
	url: string;
	track: wrtc.MediaStreamTrack;
	options: string[];
	kind: string;
	width?: number;
	height?: number;
}

export class FfmpegService implements IEmulateWebrtc {
	private videoTrack: wrtc.MediaStreamTrack | boolean;
	private audioTrack: wrtc.MediaStreamTrack | boolean;
	private mediaStramTracksCreated: boolean = false;
	private readonly WIDTH = 640;
	private readonly HEIGHT = 480;

	constructor() {}

	async createMediaStreamTracks(
		video: boolean,
		audio: boolean
	): Promise<MediaStreamTracksResponse> {
		if (!this.mediaStramTracksCreated) {
			this.videoTrack = video;
			this.audioTrack = audio;

			if (audio || video) {
				await this.createMediaStreamTracksFromVideoFile(video, audio);
			}
		}

		return { videoTrack: this.videoTrack, audioTrack: this.audioTrack };
	}

	clean() {
		this.audioTrack = null;
		this.videoTrack = null;
		this.mediaStramTracksCreated = false;
	}

	private async createMediaStreamTracksFromVideoFile(
		video: boolean,
		audio: boolean
	) {
		let videoOutput = null;
		let audioOutput = null;

		const command = ffmpeg()
			.input(`${process.env.PWD}/src/assets/mediafiles/video.mkv`)
			.inputOptions(['-stream_loop -1', '-r 1']);

		if (video) {
			videoOutput = this.createVideoOutput();
			command.output(videoOutput.url).outputOptions(videoOutput.options);
		}

		if (audio) {
			audioOutput = this.createAudioOutput();
			command.output(audioOutput.url).outputOptions(audioOutput.options);
		}

		command.on('error', (err, stdout, stderr) => {
			console.error(err.message);
			//TODO: Catch this error for decline next request
			// this.exceptionFound = true;
			// this.exceptionMessage = 'Exception found in ffmpeg' + err.message;
		});

		command.run();

		this.videoTrack = videoOutput.track;
		this.audioTrack = audioOutput.track;
		this.mediaStramTracksCreated = true;
	}

	private createVideoOutput(): CustomMediaStream {
		const sourceStream = chunker(this.WIDTH * this.HEIGHT * 1.5);
		const source = new wrtc.nonstandard.RTCVideoSource();
		const ffmpegOptions = [
			'-f rawvideo',
			// '-c:v rawvideo',
			`-s ${this.WIDTH}x${this.HEIGHT}`,
			'-pix_fmt yuv420p',
			'-r 24',
		];

		sourceStream.on('data', (chunk) => {
			const data = {
				width: this.WIDTH,
				height: this.HEIGHT,
				data: new Uint8ClampedArray(chunk),
			};
			source.onFrame(data);
		});

		const output = StreamOutput(sourceStream);
		output.track = source.createTrack();
		output.options = ffmpegOptions;
		output.kind = 'video';
		output.width = this.WIDTH;
		output.height = this.HEIGHT;

		return output;
	}
	private createAudioOutput(): CustomMediaStream {
		const sampleRate = 48000;
		const sourceStream = chunker((2 * sampleRate) / 100);
		const source = new wrtc.nonstandard.RTCAudioSource();
		const ffmpegOptions = ['-f s16le', '-ar 48k', '-ac 1'];
		sourceStream.on('data', (chunk) => {
			const data = {
				samples: new Int16Array(
					chunk.buffer.slice(
						chunk.byteOffset,
						chunk.byteOffset + chunk.length
					)
				),
				sampleRate,
			};

			source.onData(data);
		});

		const output = StreamOutput(sourceStream);
		output.track = source.createTrack();
		output.options = ffmpegOptions;
		output.kind = 'audio';

		return output;
	}
}
