// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TestPage } from "./TestPage";
import { fingerspellingItems } from "../data/fingerspelling";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  // jsdom에는 카메라가 없다. 진행 화면이 안내 문구로 넘어가는 경로를 쓴다.
  Object.defineProperty(navigator, "mediaDevices", {
    value: undefined,
    configurable: true,
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <TestPage />
    </MemoryRouter>,
  );

/** 설정 화면에서 분류/문항 수를 고르고 테스트를 시작한다. */
const startTest = (categoryLabel: string, count: string) => {
  const setupCategory = screen.getByRole("button", { name: new RegExp(categoryLabel) });
  if (setupCategory.getAttribute("aria-pressed") === "false") {
    fireEvent.click(setupCategory);
  }
  fireEvent.click(screen.getByRole("button", { name: count }));
  fireEvent.click(screen.getByRole("button", { name: "테스트 시작" }));
};

/** 자음만 남기고 시작해 문항 수를 통제한다. */
const startConsonantOnly = (count: string) => {
  fireEvent.click(screen.getByRole("button", { name: /자음/ })); // 기본 선택 해제
  fireEvent.click(screen.getByRole("button", { name: /자음/ })); // 다시 선택
  startTest("자음", count);
};

describe("TestPage 설정 화면", () => {
  it("기본으로 자음이 선택되고 최대 문항 수를 안내한다", () => {
    renderPage();

    expect(
      screen.getByRole("button", { name: /자음/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("최대 14문항")).toBeTruthy();
  });

  it("분류를 모두 해제하면 시작할 수 없다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /자음/ }));

    expect(screen.getByText("분류를 한 개 이상 선택해 주세요.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "테스트 시작" }),
    ).toHaveProperty("disabled", true);
  });

  it("숫자 분류는 AI 미지원이라 선택할 수 없다", () => {
    renderPage();

    const numberCategory = screen.getByRole("button", { name: /숫자/ });

    expect(numberCategory).toHaveProperty("disabled", true);
    expect(screen.getByText("준비중")).toBeTruthy();
  });

  it("전체를 고르면 보유 글자 수만큼 출제한다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "전체" }));

    expect(
      screen.getByText("14문항이 무작위 순서로 출제됩니다."),
    ).toBeTruthy();
  });

  it("직접 입력으로 문항 수를 지정할 수 있다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
    fireEvent.change(screen.getByLabelText("문항 수 직접 입력"), {
      target: { value: "3" },
    });

    expect(screen.getByText("3문항이 무작위 순서로 출제됩니다.")).toBeTruthy();
  });

  it("보유 글자보다 많이 직접 입력하면 축소 안내를 보여준다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
    fireEvent.change(screen.getByLabelText("문항 수 직접 입력"), {
      target: { value: "20" },
    });

    expect(
      screen.getByText("선택한 분류에는 14자가 있어 14문항으로 출제됩니다."),
    ).toBeTruthy();
  });

  it("직접 입력을 0으로 두면 시작할 수 없다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
    fireEvent.change(screen.getByLabelText("문항 수 직접 입력"), {
      target: { value: "0" },
    });

    expect(screen.getByText("문항 수를 1개 이상 입력해 주세요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "테스트 시작" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("분류를 중복 선택할 수 있다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /모음/ }));

    expect(screen.getByText("최대 31문항")).toBeTruthy();
  });
});

