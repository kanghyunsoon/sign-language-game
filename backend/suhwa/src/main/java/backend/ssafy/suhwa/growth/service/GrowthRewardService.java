package backend.ssafy.suhwa.growth.service;

import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.user.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GrowthRewardService {

    private final PetGrowthService petGrowthService;
    private final UserService userService;

    public UserPet lockPet(Long userId) {
        userService.getActiveUser(userId);
        return petGrowthService.lockPet(userId);
    }

    public void rewardLocked(UserPet pet, int experience) {
        petGrowthService.addExperience(pet, experience);
    }
}
