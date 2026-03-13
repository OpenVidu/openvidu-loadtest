import { runQoEAnalysisNonBlocking } from '../utils/qoe-analysis-utils.js';
import type { JSONQoeProcessing } from '../types/json.type.ts';
import type { LocalFilesRepository } from '../repositories/files/local-files.repository.ts';
import type { LocalFilesService } from './files/local-files.service.ts';

export class QoeAnalyzerService {
	private readonly localFilesService: LocalFilesService;
	private readonly localFilesRepository: LocalFilesRepository;
	private remainingFiles = 0;

	constructor(
		localFilesService: LocalFilesService,
		localFilesRepository: LocalFilesRepository,
	) {
		this.localFilesService = localFilesService;
		this.localFilesRepository = localFilesRepository;
	}

	public getRemainingFiles(): number {
		return this.remainingFiles;
	}

	// Width, Height and Framerate are mandatory if the video used is custom, else it can be inferred from the downloaded preset media file
	public async runQoEAnalysis(
		fragmentDuration: number,
		paddingDuration: number,
		width?: number,
		height?: number,
		framerate?: number,
	) {
		const presenterVideoFile = this.localFilesRepository.fakevideo;
		const presenterAudioFile = this.localFilesRepository.fakeaudio;
		if (presenterVideoFile && presenterAudioFile) {
			const fakeVideoProperties =
				this.localFilesService.fakeVideoProperties;
			if (!fakeVideoProperties && (!width || !height || !framerate)) {
				throw new Error(
					'Presenter video properties (width, height, framerate) are required when using a custom video file',
				);
			}
			const processingInfo: JSONQoeProcessing = {
				fragment_duration: fragmentDuration,
				padding_duration: paddingDuration,
				framerate: framerate ?? fakeVideoProperties!.fps,
				width: width ?? fakeVideoProperties!.width,
				height: height ?? fakeVideoProperties!.height,
				presenter_audio_file_location: presenterAudioFile,
				presenter_video_file_location: presenterVideoFile,
			};
			const files = await runQoEAnalysisNonBlocking(processingInfo, {
				onFileProcessed: () => {
					this.remainingFiles = Math.max(0, this.remainingFiles - 1);
				},
				onCompleted: () => {
					this.remainingFiles = 0;
				},
			});
			this.remainingFiles = files.length;
			return 'QoE analysis started';
		}
		this.remainingFiles = 0;
		return 'No presenter video properties found, QoE analysis not started. Did you forget to run a test?';
	}
}
