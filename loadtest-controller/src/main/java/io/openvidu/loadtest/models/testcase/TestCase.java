package io.openvidu.loadtest.models.testcase;

import java.util.List;

public class TestCase {

	private Typology typology;
	private List<String> participants;
	private int sessions;
	private BrowserMode browserMode;
	private Resolution resolution;
	private int frameRate;
	private OpenViduRecordingMode openviduRecordingMode;
	private boolean browserRecording = false;
	private boolean headlessBrowser = false;
	private boolean showBrowserVideoElements = true;
	private String recordingMetadata = "";

	public TestCase(String typology, List<String> participants, int sessions, BrowserMode browserMode, int frameRate, Resolution resolution,
			OpenViduRecordingMode openviduRecordingMode, boolean headlessBrowser, boolean browserRecording,
			boolean showBrowserVideoElements) {
		this.typology = getTypology(typology);
		this.participants = participants;
		this.sessions = sessions;
		this.browserMode = browserMode;
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
		this.browserMode = testCase.browserMode;
		this.resolution = testCase.resolution;
		this.frameRate = testCase.frameRate;
		this.openviduRecordingMode = testCase.openviduRecordingMode;
		this.browserRecording = testCase.browserRecording;
		this.headlessBrowser = testCase.headlessBrowser;
		this.showBrowserVideoElements = testCase.showBrowserVideoElements;
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

	public BrowserMode getBrowserMode() {
		return browserMode;
	}

	public void setBrowserMode(BrowserMode browserMode) {
		this.browserMode = browserMode;
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
		return browserRecording && this.browserMode.equals(BrowserMode.REAL);
	}

	public void setBrowserRecording(boolean browserRecording) {
		this.browserRecording = browserRecording;
	}

	public boolean isHeadlessBrowser() {
		return headlessBrowser && this.browserMode.equals(BrowserMode.REAL);
	}

	public void setHeadlessBrowser(boolean headless) {
		this.headlessBrowser = headless;
	}
	
	public OpenViduRecordingMode getOpenviduRecordingMode() {
		return openviduRecordingMode;
	}

	public boolean isShowBrowserVideoElements() {
		return showBrowserVideoElements && this.browserMode.equals(BrowserMode.REAL) && !this.isHeadlessBrowser();
	}

	@Override
	public String toString() {
		// @formatter:off

		String sessionLimit = sessions == -1 ? "No limit" : Integer.toString(sessions);
		return "Session typology: " + typology 
				+ " | Participants in session: " + participants 
				+ " | Sessions limit: "	+ sessionLimit 
				+ " | Browser mode: " + browserMode 
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
