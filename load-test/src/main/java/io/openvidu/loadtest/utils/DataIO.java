package io.openvidu.loadtest.utils;

import java.io.File;
import java.io.FileReader;

import org.json.simple.JSONArray;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;


public class DataIO {
	
	private static ClassLoader classLoader = DataIO.class.getClassLoader();
	private static final String TEST_CASES_JSON_FILE = "test_cases.json";

	public JSONArray getTestCasesFromJSON() {
		File file = new File(classLoader.getResource(TEST_CASES_JSON_FILE).getFile());

		JSONParser parser = new JSONParser();
		JSONArray testCasesList = new JSONArray();
		
		try {
			Object obj = parser.parse(new FileReader(file.getAbsolutePath()));
			JSONObject jsonObject = (JSONObject) obj;
			testCasesList = (JSONArray) jsonObject.get("testcases");
 
		} catch (Exception e) {
			e.printStackTrace();
		}
		
		return testCasesList;
	}
	
}
