package com.ssafy.ontop.table.websocket;

import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

// 연결마다 송신자 하나와 유한 큐를 둬 전송 순서를 유지하고 상태 잠금 밖에서 I/O 한다.
public final class TablePeer {

    private static final Logger log = LoggerFactory.getLogger(TablePeer.class);

    private final WebSocketSession session;
    private final Runnable cleanup;
    private final BlockingQueue<String> outgoing = new ArrayBlockingQueue<>(128);
    private final AtomicBoolean active = new AtomicBoolean(true);
    private final Thread sender;

    public TablePeer(WebSocketSession session, Runnable cleanup) {
        this.session = session;
        this.cleanup = cleanup;
        sender = Thread.ofVirtual().name("table-send-" + session.getId()).unstarted(this::sendLoop);
    }

    public void start() {
        sender.start();
    }

    public void offer(String message) {
        if (active.get() && !outgoing.offer(message)) {
            stop();
        }
    }

    public void stop() {
        active.set(false);
        sender.interrupt();
    }

    private void sendLoop() {
        try {
            while (active.get()) {
                session.sendMessage(new TextMessage(outgoing.take()));
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (IOException | RuntimeException exception) {
            log.debug("WebSocket 전송 종료 session={}", session.getId(), exception);
        } finally {
            active.set(false);
            outgoing.clear();
            cleanup.run();
            try {
                session.close(CloseStatus.GOING_AWAY);
            } catch (IOException | RuntimeException exception) {
                log.debug("WebSocket 종료 실패 session={}", session.getId(), exception);
            }
        }
    }
}
