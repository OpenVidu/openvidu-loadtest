package io.openvidu.load.test.models.webapp;

public class WebAppClassRoom extends WebApp {

    public enum ClassRoomRole {
        TEACHER,
        STUDENT
    }
    
    private int maxNumTeachers;
    
    public WebAppClassRoom(String appUrl, String openviduUrl) {
        super(appUrl, openviduUrl);
    }

    @Override
    public String generateUrl(String sessionId, String userId, int userIndex) {
        
        // First users will be teachers
        ClassRoomRole role = ClassRoomRole.STUDENT;
        if (userIndex <= maxNumTeachers) {
            role = ClassRoomRole.TEACHER;
        }
        
        return this.appUrl + "?publicurl=" + this.openviduUrl + "&sessionId="
					+ sessionId + "&role=" + role.toString() + "&userId=" + userId;
    }
    
}