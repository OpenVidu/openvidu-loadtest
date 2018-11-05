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

import org.slf4j.Logger;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.openvidu.load.test.OpenViduLoadTest;

public class LogHelper {

	final static Logger log = getLogger(lookup().lookupClass());

	public static FileWriter fileWriter;
	private JsonParser parser = new JsonParser();

	public LogHelper(String filePath) throws IOException {
		boolean alreadyExists = new File(filePath).exists();
		int fileIndex = 1;
		while (alreadyExists) {
			filePath = OpenViduLoadTest.RESULTS_PATH.substring(0, OpenViduLoadTest.RESULTS_PATH.length() - 4) + "-"
					+ fileIndex + ".txt";
			alreadyExists = new File(filePath).exists();
			fileIndex++;
		}
		fileWriter = new FileWriter(filePath, true);
		OpenViduLoadTest.RESULTS_PATH = filePath;
	}

	public void close() throws IOException {
		log.info("Closing results file");
		fileWriter.close();
	}

	public void logTestEvent(JsonObject event) {
		JsonObject testEvent = new JsonObject();
		testEvent.add("event", event);
		testEvent.addProperty("timestamp", System.currentTimeMillis());
		LogHelper.writeToOutput(testEvent.toString() + System.getProperty("line.separator"));
	}

	public void logTestEvent(JsonObject event, Long timestamp) {
		JsonObject testEvent = new JsonObject();
		testEvent.add("event", event);
		testEvent.addProperty("timestamp", timestamp);
		LogHelper.writeToOutput(testEvent.toString() + System.getProperty("line.separator"));
	}

	public void logBrowserStats(JsonObject stats) {
		LogHelper.writeToOutput(stats.toString() + System.getProperty("line.separator"));
	}

	public void logServerMonitoringStats(MonitoringStats stats) {
		LogHelper.writeToOutput(stats.toJson().toString() + System.getProperty("line.separator"));
	}

	public void logOpenViduSessionInfo(String info) {
		JsonObject jsonInfo = parser.parse(info).getAsJsonObject();
		jsonInfo.addProperty("timestamp", System.currentTimeMillis());
		LogHelper.writeToOutput(info.toString() + System.getProperty("line.separator"));
	}

	private static synchronized void writeToOutput(String s) {
		try {
			LogHelper.fileWriter.write(s);
		} catch (IOException e) {
			e.printStackTrace();
		}
	}

}
