package com.ssafy.ontop.ai;

import java.util.List;

/** Nonblocking ingress. Captured identities/audience come only from the authenticated world hub. */
public interface WorldAiBridge {
    record Chat(String id, String channelId, String userId, String nickname, String text,
                long sentAt, double x, double y, double z, List<String> audience, String gameId, boolean positionMissing) {
        public Chat(String id,String channelId,String userId,String nickname,String text,long sentAt,
                    double x,double y,double z,List<String> audience,String gameId) {
            this(id,channelId,userId,nickname,text,sentAt,x,y,z,audience,gameId,false);
        }
        public Chat(String id,String channelId,String userId,String nickname,String text,long sentAt,
                    double x,double y,double z,List<String> audience) {
            this(id,channelId,userId,nickname,text,sentAt,x,y,z,audience,"");
        }
    }
    record Feedback(String id, String userId, String channelId, String text) { }
    void chat(Chat chat);
    void feedback(Feedback feedback);
}
