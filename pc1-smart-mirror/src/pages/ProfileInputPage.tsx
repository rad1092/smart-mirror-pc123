import { useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import BackButton from "../components/BackButton";
import WindowControls from "../components/WindowControls";
import { profileNeedsBaseline, saveBodyMetric, updateProfile } from "../services/api";
import { useAppState } from "../state/AppContext";
import type { ExerciseGoal, ExperienceLevel, Limitation, WeeklyFrequency } from "../types/domain";
import { EXPERIENCE_OPTIONS, FREQUENCY_OPTIONS, friendlyError, GOAL_OPTIONS, LIMITATION_OPTIONS } from "../utils/format";

const STEP_META = [
  { eyebrow: "STEP 1", title: "기본정보", description: "몸무게, 키, 목표를 입력합니다." },
  { eyebrow: "STEP 2", title: "운동 이력", description: "운동 경험과 주간 빈도를 선택합니다." },
  { eyebrow: "STEP 3", title: "제한 부위", description: "불편한 부위가 있으면 선택합니다." },
];

export default function ProfileInputPage({ navigate }: { navigate: NavigateFunction }) {
  const app = useAppState();
  const profile = app.activeProfile;
  const [step, setStep] = useState(1);
  const [weightKg, setWeightKg] = useState(profile?.weightKg ? String(profile.weightKg) : "");
  const [heightCm, setHeightCm] = useState(profile?.heightCm ? String(profile.heightCm) : "");
  const [goal, setGoal] = useState<ExerciseGoal | null>(profile?.goal ?? null);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(profile?.experienceLevel ?? null);
  const [weeklyFrequency, setWeeklyFrequency] = useState<WeeklyFrequency | null>(profile?.weeklyFrequency ?? null);
  const [limitations, setLimitations] = useState<Limitation[]>(profile?.limitations ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    return (
      <main className="profile-wizard-page">
        <BackButton fallbackTo="/profile-select" />
        <WindowControls />
        <section className="profile-wizard-card profile-wizard-card--compact">
          <span className="eyebrow">PROFILE SETUP</span>
          <h1 className="optical-ko-title">프로필을 먼저 선택해주세요.</h1>
          <p>기본정보를 저장하려면 프로필 생성이 먼저 필요합니다.</p>
          <button type="button" className="button button--primary" onClick={() => navigate("/profile-select")}>
            프로필 선택
          </button>
        </section>
      </main>
    );
  }

  const basicValid = Number(weightKg) > 0 && Number(heightCm) > 0 && goal !== null;
  const historyValid = experienceLevel !== null && weeklyFrequency !== null;
  const currentValid = step === 1 ? basicValid : step === 2 ? historyValid : true;
  const meta = STEP_META[step - 1];

  const goBack = () => {
    if (step > 1) {
      setStep((value) => value - 1);
      return;
    }
    navigate("/profile-select", { replace: true });
  };

  const toggleLimitation = (value: Limitation) => {
    setLimitations((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  const save = async () => {
    if (!basicValid || !historyValid) {
      return;
    }
    const nextProfile = {
      ...profile,
      weightKg: Number(weightKg),
      heightCm: Number(heightCm),
      goal,
      experienceLevel,
      weeklyFrequency,
      limitations,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await updateProfile(nextProfile);
      await saveBodyMetric(saved.id, Number(weightKg));
      app.upsertProfile({ ...saved, lastUsedAt: new Date().toISOString() });
      app.setActiveProfileId(saved.id);
      navigate(profileNeedsBaseline(saved) ? "/baseline-setup" : "/mode");
    } catch (caught) {
      setError(friendlyError(caught, "프로필 정보를 저장하지 못했습니다. 다시 시도해주세요."));
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (!currentValid) {
      return;
    }
    if (step < 3) {
      setStep((value) => value + 1);
      return;
    }
    void save();
  };

  return (
    <main className="profile-wizard-page">
      <BackButton fallbackTo="/profile-select" onBack={goBack} />
      <WindowControls />

      <section className="profile-wizard-card">
        <header className="profile-wizard-head">
          <div className="step-dots" aria-label={`입력 단계 ${step}/3`}>
            {[1, 2, 3].map((item) => (
              <span key={item} className={item <= step ? "is-active" : ""} />
            ))}
          </div>
          <span className="eyebrow">{meta.eyebrow}</span>
          <h1 className="optical-ko-title">{meta.title}</h1>
          <p>{profile.name}님의 {meta.description}</p>
        </header>

        <div className="profile-wizard-body">
          {step === 1 ? (
            <div className="form-stack">
              <label className="field">
                <span>몸무게</span>
                <input type="number" min="1" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
                <em>kg</em>
              </label>
              <label className="field">
                <span>키</span>
                <input type="number" min="1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} />
                <em>cm</em>
              </label>
              <div className="wizard-option-group">
                <span className="field-label">운동 목표</span>
                <div className="choice-grid choice-grid--goals">
                  {GOAL_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={goal === option.value ? "is-selected" : ""} onClick={() => setGoal(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="form-stack">
              <div className="wizard-option-group">
                <span className="eyebrow">EXPERIENCE</span>
                <div className="choice-grid">
                  {EXPERIENCE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={experienceLevel === option.value ? "is-selected" : ""} onClick={() => setExperienceLevel(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="wizard-option-group">
                <span className="eyebrow">FREQUENCY</span>
                <div className="choice-grid">
                  {FREQUENCY_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={weeklyFrequency === option.value ? "is-selected" : ""} onClick={() => setWeeklyFrequency(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="form-stack">
              <button type="button" className={limitations.length === 0 ? "choice-wide is-selected" : "choice-wide"} onClick={() => setLimitations([])}>
                없음
              </button>
              <div className="choice-grid">
                {LIMITATION_OPTIONS.map((option) => (
                  <button key={option.value} type="button" className={limitations.includes(option.value) ? "is-selected" : ""} onClick={() => toggleLimitation(option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="profile-wizard-messages" aria-live="polite">
          {error ? <div className="inline-alert inline-alert--error">{error}</div> : null}
        </div>

        <footer className="wizard-actions">
          <button type="button" className="button button--ghost" onClick={goBack}>
            {step > 1 ? "이전" : "프로필 선택"}
          </button>
          <button type="button" className="button button--primary" onClick={goNext} disabled={!currentValid || saving}>
            {step < 3 ? "다음" : saving ? "저장 중" : "저장하고 진행"}
          </button>
        </footer>
      </section>
    </main>
  );
}
