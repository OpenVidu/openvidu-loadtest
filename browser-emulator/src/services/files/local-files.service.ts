import { LocalFilesRepository } from '../../repositories/files/local-files.repository.ts';
import type { BrowserVideo } from '../../types/initialize.type.ts';

export class LocalFilesService {
	private static readonly S3_BASE_URL =
		'https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com';

	private readonly localFilesRepository: LocalFilesRepository;
	private fakeVideoFps: number | undefined;
	private fakeVideoWidth: number | undefined;
	private fakeVideoHeight: number | undefined;

	constructor(localFilesRepository: LocalFilesRepository) {
		this.localFilesRepository = localFilesRepository;
	}

	public async downloadBrowserMediaFiles(
		videoType: BrowserVideo,
	): Promise<string[]> {
		let videoFile, audioFile, videoUrl, audioUrl: string;
		let streamingVideoFile,
			streamingAudioFile,
			streamingVideoUrl,
			streamingAudioUrl: string;

		if (videoType.videoType === 'custom') {
			videoFile = 'fakevideo_custom.y4m';
			audioFile = 'fakeaudio_custom.wav';
			videoUrl = videoType.customVideo.videoUrl;
			audioUrl = videoType.customVideo.audioUrl;
			// Custom videos don't have pre-encoded streaming files on S3
			streamingVideoFile = '';
			streamingAudioFile = '';
			streamingVideoUrl = '';
			streamingAudioUrl = '';
		} else {
			const videoInfo = videoType.videoInfo;
			const typeName = videoType.videoType;
			const width = videoInfo.width;
			const height = videoInfo.height;
			const fps = videoInfo.fps;

			// QoE files (Y4M and WAV)
			videoFile = `fakevideo_${typeName}_${fps}fps_${width}x${height}.y4m`;
			videoUrl = `${LocalFilesService.S3_BASE_URL}/${typeName}_${height}p_${fps}fps.y4m`;
			audioFile = `fakeaudio_${typeName}.wav`;
			audioUrl = `${LocalFilesService.S3_BASE_URL}/${typeName}.wav`;

			// Streaming files (H.264 and Ogg) - same base naming, different extensions
			streamingVideoFile = `fakevideo_${typeName}_${fps}fps_${width}x${height}.h264`;
			streamingVideoUrl = `${LocalFilesService.S3_BASE_URL}/${typeName}_${height}p_${fps}fps.h264`;
			streamingAudioFile = `fakeaudio_${typeName}.ogg`;
			streamingAudioUrl = `${LocalFilesService.S3_BASE_URL}/${typeName}.ogg`;

			this.fakeVideoFps = fps;
			this.fakeVideoWidth = videoInfo.width;
			this.fakeVideoHeight = height;
		}

		// Download QoE media files (Y4M and WAV)
		const qoeFiles = await this.localFilesRepository.downloadMediaFiles(
			videoFile,
			videoUrl,
			audioFile,
			audioUrl,
		);

		if (streamingVideoUrl && streamingAudioUrl) {
			await this.localFilesRepository.downloadStreamingFiles(
				streamingVideoFile,
				streamingVideoUrl,
				streamingAudioFile,
				streamingAudioUrl,
			);
		}

		return qoeFiles;
	}

	public get fakeVideoProperties():
		| {
				fps: number;
				width: number;
				height: number;
		  }
		| undefined {
		if (
			this.fakeVideoFps !== undefined &&
			this.fakeVideoWidth !== undefined &&
			this.fakeVideoHeight !== undefined
		) {
			return {
				fps: this.fakeVideoFps,
				width: this.fakeVideoWidth,
				height: this.fakeVideoHeight,
			};
		}
		return undefined;
	}
}
