package com.ssafy.ontop.shop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.security.Principal;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Profile("(local | dev) & !prod & !production")
@Order(-101)
public class ShopAccessFilter extends OncePerRequestFilter {
    private static final Set<String> PATHS = Set.of("/api/v1/shop/items", "/api/v1/shop/purchases",
            "/api/v1/users/me/items", "/api/v1/users/me/equipment");
    private final AccessJwtService jwt;
    private final ObjectProvider<WebSocketAccountLookup> accounts;
    private final AuthExchangeOriginPolicy origins;
    private final ObjectMapper mapper;

    public ShopAccessFilter(AccessJwtService jwt, ObjectProvider<WebSocketAccountLookup> accounts,
            AuthExchangeOriginPolicy origins, ObjectMapper mapper) {
        this.jwt = jwt;
        this.accounts = accounts;
        this.origins = origins;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !PATHS.contains(request.getRequestURI().substring(request.getContextPath().length()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.addHeader("Vary", "Origin");
        try {
            String origin = origins.allowedOrigin(request);
            if (origin != null) { response.setHeader("Access-Control-Allow-Origin", origin); }
            if (request.getMethod().equals("OPTIONS")) {
                String method = request.getHeader("Access-Control-Request-Method");
                String requested = request.getHeader("Access-Control-Request-Headers");
                if (origin == null || !Set.of("GET", "POST", "PATCH").contains(method == null ? "" : method)
                        || requested != null && Arrays.stream(requested.split(","))
                        .anyMatch(value -> !Set.of("authorization", "content-type", "idempotency-key")
                                .contains(value.trim().toLowerCase(java.util.Locale.ROOT)))) {
                    throw new ShopException(403, "FORBIDDEN", "허용되지 않은 요청 출처입니다.");
                }
                response.addHeader("Vary", "Access-Control-Request-Method");
                response.addHeader("Vary", "Access-Control-Request-Headers");
                response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH");
                response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
                response.setStatus(204);
                return;
            }
            var headers = Collections.list(request.getHeaders("Authorization"));
            if (headers.size() != 1 || !headers.getFirst().startsWith("Bearer ")) {
                throw new ShopException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
            }
            var access = jwt.verifyAccess(headers.getFirst().substring(7));
            long userId = access.userId();
            var lookup = accounts.getIfAvailable();
            if (lookup == null) { throw new ShopException(503, "SHOP_UNAVAILABLE", "계정을 확인할 수 없습니다."); }
            if (lookup.findActive(userId, access.sessionId()).filter(user -> user.userId() == userId).isEmpty()) {
                throw new ShopException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
            }
            Principal principal = () -> Long.toString(userId);
            chain.doFilter(new HttpServletRequestWrapper(request) {
                @Override public Principal getUserPrincipal() { return principal; }
                @Override public String getRemoteUser() { return principal.getName(); }
            }, response);
        } catch (AuthExchangeException exception) {
            int status = exception.error().status().value();
            error(response, status == 401 || status == 403 ? status : 503,
                    status == 401 ? "UNAUTHENTICATED" : status == 403 ? "FORBIDDEN" : "SHOP_UNAVAILABLE");
        } catch (ShopException exception) {
            error(response, exception.status(), exception.code());
        } catch (RuntimeException exception) {
            error(response, 503, "SHOP_UNAVAILABLE");
        }
    }

    private void error(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        mapper.writeValue(response.getOutputStream(), new ShopController.ErrorResponse(code,
                status == 401 ? "로그인이 필요합니다." : status == 403 ? "허용되지 않은 요청 출처입니다."
                        : "요청을 처리할 수 없습니다.", null));
    }
}
