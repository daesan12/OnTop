package com.ssafy.ontop.world.mobility;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class MobilityRentalsTests {
    private final MobilityWallet wallet = mock(MobilityWallet.class);
    private final MobilityRentals rentals = new MobilityRentals(wallet, new ObjectMapper().createArrayNode());

    @Test
    void 두번째_초_결제_실패는_이미_결제된_금액을_늘리지_않는다() {
        when(wallet.charge(42, "lease", 1, 2)).thenReturn(MobilityWallet.Payment.PAID);
        when(wallet.charge(42, "lease", 2, 2)).thenReturn(MobilityWallet.Payment.INSUFFICIENT);
        rentals.start("avatar", 42, "one", "lease", "mobility-entry", VehicleKind.SCOOTER);

        assertThat(rentals.extend(rentals.current("avatar"))).isEqualTo(MobilityWallet.Payment.INSUFFICIENT);
        var ended = rentals.end("avatar");

        assertThat(ended.total()).isEqualTo(2);
        assertThat(rentals.accountInUse(42)).isFalse();
        assertThat(rentals.active()).isEmpty();
        verify(wallet).charge(42, "lease", 1, 2);
        verify(wallet).charge(42, "lease", 2, 2);
        verifyNoMoreInteractions(wallet);
    }

    @Test
    void 정문에서_자전거와_킥보드의_상호작용_범위를_따로_판정한다() throws Exception {
        var stations = new ObjectMapper().readTree("""
                [{"id":"mobility-entry","reachPosition":[-6.85,4.885,86.5],
                  "yaw":-1.57,"radius":3,"heightTolerance":0.7}]
                """);
        var mapRentals = new MobilityRentals(wallet, stations);
        var bicycleSide = new Position(0, -6.85, 4.885, 84.8, 0);

        assertThat(mapRentals.inReach("mobility-entry", VehicleKind.BICYCLE, bicycleSide)).isTrue();
        assertThat(mapRentals.inReach("mobility-entry", VehicleKind.SCOOTER, bicycleSide)).isFalse();
        assertThat(mapRentals.inReach("unknown", VehicleKind.BICYCLE, bicycleSide)).isFalse();
    }
}
