package io.openvidu.loadtest.services.core;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.models.testcase.EgressConfig;
import io.openvidu.loadtest.models.testcase.EgressJob;
import io.openvidu.loadtest.models.testcase.EgressType;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.services.LiveKitEgressClient;
import io.openvidu.loadtest.services.LiveKitEgressClient.ParticipantTracks;
import io.openvidu.loadtest.services.Sleeper;

/**
 * Runs the recordings a test case asks for, alongside the load.
 *
 * <p>
 * Recordings start once every participant is connected and stop before the
 * results report is written, so the report covers a known number of recordings
 * running for a known window. That window is what makes the CPU cost of a
 * recording measurable: compare node CPU while recording against the same load
 * without it.
 *
 * <p>
 * A recording that fails to start is reported and does not stop the test: the
 * rest of the load is still valid data, and the report shows exactly which jobs
 * ran and which did not.
 */
class LoadTestEgressOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(LoadTestEgressOrchestrator.class);

    private final LiveKitEgressClient egressClient;
    private final Sleeper sleeper;

    private final List<EgressJob> jobs = new ArrayList<>();

    LoadTestEgressOrchestrator(LiveKitEgressClient egressClient, Sleeper sleeper) {
        this.egressClient = egressClient;
        this.sleeper = sleeper;
    }

    /**
     * Starts the recordings configured for this test case on the given rooms.
     * Does nothing when the test case has no {@code egress} block.
     */
    void startEgressIfConfigured(TestCase testCase, List<String> rooms) {
        EgressConfig config = testCase.getEgress();
        if (!config.isEnabled()) {
            return;
        }
        if (!egressClient.isAvailable()) {
            log.error("Test case requests {} recording but the platform is not a LiveKit deployment. "
                    + "Recording skipped.", config.getType());
            return;
        }
        if (rooms.isEmpty()) {
            log.warn("Test case requests {} recording but no room was created. Recording skipped.",
                    config.getType());
            return;
        }

        List<String> roomsToRecord = selectRooms(rooms, config.getRooms());
        if (config.getStartAfterSeconds() > 0) {
            sleeper.sleep(config.getStartAfterSeconds(), "time before starting recordings");
        }

        log.info("Starting {} recording(s) of type {} ({} job(s) per room) on room(s) {}",
                roomsToRecord.size() * config.getJobsPerRoom(), config.getType(), config.getJobsPerRoom(),
                roomsToRecord);
        for (String room : roomsToRecord) {
            startRoomEgress(room, config);
        }
        long started = jobs.stream().filter(EgressJob::isStarted).count();
        log.info("{} of {} recording(s) started", started, jobs.size());
    }

    /** Stops every recording started by {@link #startEgressIfConfigured}. */
    void stopAllEgress() {
        List<EgressJob> runningJobs = jobs.stream().filter(EgressJob::isStarted)
                .filter(job -> job.getStoppedAt() == null).toList();
        if (runningJobs.isEmpty()) {
            return;
        }

        log.info("Stopping {} recording(s)", runningJobs.size());
        for (EgressJob job : runningJobs) {
            try {
                egressClient.stopEgress(job.getEgressId());
                job.setStoppedAt(Calendar.getInstance());
                log.info("Stopped {} recording {} of room {} after {}s", job.getType(), job.getEgressId(),
                        job.getRoom(), job.getDurationSeconds());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                job.setError("Interrupted while stopping recording");
                log.error("Interrupted while stopping recording {}", job.getEgressId());
                return;
            } catch (Exception e) {
                job.setError("Could not stop recording: " + e.getMessage());
                log.error("Could not stop recording {}: {}", job.getEgressId(), e.getMessage());
            }
        }
    }

    List<EgressJob> getJobs() {
        return List.copyOf(jobs);
    }

    void cleanup() {
        jobs.clear();
    }

    private void startRoomEgress(String room, EgressConfig config) {
        if (config.getType() == EgressType.ROOM_COMPOSITE) {
            record(config.getType(), room, "", () -> egressClient.startRoomComposite(room, config));
            return;
        }

        List<ParticipantTracks> participants = resolveParticipants(room, config);
        if (participants.isEmpty()) {
            jobs.add(EgressJob.failed(config.getType(), room, "",
                    "No participant with the tracks this recording type needs was found in the room"));
            log.error("Cannot start {} recording of room {}: no suitable participant found", config.getType(), room);
            return;
        }

        for (ParticipantTracks participant : participants) {
            switch (config.getType()) {
                case PARTICIPANT -> record(config.getType(), room, participant.identity(),
                        () -> egressClient.startParticipant(room, participant.identity(), config));
                case TRACK_COMPOSITE -> record(config.getType(), room, participant.identity(),
                        () -> egressClient.startTrackComposite(room, participant, config));
                case TRACK -> {
                    // One job per track, so a room of N publishers can produce 2N jobs
                    String videoTrackId = participant.videoTrackId();
                    String audioTrackId = participant.audioTrackId();
                    if (!config.isAudioOnly() && !videoTrackId.isBlank()) {
                        record(config.getType(), room, videoTrackId,
                                () -> egressClient.startTrack(room, videoTrackId, config));
                    }
                    if (!audioTrackId.isBlank()) {
                        record(config.getType(), room, audioTrackId,
                                () -> egressClient.startTrack(room, audioTrackId, config));
                    }
                }
                default -> log.warn("Unsupported recording type {}", config.getType());
            }
        }
    }

    /**
     * Participants of the room to record, capped at {@code jobsPerRoom}. Track and
     * track-composite recordings need actual track ids, so only participants that
     * are publishing are eligible.
     */
    private List<ParticipantTracks> resolveParticipants(String room, EgressConfig config) {
        try {
            List<ParticipantTracks> publishing = egressClient.listParticipants(room).stream()
                    .filter(participant -> config.getType() == EgressType.PARTICIPANT
                            ? !participant.audioTrackId().isBlank() || !participant.videoTrackId().isBlank()
                            : participant.hasAudioAndVideo())
                    .limit(config.getJobsPerRoom())
                    .toList();
            if (publishing.size() < config.getJobsPerRoom()) {
                log.warn("Room {} has only {} participant(s) suitable for {} recording, {} were requested",
                        room, publishing.size(), config.getType(), config.getJobsPerRoom());
            }
            return publishing;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Interrupted while listing participants of room {}", room);
            return List.of();
        } catch (Exception e) {
            log.error("Could not list participants of room {}: {}", room, e.getMessage());
            return List.of();
        }
    }

    private void record(EgressType type, String room, String target, EgressStarter starter) {
        try {
            String egressId = starter.start();
            jobs.add(new EgressJob(egressId, type, room, target, Calendar.getInstance()));
            log.info("Started {} recording {} of room {}{}", type, egressId, room,
                    target.isBlank() ? "" : " (" + target + ")");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            jobs.add(EgressJob.failed(type, room, target, "Interrupted while starting recording"));
            log.error("Interrupted while starting {} recording of room {}", type, room);
        } catch (Exception e) {
            jobs.add(EgressJob.failed(type, room, target, e.getMessage()));
            log.error("Could not start {} recording of room {}: {}", type, room, e.getMessage());
        }
    }

    private List<String> selectRooms(List<String> rooms, int requested) {
        if (requested <= 0 || requested >= rooms.size()) {
            return rooms;
        }
        return rooms.subList(0, requested);
    }

    @FunctionalInterface
    private interface EgressStarter {
        String start() throws Exception;
    }
}
