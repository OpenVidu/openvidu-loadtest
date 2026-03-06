import { LocalFilesRepository } from '../../repositories/files/local-files.repository.ts';
import type { BrowserVideo } from '../../types/api-rest.type.ts';

export class LocalFilesService {
	private readonly filesRepository: LocalFilesRepository;
	constructor(filesRepository: LocalFilesRepository) {
		this.filesRepository = filesRepository;
	}

	public async downloadBrowserMediaFiles(
		videoType: BrowserVideo,
	): Promise<string[]> {
		const videoInfo =
			videoType.videoType === 'custom'
				? videoType.customVideo.video
				: videoType.videoInfo;
		const videoFile = `fakevideo_${videoInfo.fps}fps_${videoInfo.width}x${videoInfo.height}.y4m`;
		const videoUrl =
			videoType.videoType === 'custom'
				? videoType.customVideo.video.url
				: `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}_${videoInfo.height}p_${videoInfo.fps}fps.y4m`;
		const audioFile = `fakeaudio.wav`;
		const audioUrl =
			videoType.videoType === 'custom'
				? videoType.customVideo.audioUrl
				: `https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/${videoType.videoType}.wav`;
		const promises = [
			this.filesRepository.downloadFile(
				videoFile,
				videoUrl,
				LocalFilesRepository.MEDIAFILES_DIR,
			),
			this.filesRepository.downloadFile(
				audioFile,
				audioUrl,
				LocalFilesRepository.MEDIAFILES_DIR,
			),
		];
		return Promise.all(promises);
	}
}
