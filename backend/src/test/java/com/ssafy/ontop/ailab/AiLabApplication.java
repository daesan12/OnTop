package com.ssafy.ontop.ailab;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.InetAddress;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.util.UriComponentsBuilder;

/** Test classpath launcher, always loopback, no component scan, Flyway, authentication, or shared services. */
public final class AiLabApplication {
    public static void main(String[] args) {
        // Arguments intentionally cannot override loopback/profile/database isolation.
        new SpringApplication(Config.class).run("--server.address=127.0.0.1","--server.port=19190",
                "--spring.profiles.active=ai-local-lab","--spring.flyway.enabled=false","--spring.main.banner-mode=off",
                "--springdoc.api-docs.enabled=false","--springdoc.swagger-ui.enabled=false","--server.error.include-message=never",
                "--management.endpoints.web.exposure.include=health");
    }
    @Configuration(proxyBeanMethods=false)
    @Profile("ai-local-lab")
    @EnableAutoConfiguration(exclude={DataSourceAutoConfiguration.class,HibernateJpaAutoConfiguration.class,
            SecurityAutoConfiguration.class,UserDetailsServiceAutoConfiguration.class,ManagementWebSecurityAutoConfiguration.class})
    @EnableWebSocket
    public static class Config {
        @Bean(destroyMethod="close") AiLabRuntime aiLabRuntime(ObjectMapper mapper,org.springframework.core.env.Environment environment) throws Exception {
            var env=environment.getProperty("ai.lab.force-offline",Boolean.class,false)?Map.<String,String>of():System.getenv();
            return new AiLabRuntime(mapper,Path.of(environment.getProperty("ai.lab.data-dir",env.getOrDefault("AI_LAB_DATA_DIR",".gradle/ai-lab"))),env);
        }
        @Bean Controller aiLabController(AiLabRuntime runtime) { return new Controller(runtime); }
        @Bean(destroyMethod="close") LabSocket aiLabSocket(AiLabRuntime runtime,ObjectMapper mapper) { return new LabSocket(runtime,mapper); }
        @Bean WebSocketConfigurer aiLabRoutes(LabSocket socket) {
            return registry -> registry.addHandler(socket,"/dev/ai/ws").setAllowedOrigins("http://127.0.0.1:5210","http://localhost:5210");
        }
        @Bean FilterRegistrationBean<Filter> aiLabBoundary() {
            Filter filter=(request,response,chain) -> {
                var http=(HttpServletRequest)request; var out=(HttpServletResponse)response;
                String origin=http.getHeader("Origin"),host=http.getHeader("Host");
                boolean local=InetAddress.getByName(http.getRemoteAddr()).isLoopbackAddress();
                boolean knownHost=host!=null && Set.of("127.0.0.1:"+http.getLocalPort(),"localhost:"+http.getLocalPort()).contains(host);
                boolean knownOrigin=origin==null || Set.of("http://127.0.0.1:5210","http://localhost:5210","http://127.0.0.1:19190").contains(origin);
                if(!local || !knownHost || !knownOrigin || http.getMethod().equals("POST") && !"local".equals(http.getHeader("X-Ai-Lab"))) {
                    out.setStatus(403); return;
                }
                if(http.getContentLengthLong()>16_384) { out.setStatus(413); return; }
                out.setHeader("Cache-Control","no-store");
                chain.doFilter(request,response);
            };
            var registration=new FilterRegistrationBean<>(filter); registration.setOrder(Integer.MIN_VALUE); return registration;
        }
    }
    @RestController
    @Profile("ai-local-lab")
    @RequestMapping("/dev/ai")
    public static class Controller {
        private final AiLabRuntime runtime;
        Controller(AiLabRuntime runtime) { this.runtime=runtime; }
        @GetMapping("/state") Object state(@RequestParam(defaultValue="world:one") String scope,@RequestParam(defaultValue="false") boolean admin,
                @RequestParam(defaultValue="") String author) {
            return runtime.snapshot(scope,admin,author);
        }
        @PostMapping("/command") Object command(@RequestBody JsonNode body) { return runtime.command(body); }
        @ExceptionHandler({IllegalArgumentException.class,IllegalStateException.class,java.util.concurrent.RejectedExecutionException.class})
        ResponseEntity<?> failure(RuntimeException exception) {
            return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(Map.of("error",
                    exception instanceof IllegalArgumentException?exception.getMessage():"처리할 수 없습니다. 로컬 저장·대기열·중복 실행 여부를 확인해주세요."));
        }
    }
    public static final class LabSocket extends TextWebSocketHandler implements AutoCloseable {
        private final Map<String,Client> clients=new ConcurrentHashMap<>();
        private final ScheduledExecutorService sender=Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon(true).name("ai-lab-ws").factory());
        private final AiLabRuntime runtime;
        private final ObjectMapper mapper;
        LabSocket(AiLabRuntime runtime,ObjectMapper mapper) {
            this.runtime=runtime; this.mapper=mapper;
            sender.scheduleWithFixedDelay(this::publish,0,400,TimeUnit.MILLISECONDS);
        }
        @Override public void afterConnectionEstablished(WebSocketSession raw) throws Exception {
            if(clients.size()>=8) { raw.close(new CloseStatus(1013,"local connection limit")); return; }
            var params=UriComponentsBuilder.fromUri(raw.getUri()).build().getQueryParams();
            try {
                String scope=AiLabRuntime.scope(org.springframework.web.util.UriUtils.decode(params.getFirst("scope"),java.nio.charset.StandardCharsets.UTF_8));
                String author=params.getFirst("author");
                author=author==null?"":org.springframework.web.util.UriUtils.decode(author,java.nio.charset.StandardCharsets.UTF_8);
                if(author.length()>32) throw new IllegalArgumentException("검수 사용자 길이 오류");
                clients.put(raw.getId(),new Client(new ConcurrentWebSocketSessionDecorator(raw,1000,128*1024),scope,author));
            } catch(RuntimeException exception) { raw.close(CloseStatus.POLICY_VIOLATION); }
        }
        @Override protected void handleTextMessage(WebSocketSession session,TextMessage message) throws Exception { session.close(CloseStatus.POLICY_VIOLATION); }
        @Override public void afterConnectionClosed(WebSocketSession session,CloseStatus status) { clients.remove(session.getId()); }
        private void publish() {
            for(var entry:clients.entrySet()) {
                try { entry.getValue().socket.sendMessage(new TextMessage(mapper.writeValueAsString(runtime.snapshot(entry.getValue().scope,false,entry.getValue().author)))); }
                catch(Exception exception) { clients.remove(entry.getKey()); try { entry.getValue().socket.close(); } catch(Exception ignored) { } }
            }
        }
        @Override public void close() throws Exception { sender.shutdownNow(); for(var client:clients.values()) client.socket.close(); clients.clear(); }
        private record Client(WebSocketSession socket,String scope,String author) { }
    }
}
