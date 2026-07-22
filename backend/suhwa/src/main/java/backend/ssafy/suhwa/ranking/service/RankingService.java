package backend.ssafy.suhwa.ranking.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.ranking.dto.RankingEntry;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RankingService {

    private final UserRepository userRepository;

    public RankingResponse getRankings(Long requesterId) {
        List<User> topUsers = userRepository.findTop5ByDeletedAtIsNullOrderByWinCountDescLossCountAsc();
        List<RankingEntry> top = new ArrayList<>();
        for (int i = 0; i < topUsers.size(); i++) {
            top.add(RankingEntry.of(i + 1, topUsers.get(i)));
        }

        User me = userRepository.findById(requesterId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        int myRank = (int) userRepository.countHigherRanked(me.getWinCount(), me.getLossCount());

        return new RankingResponse(top, RankingEntry.of(myRank, me));
    }
}
