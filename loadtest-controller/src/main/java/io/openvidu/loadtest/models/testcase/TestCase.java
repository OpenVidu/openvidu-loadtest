package io.openvidu.loadtest.models.testcase;

import java.util.List;

public class TestCase {

	private Typology typology;
	private List<String> participants;
	private int sessions;
	private Resolution resolution;
	private int frameRate;
	private OpenViduRecordingMode openviduRecordingMode;
	private boolean browserRecording = false;
	private boolean headlessBrowser = false;
	private boolean showBrowserVideoElements = true;
	private String recordingMetadata = "";
	private int startingParticipants = 0;

	public TestCase(String typology, List<String> participants, int sessions, int frameRate, Resolution resolution,
			OpenViduRecordingMode openviduRecordingMode, boolean headlessBrowser, boolean browserRecording,
			boolean showBrowserVideoElements) {
		this.typology = getTypology(typology);
		this.participants = participants;
		this.sessions = sessions;
		this.resolution = resolution;
		this.frameRate = frameRate;
		this.openviduRecordingMode = openviduRecordingMode;
		this.browserRecording = browserRecording;
		this.headlessBrowser = headlessBrowser;
		this.showBrowserVideoElements = showBrowserVideoElements;
	}
	
	public TestCase(TestCase testCase) {
		this.typology = testCase.typology;
		this.participants = testCase.participants;
		this.sessions = testCase.sessions;
		this.resolution = testCase.resolution;
		this.frameRate = testCase.frameRate;
		this.openviduRecordingMode = testCase.openviduRecordingMode;
		this.browserRecording = testCase.browserRecording;
		this.headlessBrowser = testCase.headlessBrowser;
		this.showBrowserVideoElements = testCase.showBrowserVideoElements;
		this.recordingMetadata = testCase.recordingMetadata;
		this.startingParticipants = testCase.startingParticipants;
	}

	public boolean is_NxN() {
		return this.typology.getValue().equals(Typology.NxN.getValue());
	}

	public boolean is_NxM() {
		return this.typology.getValue().equals(Typology.NxM.getValue());
	}

	public boolean is_TEACHING() {
		return this.typology.getValue().equals(Typology.TEACHING.getValue());
	}

	public boolean is_ONE_SESSION() {
		return this.typology.getValue().equals(Typology.ONE_SESSION.getValue());
	}

	public boolean is_TERMINATE() {
		return this.typology.getValue().equals(Typology.TERMINATE.getValue());
	}

	public Typology getTypology() {
		return typology;
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
	
	public Resolution getResolution() {
		return resolution;
	}

	public String getRecordingMetadata() {
		return recordingMetadata;
	}

	public void setRecordingMetadata(String recordingMetadata) {
		this.recordingMetadata = recordingMetadata;
	}

	public int getFrameRate() {
		return frameRate;
	}

	public boolean isBrowserRecording() {
		return browserRecording;
	}

	public void setBrowserRecording(boolean browserRecording) {
		this.browserRecording = browserRecording;
	}

	public boolean isHeadlessBrowser() {
		return headlessBrowser;
	}

	public void setHeadlessBrowser(boolean headless) {
		this.headlessBrowser = headless;
	}
	
	public OpenViduRecordingMode getOpenviduRecordingMode() {
		return openviduRecordingMode;
	}

	public boolean isShowBrowserVideoElements() {
		return showBrowserVideoElements && !this.isHeadlessBrowser();
	}

	public int getStartingParticipants() {
		return startingParticipants;
	}

	public void setStartingParticipants(int startingParticipants) {
		this.startingParticipants = startingParticipants;
	}

	@Override
	public String toString() {
		// @formatter:off

		String sessionLimit = sessions == -1 ? "No limit" : Integer.toString(sessions);
		String startingParticipantString = startingParticipants == 0 ? "No starting participants" : Integer.toString(startingParticipants);
		return "Session typology: " + typology
				+ " | Participants in session: " + participants
				+ " | Starting participants: " + startingParticipantString
				+ " | Sessions limit: "	+ sessionLimit
				+ " | Resolution: " + resolution.getValue()
				+ " | Frame rate: " + frameRate 
				+ " | Headless browser: " + isHeadlessBrowser()
				+ " | Browser recording: " + isBrowserRecording()
				+ " | Browser show video elements: " + isShowBrowserVideoElements();
		
		// @formatter:on

	}

	private Typology getTypology(String typology) {
		for (int i = 0; i < Typology.values().length; i++) {
			if (Typology.values()[i].getValue().equalsIgnoreCase(typology)) {
				return Typology.values()[i];
			}
		}
		return null;
	}

}
