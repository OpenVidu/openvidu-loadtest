package io.openvidu.loadtest.utils;

import java.io.File;
import java.io.FileReader;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;

import io.openvidu.loadtest.models.testcase.TestCase;

public class DataIO {

	private static ClassLoader classLoader = DataIO.class.getClassLoader();
	private static final String TEST_CASES_JSON_FILE = "test_cases.json";

	public List<TestCase> getTestCasesFromJSON() {
		File file = new File(classLoader.getResource(TEST_CASES_JSON_FILE).getFile());
		Gson gson = new Gson();
		JsonArray testCasesList = new JsonArray();

		try {
			JsonReader reader = new JsonReader(new FileReader(file.getAbsolutePath()));
			JsonObject jsonObject = gson.fromJson(reader, JsonObject.class);
			testCasesList = (JsonArray) jsonObject.get("testcases");

		} catch (Exception e) {
			e.printStackTrace();
		}

		return this.convertJsonArrayToTestCasesList(testCasesList);
	}

	private List<TestCase> convertJsonArrayToTestCasesList(JsonArray array) {

		Type listType = new TypeToken<List<String>>() {}.getType();
		List<TestCase> testCaseList = new ArrayList<TestCase>();

		for (int i = 0; i < array.size(); i++) {
			String typology = array.get(i).getAsJsonObject().get("typology").getAsString();
			String sessions = array.get(i).getAsJsonObject().get("sessions").getAsString();
			JsonArray participantsArray = (JsonArray) array.get(i).getAsJsonObject().get("participants");
			List<String> participants = new Gson().fromJson(participantsArray, listType);

			testCaseList.add(new TestCase(typology, participants, sessions));
		}

		return testCaseList;

	}

}
