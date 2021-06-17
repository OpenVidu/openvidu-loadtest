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

	public ResultReport(int totalParticipants, int numSessionsCompleted, int numSessionsCreated, int workersUsed, List<Integer> streamsPerWorker,
			String sessionTypology, String browserModeSelected, String openviduRecording, boolean browserRecording, String participantsPerSession, String stopReason,
			Calendar startTime, Calendar endTime, String kibanaUrl) {
		this.totalParticipants = totalParticipants;
		this.numSessionsCompleted = numSessionsCompleted;
		this.numSessionsCreated = numSessionsCreated;
		this.workersUsed = workersUsed;
		this.streamsPerWorker = streamsPerWorker;
		this.sessionTypology = sessionTypology;
		this.openviduRecording = openviduRecording;
		this.browserModeSelected = browserModeSelected;
		this.browserRecording = browserRecording;
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
		if(minutes >= 60) {
			hours = (int) Math.floor(minutes / 60);
			minutes = minutes - (hours * 60);
		}
		return hours + "h " + minutes + "m " + seconds + "s ";
	}


	@Override
	public String toString() {

		return " ----- Test Case Report " +  startTime.getTime() + " ----- " + System.getProperty("line.separator")
				+ "Browser approach:	" + browserModeSelected + System.getProperty("line.separator")
				+ "Browser with recording:	" + browserRecording + System.getProperty("line.separator")
				+ "OpenVidu recording:	" + openviduRecording + System.getProperty("line.separator")
				+ "Session typology:	" + sessionTypology + System.getProperty("line.separator")
				+ "Participants per session:	" + participantsPerSession + System.getProperty("line.separator")
				+ "Number of sessions created:	" + numSessionsCreated + System.getProperty("line.separator")
				+ "Number of sessions completed:	" + numSessionsCompleted + System.getProperty("line.separator")
				+ "Number of participants created:	" + totalParticipants + System.getProperty("line.separator")
				+ "Number of workers used:	" + workersUsed + System.getProperty("line.separator")
				+ "Number of streams per workers:	" + streamsPerWorker + System.getProperty("line.separator")
				+ "Stop reason:	" + stopReason + System.getProperty("line.separator")
				+ "Test duration:	" + getDuration() + System.getProperty("line.separator")
				+ "Kibana url:	" + kibanaUrl + System.getProperty("line.separator")
				+ System.getProperty("line.separator")
				+ "   ---------------------   ";
	}

}
