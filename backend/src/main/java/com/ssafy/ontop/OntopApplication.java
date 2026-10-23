package com.ssafy.ontop;

import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.wallet.domain.Wallet;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;

@SpringBootApplication
@EntityScan(basePackageClasses = {User.class, RefreshToken.class, Wallet.class})
public class OntopApplication {

    public static void main(String[] args) {
        SpringApplication.run(OntopApplication.class, args);
    }
}
