package io.openvidu.loadtest.models.testcase;

import java.util.List;

public class TestCase {

	private String typology;
	private List<String> participants;
	private int sessions;

	public TestCase(String typology, List<String> participants, int sessions) {
		this.typology = typology;
		this.participants = participants;
		this.sessions = sessions;
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

	@Override
	public String toString() {
		return "TestCase [typology=" + typology + ", participants=" + participants + ", sessions=" + sessions + "]";
	}

}
