import { BrowserManagerService } from './browser-manager.service';
import { ElasticSearchService } from './elasticsearch.service';
import { JSONQoeProcessing } from '../types/api-rest.type';
import { runQoEAnalysisNonBlocking } from '../utils/qoe-analysis-utils'

export class QoeAnalyzerService {

    private static instance: QoeAnalyzerService;

    constructor(
        private readonly elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance(),
        private readonly browserManagerService: BrowserManagerService = BrowserManagerService.getInstance(),
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
        const lastRequest = this.browserManagerService.lastRequestInfo
        if (lastRequest) {
            const properties = lastRequest.properties
            if (properties) {
                const framerate: number = properties.frameRate
                const dim: string[] = properties.resolution.split("x")
                const width: string = dim[0]
                const height: string = dim[1]
                const PRESENTER_VIDEO_FILE_LOCATION =
                    `${process.env.PWD}/src/assets/mediafiles/fakevideo_${framerate}fps_${properties.resolution}.y4m`
                const PRESENTER_AUDIO_FILE_LOCATION = `${process.env.PWD}/src/assets/mediafiles/fakeaudio.wav`
                const processingInfo: JSONQoeProcessing = {
                    index: this.elasticSearchService.indexName,
                    fragment_duration: this.FRAGMENT_DURATION,
                    padding_duration: this.PADDING_DURATION,
                    framerate,
                    width,
                    height,
                    presenter_audio_file_location: PRESENTER_AUDIO_FILE_LOCATION,
                    presenter_video_file_location: PRESENTER_VIDEO_FILE_LOCATION,
                }
                await runQoEAnalysisNonBlocking(processingInfo)
                return 'QoE analysis started'
            }
        }
        return 'No recordings to analyze'
    }
}
