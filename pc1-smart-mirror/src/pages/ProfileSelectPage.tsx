import { useEffect, useMemo, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import WindowControls from "../components/WindowControls";
import { createProfile, deleteProfile, hasRequiredProfileInput, listProfiles, profileNeedsBaseline, updateProfile } from "../services/api";
import { getProfilePhoto, removeProfilePhoto } from "../services/profilePhoto";
import { useAppState } from "../state/AppContext";
import type { UserProfile } from "../types/domain";
import { friendlyError } from "../utils/format";

const MAX_PROFILES = 10;

export default function ProfileSelectPage({ navigate }: { navigate: NavigateFunction }) {
  const app = useAppState();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<UserProfile | null>(null);

  const orderedProfiles = useMemo(
    () => [...app.profiles].sort((left, right) => String(right.lastUsedAt ?? "").localeCompare(String(left.lastUsedAt ?? ""))),
    [app.profiles],
  );

  const selectedProfile = orderedProfiles[selectedIndex] ?? null;
  const previousProfile = orderedProfiles.length > 1 ? orderedProfiles[(selectedIndex - 1 + orderedProfiles.length) % orderedProfiles.length] : null;
  const nextProfile = orderedProfiles.length > 2 ? orderedProfiles[(selectedIndex + 1) % orderedProfiles.length] : null;

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await listProfiles(app.profiles);
      app.setProfiles(loaded);
    } catch (caught) {
      setError(friendlyError(caught, "프로필 목록을 불러오지 못했습니다. 다시 시도해주세요."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (orderedProfiles.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((current) => {
      const activeIndex = orderedProfiles.findIndex((profile) => profile.id === app.activeProfileId);
      if (activeIndex >= 0) {
        return activeIndex;
      }
      return Math.min(current, orderedProfiles.length - 1);
    });
  }, [app.activeProfileId, orderedProfiles]);

  const moveSelection = (direction: -1 | 1) => {
    if (orderedProfiles.length === 0) {
      return;
    }
    setEditingId(null);
    setEditingName("");
    setSelectedIndex((current) => (current + direction + orderedProfiles.length) % orderedProfiles.length);
  };

  const selectOnly = (profile: UserProfile) => {
    app.upsertProfile({ ...profile, lastUsedAt: new Date().toISOString() });
    app.setActiveProfileId(profile.id);
    app.resetWorkout();
  };

  const proceed = () => {
    if (!selectedProfile || loading || error || editingId) {
      return;
    }
    selectOnly(selectedProfile);
    if (!hasRequiredProfileInput(selectedProfile)) {
      navigate("/baseline-check");
      return;
    }
    navigate(profileNeedsBaseline(selectedProfile) ? "/baseline-setup" : "/mode");
  };

  const create = async () => {
    const name = newName.trim();
    if (!name || orderedProfiles.length >= MAX_PROFILES) {
      return;
    }
    setBusyId("new");
    setError(null);
    try {
      const profile = await createProfile(name);
      app.upsertProfile(profile);
      app.setActiveProfileId(profile.id);
      setNewName("");
      navigate("/baseline-check");
    } catch (caught) {
      setError(friendlyError(caught, "프로필을 생성하지 못했습니다. 다시 시도해주세요."));
    } finally {
      setBusyId(null);
    }
  };

  const saveName = async (profile: UserProfile) => {
    const name = editingName.trim();
    if (!name) {
      return;
    }
    setBusyId(profile.id);
    setError(null);
    try {
      const saved = await updateProfile({ ...profile, name });
      app.upsertProfile(saved);
      setEditingId(null);
      setEditingName("");
    } catch (caught) {
      setError(friendlyError(caught, "프로필을 수정하지 못했습니다. 다시 시도해주세요."));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (profile: UserProfile) => {
    setBusyId(profile.id);
    setError(null);
    try {
      await deleteProfile(profile.id);
      removeProfilePhoto(profile.id);
      app.removeProfile(profile.id);
    } catch (caught) {
      setError(friendlyError(caught, "프로필을 삭제하지 못했습니다. 다시 시도해주세요."));
    } finally {
      setBusyId(null);
    }
  };

  const renderProfileCard = (profile: UserProfile | null, variant: "side" | "center", side?: "left" | "right") => {
    if (!profile) {
      if (variant === "side") {
        return <div className="profile-card-spacer" aria-hidden="true" />;
      }

      return (
        <article className="profile-card profile-card--center profile-card--empty">
          <span className="eyebrow">NO PROFILE</span>
          <strong>등록된 프로필 없음</strong>
          <p>하단 입력란에서 이름을 입력한 뒤 프로필 생성 버튼을 눌러주세요.</p>
        </article>
      );
    }

    const editing = editingId === profile.id;
    const enterLabel = `${profile.name} 프로필로 진입`;
    const className = `profile-card profile-card--${variant}${editing ? " is-editing" : ""}`;
    const profilePhoto = getProfilePhoto(profile.id);
    const activateCard = () => {
      if (variant === "center") {
        proceed();
        return;
      }
      moveSelection(side === "left" ? -1 : 1);
    };

    return (
      <article
        key={`${profile.id}-${variant}-${side ?? "center"}`}
        className={className}
        role="button"
        tabIndex={0}
        aria-label={enterLabel}
        onClick={activateCard}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateCard();
          }
        }}
      >
        {variant === "center" ? (
          <button
            type="button"
            className="profile-card__delete"
            aria-label={`${profile.name} 삭제`}
            onClick={(event) => {
              event.stopPropagation();
              setPendingDeleteProfile(profile);
            }}
            disabled={busyId === profile.id}
          >
            x
          </button>
        ) : null}

        <span className={`profile-card__avatar${profilePhoto ? " has-photo" : ""}`}>
          {profilePhoto ? <img src={profilePhoto} alt="" /> : profile.name.slice(0, 1).toUpperCase()}
        </span>

        {editing ? (
          <div className="profile-card__edit" onClick={(event) => event.stopPropagation()}>
            <input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
            <button type="button" className="button button--primary" onClick={() => void saveName(profile)} disabled={busyId === profile.id}>
              저장
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setEditingId(null);
                setEditingName("");
              }}
            >
              취소
            </button>
          </div>
        ) : (
          <>
            <div className="profile-card__copy">
              <span className="eyebrow">{profile.status === "ready" ? "READY" : "BASELINE"}</span>
              <strong>{profile.name}</strong>
              <p>{profile.status === "ready" ? "기준 촬영 완료" : "기준 촬영 필요"}</p>
            </div>
            {variant === "center" ? (
              <div className="profile-card__actions" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="text-button" onClick={proceed} disabled={loading || Boolean(error)}>
                  선택하고 진행
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditingId(profile.id);
                    setEditingName(profile.name);
                  }}
                >
                  이름 수정
                </button>
              </div>
            ) : null}
          </>
        )}
      </article>
    );
  };

  return (
    <main className="profile-carousel-page">
      <WindowControls />

      <header className="profile-carousel-hero">
        <span className="eyebrow">SMART MIRROR</span>
        <h1 className="optical-ko-title">프로필 선택</h1>
      </header>

      <section className="profile-carousel-stage" aria-label="프로필 선택">
        <button type="button" className="carousel-arrow" onClick={() => moveSelection(-1)} disabled={loading || orderedProfiles.length < 2} aria-label="이전 프로필">
          {"<"}
        </button>

        <div className="profile-carousel-track">
          {renderProfileCard(previousProfile, "side", "left")}
          {renderProfileCard(selectedProfile, "center")}
          {renderProfileCard(nextProfile, "side", "right")}
        </div>

        <button type="button" className="carousel-arrow" onClick={() => moveSelection(1)} disabled={loading || orderedProfiles.length < 2} aria-label="다음 프로필">
          {">"}
        </button>
      </section>

      <section className="profile-status-stack" aria-live="polite">
        {loading ? <div className="inline-alert">프로필 목록을 불러오는 중입니다.</div> : null}
        {error ? (
          <div className="inline-alert inline-alert--error">
            <span>{error}</span>
            <button type="button" onClick={() => void reload()}>
              재시도
            </button>
          </div>
        ) : null}
        {!loading && !error && orderedProfiles.length === 0 ? <div className="inline-alert">등록된 프로필이 없습니다.</div> : null}
      </section>

      <section className="profile-create-dock" aria-label="새 프로필 생성">
        <div>
          <span className="eyebrow">NEW PROFILE</span>
          <strong>새 프로필 만들기</strong>
          <em>
            {orderedProfiles.length}/{MAX_PROFILES}
          </em>
        </div>
        <label className="field">
          <span>이름</span>
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="이름 입력" />
        </label>
        <button type="button" className="button button--primary" onClick={() => void create()} disabled={busyId === "new" || orderedProfiles.length >= MAX_PROFILES || !newName.trim()}>
          {busyId === "new" ? "생성 중" : "프로필 생성"}
        </button>
        <button type="button" className="button button--ghost" onClick={() => void reload()} disabled={loading}>
          다시 불러오기
        </button>
      </section>

      {pendingDeleteProfile ? (
        <div className="profile-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="profile-delete-title" onClick={() => setPendingDeleteProfile(null)}>
          <section className="panel" onClick={(event) => event.stopPropagation()}>
            <span className="eyebrow">DELETE PROFILE</span>
            <h2 id="profile-delete-title">정말 삭제할까요?</h2>
            <p>
              <strong>{pendingDeleteProfile.name}</strong> 프로필을 삭제하면 저장된 프로필 목록에서도 제거됩니다.
            </p>
            <div className="footer-actions">
              <button type="button" className="button button--ghost" onClick={() => setPendingDeleteProfile(null)} disabled={busyId === pendingDeleteProfile.id}>
                취소
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  const target = pendingDeleteProfile;
                  void remove(target).finally(() => setPendingDeleteProfile(null));
                }}
                disabled={busyId === pendingDeleteProfile.id}
              >
                {busyId === pendingDeleteProfile.id ? "삭제 중" : "삭제"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
