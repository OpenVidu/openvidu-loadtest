/*
 * (C) Copyright 2017-2018 OpenVidu (https://openvidu.io/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

package io.openvidu.load.test.utils;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;

import org.slf4j.Logger;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.openvidu.load.test.OpenViduLoadTest;
import io.openvidu.load.test.models.MonitoringStats;

/**
 * Test logging service: writes standard logs and information logs to output
 * files
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class LogHelper {

	final static Logger log = getLogger(lookup().lookupClass());

	// Test standard log file (events, stats, monitoring, OpenVidu sessions)
	public final static String testLogFilename = "loadTestStats.txt";
	// Test information file (configuration and average results)
	public final static String testInfoFilename = "loadTestInfo.txt";

	public FileWriter testLogWriter;
	public FileWriter testInfoWriter;
	private JsonParser parser = new JsonParser();

	public LogHelper() throws IOException {
		String resultsPath = OpenViduLoadTest.RESULTS_PATH;
		File testDirectory = new File(resultsPath.replaceAll("/$", "") + "/loadtest_"
				+ (new SimpleDateFormat("yyyy-MM-dd_HH:mm:ss").format(new Date())));
		testDirectory.mkdirs();

		testLogWriter = new FileWriter(new File(testDirectory, testLogFilename), true);
		testInfoWriter = new FileWriter(new File(testDirectory, testInfoFilename), true);
		OpenViduLoadTest.RESULTS_PATH = testDirectory.getAbsolutePath();
	}

	public void closeLogFile() throws IOException {
		log.info("Closing test log file");
		testLogWriter.close();
	}
	
	public void closeInfoFile() throws IOException {
		log.info("Closing test info file");
		testInfoWriter.close();
	}

	public void logTestEvent(JsonObject event) {
		JsonObject testEvent = new JsonObject();
		testEvent.add("event", event);
		testEvent.addProperty("timestamp", System.currentTimeMillis());
		writeToTestLog(testEvent.toString() + System.getProperty("line.separator"));
	}

	public void logTestEvent(JsonObject event, Long timestamp) {
		JsonObject testEvent = new JsonObject();
		testEvent.add("event", event);
		testEvent.addProperty("timestamp", timestamp);
		writeToTestLog(testEvent.toString() + System.getProperty("line.separator"));
	}

	public void logBrowserStats(JsonObject stats) {
		writeToTestLog(stats.toString() + System.getProperty("line.separator"));
	}

	public void logServerMonitoringStats(MonitoringStats stats) {
		writeToTestLog(stats.toJson().toString() + System.getProperty("line.separator"));
	}

	public void logOpenViduSessionInfo(String info) {
		JsonObject jsonInfo = parser.parse(info).getAsJsonObject();
		jsonInfo.addProperty("timestamp", System.currentTimeMillis());
		writeToTestLog(info.toString() + System.getProperty("line.separator"));
	}

	public void logTestInfo(String info) {
		writeToTestInfo(info + System.getProperty("line.separator"));
	}

	private synchronized void writeToTestLog(String s) {
		try {
			testLogWriter.write(s);
		} catch (IOException e) {
			e.printStackTrace();
		}
	}

	private synchronized void writeToTestInfo(String s) {
		try {
			testInfoWriter.write(s);
		} catch (IOException e) {
			e.printStackTrace();
		}
	}

}
