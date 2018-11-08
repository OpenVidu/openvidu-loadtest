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
import java.nio.file.Path;
import java.nio.file.Paths;

import org.slf4j.Logger;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.openvidu.load.test.OpenViduLoadTest;

/**
 * Test logging service: writes standard logs and information logs
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class LogHelper {

	final static Logger log = getLogger(lookup().lookupClass());

	// Test standard log file (events, stats, monitoring, OpenVidu sessions)
	final String testLogFilename = "loadTestStats";
	// Test information file (configuration and average results)
	final String testInfoFilename = "loadTestInfo";

	public FileWriter testLogWriter;
	public FileWriter testInfoWriter;
	private JsonParser parser = new JsonParser();

	public LogHelper(String filePath) throws IOException {
		Path resultPath = Paths.get(OpenViduLoadTest.RESULTS_PATH);
		String directory = resultPath.getParent().toString();

		File logFile = new File(directory, testLogFilename + ".txt");
		File infoFile = new File(directory, testInfoFilename + ".txt");
		boolean alreadyExists = logFile.exists();
		int fileIndex = 1;
		while (alreadyExists) {
			logFile = new File(directory, testLogFilename + "-" + fileIndex + ".txt");
			infoFile = new File(directory, testInfoFilename + "-" + fileIndex + ".txt");
			alreadyExists = logFile.exists();
			fileIndex++;
		}
		testLogWriter = new FileWriter(logFile, true);
		testInfoWriter = new FileWriter(infoFile, true);
		OpenViduLoadTest.RESULTS_PATH = filePath;
	}

	public void close() throws IOException {
		log.info("Closing results file");
		testLogWriter.close();
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
