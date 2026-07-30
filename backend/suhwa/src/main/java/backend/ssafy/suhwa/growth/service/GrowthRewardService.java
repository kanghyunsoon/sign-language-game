package backend.ssafy.suhwa.growth.service;

import backend.ssafy.suhwa.growth.domain.UserPet;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GrowthRewardService {

    private final PetGrowthService petGrowthService;

    public UserPet lockPet(Long userId) {
        return petGrowthService.lockPet(userId);
    }

    public void rewardLocked(UserPet pet, int experience) {
        petGrowthService.addExperience(pet, experience);
    }
}
