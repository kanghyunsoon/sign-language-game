import otterInBed from "../assets/habitats/otter_in_bed.png";
import otterInCave from "../assets/habitats/otter_in_cave.png";
import otterInRock from "../assets/habitats/otter_in_rock.png";
import otterWithLog from "../assets/habitats/otter_with_log.png";
import otterWithLogTwo from "../assets/habitats/otter_with_log_2.png";

export const habitatOptions = [
  {
    id: "log-pond",
    name: "통나무 연못",
    description: "잔잔한 물가에서 편안하게 쉴 수 있어요.",
    unlockLevel: 1,
    image: otterWithLog,
  },
  {
    id: "log-rest",
    name: "통나무 쉼터",
    description: "포근한 통나무와 함께 쉬어 가는 집이에요.",
    unlockLevel: 5,
    image: otterWithLogTwo,
  },
  {
    id: "rock-home",
    name: "바위 동굴",
    description: "든든한 바위 아래 아늑하게 숨을 수 있어요.",
    unlockLevel: 10,
    image: otterInRock,
  },
  {
    id: "forest-cave",
    name: "숲속 동굴",
    description: "초록빛 숲속에 자리한 조용한 동굴이에요.",
    unlockLevel: 15,
    image: otterInCave,
  },
  {
    id: "cozy-bed",
    name: "포근한 침실",
    description: "하루의 끝을 포근하게 마무리하는 집이에요.",
    unlockLevel: 20,
    image: otterInBed,
  },
] as const;

export type HabitatId = (typeof habitatOptions)[number]["id"];
