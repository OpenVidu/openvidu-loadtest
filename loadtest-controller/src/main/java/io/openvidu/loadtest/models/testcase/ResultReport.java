package io.openvidu.loadtest.models.testcase;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

public class ResultReport {
	
	private int totalParticipants = 0;
	private int numSessionsCompleted = 0;
	private int numSessionsCreated = 0;
	private String sessionTypology;
	private String browserModeSelected;
	private boolean recording;
	private String participantsPerSession = "";
	private Calendar startTime;
	private Calendar endTime;
	private long duration = 0;
	private String kibanaUrl = "";



	public ResultReport(int totalParticipants, int numSessionsCompleted, int numSessionsCreated,
			String sessionTypology, String browserModeSelected, boolean recording, String participantsPerSession,
			Calendar startTime, Calendar endTime, String kibanaUrl) {
		super();
		this.totalParticipants = totalParticipants;
		this.numSessionsCompleted = numSessionsCompleted;
		this.numSessionsCreated = numSessionsCreated;
		this.sessionTypology = sessionTypology;
		this.browserModeSelected = browserModeSelected;
		this.recording = recording;
		this.participantsPerSession = participantsPerSession;
		this.startTime = startTime;
		this.endTime = endTime;
	    long diffInMillies = Math.abs(startTime.getTime().getTime() - endTime.getTime().getTime());
		this.duration = TimeUnit.MINUTES.convert(diffInMillies, TimeUnit.MILLISECONDS);
		this.kibanaUrl = kibanaUrl;
	}


	@Override
	public String toString() {
		
		return " *** Test Case Report *** " + System.getProperty("line.separator")
				+ "Participants per session:		" + participantsPerSession + System.getProperty("line.separator")
				+ "Session typology:				" + sessionTypology + System.getProperty("line.separator")
				+ "Browser approach selected:		" + browserModeSelected + System.getProperty("line.separator")
				+ "Browser with recording:			" + recording + System.getProperty("line.separator")
				+ "Number of sessions created:		" + numSessionsCreated + System.getProperty("line.separator")
				+ "Number of sessions completed:	" + numSessionsCompleted + System.getProperty("line.separator")
				+ "Number of participants created:	" + totalParticipants + System.getProperty("line.separator")
				+ "Test duration:					" + duration + " minutes" + System.getProperty("line.separator")
				+ "Kibana url:						" + kibanaUrl + System.getProperty("line.separator")
				+ "   ***   ";
	}
	
}
