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

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.openvidu.load.test.models.AmazonInstance;

/**
 * Executes bash scripts under src/test/resources folder. These scripts manage
 * AWS instances
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class ScriptExecutor {

	final static Logger log = getLogger(lookup().lookupClass());
	JsonParser parser = new JsonParser();

	File fileBrowserProvider;
	File fileGetActiveInstances;
	File fileTerminateInstances;
	File fileTerminateOneInstance;

	public ScriptExecutor() {
		ClassLoader classLoader = getClass().getClassLoader();
		fileBrowserProvider = new File(classLoader.getResource("browserProvider.sh").getFile());
		fileGetActiveInstances = new File(classLoader.getResource("getActiveInstances.sh").getFile());
		fileTerminateInstances = new File(classLoader.getResource("terminateInstances.sh").getFile());
		fileTerminateOneInstance = new File(classLoader.getResource("terminateOneInstance.sh").getFile());
		this.executeCommand("chmod 777 " + fileBrowserProvider.getAbsolutePath());
		this.executeCommand("chmod 777 " + fileGetActiveInstances.getAbsolutePath());
		this.executeCommand("chmod 777 " + fileTerminateInstances.getAbsolutePath());
		this.executeCommand("chmod 777 " + fileTerminateOneInstance.getAbsolutePath());
	}

	public Map<String, AmazonInstance> launchBrowsers(int numberOfBrowsers) {
		String cmd = fileBrowserProvider.getAbsolutePath() + " " + numberOfBrowsers;
		return parseInstanceJsonToMap(this.executeCommand(cmd));
	}

	public Map<String, AmazonInstance> getActiveBrowsers() {
		return parseInstanceJsonToMap(this.executeCommand(this.fileGetActiveInstances.getAbsolutePath()));
	}

	public void bringDownBrowser(String instanceId) {
		this.executeCommand(this.fileTerminateOneInstance.getAbsolutePath() + " " + instanceId);
	}

	public Map<String, AmazonInstance> bringDownAllBrowsers() {
		return parseInstanceJsonToMap(this.executeCommand(this.fileTerminateInstances.getAbsolutePath()));
	}

	private String executeCommand(String bashCommand) {
		String result = "";
		try {
			Process p = Runtime.getRuntime().exec(bashCommand);
			BufferedReader in = new BufferedReader(new InputStreamReader(p.getInputStream()));
			String inputLine;
			while ((inputLine = in.readLine()) != null) {
				result += inputLine;
			}
			in.close();
		} catch (IOException e) {
			log.error(e.toString());
		}
		return result;
	}

	private Map<String, AmazonInstance> parseInstanceJsonToMap(String str) {
		Map<String, AmazonInstance> instanceMap = new HashMap<>();
		JsonObject json;

		try {
			json = parser.parse(str).getAsJsonObject();
		} catch (IllegalStateException e) {
			log.error(
					"The response from AWS-CLI is not a JSON object. Some error must have occured when calling aws-cli command. Response: {}",
					str);
			return instanceMap;
		}
		JsonArray reservations = null;

		try {
			reservations = json.get("Reservations").getAsJsonArray();
		} catch (NullPointerException e) {
			log.warn("No instances found inside \"Reservations\" array");
		}

		if (reservations != null) {
			// There are instances being launched
			reservations.getAsJsonArray().forEach(instanceArray -> {
				instanceArray.getAsJsonObject().get("Instances").getAsJsonArray().forEach(instance -> {
					JsonObject instanceJson = instance.getAsJsonObject();
					if ("OpenViduLoadTest".equals(instanceJson.get("Tags").getAsJsonArray().get(0).getAsJsonObject()
							.get("Value").getAsString())) {
						String instanceId = instanceJson.get("InstanceId").getAsString();
						String instancePublicIp = instanceJson.get("PublicIpAddress").getAsString();
						String instancePrivateIp = instanceJson.get("PrivateIpAddress").getAsString();
						instanceMap.put(instanceId,
								new AmazonInstance(instanceId, instancePublicIp, instancePrivateIp));
					}
				});
			});
			log.info("Instances: {}", instanceMap.toString());
		}

		return instanceMap;
	}

}
