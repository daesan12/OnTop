package com.ssafy.ontop.ai;

import java.util.*;
import com.ssafy.ontop.ai.LocalJokeContest.Submission;

/** Atomic participation reservation and terminal transitions; never holds locks during AI calls. */
public interface JokeContestStore extends AutoCloseable {
    record Reservation(Submission submission, boolean created) { }
    Reservation reserve(Submission draft);
    boolean pending(String id,long now);
    void finish(Submission result,long now);
    void settle(long now);
    List<Submission> mine(String user,String date);
    Optional<Submission> find(String id);
    List<Submission> ranked(String date);
    Optional<Submission> winner(String date);
    List<Submission> winners();
    String mode();
    default boolean unlimitedAttempts(){return false;}
    @Override default void close() throws java.io.IOException { }
    static void sameRequest(Submission existing,Submission draft) {
        if(!existing.question().equals(draft.question())||!existing.answer().equals(draft.answer()))
            throw new IllegalArgumentException("같은 요청 식별자로 다른 작품을 보낼 수 없습니다.");
    }
}
