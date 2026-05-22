import { useNavigate } from "react-router-dom";

type BackButtonProps = {
  fallbackTo?: string;
  label?: string;
  className?: string;
  onBack?: () => void;
  onBeforeBack?: () => void;
};

export default function BackButton({ fallbackTo, label = "이전", className = "", onBack, onBeforeBack }: BackButtonProps) {
  const navigate = useNavigate();

  const goBack = () => {
    onBeforeBack?.();
    if (onBack) {
      onBack();
      return;
    }
    navigate(fallbackTo ?? "/profile-select", { replace: true });
  };

  return (
    <button type="button" className={`back-button ${className}`.trim()} onClick={goBack} aria-label="이전 화면으로 이동">
      <span aria-hidden="true">{"<"}</span>
      {label}
    </button>
  );
}
