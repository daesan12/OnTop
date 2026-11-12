package com.ssafy.ontop.ai;

public interface AiNotifier {
    /** Returns the successful destination marker; throwing preserves retry state. */
    String send(String id, String kind, String text);
    default String send(String id,String kind,String text,Double modelScore){return send(id,kind,text);}
    static AiNotifier local() { return (id, kind, text) -> "LOCAL_CAPTURE"; }
}
