import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { updateProfile, type Profile } from '../services/api';
import {
  GOAL_OPTIONS,
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  LIMITATION_OPTIONS,
  normalizeLimitations,
  normalizeProfileForPc3,
} from '../services/profileContract';
import './BaselineCheckPage.css';

type Step1 = { weight_kg: string; height_cm: string; goal: string };
type Step2 = { experience_level: string; weekly_frequency: string };
type Step3 = { limitations: string[] };

export default function BaselineCheckPage() {
  const navigate = useNavigate();
  const { activeProfile, setActiveProfile } = useApp();
  const normalizedProfile = activeProfile ? normalizeProfileForPc3(activeProfile) : null;
  const [step, setStep] = useState(1);

  const [s1, setS1] = useState<Step1>({
    weight_kg: String(normalizedProfile?.weight_kg || ''),
    height_cm: String(normalizedProfile?.height_cm || ''),
    goal: normalizedProfile?.goal ?? 'build_habit',
  });
  const [s2, setS2] = useState<Step2>({
    experience_level: normalizedProfile?.experience_level ?? 'beginner',
    weekly_frequency: normalizedProfile?.weekly_frequency ?? 'three_four',
  });
  const [s3, setS3] = useState<Step3>({
    limitations: normalizedProfile?.limitations ?? [],
  });

  function toggleLimitation(value: string) {
    setS3((prev) => {
      if (value === 'none') return { limitations: [] };
      const current = normalizeLimitations(prev.limitations);
      const nextValue = normalizeLimitations([value])[0];
      if (!nextValue) return { limitations: current };
      return {
        limitations: current.includes(nextValue)
          ? current.filter((item) => item !== nextValue)
          : normalizeLimitations([...current, nextValue]),
      };
    });
  }

  function isLimitationSelected(value: string) {
    return value === 'none' ? s3.limitations.length === 0 : s3.limitations.includes(value);
  }

  function isStep1Valid() {
    const weight = parseFloat(s1.weight_kg);
    const height = parseFloat(s1.height_cm);
    return weight > 0 && weight < 300 && height > 0 && height < 250 && s1.goal !== '';
  }

  async function handleFinish() {
    if (!activeProfile) return;
    const updated: Profile = normalizeProfileForPc3({
      ...activeProfile,
      weight_kg: parseFloat(s1.weight_kg),
      height_cm: parseFloat(s1.height_cm),
      goal: s1.goal,
      experience_level: s2.experience_level,
      weekly_frequency: s2.weekly_frequency,
      limitations: normalizeLimitations(s3.limitations),
    });
    const saved = await updateProfile(updated);
    setActiveProfile(normalizeProfileForPc3(saved));
    navigate('/baseline-setup');
  }

  if (!activeProfile) {
    return (
      <div className="baseline-check-page">
        <div className="wizard-container card">
          <h2 className="step-title">프로필이 없습니다</h2>
          <p className="step-desc">먼저 프로필을 생성해 주세요.</p>
          <button className="btn-primary" onClick={() => navigate('/')}>프로필로 돌아가기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="baseline-check-page">
      <div className="wizard-container card">
        <div className="step-indicator">
          {[1, 2, 3].map((item) => (
            <div key={item} className={`step-dot ${step === item ? 'active' : step > item ? 'done' : ''}`} />
          ))}
          <span className="step-label">{step}/3</span>
        </div>

        {step === 1 && (
          <div className="wizard-step">
            <h2 className="step-title">기본 정보</h2>

            <div className="field-group">
              <label>체중</label>
              <div className="input-row">
                <input
                  type="number"
                  className="field-input"
                  placeholder="0"
                  value={s1.weight_kg}
                  onChange={(event) => setS1({ ...s1, weight_kg: event.target.value })}
                  min={1}
                  max={299}
                />
                <span className="unit">kg</span>
              </div>
            </div>

            <div className="field-group">
              <label>키</label>
              <div className="input-row">
                <input
                  type="number"
                  className="field-input"
                  placeholder="0"
                  value={s1.height_cm}
                  onChange={(event) => setS1({ ...s1, height_cm: event.target.value })}
                  min={1}
                  max={249}
                />
                <span className="unit">cm</span>
              </div>
            </div>

            <div className="field-group">
              <label>운동 목표</label>
              <select
                className="field-select"
                value={s1.goal}
                onChange={(event) => setS1({ ...s1, goal: event.target.value })}
              >
                {GOAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="wizard-nav">
              <button className="btn-outline" onClick={() => navigate('/')}>취소</button>
              <button className="btn-primary" disabled={!isStep1Valid()} onClick={() => setStep(2)}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <h2 className="step-title">운동 경험</h2>

            <div className="field-group">
              <label>경험 수준</label>
              <div className="radio-group">
                {EXPERIENCE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`radio-option ${s2.experience_level === option.value ? 'selected' : ''}`}
                    onClick={() => setS2({ ...s2, experience_level: option.value })}
                  >
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label>주간 운동 횟수</label>
              <div className="radio-group">
                {FREQUENCY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`radio-option ${s2.weekly_frequency === option.value ? 'selected' : ''}`}
                    onClick={() => setS2({ ...s2, weekly_frequency: option.value })}
                  >
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="wizard-nav">
              <button className="btn-outline" onClick={() => setStep(1)}>이전</button>
              <button className="btn-primary" onClick={() => setStep(3)}>다음</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step">
            <h2 className="step-title">신체 제한 사항</h2>
            <p className="step-desc">해당하는 항목을 모두 선택하세요.</p>

            <div className="check-group">
              {LIMITATION_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`check-option ${isLimitationSelected(option.value) ? 'selected' : ''}`}
                  onClick={() => toggleLimitation(option.value)}
                >
                  <span className="check-mark">{isLimitationSelected(option.value) ? '✓' : ''}</span>
                  {option.label}
                </label>
              ))}
            </div>

            <div className="wizard-nav">
              <button className="btn-outline" onClick={() => setStep(2)}>이전</button>
              <button className="btn-primary" onClick={() => void handleFinish()}>완료</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