describe("TestPage 진행 화면", () => {
  it("문제 글자와 진행도, 타이머를 보여준다", () => {
    renderPage();
    startConsonantOnly("5개");

    expect(screen.getByText("1 / 5")).toBeTruthy();
    expect(screen.getByText("문제")).toBeTruthy();
    expect(screen.getByRole("timer", { name: "남은 시간" }).textContent).toBe(
      "10초",
    );
  });

  it("문제 글자 위에 분류와 글자 이름을 뱃지로 보여준다", () => {
    renderPage();
    startConsonantOnly("5개");

    const tags = document.querySelector(".test-question-tags") as HTMLElement;
    const symbol = document.querySelector(
      ".test-question-symbol",
    ) as HTMLElement;

    // 자음만 출제했으므로 분류 뱃지는 항상 "자음"이다.
    expect(
      within(tags).getByText("자음", { selector: ".test-question-tag-category" }),
    ).toBeTruthy();

    // 이름 뱃지는 출제된 글자의 이름과 일치해야 한다.
    const name = tags.querySelectorAll(".test-question-tag")[1].textContent;
    const expected = fingerspellingItems.consonant.find(
      (item) => item.symbol === symbol.textContent,
    );

    expect(expected).toBeTruthy();
    expect(name).toBe(expected?.name);
  });

  it("모음 문항도 분류 뱃지가 모음으로 표시된다", () => {
    renderPage();
    // 자음 해제 후 모음만 선택
    fireEvent.click(screen.getByRole("button", { name: /자음/ }));
    fireEvent.click(screen.getByRole("button", { name: /모음/ }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 시작" }));

    const tags = document.querySelector(".test-question-tags") as HTMLElement;

    expect(
      within(tags).getByText("모음", { selector: ".test-question-tag-category" }),
    ).toBeTruthy();
  });

  it("카메라를 쓸 수 없으면 안내 문구를 보여준다", () => {
    renderPage();
    startConsonantOnly("5개");

    expect(
      screen.getByText("현재 환경에서는 카메라를 사용할 수 없습니다."),
    ).toBeTruthy();
  });

  it("넘어가기를 누르면 다음 문항으로 이동한다", () => {
    renderPage();
    startConsonantOnly("5개");

    fireEvent.click(screen.getByRole("button", { name: "넘어가기" }));

    expect(screen.getByText("2 / 5")).toBeTruthy();
  });

  it("제한 시간이 지나면 자동으로 다음 문항으로 넘어간다", () => {
    vi.useFakeTimers();
    renderPage();
    startConsonantOnly("5개");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText("2 / 5")).toBeTruthy();
  });
});

describe("TestPage 결과 화면", () => {
  /** 5문항을 모두 넘겨 결과 화면까지 진행한다. */
  const finishAllWrong = () => {
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "넘어가기" }));
    }
  };

  const resultItems = () =>
    within(screen.getByRole("list")).getAllByRole("button");

  /** 결과 목록 항목에 표시된 글자. */
  const itemSymbol = (item: HTMLElement) =>
    item.querySelector(".test-result-symbol")?.textContent;

  /** 우측 상세 패널에 표시된 글자. */
  const detailSymbol = () =>
    screen.getByRole("heading", { level: 2 }).textContent;

  it("마지막 문항을 끝내면 결과 화면으로 넘어간다", () => {
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    expect(
      screen.getByText("5개 문자를 오답노트에 추가했어요!"),
    ).toBeTruthy();
    expect(
      screen.getByText("총 5문항 중 정답 0개 · 오답 5개"),
    ).toBeTruthy();
  });

  it("문항 목록과 선택된 글자의 상세를 보여준다", () => {
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    const listItems = resultItems();

    expect(listItems).toHaveLength(5);
    // 기본 선택은 첫 문항이고, 상세 패널이 같은 글자를 보여준다.
    expect(listItems[0].getAttribute("aria-pressed")).toBe("true");
    expect(detailSymbol()).toBe(itemSymbol(listItems[0]));
    expect(screen.getByText("수형 설명")).toBeTruthy();

    // 손그림 이미지 경로가 문항에서 상세 패널까지 전달되어야 한다.
    const image = document.querySelector(
      ".fingerspelling-detail-image img",
    ) as HTMLImageElement;

    expect(image).toBeTruthy();
    expect(image.getAttribute("src")).toMatch(/\.png$/);
    expect(image.getAttribute("alt")).toContain("지문자 동작");
  });

  it("목록 항목을 클릭하면 상세가 그 글자로 바뀐다", () => {
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    const listItems = resultItems();
    const targetSymbol = itemSymbol(listItems[2]);

    fireEvent.click(listItems[2]);

    expect(listItems[2].getAttribute("aria-pressed")).toBe("true");
    expect(listItems[0].getAttribute("aria-pressed")).toBe("false");
    expect(detailSymbol()).toBe(targetSymbol);
  });

  it("카드 제목이 타원형 뱃지로 렌더된다", () => {
    renderPage();
    startConsonantOnly("5개");

    const labels = document.querySelectorAll(".test-panel-label");
    const badges = document.querySelectorAll(".test-panel-label > span");

    expect(labels).toHaveLength(2);
    expect(badges).toHaveLength(2);
    expect([...badges].map((badge) => badge.textContent)).toEqual([
      "문제",
      "내 동작",
    ]);
  });

  it("안내 문구와 컨트롤이 카메라 영역 밖에 배치된다", () => {
    renderPage();
    startConsonantOnly("5개");

    const camera = document.querySelector(
      ".test-camera-placeholder",
    ) as HTMLElement;
    const footer = document.querySelector(
      ".test-camera-footer",
    ) as HTMLElement;

    expect(footer).toBeTruthy();
    // 안내·타이머·넘어가기는 영상 안이 아니라 하단 영역에 있어야 한다.
    expect(camera.querySelector(".test-recognition-message")).toBeNull();
    expect(camera.querySelector(".test-camera-controls")).toBeNull();
    expect(within(footer).getByRole("timer", { name: "남은 시간" })).toBeTruthy();
    expect(within(footer).getByRole("button", { name: "넘어가기" })).toBeTruthy();
    expect(footer.querySelector(".test-recognition-message")).toBeTruthy();
  });

  it("오답노트 버튼은 개발중 팝업을 연다", () => {
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    fireEvent.click(screen.getByRole("button", { name: "오답노트" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("수달이 개발중..")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "기다릴게!" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("문항이 많아도 목록과 하단 버튼이 모두 렌더된다", () => {
    renderPage();
    // 자음 전체(14문항)로 목록이 길어지는 상황을 만든다.
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 시작" }));
    for (let index = 0; index < 14; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "넘어가기" }));
    }

    const list = screen.getByRole("list");
    const actions = document.querySelector(
      ".test-result-actions",
    ) as HTMLElement;

    expect(within(list).getAllByRole("button")).toHaveLength(14);
    // 목록이 길어져도 하단 고정 영역은 잘리지 않고 남아 있어야 한다.
    expect(within(actions).getByRole("button", { name: "다시 테스트" })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: "오답노트" })).toBeTruthy();
    expect(within(actions).getByRole("link", { name: "메인페이지" })).toBeTruthy();
  });

  it("오답 문항은 오답노트에 담긴 상태로 시작하고 토글할 수 있다", () => {
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    // 전부 오답이므로 첫 문항은 이미 담겨 있다.
    expect(
      screen.getByText("5개 문자를 오답노트에 추가했어요!"),
    ).toBeTruthy();

    const toggle = () =>
      screen.getByRole("button", { name: /오답노트 (추가|삭제)하기/ });

    expect(toggle().textContent).toBe("오답노트 삭제하기");

    fireEvent.click(toggle());

    expect(toggle().textContent).toBe("오답노트 추가하기");
    expect(
      screen.getByText("4개 문자를 오답노트에 추가했어요!"),
    ).toBeTruthy();

    fireEvent.click(toggle());

    expect(toggle().textContent).toBe("오답노트 삭제하기");
    expect(
      screen.getByText("5개 문자를 오답노트에 추가했어요!"),
    ).toBeTruthy();
  });

  it("오답노트를 바꾸면 알림이 떴다가 사라진다", () => {
    vi.useFakeTimers();
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    const toggle = () =>
      screen.getByRole("button", { name: /오답노트 (추가|삭제)하기/ });

    fireEvent.click(toggle());
    expect(screen.getByText("오답노트에서 삭제되었어요.")).toBeTruthy();
    expect(
      document.querySelector(".test-toast")?.getAttribute("data-tone"),
    ).toBe("remove");

    fireEvent.click(toggle());
    expect(screen.getByText("오답노트에 추가되었어요.")).toBeTruthy();
    expect(
      document.querySelector(".test-toast")?.getAttribute("data-tone"),
    ).toBe("add");

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(screen.queryByText("오답노트에 추가되었어요.")).toBeNull();
  });

  it("오답노트 담김 여부는 선택한 문항을 따라간다", () => {
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    const toggle = () =>
      screen.getByRole("button", { name: /오답노트 (추가|삭제)하기/ });

    // 첫 문항만 오답노트에서 뺀다.
    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("오답노트 추가하기");

    // 다른 문항을 고르면 여전히 담긴 상태여야 한다.
    fireEvent.click(resultItems()[2]);
    expect(toggle().textContent).toBe("오답노트 삭제하기");

    // 첫 문항으로 돌아오면 뺀 상태가 유지된다.
    fireEvent.click(resultItems()[0]);
    expect(toggle().textContent).toBe("오답노트 추가하기");
  });

  it("다시 테스트를 누르면 설정 화면으로 돌아간다", () => {
    renderPage();
    startConsonantOnly("5개");
    finishAllWrong();

    fireEvent.click(screen.getByRole("button", { name: "다시 테스트" }));

    expect(screen.getByRole("button", { name: "테스트 시작" })).toBeTruthy();
  });
});
