import { BrowserManagerService } from './browser-manager.service';
import { ElasticSearchService } from './elasticsearch.service';
import { JSONQoeProcessing } from '../types/api-rest.type';
import { runQoEAnalysisNonBlocking } from '../utils/qoe-analysis-utils'

export class QoeAnalyzerService {

    private static instance: QoeAnalyzerService;

    constructor(
        private readonly elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance(),
        private readonly framerate: number = BrowserManagerService.getInstance().lastRequestInfo.properties.frameRate,
        private readonly width: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[0],
        private readonly height: string = BrowserManagerService.getInstance().lastRequestInfo.properties.resolution.split("x")[1],
        private readonly PRESENTER_VIDEO_FILE_LOCATION =
            `${process.env.PWD}/src/assets/mediafiles/fakevideo_${framerate}fps_${BrowserManagerService.getInstance().lastRequestInfo.properties.resolution}.y4m`,
        private readonly PRESENTER_AUDIO_FILE_LOCATION = `${process.env.PWD}/src/assets/mediafiles/fakeaudio.wav`,
        private FRAGMENT_DURATION: number = 5,
        private PADDING_DURATION: number = 1,
    ) { }

    static getInstance() {
        if (!QoeAnalyzerService.instance) {
            QoeAnalyzerService.instance = new QoeAnalyzerService();
        }
        return QoeAnalyzerService.instance;
    }

    public setDurations(fragment_duration: number, padding_duration: number) {
        this.FRAGMENT_DURATION = fragment_duration;
        this.PADDING_DURATION = padding_duration;
    }

    public async runQoEAnalysis() {
        const processingInfo: JSONQoeProcessing = {
            index: this.elasticSearchService.indexName,
            fragment_duration: this.FRAGMENT_DURATION,
            padding_duration: this.PADDING_DURATION,
            framerate: this.framerate,
            width: this.width,
            height: this.height,
            presenter_audio_file_location: this.PRESENTER_AUDIO_FILE_LOCATION,
            presenter_video_file_location: this.PRESENTER_VIDEO_FILE_LOCATION,
        }
        await runQoEAnalysisNonBlocking(processingInfo)
    }
}
