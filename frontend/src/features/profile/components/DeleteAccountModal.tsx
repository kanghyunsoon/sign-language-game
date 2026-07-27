import "./DeleteAccountModal.css";
import { useEffect, useRef, useState } from "react";
import otterDeleteImage from "../assets/otter_delete.png";

interface DeleteAccountModalProps {
  onClose: () => void;
}

const deletedAccountData = [
  "프로필 정보",
  "학습 기록",
  "테스트 결과",
  "오답 노트",
  "게임 전적",
  "랭킹 기록",
] as const;

export function DeleteAccountModal({ onClose }: DeleteAccountModalProps) {
  const initialDevicePixelRatio = useRef(window.devicePixelRatio || 1);
  const initialModalScale = useRef(
    Math.min(window.innerWidth / 1920, window.innerHeight / 1200, 1),
  );
  const [modalScale, setModalScale] = useState(initialModalScale.current);
  const [isFinalConfirmation, setIsFinalConfirmation] = useState(false);

  useEffect(() => {
    const updateModalScale = () => {
      setModalScale(
        initialModalScale.current *
          (initialDevicePixelRatio.current / (window.devicePixelRatio || 1)),
      );
    };

    window.addEventListener("resize", updateModalScale);
    return () => window.removeEventListener("resize", updateModalScale);
  }, []);

  return (
    <div
      className="delete-account-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`delete-account-modal ${
          isFinalConfirmation ? "delete-account-modal-final" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        style={{ transform: `translate(-50%, -50%) scale(${modalScale})` }}
      >
        {isFinalConfirmation ? (
          <>
            <img
              className="delete-account-character"
              src={otterDeleteImage}
              alt="뒤돌아 떠나는 수달 캐릭터"
            />

            <h2
              className="delete-account-final-message"
              id="delete-account-title"
            >
              지금까지 쌓은 학습 기록이 모두 사라져요.
              <br />
              그래도 탈퇴를 진행할까요?
            </h2>

            <div className="delete-account-actions delete-account-final-actions">
              <button
                className="delete-account-cancel"
                type="button"
                onClick={onClose}
              >
                계속 이용하기
              </button>
              <button
                className="delete-account-confirm"
                type="button"
                onClick={onClose}
              >
                탈퇴하기
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="delete-account-title">정말 탈퇴하시겠어요?</h2>

            <div className="delete-account-info">
              <strong>탈퇴 시 삭제되는 정보</strong>
              <ul>
                {deletedAccountData.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <p className="delete-account-warning">
              회원탈퇴를 진행하면 계정과 학습 기록이 삭제되며,
              <br />
              삭제된 정보는 다시 복구할 수 없어요.
            </p>

            <div className="delete-account-actions">
              <button
                className="delete-account-cancel"
                type="button"
                onClick={onClose}
              >
                계속 이용하기
              </button>
              <button
                className="delete-account-confirm"
                type="button"
                onClick={() => setIsFinalConfirmation(true)}
              >
                탈퇴하기
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
