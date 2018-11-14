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

package io.openvidu.load.test.browser;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeOptions;

import io.openvidu.load.test.models.AmazonInstance;

/**
 * Chrome browser encapsulation for OpenVidu load testing
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public class ChromeBrowser extends Browser {

	ChromeBrowser(BrowserProperties properties, AmazonInstance instance, WebDriver driver) {
		super(properties, instance, driver);
	}
	
	ChromeBrowser(BrowserProperties properties, WebDriver driver) {
		super(properties, driver);
	}

	static ChromeOptions generateFakeVideoChromeOptions(String videoFileLocation, String audioFileLocation) {
		ChromeOptions options = new ChromeOptions();
		// This flag avoids to grant the user media
		options.addArguments("--use-fake-ui-for-media-stream");
		// This flag fakes user media with synthetic video
		options.addArguments("--use-fake-device-for-media-stream");
		// This flag allows to load fake media files from host
		options.addArguments("--allow-file-access-from-files");
		// This flag sets the video input
		options.addArguments("--use-file-for-fake-video-capture=" + videoFileLocation);
		// This flag sets the audio input
		options.addArguments("--use-file-for-fake-audio-capture=" + audioFileLocation);
		return options;
	}

}