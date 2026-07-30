package backend.ssafy.suhwa.growth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.EvolutionStage;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.user.service.UserService;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class PetQueryServiceTest {

    private final UserPetRepository repository = Mockito.mock(UserPetRepository.class);
    private final UserService userService = Mockito.mock(UserService.class);
    private final PetQueryService service =
            new PetQueryService(repository, new GrowthPolicyProperties(), userService);

    @Test
    void levelOneShowsInitialStageAndRemainingExperience() {
        given(repository.findByUserId(1L))
                .willReturn(Optional.of(UserPet.builder().userId(1L).level(1).exp(3).build()));

        PetStatusResponse response = service.getStatus(1L);

        assertThat(response.evolutionStage()).isEqualTo(EvolutionStage.STAGE_1);
        assertThat(response.expToNextLevel()).isEqualTo(17);
    }

    @Test
    void levelFiveShowsSecondStage() {
        given(repository.findByUserId(1L))
                .willReturn(Optional.of(UserPet.builder().userId(1L).level(5).exp(0).build()));

        assertThat(service.getStatus(1L).evolutionStage()).isEqualTo(EvolutionStage.STAGE_2);
    }

    @Test
    void maximumLevelHasNoNextLevelTarget() {
        given(repository.findByUserId(1L))
                .willReturn(Optional.of(UserPet.builder().userId(1L).level(10).exp(0).build()));

        PetStatusResponse response = service.getStatus(1L);

        assertThat(response.evolutionStage()).isEqualTo(EvolutionStage.STAGE_3);
        assertThat(response.expToNextLevel()).isNull();
    }

    @Test
    void missingPetReturnsRecoverableServerError() {
        given(repository.findByUserId(1L)).willReturn(Optional.empty());

        assertThatThrownBy(() -> service.getStatus(1L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(ErrorCode.PET_NOT_FOUND.name()));
    }

    @Test
    void withdrawnUserIsRejectedBeforePetLookup() {
        given(userService.getActiveUser(1L))
                .willThrow(new BusinessException(ErrorCode.USER_NOT_FOUND));

        assertThatThrownBy(() -> service.getStatus(1L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(ErrorCode.USER_NOT_FOUND.name()));
    }
}
