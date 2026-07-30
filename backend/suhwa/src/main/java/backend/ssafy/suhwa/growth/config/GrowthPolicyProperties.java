package backend.ssafy.suhwa.growth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "growth")
public class GrowthPolicyProperties {

    private int attendanceExp = 3;
    private int practiceExp = 10;
    private int testExp = 7;
    private int soloFastExp = 15;
    private int soloMediumExp = 10;
    private int soloSlowExp = 5;
    private int duelWinnerExp = 10;
    private int duelLoserExp = 3;
    private int expPerLevel = 20;
    private int firstEvolutionLevel = 5;
    private int finalEvolutionLevel = 10;
    private int maxLevel = 10;

    public int getAttendanceExp() {
        return attendanceExp;
    }

    public void setAttendanceExp(int attendanceExp) {
        this.attendanceExp = attendanceExp;
    }

    public int getPracticeExp() {
        return practiceExp;
    }

    public void setPracticeExp(int practiceExp) {
        this.practiceExp = practiceExp;
    }

    public int getTestExp() {
        return testExp;
    }

    public void setTestExp(int testExp) {
        this.testExp = testExp;
    }

    public int getSoloFastExp() {
        return soloFastExp;
    }

    public void setSoloFastExp(int soloFastExp) {
        this.soloFastExp = soloFastExp;
    }

    public int getSoloMediumExp() {
        return soloMediumExp;
    }

    public void setSoloMediumExp(int soloMediumExp) {
        this.soloMediumExp = soloMediumExp;
    }

    public int getSoloSlowExp() {
        return soloSlowExp;
    }

    public void setSoloSlowExp(int soloSlowExp) {
        this.soloSlowExp = soloSlowExp;
    }

    public int getDuelWinnerExp() {
        return duelWinnerExp;
    }

    public void setDuelWinnerExp(int duelWinnerExp) {
        this.duelWinnerExp = duelWinnerExp;
    }

    public int getDuelLoserExp() {
        return duelLoserExp;
    }

    public void setDuelLoserExp(int duelLoserExp) {
        this.duelLoserExp = duelLoserExp;
    }

    public int getExpPerLevel() {
        return expPerLevel;
    }

    public void setExpPerLevel(int expPerLevel) {
        this.expPerLevel = expPerLevel;
    }

    public int getFirstEvolutionLevel() {
        return firstEvolutionLevel;
    }

    public void setFirstEvolutionLevel(int firstEvolutionLevel) {
        this.firstEvolutionLevel = firstEvolutionLevel;
    }

    public int getFinalEvolutionLevel() {
        return finalEvolutionLevel;
    }

    public void setFinalEvolutionLevel(int finalEvolutionLevel) {
        this.finalEvolutionLevel = finalEvolutionLevel;
    }

    public int getMaxLevel() {
        return maxLevel;
    }

    public void setMaxLevel(int maxLevel) {
        this.maxLevel = maxLevel;
    }
}
