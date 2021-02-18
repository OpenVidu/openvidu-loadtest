export interface WebrtcStatsConfig {
    interval: number,
    httpEndpoint: string
}

export interface JSONStats {
    '@timestamp': string,
    participant_id: string,
    session_id: string,
    platform: string,
    platform_description: string,
    stream: string,
    webrtc_stats: any
}