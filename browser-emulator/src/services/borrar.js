


.es(index=openvidu, timefield=timestamp, q='event:sessionCreated').cusum().subtract(
    .es(index=openvidu, timefield=timestamp, q='event:sessionDestroyed').cusum()).color(color="#db00c5").label('Sessions').yaxis(2, min=0, label="Number of Sessions,Streams and Participants"),

    .es(index=openvidu, timefield=timestamp, q='event:webrtcConnectionCreated').cusum().subtract(.es(index=openvidu, timefield=timestamp, q='event:webrtcConnectionDestroyed').cusum()).color(color="#008afc").label('Streams').yaxis(2, min=0, label="Number of Sessions,Streams and Participants"),

    .es(index=openvidu, timefield=timestamp, q='event:participantJoined').cusum().subtract(.es(index=openvidu, timefield=timestamp, q='event:participantLeft').cusum()).color(color="#00e269").label('Participants').yaxis(2, min=0, label="Number of Sessions,Streams and Participants"),
    .es(index=metricbeat-*,q='fields.node_role:browseremulator',
        metric='avg:system.cpu.total.norm.pct').color(color="#000000").lines(fill=1)
    .multiply(100).label('Workers CPU').yaxis(1, label="Workers CPU Usage (%)", units="custom::%", tickDecimals=2),
    .es(index=metricbeat-*,q='fields.node_role:browseremulator',
        metric='avg:system.memory.used.pct').color(color="#ff0000").lines(fill=1)
    .multiply(100).label('Workers CPU').yaxis(1, label="Workers Mem Usage (%)", units="custom::%", tickDecimals=2),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='count:webrtc_stats.inbound.audio.bytesReceived').color(color="#68BC00").lines(fill=0)
    .label('Client Bytes Received').yaxis(3, position=right, min=0, label="Bytes Received / Sent"),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.audio.packetsReceived').color(color="#004909").lines(fill=0)
    .label('Client Audio Packets Received').yaxis(3, position=right, min=0, label="Bytes Received / Sent"),


    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.audio.packetsLost').color(color="#6b0303").lines(fill=0)
    .label('Client Audio Packets Lost').yaxis(4, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.audio.jitter').color(color="#0072ff").lines(fill=0)
    .label('Client AVG Audio Jitter').yaxis(5, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.bytesReceived').color(color="#59ff00").lines(fill=0)
    .label('Client Video Bytes Received').yaxis(3, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.packetsReceived').color(color="#007f30").lines(fill=0)
    .label('Client Video Packets Received').yaxis(3, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.packetsLost').color(color="#930000").lines(fill=0)
    .label('Client Video Packets Lost').yaxis(4, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.jitter').color(color="#7700ff").lines(fill=0)
    .label('Client Video Jitter').yaxis(5, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.jitterBufferDelay').color(color="#c300ff").lines(fill=0)
    .label('Client Video jitterBufferDelay').yaxis(5, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.framesDecoded').color(color="#539e7a").lines(fill=0)
    .label('Client Video framesDecoded').yaxis(6, position=right, min=0, label="Frames"),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.framesDropped').color(color="#6b6040").lines(fill=0)
    .label('Client Video framesDropped').yaxis(6, position=right, min=0, label="Frames"),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.inbound.video.framesReceived').color(color="#00bf4c").lines(fill=0)
    .label('Client Video framesReceived').yaxis(6, position=right, min=0, label="Frames"),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.outbound.audio.bytesSent').color(color="#55d189").lines(fill=0)
    .label('Client Audio bytesSent').yaxis(3, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.outbound.audio.packetsSent').color(color="#3c961e").lines(fill=0)
    .label('Client Audio packetsSent').yaxis(4, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.outbound.video.bytesSent').color(color="#004909").lines(fill=0)
    .label('Client Video bytesSent').yaxis(3, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.outbound.video.packetsSent').color(color="#5ec94e").lines(fill=0)
    .label('Client Video packetsSent').yaxis(3, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.outbound.video.framesEncoded').color(color="#bdd808").lines(fill=0)
    .label('Client Video framesEncoded').yaxis(6, position=right, min=0),

    .es(index=loadtest*, timefield=@timestamp, q='*',
        metric='avg:webrtc_stats.outbound.video.framesSent').color(color="#ffa100").lines(fill=0)
    .label('Client Video framesSent').yaxis(6, position=right, min=0),

    .es(index=metricbeat-*,q='fields.node_role:medianode',
        metric='avg:system.cpu.total.norm.pct').color(color="#0062B1").lines(fill=5)
    .multiply(100).label('Media Node CPU').yaxis(1, label="CPU Usage (%)", units="custom::%", tickDecimals=2),

    .es(index=metricbeat-*,q='fields.node_role:masternode',
        metric='avg:system.cpu.total.norm.pct').color(color="#FFE45B").lines(fill=5).multiply(100).label('Master Node CPU').yaxis(1, label="CPU Usage (%)", units="custom::%", tickDecimals=2)


