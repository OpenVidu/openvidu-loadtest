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

import java.util.List;

/**
 * Manages browsers, both providing them and terminating them
 *
 * @author Pablo Fuente (pablofuenteperez@gmail.com)
 */
public interface BrowserProvider {

	Browser getBrowser(BrowserProperties properties) throws BrowserNotReadyException;

	/*
	 * Sync method. Until all WebDrivers are not ready this method shouldn't return
	 */
	List<Browser> getBrowsers(List<BrowserProperties> properties) throws InterruptedException;

	void terminateInstances();

}
