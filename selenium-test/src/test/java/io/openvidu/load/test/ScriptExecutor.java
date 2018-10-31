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

package io.openvidu.load.test;

import static java.lang.invoke.MethodHandles.lookup;
import static org.slf4j.LoggerFactory.getLogger;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;

public class ScriptExecutor {

	final static Logger log = getLogger(lookup().lookupClass());

	public Map<String, AmazonInstance> launchBrowsers(int numberOfBrowsers) {
		return parseInstanceStringToMap(this.executeCommand(
				"export NUM_INSTANCES=" + numberOfBrowsers + " && src/test/resources/browserProvider.sh"));
	}

	public Map<String, AmazonInstance> getActiveBrowsers() {
		return parseInstanceStringToMap(this.executeCommand("src/test/resources/getActiveInstances.sh"));
	}

	public void bringDownBrowser(String instanceId) {
		this.executeCommand("export INSTANCE=" + instanceId + " && src/test/resources/terminateOneInstance.sh");
	}

	public void bringDownAllBrowsers() {
		this.executeCommand("src/test/resources/terminateInstances.sh");
	}

	private String executeCommand(String bashCommand) {
		String result = null;
		try {
			Runtime r = Runtime.getRuntime();
			Process p = r.exec(bashCommand);
			BufferedReader in = new BufferedReader(new InputStreamReader(p.getInputStream()));
			String inputLine;
			while ((inputLine = in.readLine()) != null) {
				System.out.println(inputLine);
				result += inputLine;
			}
			in.close();
		} catch (IOException e) {
			log.error(e.toString());
		}
		return result;
	}

	private Map<String, AmazonInstance> parseInstanceStringToMap(String str) {
		Map<String, AmazonInstance> instanceMap = new HashMap<>();
		String[] instanceArray = str.split("\\r?\\n|\\r");
		for (int i = 0; i < instanceArray.length; i++) {
			String[] idAndIp = instanceArray[i].split(" ");
			instanceMap.put(idAndIp[0], new AmazonInstance(idAndIp[0], idAndIp[1]));
		}
		return instanceMap;
	}

}
