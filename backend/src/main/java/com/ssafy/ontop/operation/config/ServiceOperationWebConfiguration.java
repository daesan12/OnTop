package com.ssafy.ontop.operation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class ServiceOperationWebConfiguration implements WebMvcConfigurer {
    private final ServiceOperationService operations;
    private final ObjectMapper mapper;

    public ServiceOperationWebConfiguration(ServiceOperationService operations, ObjectMapper mapper) {
        this.operations = operations;
        this.mapper = mapper;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new NewActivityGateInterceptor(operations, mapper));
    }
}
