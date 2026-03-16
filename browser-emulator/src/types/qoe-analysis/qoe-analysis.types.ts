export interface QoeConfig {
	maxCpus?: number;
	allAnalysis?: boolean;
	debug?: boolean;
	onlyFiles?: boolean;
}

export interface AnalyzeQoEInput {
	viewerPath: string;
	presenterPath: string;
	presenterAudioPath: string;
	prefix: string;
	fragmentDurationSecs: number;
	paddingDurationSecs: number;
	width: number;
	height: number;
	fps: number;
	qoeConfig?: QoeConfig;
}

export interface CutWindow {
	cutIndex: number;
	startSeconds: number;
	endSeconds: number;
}

export interface DetectionState {
	isBeginPadding: boolean;
	isBeginningVideo: boolean;
	currentCutFrames: number;
	currentStartSeconds: number | null;
	cutIndex: number;
	previousEndSeconds: number | null;
}

export interface RegularFrameContext {
	isPadding: boolean;
	frameIndex: number;
	fps: number;
	fragmentDurationSecs: number;
	windows: CutWindow[];
}

export interface QoECutJson {
	cut_index: number;
	vmaf: number;
	visqol: number;
	msssim?: number;
	psnr?: number;
	psnrhvs?: number;
	ssim?: number;
	vifp?: number;
	psnrhvsm?: number;
	pesq?: number;
}

export interface PresenterArtifacts {
	presenterYuv: string;
	presenterWav: string;
	presenterPesqWav: string;
}

export interface OcrFrameArtifacts {
	rawDir: string;
	fullDir: string;
}
