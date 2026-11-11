package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/** Single-process local integration. File storage must not be used on a shared deployment. */
public final class LocalWorldAi implements WorldAiBridge, AutoCloseable {
    private final LocalAiStore store;
    private final AiOperations operations;
    private final TableHub hub;
    private final String mode;
    private final AiDecisions decisions;
    private final AiText texts;
    private final boolean advisoryChat;
    private final ArrayBlockingQueue<Runnable> ingress = new ArrayBlockingQueue<>(512);
    private final ArrayBlockingQueue<AiDecisions.Chat> chatIngress=new ArrayBlockingQueue<>(512);
    private final Object chatLaneLock=new Object();
    private final ScheduledExecutorService chatWorker=Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("world-chat-ingress").factory());
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("world-ai").factory());
    private final Map<String,Long> published = new HashMap<>();
    private final AtomicLong rejected = new AtomicLong();
    private final java.util.concurrent.atomic.AtomicBoolean followUpScheduled=new java.util.concurrent.atomic.AtomicBoolean();
    private final AiMetrics metrics=new AiMetrics();
    private boolean flushRequested, digestRequested;
    private final java.util.function.Supplier<com.ssafy.ontop.world.movement.ParkNavigation> navigationFactory;
    private final ScheduledExecutorService npcWorker=Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("world-police").factory());
    private final ArrayBlockingQueue<Runnable> npcRequests=new ArrayBlockingQueue<>(32);
    private final Map<String,PolicePatrol> patrols=new HashMap<>();
    private com.ssafy.ontop.world.movement.ParkNavigation navigation;
    private long npcVersion;
    private long lastNpcAt;
    private volatile Map<String,PolicePatrol.View> npcViews=Map.of();
    private volatile Map<String,Map<String,Long>> policeMetrics=Map.of();
    private volatile boolean closed;
    private volatile String error = "";

    public LocalWorldAi(ObjectMapper mapper, Path directory, AiDecisions decisions, AiNotifier notifier,
                        TableHub hub) throws java.io.IOException {
        this(mapper,directory,decisions,notifier,hub,null);
    }
    public LocalWorldAi(ObjectMapper mapper,Path directory,AiDecisions decisions,AiNotifier notifier,TableHub hub,
                        java.util.function.Supplier<com.ssafy.ontop.world.movement.ParkNavigation> navigationFactory) throws java.io.IOException {
        this(mapper,directory,decisions,notifier,hub,navigationFactory,false);
    }
    public LocalWorldAi(ObjectMapper mapper,Path directory,AiDecisions decisions,AiNotifier notifier,TableHub hub,
                        java.util.function.Supplier<com.ssafy.ontop.world.movement.ParkNavigation> navigationFactory,boolean advisoryChat) throws java.io.IOException {
        this(mapper,directory,decisions,notifier,hub,navigationFactory,advisoryChat,AiText.fixed());
    }
    public LocalWorldAi(ObjectMapper mapper,Path directory,AiDecisions decisions,AiNotifier notifier,TableHub hub,
                        java.util.function.Supplier<com.ssafy.ontop.world.movement.ParkNavigation> navigationFactory,boolean advisoryChat,AiText texts) throws java.io.IOException {
        this.hub = hub;
        this.decisions=decisions;
        this.texts=java.util.Objects.requireNonNull(texts);
        this.advisoryChat=advisoryChat;
        this.navigationFactory=navigationFactory;
        mode=(advisoryChat?"CHAT_FILTER_NEGATIVE / FEEDBACK_":"")+(decisions instanceof JevDecisions?"JEV":"OFFLINE_RULE_FIXTURE")+" / "+(notifier instanceof MattermostNotifier?"MATTERMOST":"LOCAL");
        store = new LocalAiStore(directory,mapper);
        operations = new AiOperations(store,decisions,texts,notifier,Clock.systemUTC(),this::police,60_000,advisoryChat);
        hub.aiBridge(this);
        worker.scheduleWithFixedDelay(this::step,1,1,TimeUnit.SECONDS);
        if(advisoryChat)chatWorker.scheduleWithFixedDelay(this::drainChat,0,50,TimeUnit.MILLISECONDS);
        if(navigationFactory!=null) npcWorker.scheduleWithFixedDelay(this::npcTick,0,100,TimeUnit.MILLISECONDS);
    }
    @Override public void chat(Chat chat) {
        String scope=chat.gameId().isEmpty()?"world:"+chat.channelId():"game:"+chat.channelId()+"#"+chat.gameId();
        var input=new AiDecisions.Chat(chat.id(),scope,chat.userId(),chat.text(),chat.sentAt(),chat.x(),chat.z(),chat.audience(),chat.nickname(),chat.y());
        if(advisoryChat){if(closed||!chatIngress.offer(input))rejected.incrementAndGet();}
        else enqueue(() -> operations.acceptChat(input));
    }
    private void drainChat(){
        synchronized(chatLaneLock){
            if(closed)return;
            for(int i=0;i<128;i++){
                var input=chatIngress.peek();if(input==null)break;
                try{operations.acceptChatAndWarn(input);chatIngress.poll();}
                catch(IllegalArgumentException invalid){chatIngress.poll();rejected.incrementAndGet();error="INVALID_CHAT_INPUT";}
                catch(RuntimeException retry){error="CHAT_LANE_RETRY_PENDING";break;}
            }
        }
    }
    @Override public void feedback(Feedback feedback) {
        enqueue(() -> operations.feedback(feedback.userId(),"feedback-"+feedback.id(),feedback.text()));
    }
    private void enqueue(Runnable task) {
        if (closed || !ingress.offer(task)) rejected.incrementAndGet();
    }
    /** Also used by the integration tests; all provider and file I/O stays on this worker. */
    public synchronized void step() {
        if (closed) return;
        drainChat();
        try {
            for (int i=0;i<128;i++) {
                Runnable task=ingress.peek();
                if (task==null) break;
                try { task.run(); ingress.poll(); }
                catch(IllegalArgumentException invalid) { ingress.poll(); rejected.incrementAndGet(); error="INVALID_INPUT"; }
                catch(RuntimeException retry) { error=retry.getClass().getSimpleName(); break; }
            }
        } finally {
            // A full pending queue must still drain; a failed ingress cannot starve moderation/outbox.
            process();
            if(!closed && operations.moderationReady() && followUpScheduled.compareAndSet(false,true))
                worker.execute(() -> { followUpScheduled.set(false); step(); });
        }
    }
    private void process() {
        try {
            boolean force=flushRequested, digest=digestRequested;
            flushRequested=false; digestRequested=false;
            if(digest) operations.digest(); else if(force) operations.flush(); else operations.tick();
            if(advisoryChat) return; // Do not replay historical masks after switching policy.
            for(var message:store.read().messages) {
                if (!message.hidden() || published.getOrDefault(message.chat().id(),0L)>=message.version()) continue;
                var chat=message.chat();
                hub.publishAi(channel(chat.scope()),chat.audience(),game(chat.scope()).isEmpty()?"WORLD_CHAT_MODERATED":"GAME_CHAT_MODERATED",Map.of(
                        "channelId",channel(chat.scope()),"gameId",game(chat.scope()),"messageId",chat.id(),"version",message.version(),
                        "text",AiOperations.HIDDEN),game(chat.scope()));
                published.put(chat.id(),message.version());
            }
        } catch (RuntimeException failure) { error=failure.getClass().getSimpleName(); }
    }
    private final java.util.Set<String> announcedWarnings=new java.util.HashSet<>();
    private void police(AiOperations.PoliceDispatch dispatch) {
        var data=store.read();
        var incident=data.incidents.stream().filter(i -> i.id().equals(dispatch.incidentId())).findFirst().orElseThrow();
        var messages=data.messages.stream().filter(m -> incident.messageIds().contains(m.chat().id())).toList();
        if(messages.isEmpty()) return;
        boolean mediation=dispatch.kind().equals("CONFLICT") || dispatch.kind().equals("CONFLICT_SUSPECTED");
        var targets=mediation?List.of(messages.getLast()):dispatch.kind().equals("PROFANITY_RULE")||dispatch.kind().equals("NEGATIVE_SPEECH")?messages:messages.stream().filter(LocalAiStore.Message::hidden).toList();
        for(String author:targets.stream().map(m -> m.chat().author()).distinct().toList()) {
            var last=targets.stream().map(LocalAiStore.Message::chat).filter(c -> c.author().equals(author)).reduce((a,b) -> b).orElseThrow();
            String warningId=incident.id()+":"+author;
            if(advisoryChat && !game(last.scope()).isEmpty()) {
                if(!announcedWarnings.contains(warningId)) {
                    hub.publishAi(channel(last.scope()),List.of(author),
                        "WORLD_AI_PRIVATE_NOTICE",Map.of("channelId",channel(last.scope()),"gameId",game(last.scope()),
                                "incidentId",warningId,"text","함께 즐기는 게임이에요. 서로 존중하는 표현을 사용해주세요.",
                                "expiresAt",System.currentTimeMillis()+8_000),game(last.scope()));
                    metrics.duration("private_notice.delay",Math.max(0,System.currentTimeMillis()-last.sentAt())*1_000_000);
                    announcedWarnings.add(warningId);
                }
                continue; // Game warnings are private notices; never enqueue or move the police body.
            }
            var audience=messages.stream().flatMap(m -> m.chat().audience().stream()).distinct().toList();
            java.util.function.Consumer<String> personal=text -> {
                if(mediation) return;
                hub.publishAi(channel(last.scope()),List.of(author),
                    "WORLD_AI_PRIVATE_NOTICE",Map.of("channelId",channel(last.scope()),"incidentId",warningId,
                            "text",text,"expiresAt",System.currentTimeMillis()+30_000));
                if(!text.isBlank())metrics.duration("private_notice.delay",Math.max(0,System.currentTimeMillis()-last.sentAt())*1_000_000);
            };
            java.util.function.Consumer<com.ssafy.ontop.world.movement.ParkNavigation.Point> arrival=point -> hub.publishAi(
                    channel(last.scope()),audience,"WORLD_AI_POLICE",Map.of("channelId",channel(last.scope()),
                            "gameId",game(last.scope()),"incidentId",warningId,"name","한순경","x",point.x(),"y",point.y(),"z",point.z(),
                            "speech",last.nickname()+"님, "+dispatch.speech(),"expiresAt",System.currentTimeMillis()+30_000),game(last.scope()));
            if(navigationFactory==null) arrival.accept(new com.ssafy.ontop.world.movement.ParkNavigation.Point(last.x(),last.y(),last.z()));
            else if(!npcRequests.offer(() -> patrol(channel(last.scope())).incident(new PolicePatrol.Incident(warningId,author,
                    dispatch.speech(),arrival,personal)))) throw new IllegalStateException("경찰 대기열 초과");
            if(!mediation && announcedWarnings.add(warningId))
                personal.accept(dispatch.kind().equals("PROFANITY_RULE")?"욕설 표현이 감지됐어요. 서로 존중하는 말을 사용해주세요.":
                        dispatch.kind().equals("NEGATIVE_SPEECH")?"거친 표현이 감지됐어요. 조금만 부드럽게 이야기해주세요.":"부적절한 표현이 감지되어 채팅이 가려졌어요. 서로 존중하는 말을 사용해주세요.");
        }
    }
    private PolicePatrol patrol(String channel) {
        if(navigation==null) navigation=navigationFactory.get();
        return patrols.computeIfAbsent(channel,ignored -> new PolicePatrol(new PolicePatrol.Navigation() {
            public com.ssafy.ontop.world.movement.ParkNavigation.Point spawn() { return navigation.spawn(); }
            public java.util.List<com.ssafy.ontop.world.movement.ParkNavigation.Point> path(
                    com.ssafy.ontop.world.movement.ParkNavigation.Point a,com.ssafy.ontop.world.movement.ParkNavigation.Point b) { return navigation.path(a,b); }
            public boolean lineClear(com.ssafy.ontop.world.movement.ParkNavigation.Point a,com.ssafy.ontop.world.movement.ParkNavigation.Point b) { return navigation.lineClear(a,b); }
            public boolean requiresTeleport(String actor,com.ssafy.ontop.world.movement.ParkNavigation.Point target) {
                return Math.abs(target.y()-navigation.groundPoint(target.x(),target.z()).y())>.35;
            }
            public com.ssafy.ontop.world.movement.ParkNavigation.Point approachPoint(com.ssafy.ontop.world.movement.ParkNavigation.Point target) {
                return navigation.groundPoint(target.x(),target.z());
            }
            public boolean canPatrolFrom(com.ssafy.ontop.world.movement.ParkNavigation.Point point) {
                return !navigation.path(point,point).isEmpty();
            }
            public java.util.List<com.ssafy.ontop.world.movement.NpcDescent.Step> returnPath(com.ssafy.ontop.world.movement.ParkNavigation.Point point) {
                return navigation.returnToGround(point);
            }
            public com.ssafy.ontop.world.movement.ParkNavigation.Point warningPoint(com.ssafy.ontop.world.movement.ParkNavigation.Point target) { return navigation.warningPoint(target); }
            public com.ssafy.ontop.world.movement.ParkNavigation.Point patrolDestination(com.ssafy.ontop.world.movement.ParkNavigation.Point from,java.util.random.RandomGenerator random) {
                return navigation.randomDestination(from,navigation.wholePark(),random);
            }
        }));
    }
    private void npcTick() {
        if(closed) return;
        try {
            var actors=hub.aiActors();
            for(int i=0;i<32;i++) {
                var request=npcRequests.peek(); if(request==null) break;
                try { request.run(); npcRequests.poll(); }
                catch(RuntimeException retry) { error="NPC_QUEUE_RETRY"; break; }
            }
            long now=System.currentTimeMillis(); npcVersion++;
            double dt=lastNpcAt==0?.1:Math.max(0,Math.min(.2,(now-lastNpcAt)/1000.0));lastNpcAt=now;
            var views=new java.util.LinkedHashMap<String,PolicePatrol.View>();
            patrols.keySet().removeIf(channel -> !actors.containsKey(channel));
            for(var world:actors.entrySet()) {
                var view=patrol(world.getKey()).tick(now,dt,world.getValue());
                views.put(world.getKey(),view);
                hub.publishAiNpcs(world.getKey(),Map.of("channelId",world.getKey(),"version",npcVersion,"serverNow",now,"npcs",List.of(view)));
            }
            npcViews=Map.copyOf(views);
            var observed=new java.util.LinkedHashMap<String,Map<String,Long>>();patrols.forEach((channel,patrol)->observed.put(channel,patrol.metrics()));policeMetrics=Map.copyOf(observed);
        } catch(RuntimeException failure) { error="NPC_"+failure.getClass().getSimpleName(); }
    }
    private static String channel(String scope) { return scope.startsWith("world:")?scope.substring(6):scope.substring(5,scope.lastIndexOf('#')); }
    private static String game(String scope) { return scope.startsWith("world:")?"":scope.substring(scope.lastIndexOf('#')+1); }
    public Map<String,Object> status() {
        var data=store.read();
        var result=new java.util.LinkedHashMap<String,Object>(Map.of("mode",mode,"queue",ingress.size()+chatIngress.size(),"rejected",rejected.get(),"error",error,"worker",operations.status(),"npcs",npcViews,
                "hidden",data.messages.stream().filter(LocalAiStore.Message::hidden).count(),
                "reports",data.reports.size(),"notices",data.notices.stream().map(n -> Map.of("kind",n.kind(),"status",n.status())).toList(),
                "providerUsage",decisions instanceof JevDecisions jev?jev.usage():Map.of()));
        result.put("feedbackSummaryProvider",texts.mode());
        result.put("chatLane",Map.of("pending",chatIngress.size(),"capacity",512,"metrics",metrics.snapshot()));result.put("policeMetrics",policeMetrics);return result;
    }
    public void flush() { enqueue(() -> flushRequested=true); }
    public Map<String,AiDecisions.Assessment> assessments() { return Map.copyOf(store.read().assessments); }
    public Map<String,AiDecisions.ConflictAssessment> conflictAssessments() { return Map.copyOf(store.read().conflictAssessments); }
    public void digest() { enqueue(() -> digestRequested=true); }
    @Override public void close() throws java.io.IOException {
        closed=true; hub.aiBridge(null); chatWorker.shutdown(); worker.shutdown();
        try {
            if(!chatWorker.awaitTermination(10,TimeUnit.SECONDS)){
                chatWorker.shutdownNow();
                if(!chatWorker.awaitTermination(5,TimeUnit.SECONDS))throw new IllegalStateException("채팅 수신 worker 종료 대기 실패");
            }
            if(!worker.awaitTermination(30,TimeUnit.SECONDS)) {
                worker.shutdownNow();
                if(!worker.awaitTermination(10,TimeUnit.SECONDS)) throw new IllegalStateException("AI worker 종료 대기 실패");
            }
        } catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
        try {
            npcWorker.submit(() -> { if(navigation!=null) navigation.close(); }).get(15,TimeUnit.SECONDS);
            npcWorker.shutdown();
            if(!npcWorker.awaitTermination(5,TimeUnit.SECONDS)) throw new IllegalStateException("경찰 worker 종료 대기 실패");
        } catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
        catch(java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException failure) { npcWorker.shutdownNow(); throw new IllegalStateException(failure); }
        store.close();
    }
}
