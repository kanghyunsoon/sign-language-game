package backend.ssafy.suhwa.growth.repository;

import backend.ssafy.suhwa.growth.domain.UserPet;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserPetRepository extends JpaRepository<UserPet, Long> {

    Optional<UserPet> findByUserId(Long userId);

    boolean existsByUserId(Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select pet from UserPet pet where pet.userId = :userId")
    Optional<UserPet> findByUserIdForUpdate(@Param("userId") Long userId);
}
