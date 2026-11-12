package com.ssafy.ontop.ai;

import java.util.*;

/** Bubble-only idle speech. No model, chat message, moderation input or notification is created. */
public final class NpcAmbient {
    public record Bubble(String text,long expiresAt) { }
    private static final Map<String,List<String>> LINES=Map.of(
        "POLICE",List.of("오늘도 천천히 공원을 둘러볼까요.","서로 배려하면 모두 즐거운 공원이 됩니다.","산책하기 좋은 날이네요.","곤란한 일이 있으면 소리함에 남겨주세요.","저는 이쪽 길을 한 번 더 살펴볼게요."),
        "CHILD",List.of("오늘은 꼭 오목 한 판 이겨야지!","저쪽에 누가 있나 구경 가볼까?","잠깐 쉬었다가 또 놀아야지.","오목에서 가운데가 좋다던데!","오늘은 어떤 재미있는 일이 생길까?"),
        "NEIGHBOR",List.of("이렇게 한 바퀴 걸으니 좋네요.","빈 테이블이 있으면 한 판 두고 싶네요.","서두르지 않고 천천히 둘러볼까요.","다들 편하게 쉬다 가면 좋겠어요.","저쪽 마당도 구경해 봐야겠네요."),
        "ELDER",List.of("허허, 산책도 한 수 쉬어 가는 거지.","좋은 수는 천천히 보다 보면 보이는 법이네.","오늘은 누가 오목을 두려나.","바람 쐬며 한 바퀴 돌아보세.","이 공원도 제법 정이 드는구먼."));
    private static final class State {long nextAt;int index;Bubble bubble;State(String actor,long now){nextAt=now+8000+Math.floorMod(actor.hashCode(),8000);index=Math.floorMod(actor.hashCode(),5);}}
    private final Map<String,State> states=new HashMap<>();
    public Bubble tick(String actor,String persona,boolean idle,long now) {
        var state=states.computeIfAbsent(actor,id->new State(id,now));
        if(!idle){state.bubble=null;state.nextAt=now+8000+Math.floorMod(actor.hashCode(),8000);return null;}
        if(state.bubble!=null&&state.bubble.expiresAt()<=now)state.bubble=null;
        if(now>=state.nextAt) {
            var lines=LINES.getOrDefault(persona,LINES.get("NEIGHBOR"));
            state.bubble=new Bubble(lines.get(state.index++%lines.size()),now+6000);
            state.nextAt=now+25000+Math.floorMod(actor.hashCode(),15000);
        }
        return state.bubble;
    }
    public void retain(Set<String> actors){states.keySet().retainAll(actors);}
}
