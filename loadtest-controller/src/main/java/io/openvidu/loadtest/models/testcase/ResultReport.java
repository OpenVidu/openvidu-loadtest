package io.openvidu.loadtest.models.testcase;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

public class ResultReport {
	
	private int totalParticipants = 0;
	private int numSessionsCompleted = 0;
	private int numSessionsCreated = 0;
	private int usedWorkers = 0;
	private String sessionTypology;
	private String browserModeSelected;
	private boolean recording;
	private String participantsPerSession = "";
	private Calendar startTime;
	private Calendar endTime;
	private String kibanaUrl = "";

	public ResultReport(int totalParticipants, int numSessionsCompleted, int numSessionsCreated, int usedWorkers,
			String sessionTypology, String browserModeSelected, boolean recording, String participantsPerSession,
			Calendar startTime, Calendar endTime, String kibanaUrl) {
		this.totalParticipants = totalParticipants;
		this.numSessionsCompleted = numSessionsCompleted;
		this.numSessionsCreated = numSessionsCreated;
		this.usedWorkers = usedWorkers;
		this.sessionTypology = sessionTypology;
		this.browserModeSelected = browserModeSelected;
		this.recording = recording;
		this.participantsPerSession = participantsPerSession;
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
		
		return " *** Test Case Report *** " + System.getProperty("line.separator")
				+ "Browser approach:	" + browserModeSelected + System.getProperty("line.separator")
				+ "Browser with recording:	" + recording + System.getProperty("line.separator")
				+ "Session typology:	" + sessionTypology + System.getProperty("line.separator")
				+ "Participants per session:	" + participantsPerSession + System.getProperty("line.separator")
				+ "Number of sessions created:	" + numSessionsCreated + System.getProperty("line.separator")
				+ "Number of sessions completed:	" + numSessionsCompleted + System.getProperty("line.separator")
				+ "Number of participants created:	" + totalParticipants + System.getProperty("line.separator")
				+ "Number of used workers:	" + usedWorkers + System.getProperty("line.separator")
				+ "Test duration:	" + getDuration() + System.getProperty("line.separator")
				+ "Kibana url:	" + kibanaUrl + System.getProperty("line.separator")
				+ "   ***   ";
	}
	
}
