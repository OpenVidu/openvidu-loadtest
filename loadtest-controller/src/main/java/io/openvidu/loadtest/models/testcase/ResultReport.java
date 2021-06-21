package io.openvidu.loadtest.models.testcase;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class ResultReport {

	private int totalParticipants = 0;
	private int numSessionsCompleted = 0;
	private int numSessionsCreated = 0;
	private int workersUsed = 0;
	private List<Integer> streamsPerWorker = new ArrayList<>();
	private String sessionTypology;
	private String browserModeSelected;
	private boolean browserRecording;
	private String openviduRecording = "";
	private String participantsPerSession = "";
	private String stopReason = "";
	private Calendar startTime;
	private Calendar endTime;
	private String kibanaUrl = "";
	private boolean isManualParticipantAllocation = false;
	private int participantsPerWorker = 0;

	public ResultReport() {
	}

	public ResultReport build() {
		return new ResultReport(this.totalParticipants, this.numSessionsCompleted, this.numSessionsCreated,
				this.workersUsed, this.streamsPerWorker, this.sessionTypology, this.browserModeSelected,
				this.openviduRecording, this.browserRecording, this.isManualParticipantAllocation,
				this.participantsPerWorker, this.participantsPerSession, this.stopReason, this.startTime, this.endTime,
				this.kibanaUrl);
	}

	public ResultReport setManualParticipantAllocation(boolean isManualParticipantAllocation) {
		this.isManualParticipantAllocation = isManualParticipantAllocation;
		return this;
	}

	public ResultReport setTotalParticipants(int totalParticipants) {
		this.totalParticipants = totalParticipants;
		return this;
	}

	public ResultReport setNumSessionsCompleted(int numSessionsCompleted) {
		this.numSessionsCompleted = numSessionsCompleted;
		return this;
	}

	public ResultReport setParticipantsPerWorker(int participantsPerWorker) {
		this.participantsPerWorker = participantsPerWorker;
		return this;
	}

	public ResultReport setNumSessionsCreated(int numSessionsCreated) {
		this.numSessionsCreated = numSessionsCreated;
		return this;
	}

	public ResultReport setWorkersUsed(int workersUsed) {
		this.workersUsed = workersUsed;
		return this;
	}

	public ResultReport setStreamsPerWorker(List<Integer> streamsPerWorker) {
		this.streamsPerWorker = streamsPerWorker;
		return this;
	}

	public ResultReport setSessionTypology(String sessionTypology) {
		this.sessionTypology = sessionTypology;
		return this;
	}

	public ResultReport setBrowserModeSelected(String browserModeSelected) {
		this.browserModeSelected = browserModeSelected;
		return this;
	}

	public ResultReport setBrowserRecording(boolean browserRecording) {
		this.browserRecording = browserRecording;
		return this;
	}

	public ResultReport setOpenviduRecording(String openviduRecording) {
		this.openviduRecording = openviduRecording;
		return this;
	}

	public ResultReport setParticipantsPerSession(String participantsPerSession) {
		this.participantsPerSession = participantsPerSession;
		return this;
	}

	public ResultReport setStopReason(String stopReason) {
		this.stopReason = stopReason;
		return this;
	}

	public ResultReport setStartTime(Calendar startTime) {
		this.startTime = startTime;
		return this;
	}

	public ResultReport setEndTime(Calendar endTime) {
		this.endTime = endTime;
		return this;
	}

	public ResultReport setKibanaUrl(String kibanaUrl) {
		this.kibanaUrl = kibanaUrl;
		return this;
	}

	private ResultReport(int totalParticipants, int numSessionsCompleted, int numSessionsCreated, int workersUsed,
			List<Integer> streamsPerWorker, String sessionTypology, String browserModeSelected,
			String openviduRecording, boolean browserRecording, boolean manualParticipantsAllocation,
			int participantsPerWorker, String participantsPerSession, String stopReason, Calendar startTime,
			Calendar endTime, String kibanaUrl) {
		this.totalParticipants = totalParticipants;
		this.numSessionsCompleted = numSessionsCompleted;
		this.numSessionsCreated = numSessionsCreated;
		this.workersUsed = workersUsed;
		this.streamsPerWorker = streamsPerWorker;
		this.sessionTypology = sessionTypology;
		this.openviduRecording = openviduRecording;
		this.browserModeSelected = browserModeSelected;
		this.browserRecording = browserRecording;
		this.isManualParticipantAllocation = manualParticipantsAllocation;
		this.participantsPerWorker = participantsPerWorker;
		this.participantsPerSession = participantsPerSession;
		this.stopReason = stopReason;
		this.startTime = startTime;
		this.endTime = endTime;

		this.kibanaUrl = kibanaUrl;
	}

	private String getDuration() {
		int hours = 0;
		int minutes = 0;
		long diffInMillies = Math.abs(startTime.getTime().getTime() - endTime.getTime().getTime());
		int seconds = (int) TimeUnit.SECONDS.convert(diffInMillies, TimeUnit.MILLISECONDS);
		if (seconds >= 60) {
			minutes = (int) Math.floor(seconds / 60);
			seconds = seconds - (minutes * 60);
		}
		if (minutes >= 60) {
			hours = (int) Math.floor(minutes / 60);
			minutes = minutes - (hours * 60);
		}
		return hours + "h " + minutes + "m " + seconds + "s ";
	}

	@Override
	public String toString() {

		return " ----- Test Case Report " + startTime.getTime() + " ----- " + System.getProperty("line.separator")
				+ "Browser approach:	" + browserModeSelected + System.getProperty("line.separator")
				+ "Browser with recording:	" + browserRecording + System.getProperty("line.separator")
				+ "OpenVidu recording:	" + openviduRecording + System.getProperty("line.separator")
				+ "Session typology:	" + sessionTypology + System.getProperty("line.separator")
				+ "Participants per session:	" + participantsPerSession + System.getProperty("line.separator")
				+ "Number of sessions created:	" + numSessionsCreated + System.getProperty("line.separator")
				+ "Number of sessions completed:	" + numSessionsCompleted + System.getProperty("line.separator")
				+ "Number of participants created:	" + totalParticipants + System.getProperty("line.separator")
				+ "Number of workers used:	" + workersUsed + System.getProperty("line.separator")
				+ "Is manual participants allocation:	" + isManualParticipantAllocation
				+ System.getProperty("line.separator")
				+ (isManualParticipantAllocation
						? "Number of participants per worker:	" + participantsPerWorker
								+ System.getProperty("line.separator")
						: "")
				+ (isManualParticipantAllocation ? ""
						: "Number of streams per workers:	" + streamsPerWorker + System.getProperty("line.separator"))
				+ "Stop reason:	" + stopReason + System.getProperty("line.separator") + "Test duration:	"
				+ getDuration() + System.getProperty("line.separator") + "Kibana url:	" + kibanaUrl
				+ System.getProperty("line.separator") + System.getProperty("line.separator")
				+ "   ---------------------   ";
	}

}
