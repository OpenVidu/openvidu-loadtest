import { BrowserManagerService } from './browser-manager.service.js';
import { runQoEAnalysisNonBlocking } from '../utils/qoe-analysis-utils.js';
import type { JSONQoeProcessing } from '../types/json.type.ts';

export class QoeAnalyzerService {
	private readonly browserManagerService: BrowserManagerService;

	constructor(browserManagerService: BrowserManagerService) {
		this.browserManagerService = browserManagerService;
	}

	public async runQoEAnalysis(
		fragmentDuration: number,
		paddingDuration: number,
	) {
		const lastRequest = this.browserManagerService.lastRequestInfo;
		if (lastRequest) {
			const properties = lastRequest.properties;
			if (properties) {
				const framerate: number = properties.frameRate;
				const dim: string[] = properties.resolution.split('x');
				const width: string = dim[0];
				const height: string = dim[1];
				const PRESENTER_VIDEO_FILE_LOCATION = `${process.cwd()}/src/assets/mediafiles/fakevideo_${framerate}fps_${properties.resolution}.y4m`;
				const PRESENTER_AUDIO_FILE_LOCATION = `${process.cwd()}/src/assets/mediafiles/fakeaudio.wav`;
				const processingInfo: JSONQoeProcessing = {
					fragment_duration: fragmentDuration,
					padding_duration: paddingDuration,
					framerate,
					width,
					height,
					presenter_audio_file_location:
						PRESENTER_AUDIO_FILE_LOCATION,
					presenter_video_file_location:
						PRESENTER_VIDEO_FILE_LOCATION,
				};
				await runQoEAnalysisNonBlocking(processingInfo);
				return 'QoE analysis started';
			}
		}
		return 'No recordings to analyze';
	}
}
