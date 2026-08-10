package backend.ssafy.suhwa.growth.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PetGrowthService {

    private final UserPetRepository userPetRepository;
    private final GrowthPolicyProperties policy;

    public UserPet createInitialPet(Long userId) {
        return userPetRepository.findByUserId(userId)
                .orElseGet(() -> {
                    UserPet pet = UserPet.builder().userId(userId).build();
                    userPetRepository.save(pet);
                    return pet;
                });
    }

    public UserPet lockPet(Long userId) {
        return userPetRepository.findByUserIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PET_NOT_FOUND));
    }

    public void addExperience(UserPet pet, int amount) {
        pet.addExperience(amount, policy.getExpPerLevel(), policy.getMaxLevel());
    }
}
