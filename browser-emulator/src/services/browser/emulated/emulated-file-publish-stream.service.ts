import type { ContainerCreateOptions } from 'dockerode';
import { LocalFilesRepository } from '../../../repositories/files/local-files.repository.ts';
import type { ConfigService } from '../../config.service.ts';
import type { DockerService } from '../../docker.service.ts';

export class EmulatedFilePublishStreamService {
	private readonly DOCKER_IMAGE = 'jrottenberg/ffmpeg:8-alpine';
	private readonly dockerService: DockerService;
	private readonly configService: ConfigService;
	private readonly localFilesRepository: LocalFilesRepository;
	private containerNameList: string[] = [];

	private readonly beginFfmpegArgs = ['-re', '-stream_loop', '-1', '-i'];
	private readonly endFfmpegVideoArgs = [
		'-c:v',
		'libx264',
		'-bsf:v',
		'h264_mp4toannexb',
		'-b:v',
		'2M',
		'-profile:v',
		'baseline',
		'-pix_fmt',
		'yuv420p',
		'-x264-params',
		'keyint=120',
		'-max_delay',
		'0',
		'-bf',
		'0',
		'-f',
		'h264',
		'tcp://0.0.0.0:5004?listen=1',
	];
	private readonly endFfmpegAudioArgs = [
		'-c:a',
		'libopus',
		'-page_duration',
		'20000',
		'-vn',
		'-f',
		'opus',
		'tcp://0.0.0.0:5005?listen=1',
	];

	constructor(
		dockerService: DockerService,
		configService: ConfigService,
		localFilesRepository: LocalFilesRepository,
	) {
		this.dockerService = dockerService;
		this.configService = configService;
		this.localFilesRepository = localFilesRepository;
	}

	public async startEmulatedStreams(
		containerName: string,
		video: boolean,
		audio: boolean,
	) {
		if (video && !this.localFilesRepository.fakevideo) {
			throw new Error(
				'WARNING! Video file not found. Have you downloaded the media files?',
			);
		}
		if (audio && !this.localFilesRepository.fakeaudio) {
			throw new Error(
				'WARNING! Audio file not found. Have you downloaded the media files?',
			);
		}
		if (!(await this.dockerService.imageExists(this.DOCKER_IMAGE))) {
			console.log(
				`Pulling Docker image ${this.DOCKER_IMAGE} for emulated stream publishing...`,
			);
			await this.dockerService.pullImage(this.DOCKER_IMAGE);
		}
		// Parameters for ffmpeg gotten from https://github.com/livekit/server-sdk-go/tree/main#publishing-tracks-to-room
		// TODO: Study if optimizations could be made, or transcoding could be avoided by using directly the correct codecs and parameters in the input files
		// Already tried to encode an h264 file with the same parameters and using it, it ends up crashing the ffmpeg instance after the first loop
		const containerConfig: ContainerCreateOptions = {
			Image: 'jrottenberg/ffmpeg:8-alpine',
			name: containerName,
			Cmd: this.buildFfmpegCommand(video, audio),
			HostConfig: {
				Binds: [
					`${this.configService.getMediaFilesHostDir()}:/app/mediafiles/:ro`,
				],
				AutoRemove: true,
				NetworkMode:
					this.configService.getDockerizedBrowsersConfig()
						.networkName,
			},
		};
		await this.dockerService.startContainer(containerConfig);
		this.containerNameList.push(containerName);
		console.log(
			`Started ffmpeg container ${containerName} to publish emulated streams`,
		);
		const logsPath = `${this.configService.getScriptsLogsHostDir()}/${containerName}.log`;
		void this.dockerService.streamContainerLogs(containerName, logsPath);
	}

	public async stopPublishing() {
		for (const containerName of this.containerNameList) {
			console.log(
				`Stopping ffmpeg container ${containerName} that publishes emulated streams...`,
			);
			await this.dockerService.stopContainer(containerName);
		}
		this.containerNameList = [];
		console.log(
			`Stopped all ffmpeg containers for emulated stream publishing`,
		);
	}

	private buildFfmpegCommand(video: boolean, audio: boolean): string[] {
		const command: string[] = [];
		const isVideoEnabled = video && this.localFilesRepository.fakevideo;
		const isAudioEnabled = audio && this.localFilesRepository.fakeaudio;
		if (isVideoEnabled) {
			command.push(
				...this.beginFfmpegArgs,
				this.localFilesRepository.fakevideo,
			);
		}
		if (isAudioEnabled) {
			command.push(
				...this.beginFfmpegArgs,
				this.localFilesRepository.fakeaudio,
			);
		}
		let tracks = 0;
		if (isVideoEnabled) {
			command.push('-map', '0:v', ...this.endFfmpegVideoArgs);
			tracks++;
		}
		if (isAudioEnabled) {
			command.push('-map', `${tracks}:a`, ...this.endFfmpegAudioArgs);
		}
		return command;
	}
}
