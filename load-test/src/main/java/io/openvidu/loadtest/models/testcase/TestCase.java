package io.openvidu.loadtest.models.testcase;

import java.util.List;

public class TestCase {

	private String typology;
	private List<String> participants;
	private int sessions;
	private BrowserMode browserMode;
	private boolean recording = false;
	private boolean headless = false;

	public TestCase(String typology, List<String> participants, int sessions, BrowserMode browserMode, boolean headless, boolean recording) {
		this.typology = typology;
		this.participants = participants;
		this.sessions = sessions;
		this.browserMode = browserMode;
		this.recording = recording;
		this.headless = headless;
	}

	public boolean is_NxN() {
		return this.typology.equals(Typology.NxN.getValue());
	}

	public boolean is_1xN() {
		return this.typology.equals(Typology.oneNxM.getValue());
	}

	public boolean is_NxM() {
		return this.typology.equals(Typology.NxM.getValue());
	}

	public boolean is_TEACHING() {
		return this.typology.equals(Typology.TEACHING.getValue());
	}

	public void setTopology(String typology) {
		this.typology = typology;
	}

	public List<String> getParticipants() {
		return participants;
	}

	public void setParticipants(List<String> participants) {
		this.participants = participants;
	}

	public int getSessions() {
		return sessions;
	}

	public void setSessions(int sessions) {
		this.sessions = sessions;
	}
	
	public BrowserMode getBrowserMode() {
		return browserMode;
	}

	public void setBrowserMode(BrowserMode browserMode) {
		this.browserMode = browserMode;
	}

	public boolean isRecording() {
		return recording && this.browserMode.equals(BrowserMode.REAL);
	}

	public void setRecording(boolean recording) {
		this.recording = recording;
	}

	public boolean isHeadless() {
		return headless && this.browserMode.equals(BrowserMode.REAL);
	}

	public void setHeadless(boolean headless) {
		this.headless = headless;
	}

	@Override
	public String toString() {
		String sessionLimit = sessions == -1 ? "No limit" : Integer.toString(sessions);
		return "Session typology: " + typology + 
				" | Participants in session: " + participants +
				" | Sessions limit: " + sessionLimit + 
				" | Browser mode: " + browserMode.getValue() +
				" | Headless: " + isHeadless() +
				" | Recording: " + isRecording();
	}

}
