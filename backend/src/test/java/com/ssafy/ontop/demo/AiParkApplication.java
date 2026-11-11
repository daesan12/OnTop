package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.ai.LocalWorldAi;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.feedback.config.FeedbackProperties;
import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import com.ssafy.ontop.feedback.service.FeedbackService;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.filter.OncePerRequestFilter;

/** Actual park/socket/feedback flow, fixture accounts and in-memory feedback repository. No shared DB. */
public final class AiParkApplication {
    public static void main(String[] args) {
        var settings=new HashMap<String,Object>();
        settings.put("spring.profiles.active","local,frontend-test,alkkagi-park,ai-park");
        settings.put("server.address","127.0.0.1"); settings.put("server.port",19191);
        settings.put("ontop.auth.jwt-secret-base64","AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=");
        settings.put("ontop.auth.allowed-origins","http://127.0.0.1:5211,http://localhost:5211");
        settings.put("ontop.websocket.authenticated",true); settings.put("ontop.feedback.enabled",true);
        settings.put("ontop.games.omok.enabled",true);
        settings.put("ontop.games.alkkagi.enabled",true);
        settings.put("ontop.game-start.enabled",true);
        settings.put("ontop.start-rehearsal.enabled",false);
        settings.put("ontop.world.map.source","generated"); settings.put("ontop.world.map.require-match",true);
        settings.put("ontop.world.map.json-path","../frontend/generated/park/server-map.json");
        settings.put("ontop.world.map.manifest-path","../frontend/generated/park/manifest.json");
        settings.put("ontop.ai.live-jev",Boolean.parseBoolean(System.getenv("AI_LAB_JEV_LIVE")));
        settings.put("ontop.ai.live-mattermost",Boolean.parseBoolean(System.getenv("AI_LAB_MM_LIVE")));
        // Isolated comparison; external Jev requires a separate explicit opt-in. MM stays disabled.
        String benchmark=System.getenv("AI_PARK_BENCHMARK");
        if("on".equals(benchmark) || "off".equals(benchmark)) {
            settings.put("server.port",19192);
            settings.put("ontop.ai.directory",System.getenv().getOrDefault("AI_PARK_BENCHMARK_DIRECTORY",".gradle/ai-park-benchmark/"+benchmark));
            settings.put("ontop.ai.npc-enabled","on".equals(benchmark));
            settings.put("ontop.ai.live-jev",Boolean.parseBoolean(System.getenv("AI_PARK_BENCHMARK_LIVE_JEV")));
            settings.put("ontop.ai.live-mattermost",Boolean.parseBoolean(System.getenv("AI_PARK_BENCHMARK_LIVE_MM")));
        }
        var app=new SpringApplication(OntopApplication.class,AlkkagiParkApplication.Fixture.class,Fixture.class);
        app.run(settings.entrySet().stream().map(e -> "--"+e.getKey()+"="+e.getValue()).toArray(String[]::new));
    }
    @TestConfiguration(proxyBeanMethods=false)
    @Profile("local & ai-park & !db & !dev & !prod & !production")
    public static class Fixture {
        @Bean com.ssafy.ontop.ai.AiText localParkAiText() {
            var env=System.getenv();String key=env.getOrDefault("OPENAI_API_KEY","");
            if(env.containsKey("AI_PARK_BENCHMARK")&&!"true".equals(env.get("AI_PARK_BENCHMARK_LIVE_LLM")))key="";
            return key.isBlank()?com.ssafy.ontop.ai.AiText.fixed():new com.ssafy.ontop.ailab.SpringAiText(key,
                    env.getOrDefault("AI_LAB_LLM_MODEL","gpt-4.1-mini"),Integer.parseInt(env.getOrDefault("AI_LAB_LLM_DAILY_CALLS","100")));
        }
        @Bean @org.springframework.context.annotation.Primary
        AiParkLedger aiParkLedger(AlkkagiParkApplication.LocalLedger original,org.springframework.context.ApplicationEventPublisher events) {
            return new AiParkLedger(original,events);
        }
        @Bean(destroyMethod="close",initMethod="start")
        com.ssafy.ontop.ai.LocalCompanions localCompanions(TableHub hub,ObjectMapper mapper,LocalWorldAi ai,WorldMapRuntime map,
                com.ssafy.ontop.game.omok.service.OmokEngine omok,com.ssafy.ontop.ai.AiText text) {
            var env=System.getenv();
            String binary=env.getOrDefault("AI_LAB_RAPFI_PATH","");
            var installed=java.nio.file.Path.of("../../local-tools/ai-lab/rapfi-250615/pbrain-rapfi-windows-avx2.exe").toAbsolutePath();
            if(binary.isBlank() && java.nio.file.Files.isRegularFile(installed)) binary=installed.toString();
            com.ssafy.ontop.ai.OmokAnalyzer analyzer=binary.isBlank()?(board,moves) -> com.ssafy.ontop.ai.OmokAnalyzer.unavailable():new com.ssafy.ontop.ai.RapfiAnalyzer(java.nio.file.Path.of(binary),300);
            var companions=new com.ssafy.ontop.ai.LocalCompanions(hub,mapper,Clock.systemUTC(),analyzer,text,
                    () -> new com.ssafy.ontop.world.movement.ParkNavigation(map.scene()));
            companions.observe(omok::analysisPositions);return companions;
        }
        @Bean @org.springframework.context.annotation.Primary
        com.ssafy.ontop.world.jumpmap.JumpmapActivation aiJumpmapGeometry(WorldMapRuntime map) {
            // Geometry/tracker only; no DB store, rewards or wallet writes.
            return com.ssafy.ontop.world.jumpmap.JumpmapActivation.decide(true,map.scene().version(),
                    com.ssafy.ontop.world.jumpmap.JumpCourse::loadDefault);
        }
        @Bean FeedbackService aiParkFeedback(TableHub hub,LocalWorldAi ai) {
            var manager=new AbstractPlatformTransactionManager() {
                @Override protected Object doGetTransaction() { return new Object(); }
                @Override protected void doBegin(Object t,org.springframework.transaction.TransactionDefinition d) { }
                @Override protected void doCommit(DefaultTransactionStatus s) { }
                @Override protected void doRollback(DefaultTransactionStatus s) { }
            };
            var service=new FeedbackService(new MemoryFeedback(),manager,hub,
                    new FeedbackProperties(Set.of(101L),null,null,null),Clock.systemUTC());
            service.ai(ai::feedback); return service;
        }
        @Bean FilterRegistrationBean<OncePerRequestFilter> aiParkControls(AccessAuthenticationService auth,
                LocalWorldAi ai, WorldChannelRegistry channels, WorldMapRuntime map, ObjectMapper mapper,TableHub hub,
                com.ssafy.ontop.ai.LocalCompanions companions) throws IOException {
            var registration=new FilterRegistrationBean<OncePerRequestFilter>();
            registration.setOrder(-190);
            registration.setFilter(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,
                        FilterChain chain) throws IOException,ServletException {
                    if(!request.getRequestURI().startsWith("/local/ai/")) { chain.doFilter(request,response); return; }
                    response.setHeader("Cache-Control","no-store");
                    try {
                        String header=request.getHeader("Authorization");
                        long user=auth.authenticate(header!=null && header.startsWith("Bearer ")?header.substring(7):"").userId();
                        Object result;
                        String path=request.getRequestURI();
                        if(path.startsWith("/local/ai/companions/")) {
                            String owner=Long.toString(user),channel=channels.channelOf(owner);
                            if(channel==null) { response.setStatus(409);return; }
                            if(path.endsWith("/status") && request.getMethod().equals("GET")) result=companions.status(owner,channel);
                            else if(request.getMethod().equals("POST")) {
                                byte[] bytes=request.getInputStream().readNBytes(4097);
                                if(bytes.length>4096) { response.setStatus(413);return; }
                                var body=mapper.readTree(bytes);
                                try {
                                    result=switch(path) {
                                        case "/local/ai/companions/invite" -> companions.invite(owner,com.ssafy.ontop.ai.LocalCompanions.Difficulty.valueOf(body.path("difficulty").asText("NORMAL")));
                                        case "/local/ai/companions/action" -> companions.action(owner,body);
                                        case "/local/ai/companions/talk" -> companions.talk(owner,body.path("persona").asText(),body.path("question").asText());
                                        default -> throw new IllegalArgumentException("지원하지 않는 요청이에요.");
                                    };
                                } catch(RuntimeException invalid) {
                                    response.setStatus(409);result=Map.of("message",invalid instanceof IllegalArgumentException?invalid.getMessage():"최신 판과 차례를 확인해주세요.");
                                }
                            } else { response.setStatus(405);return; }
                        } else if(path.equals("/local/ai/table-position") && request.getMethod().equals("POST")) {
                            String channel=channels.channelOf(Long.toString(user));if(channel==null){response.setStatus(409);return;}
                            int index=Integer.parseInt(Optional.ofNullable(request.getParameter("index")).orElse("0"));
                            var layout=map.tableLayout(channel).get(index);
                            var anchor=map.scene().tableAnchors().stream().filter(a -> a.anchorId().equals(layout.anchorId())).findFirst().orElseThrow();
                            channels.releaseFacility(Long.toString(user),new Pose(layout.point().x()+2,anchor.y()+.8,layout.point().z(),0));
                            result=Map.of("tableId",layout.tableId());
                        } else if(path.equals("/local/ai/feedback-position") && request.getMethod().equals("POST")) {
                            if(channels.channelOf(Long.toString(user))==null) { response.setStatus(409); return; }
                            var area=map.prepared().orElseThrow().feedback();
                            // Pose is selected from the actual generated map's interaction geometry.
                            var center=area.center();
                            channels.releaseFacility(Long.toString(user),new Pose(center.x(),center.y(),center.z(),0));
                            result=Map.of("placed",true);
                        } else if(request.getMethod().equals("POST") && (path.equals("/local/ai/jumpmap-position") || path.equals("/local/ai/roof-position"))) {
                            if(channels.channelOf(Long.toString(user))==null) { response.setStatus(409); return; }
                            if(path.equals("/local/ai/jumpmap-position")) {
                                var block=com.ssafy.ontop.world.jumpmap.JumpCourse.loadDefault().colliders().stream()
                                        .filter(c -> c.top()>4).findFirst().orElseThrow();
                                channels.releaseFacility(Long.toString(user),new Pose(block.x(),block.top()+.8,block.z(),0));
                            } else {
                                var meshes=map.prepared().orElseThrow().collisionData().path("meshes");
                                Pose site=null; double bestY=4,bestArea=0;
                                for(var mesh:meshes) if(mesh.path("id").asText().equals("tower-deck")) {
                                    var v=mesh.path("vertices"); var indices=mesh.path("indices");
                                    for(int i=0;i+2<indices.size();i+=3) {
                                        int a=indices.get(i).asInt()*3,b=indices.get(i+1).asInt()*3,c=indices.get(i+2).asInt()*3;
                                        double y=v.get(a+1).asDouble();
                                        if(Math.abs(y-v.get(b+1).asDouble())>.001 || Math.abs(y-v.get(c+1).asDouble())>.001) continue;
                                        double area=Math.abs((v.get(b).asDouble()-v.get(a).asDouble())*(v.get(c+2).asDouble()-v.get(a+2).asDouble())
                                                -(v.get(c).asDouble()-v.get(a).asDouble())*(v.get(b+2).asDouble()-v.get(a+2).asDouble()));
                                        if(area>1 && (y>bestY || y==bestY && area>bestArea)) {
                                            bestY=y; bestArea=area; site=new Pose((v.get(a).asDouble()+v.get(b).asDouble()+v.get(c).asDouble())/3,y+.8,
                                                    (v.get(a+2).asDouble()+v.get(b+2).asDouble()+v.get(c+2).asDouble())/3,0);
                                        }
                                    }
                                }
                                if(site==null) throw new IllegalStateException("높은 검수 지점 없음");
                                channels.releaseFacility(Long.toString(user),site);
                            }
                            result=Map.of("placed",true);
                        } else if(user==101 && path.equals("/local/ai/status") && request.getMethod().equals("GET")) result=ai.status();
                        else if(user==101 && path.equals("/local/ai/assessments") && request.getMethod().equals("GET")) result=ai.assessments();
                        else if(user==101 && path.equals("/local/ai/conflicts") && request.getMethod().equals("GET")) result=ai.conflictAssessments();
                        else if(user==101 && request.getMethod().equals("POST") && path.equals("/local/ai/flush")) { ai.flush(); result=Map.of("queued",true); }
                        else if(user==101 && request.getMethod().equals("POST") && path.equals("/local/ai/digest")) { ai.digest(); result=Map.of("queued",true); }
                        else { response.setStatus(403); return; }
                        response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
                        mapper.writeValue(response.getWriter(),result);
                    } catch(IllegalArgumentException invalid) {response.setStatus(request.getRequestURI().startsWith("/local/ai/joke-contest/")?400:403);response.setContentType("application/json");response.setCharacterEncoding("UTF-8");mapper.writeValue(response.getWriter(),Map.of("message",invalid.getMessage()==null?"입력을 확인해주세요.":invalid.getMessage()));}
                    catch(RuntimeException denied) { response.setStatus(403); }
                }
            });
            return registration;
        }
    }
    /** Persistence substitute only. The production FeedbackService keeps validation, receipt and cooldown. */
    static final class MemoryFeedback extends FeedbackRepository {
        private final List<FeedbackMessage> rows=new ArrayList<>();
        private final Map<String,FeedbackMessage> requests=new HashMap<>();
        private final java.util.concurrent.atomic.AtomicLong sequence=new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis()*1000);
        MemoryFeedback() { super(null); }
        @Override public boolean lockActiveMember(long id) { return Set.of(101L,202L,505L).contains(id); }
        @Override public synchronized Optional<FeedbackMessage> request(long user,String key,Instant cutoff) { return Optional.ofNullable(requests.get(user+":"+key)); }
        @Override public synchronized Optional<Instant> latest(long user) { return rows.stream().filter(r -> r.userId()==user).map(FeedbackMessage::createdAt).max(Comparator.naturalOrder()); }
        @Override public synchronized void save(FeedbackMessage message) {
            try {
                var id=FeedbackMessage.class.getDeclaredField("id"); id.setAccessible(true); id.set(message,sequence.incrementAndGet());
                var key=FeedbackMessage.class.getDeclaredField("requestKey"); key.setAccessible(true);
                requests.put(message.userId()+":"+key.get(message),message); rows.add(message);
            } catch(ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
        }
        @Override public synchronized List<FeedbackMessage> list(long before,int limit,Instant cutoff) {
            return rows.stream().filter(r -> r.id()<before).sorted(Comparator.comparing(FeedbackMessage::id).reversed()).limit(limit).toList();
        }
        @Override public void deleteExpiredForMember(long id,Instant cutoff) { }
        @Override public int deleteExpired(Instant cutoff) { return 0; }
    }
}
