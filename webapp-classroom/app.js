$(document).ready(async () => {
    var url = new URL(window.location.href);
	console.log("URL", url)
    startTime();

	OPENVIDU_SERVER_URL = url.searchParams.get("publicurl");
	SESSION_ID = url.searchParams.get("sessionId");
    PATH_API = `/classroom/api/sessions/${SESSION_ID}/participants`;
    ROLE = url.searchParams.get("role") || "TEACHER";
    NUM_TEACHERS = url.searchParams.get("numTeachers") || 1;
    NUM_STUDENTS = url.searchParams.get("numStudents") || 3;
    BROWSER_IDENTIFIER = url.searchParams.get("browserId") || "1";

    console.log(`Request token url: ${OPENVIDU_SERVER_URL}${PATH_API}`);
    console.log(`Session id: + ${SESSION_ID}`);
    console.log(`Role: ${ROLE}`);
    console.log(`Num Teachers: ${NUM_TEACHERS}`);
    console.log(`Num Students: ${NUM_STUDENTS}`);
    console.log(`Browser Identifier: ${BROWSER_IDENTIFIER}`);

    var teachers = [];
    var students = [];

    if (ROLE == "TEACHER") {
        for(var numTeacher = 0; numTeacher < NUM_TEACHERS; numTeacher++) {
            var teacher = {
                name: `teacher-${numTeacher}-${BROWSER_IDENTIFIER}`,
                role: "TEACHER"
            }
            teachers.push(teacher);
            addParticipant(teacher);
        }
    }

    if (ROLE == "STUDENT") {
        for(var numStudent = 0; numStudent < NUM_STUDENTS; numStudent++) {
            var student = {
                name: `student-${numStudent}-${BROWSER_IDENTIFIER}`,
                role: "STUDENT"
            };
            students.push(student);
            addParticipant(student);
        }
    }

});

function appendIframeSession(tokenUrl, title) {
    var iframe = document.createElement('iframe');
    iframe.width = 500;
    iframe.height = 500;
    iframe.allow = "microphone; camera";
    iframe.src = tokenUrl;
    iframe.title = title;
    iframe.id = title;
    document.getElementById("iframes-section").appendChild(iframe);
}

async function addParticipant(participant) {

    var addParticipantUrl = OPENVIDU_SERVER_URL + PATH_API;

    try {
        var result = JSON.parse(await addParticipantRequest(addParticipantUrl, participant));
        var tokenUrl = result.token + "&autoJoinRoom=true";
        appendIframeSession(tokenUrl, "iframe-" + participant.name);
    } catch (error) {
        alert("An error has ocurred while adding the participant");
        console.error(error);
    }

}

async function addParticipantRequest(addParticipantUrl, participant) {
	return new Promise((resolve, reject) => {
        $.ajax({
            type: 'POST',
            url: addParticipantUrl,
            data: JSON.stringify(participant),
            headers: {
                Authorization: 'Basic ' + btoa('user1:pass'),
                'Content-Type': 'application/json',
            },
            success: (response) => resolve(response),
            error: (error) => reject(error),
        });
    });
}

function openInNewTab(url) {
    var win = window.open(url, '_blank');
    win.focus();
}

function startTime() {
    var date = new Date().toISOString();
	document.getElementById('time').innerHTML = date.substring(0, date.length - 5);
	t = setTimeout(() => startTime(), 1000);
}
