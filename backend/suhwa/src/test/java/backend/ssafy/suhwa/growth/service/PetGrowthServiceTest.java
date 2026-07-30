package backend.ssafy.suhwa.growth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PetGrowthServiceTest {

    @Mock
    private UserPetRepository userPetRepository;

    private PetGrowthService petGrowthService;

    @BeforeEach
    void setUp() {
        GrowthPolicyProperties policy = new GrowthPolicyProperties();
        petGrowthService = new PetGrowthService(userPetRepository, policy);
    }

    @Test
    void createsInitialPetExactlyOnce() {
        given(userPetRepository.findByUserId(1L)).willReturn(Optional.empty());

        UserPet pet = petGrowthService.createInitialPet(1L);

        assertThat(pet.getLevel()).isEqualTo(1);
        assertThat(pet.getExp()).isZero();
        verify(userPetRepository).save(pet);
    }

    @Test
    void lockedPetReceivesExperience() {
        UserPet pet = UserPet.builder().userId(1L).build();
        given(userPetRepository.findByUserIdForUpdate(1L)).willReturn(Optional.of(pet));

        UserPet locked = petGrowthService.lockPet(1L);
        petGrowthService.addExperience(locked, 23);

        assertThat(pet.getLevel()).isEqualTo(2);
        assertThat(pet.getExp()).isEqualTo(3);
    }
}
