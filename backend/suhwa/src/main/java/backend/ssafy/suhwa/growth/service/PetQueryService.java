package backend.ssafy.suhwa.growth.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.user.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PetQueryService {

    private final UserPetRepository userPetRepository;
    private final GrowthPolicyProperties policy;
    private final UserService userService;

    public PetStatusResponse getStatus(Long userId) {
        userService.getActiveUser(userId);
        return userPetRepository.findByUserId(userId)
                .map(pet -> PetStatusResponse.from(pet, policy))
                .orElseThrow(() -> new BusinessException(ErrorCode.PET_NOT_FOUND));
    }
}
