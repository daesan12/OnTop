package com.ssafy.ontop.table.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.domain.TableRoom;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableProtocol.Request;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import com.ssafy.ontop.table.websocket.TablePeer;
import jakarta.annotation.PreDestroy;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

@Service
@Profile("local")
public class TableHub {

    private static final Logger log = LoggerFactory.getLogger(TableHub.class);

    private final TableProtocol protocol;
    private final Map<String, TableRoom> rooms = Map.of(
            "table-1", new TableRoom("table-1"), "table-2", new TableRoom("table-2"));
    private final Map<String, Member> members = new HashMap<>();
    private final Map<String, String> seating = new HashMap<>();

    public TableHub(ObjectMapper mapper) {
        protocol = new TableProtocol(mapper);
    }

    public synchronized void connect(WebSocketSession session) {
        String userId = "dev-" + UUID.randomUUID();
        TablePeer peer = new TablePeer(session, () -> disconnect(session.getId()));
        members.put(session.getId(), new Member(userId, peer));
        peer.offer(protocol.encode(null, "CONNECTED", Map.of("userId", userId)));
        peer.start();
    }

    public synchronized void receive(String sessionId, String text) {
        Member member = members.get(sessionId);
        if (member == null) {
            return;
        }
        String requestId = null;
        try {
            Request request = protocol.parse(text);
            requestId = request.requestId();
            switch (request.type()) {
                case "TABLE_JOIN" -> join(member, request);
                case "READY_SET" -> ready(member, request);
                case "TABLE_LEAVE" -> leave(member, request);
                default -> throw new IllegalStateException("검증되지 않은 메시지");
            }
        } catch (RequestException exception) {
            member.peer().offer(protocol.error(exception.requestId(), exception.code(), exception.getMessage()));
        } catch (RuntimeException exception) {
            log.error("테이블 요청 처리 실패 session={}", sessionId, exception);
            member.peer().offer(protocol.error(requestId, "INTERNAL_ERROR", "요청 처리 중 오류가 발생했습니다."));
        }
    }

    public synchronized void disconnect(String sessionId) {
        Member member = members.remove(sessionId);
        if (member == null) {
            return;
        }
        member.peer().stop();
        String tableId = seating.remove(member.userId());
        if (tableId != null) {
            TableRoom room = rooms.get(tableId);
            room.leave(member.userId());
            publish(room, null, null);
        }
    }

    @PreDestroy
    public synchronized void shutdown() {
        members.values().forEach(member -> member.peer().stop());
        members.clear();
        seating.clear();
    }

    private void join(Member member, Request request) {
        String tableId = request.payload().get("tableId").textValue();
        TableRoom room = rooms.get(tableId);
        if (room == null) {
            fail(request, "TABLE_NOT_FOUND", "등록되지 않은 테이블입니다.");
        }
        String current = seating.get(member.userId());
        if (current != null) {
            if (!current.equals(tableId)) {
                fail(request, "ALREADY_SEATED", "다른 테이블에 이미 착석했습니다.");
            }
            replyState(member, request, room);
            return;
        }
        if (!room.join(member.userId())) {
            fail(request, "TABLE_FULL", "빈 좌석이 없습니다.");
        }
        seating.put(member.userId(), tableId);
        publish(room, member, request.requestId());
    }

    private void ready(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        if (room.setReady(member.userId(), request.payload().get("ready").booleanValue())) {
            publish(room, member, request.requestId());
        } else {
            replyState(member, request, room);
        }
    }

    private void leave(Member member, Request request) {
        TableRoom room = seatedRoom(member, request);
        String tableId = seating.remove(member.userId());
        room.leave(member.userId());
        member.peer().offer(protocol.encode(request.requestId(), "TABLE_LEFT", Map.of("tableId", tableId)));
        publish(room, null, null);
    }

    private TableRoom seatedRoom(Member member, Request request) {
        String tableId = seating.get(member.userId());
        if (tableId == null) {
            fail(request, "NOT_SEATED", "먼저 테이블에 착석해주세요.");
        }
        return rooms.get(tableId);
    }

    private void replyState(Member member, Request request, TableRoom room) {
        member.peer().offer(protocol.encode(request.requestId(), "TABLE_STATE", room.snapshot()));
    }

    private void publish(TableRoom room, Member actor, String requestId) {
        TableRoom.Snapshot snapshot = room.snapshot();
        for (Member target : members.values()) {
            if (snapshot.tableId().equals(seating.get(target.userId()))) {
                target.peer().offer(protocol.encode(target == actor ? requestId : null, "TABLE_STATE", snapshot));
            }
        }
    }

    private void fail(Request request, String code, String message) {
        throw new RequestException(request.requestId(), code, message);
    }

    private record Member(String userId, TablePeer peer) {
    }
}
