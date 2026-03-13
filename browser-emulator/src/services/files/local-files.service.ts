import { LocalFilesRepository } from '../../repositories/files/local-files.repository.ts';
import type { BrowserVideo } from '../../types/initialize.type.ts';

export class LocalFilesService {
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
		if (videoType.videoType === 'custom') {
			videoFile = `fakevideo_custom.y4m`;
			audioFile = `fakeaudio_custom.y4m`;
			videoUrl = videoType.customVideo.videoUrl;
			audioUrl = videoType.customVideo.audioUrl;
		} else {
			const videoInfo = videoType.videoInfo;
			videoFile = `fakevideo_${videoType.videoType}_${videoInfo.fps}fps_${videoInfo.width}x${videoInfo.height}.y4m`;
			videoUrl = `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}_${videoInfo.height}p_${videoInfo.fps}fps.y4m`;
			audioFile = `fakeaudio_${videoType.videoType}.wav`;
			audioUrl = `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}.wav`;
			this.fakeVideoFps = videoInfo.fps;
			this.fakeVideoWidth = videoInfo.width;
			this.fakeVideoHeight = videoInfo.height;
		}
		return this.localFilesRepository.downloadMediaFiles(
			videoFile,
			videoUrl,
			audioFile,
			audioUrl,
		);
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
