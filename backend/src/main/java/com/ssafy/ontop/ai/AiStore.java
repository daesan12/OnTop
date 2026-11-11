package com.ssafy.ontop.ai;

import java.io.IOException;
import java.util.List;
import java.util.function.Consumer;
import com.ssafy.ontop.ai.LocalAiStore.*;

/** Transactional workflow storage. DB reads expose a bounded work set, never the entire archive. */
public interface AiStore extends AutoCloseable {
    Data read();
    void change(Consumer<Data> mutation);
    default void changeMessage(String id,Consumer<Data> mutation){change(mutation);}
    default void changeReport(String author,String operationId,Consumer<Data> mutation){change(mutation);}
    default Incident incident(String id){return read().incidents.stream().filter(i->i.id().equals(id)).findFirst().orElseThrow();}
    default List<Message> messages(List<String> ids){return read().messages.stream().filter(m->ids.contains(m.chat().id())).toList();}
    default void retryFailures(long now){
        change(data->{
            data.notices.replaceAll(n->n.status().equals("SENT")?n:new Notice(n.id(),n.key(),n.kind(),n.text(),"PENDING",0,now,0,n.modelScore()));
            data.incidents.replaceAll(i->!i.policeStatus().equals("FAILED")?i:new Incident(i.id(),i.scope(),i.kind(),i.messageIds(),i.createdAt(),i.provider(),i.actors(),i.x(),i.z(),"PENDING",0,now));
        });
    }
    @Override void close() throws IOException;
}
