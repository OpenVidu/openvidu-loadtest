export type JsonPrimitive = string | number | boolean | Date | null;

// Extend with any other types we know are valid JSON for later stringification
export type JsonValue =
	| JSONStatsResponse
	| JSONStreamsInfo
	| JsonPrimitive
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface JSONStatsResponse {
	timestamp: string;
	user: string;
	session: string;
	webrtcStats: Record<string, JsonValue>;
}

export type JSONStreamsInfo = JSONUserInfo & {
	streams: number;
	worker_name: string;
	node_role: string;
};

export interface JSONUserInfo {
	'@timestamp': string;
	new_participant_id: string;
	new_participant_session: string;
}

export type JSONQoeProcessing = {
	padding_duration: number;
	fragment_duration: number;
	presenter_video_file_location: string;
	presenter_audio_file_location: string;
	width: number | string;
	height: number | string;
	framerate: number;
	timestamps?: JSONUserInfo[];
} & (ElasticsearchConfig | Partial<Record<keyof ElasticsearchConfig, never>>);

interface ElasticsearchConfig {
	elasticsearch_hostname: string;
	elasticsearch_username: string;
	elasticsearch_password: string;
	index: string;
}

export interface JSONQoEInfo {
	'@timestamp': string;
	session: string;
	userFrom: string;
	userTo: string;
	cutIndex: number;
	vmaf: number;
	vifp: number;
	ssim: number;
	psnr: number;
	msssim: number;
	psnrhvs: number;
	psnrhvsm: number;
	pesq: number;
	visqol: number;
}
