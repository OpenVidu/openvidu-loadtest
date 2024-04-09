package io.openvidu.loadtest.utils;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.stream.JsonReader;

import io.openvidu.loadtest.models.testcase.BrowserMode;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Typology;

@Service
public class DataIO {

	private static final Logger log = LoggerFactory.getLogger(DataIO.class);
	private static ClassLoader classLoader = DataIO.class.getClassLoader();
	private static final String TEST_CASES_JSON_FILE = "test_cases.json";
	private static final String REPORT_FILE_RESULT = "results.txt";


	@Autowired
	private JsonUtils jsonUtils;

	public List<TestCase> getTestCasesFromJSON() {
		File file = new File(classLoader.getResource(TEST_CASES_JSON_FILE).getFile());
		JsonArray testCasesList = new JsonArray();

		try {
			JsonReader reader = new JsonReader(new FileReader(file.getAbsolutePath()));
			JsonObject jsonObject = jsonUtils.getJson(reader);
			testCasesList = (JsonArray) jsonObject.get("testcases");

		} catch (Exception e) {
			e.printStackTrace();
		}

		return this.convertJsonArrayToTestCasesList(testCasesList);
	}

	public void exportResults(ResultReport result) {

		String RESULT_PATH = new FileSystemResource(REPORT_FILE_RESULT).getFile().getAbsolutePath();

		FileWriter fw;
		try {
			fw = new FileWriter(RESULT_PATH, true);
			BufferedWriter bw = new BufferedWriter(fw);
		    bw.write(result.toString());
		    bw.newLine();
		    bw.newLine();
		    bw.close();
		} catch (IOException e) {
			e.printStackTrace();
		}

		log.info("Saved result in a " + RESULT_PATH);
	}

	private List<TestCase> convertJsonArrayToTestCasesList(JsonArray array) {

		List<TestCase> testCaseList = new ArrayList<TestCase>();

		for (int i = 0; i < array.size(); i++) {
			JsonObject element = array.get(i).getAsJsonObject();
			boolean headlessBrowser = false;
			boolean browserRecording = false;
			boolean showBrowserVideoElements = false;
			String openviduRecordingModeStr = "";
			int frameRate = 30;
			Resolution resolution = Resolution.MEDIUM;
			List<String> participants = new ArrayList<String>();
			int sessions = 0;
			BrowserMode browserMode = BrowserMode.EMULATE;
			OpenViduRecordingMode openviduRecordingMode = OpenViduRecordingMode.NONE;
			String typology = element.get("typology").getAsString();
			if (!typology.equalsIgnoreCase(Typology.TERMINATE.getValue())) {
				String sessionsStr = element.get("sessions").getAsString();
				JsonArray participantsArray = (JsonArray) element.get("participants");
				participants = jsonUtils.getStringList(participantsArray);
				String browserModeStr = element.get("browserMode").getAsString();
				if(!browserModeStr.isBlank() ) {
					browserMode = browserModeStr.equalsIgnoreCase(BrowserMode.EMULATE.getValue()) ? BrowserMode.EMULATE : BrowserMode.REAL;
				}

				if(element.get("frameRate") !=null && !element.get("frameRate").getAsString().isBlank()) {
					frameRate = element.get("frameRate").getAsInt();
				}
				
				if(element.get("resolution") !=null && !element.get("resolution").getAsString().isBlank()) {
					resolution = element.get("resolution").getAsString().equalsIgnoreCase(Resolution.HIGH.getValue()) ? Resolution.HIGH : Resolution.MEDIUM;
				}

				if(element.get("openviduRecordingMode") != null && !element.get("openviduRecordingMode").getAsString().isBlank()) {

					openviduRecordingModeStr = element.get("openviduRecordingMode").getAsString();
				}

				if(!openviduRecordingModeStr.isBlank()) {
					if(openviduRecordingModeStr.equalsIgnoreCase(OpenViduRecordingMode.COMPOSED.getValue())) {
						openviduRecordingMode = OpenViduRecordingMode.COMPOSED;
					} else if (openviduRecordingModeStr.equalsIgnoreCase(OpenViduRecordingMode.INDIVIDUAL.getValue())){
						openviduRecordingMode = OpenViduRecordingMode.INDIVIDUAL;
					}
				}

				sessions = sessionsStr.equals("infinite") ? -1 : Integer.parseInt(sessionsStr);

				if (browserMode.equals(BrowserMode.REAL)) {
					browserRecording = element.has("recording") ? element.get("recording").getAsBoolean() : false;
					headlessBrowser = element.has("headless") ? element.get("headless").getAsBoolean() : false;
					showBrowserVideoElements = element.has("showBrowserVideoElements")
							? element.get("showBrowserVideoElements").getAsBoolean()
							: false;

				}
			}

			testCaseList.add(new TestCase(typology, participants, sessions, browserMode, frameRate, resolution, openviduRecordingMode,
					headlessBrowser, browserRecording, showBrowserVideoElements));
		}

		return testCaseList;

	}

}
