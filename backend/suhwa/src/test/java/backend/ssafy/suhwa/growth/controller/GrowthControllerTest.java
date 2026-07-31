package backend.ssafy.suhwa.growth.controller;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import backend.ssafy.suhwa.growth.domain.EvolutionStage;
import backend.ssafy.suhwa.growth.dto.AttendanceCompletionResponse;
import backend.ssafy.suhwa.growth.dto.AttendanceResponse;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.service.AttendanceService;
import backend.ssafy.suhwa.growth.service.PetQueryService;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(GrowthController.class)
@AutoConfigureMockMvc(addFilters = false)
class GrowthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AttendanceService attendanceService;

    @MockitoBean
    private PetQueryService petQueryService;

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(1L, null, List.of()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getAttendanceReturnsCurrentStatus() throws Exception {
        given(attendanceService.getTodayStatus(1L))
                .willReturn(new AttendanceResponse(LocalDate.of(2026, 7, 30), false, 3));

        mockMvc.perform(get("/growth/attendance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attendedToday").value(false))
                .andExpect(jsonPath("$.streakCount").value(3));
    }

    @Test
    void postAttendanceReturnsGrowthResult() throws Exception {
        PetStatusResponse pet = new PetStatusResponse(1, 3, 17, EvolutionStage.STAGE_1, 20);
        given(attendanceService.checkIn(1L)).willReturn(
                new AttendanceCompletionResponse(
                        LocalDate.of(2026, 7, 30), true, 1, true, 3, pet));

        mockMvc.perform(post("/growth/attendance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.newlyAttended").value(true))
                .andExpect(jsonPath("$.awardedExp").value(3))
                .andExpect(jsonPath("$.pet.currentExp").value(3));
    }

    @Test
    void getPetReturnsCurrentGrowthState() throws Exception {
        given(petQueryService.getStatus(1L))
                .willReturn(new PetStatusResponse(5, 7, 13, EvolutionStage.STAGE_2, 20));

        mockMvc.perform(get("/growth/pet"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.level").value(5))
                .andExpect(jsonPath("$.currentExp").value(7))
                .andExpect(jsonPath("$.evolutionStage").value("STAGE_2"));
    }

    @Test
    void getPetForWithdrawnUserReturnsNotFound() throws Exception {
        given(petQueryService.getStatus(1L))
                .willThrow(new BusinessException(ErrorCode.USER_NOT_FOUND));

        mockMvc.perform(get("/growth/pet"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }
}
