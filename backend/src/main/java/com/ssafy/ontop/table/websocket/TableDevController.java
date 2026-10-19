package com.ssafy.ontop.table.websocket;

import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
public class TableDevController {

    @GetMapping(value = "/dev/tables", produces = MediaType.TEXT_HTML_VALUE)
    public Resource page() {
        return new ClassPathResource("dev/tables.html");
    }
}
