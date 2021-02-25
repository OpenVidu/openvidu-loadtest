/**
 * 
 */
package io.openvidu.loadtest.models.testcase;

/**
 * @author Carlos Santos
 *
 */
public enum OutputMode {
	
	COMPOSED("COMPOSED", "COMPOSED"),

	INDIVIDUAL("INDIVIDUAL", "INDIVIDUAL");


	private String label;
	private String value;

	OutputMode(String label, String string) {
		this.label = label;
		this.value = string;
	}

	public String getValue() {
		return this.value;
	}

	public String getLabel() {
		return this.label;
	}

	public String toString() {
		return this.getLabel();
	}

}
