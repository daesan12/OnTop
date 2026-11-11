package com.ssafy.ontop.ai;

import java.util.List;
import java.util.Map;

/** Provider boundary. Implementations must not change world/game state. */
public interface AiDecisions {
    record Chat(String id, String scope, String author, String text, long sentAt, double x, double z,List<String> audience, String nickname, double y, boolean positionMissing) {
        public Chat { audience=audience==null?List.of():List.copyOf(audience); nickname=nickname==null?author:nickname; }
        public Chat(String id,String scope,String author,String text,long sentAt,double x,double z,List<String> audience,String nickname,double y) {
            this(id,scope,author,text,sentAt,x,z,audience,nickname,y,false);
        }
        public Chat(String id,String scope,String author,String text,long sentAt,double x,double z,List<String> audience,String nickname) {
            this(id,scope,author,text,sentAt,x,z,audience,nickname,0);
        }
        public Chat(String id,String scope,String author,String text,long sentAt,double x,double z,List<String> audience) {
            this(id,scope,author,text,sentAt,x,z,audience,author);
        }
        public String speaker() { return nickname.equals(author) ? author : nickname + " [" + author + "]"; }
        public Chat(String id,String scope,String author,String text,long sentAt,double x,double z) {
            this(id,scope,author,text,sentAt,x,z,List.of());
        }
    }
    enum Verdict { NORMAL, UNCERTAIN, VIOLATION }
    record Assessment(String provider,double probability,double hideThreshold,Verdict verdict,long evaluatedAt,List<String> conversationIds,
                      double utteranceProbability,double contributionProbability,int spellingCandidateCount,String guidanceDigest,double utteranceThreshold,
                      double profanityProbability,double mentionProbability,double profanityThreshold,double mentionThreshold,
                      double conflictProbability,double conflictThreshold,String reason,String policyVersion) {
        public Assessment { conversationIds=List.copyOf(conversationIds); }
    }
    record Moderation(Map<String, Verdict> messages, boolean conflict, String provider,Map<String,Assessment> assessments) {
        public Moderation { messages = Map.copyOf(messages); assessments=Map.copyOf(assessments); }
        public Moderation(Map<String,Verdict> messages,boolean conflict,String provider) { this(messages,conflict,provider,Map.of()); }
    }
    record Triage(String type, String area, int severity, String provider) {
        public Triage {
            if (severity < 0 || severity > 3) throw new IllegalArgumentException("잘못된 심각도");
        }
    }
    record ConflictAssessment(String provider,double probability,double threshold,boolean suspected,long evaluatedAt,
                              List<String> conversationIds,List<String> pendingMessageIds,String reason,String policyVersion) {
        public ConflictAssessment {
            conversationIds=List.copyOf(conversationIds); pendingMessageIds=List.copyOf(pendingMessageIds);
            if(!Double.isFinite(probability) || probability<0 || probability>1 || !Double.isFinite(threshold) || threshold<.5 || threshold>1)
                throw new IllegalArgumentException("갈등 판단값 오류");
        }
    }
    default ConflictAssessment assessConflict(List<Chat> context,List<Chat> targets,long now) {
        var recent=context.stream().filter(c -> c.sentAt()>=now-30_000 && c.sentAt()<=now+1000).toList();
        var pending=targets.stream().filter(c -> recent.stream().anyMatch(r -> r.id().equals(c.id()))).toList();
        if(pending.isEmpty())
            return new ConflictAssessment("LOCAL_GATE",0,.85,false,now,recent.stream().map(Chat::id).toList(),pending.stream().map(Chat::id).toList(),"NOT_ENOUGH_RECENT_SPEAKERS","conflict-advisory-v1");
        var result=moderate(recent,pending);
        var flagged=pending.stream().filter(c->result.conflict()||result.messages().get(c.id())==Verdict.VIOLATION).map(Chat::id).toList();
        return new ConflictAssessment(result.provider(),flagged.isEmpty()?0:1,.85,!flagged.isEmpty(),now,
                recent.stream().map(Chat::id).toList(),flagged.isEmpty()?pending.stream().map(Chat::id).toList():flagged,"FIXTURE_NEGATIVITY","negative-advisory-v2");
    }
    /** Ordered window: up to five prior messages plus ten pending targets. Prior messages are read-only context. */
    Moderation moderate(List<Chat> context, List<Chat> targets);
    Triage triage(String text);
    enum NpcIntent { RULES, RECOMMEND, CHAT }
    default NpcIntent npcIntent(String question) {
        return question.matches(".*(규칙|오목|방법).*")?NpcIntent.RULES:question.contains("추천")?NpcIntent.RECOMMEND:NpcIntent.CHAT;
    }
}
