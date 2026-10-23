package com.ssafy.ontop.wallet.admin;

import com.ssafy.ontop.OntopApplication;
import com.ssafy.ontop.wallet.service.ExistingWalletInitializationService;
import org.slf4j.LoggerFactory;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;

public final class WalletInitializationCommand {

    private WalletInitializationCommand() { }

    public static void main(String[] args) {
        try (var context = new SpringApplicationBuilder(OntopApplication.class)
                .web(WebApplicationType.NONE).profiles("db").run(args)) {
            var result = context.getBean(ExistingWalletInitializationService.class).initializeExistingMembers();
            LoggerFactory.getLogger(WalletInitializationCommand.class).info(
                    "Wallet initialization completed: created={}, preserved={}, inactive={}",
                    result.created(), result.preserved(), result.inactive());
        }
    }
}
