import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { createProfile, deleteProfile, listProfiles, type Profile } from '../services/api';
import { normalizeProfileForPc3 } from '../services/profileContract';
import './ProfileSelectPage.css';

const LAST_PROFILE_KEY = 'sm_last_profile_id';
const MAX_PROFILES = 10;

export default function ProfileSelectPage() {
  const navigate = useNavigate();
  const {
    activeProfile,
    setActiveProfile,
    setBaselineReady,
    setRoutine,
    setCurrentExerciseIndex,
    setLastResult,
  } = useApp();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function refreshProfiles(preferredSelectedId?: string | null) {
    const response = await listProfiles();
    const loaded = (response.profiles ?? []).map(normalizeProfileForPc3);
    setProfiles(loaded);

    const lastId = preferredSelectedId ?? localStorage.getItem(LAST_PROFILE_KEY);
    if (lastId && loaded.some((profile) => profile.id === lastId)) {
      setSelected(lastId);
    } else {
      setSelected(null);
      localStorage.removeItem(LAST_PROFILE_KEY);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProfilesFromPc3() {
      setLoading(true);
      setError('');
      try {
        const response = await listProfiles();
        if (cancelled) return;
        const loaded = (response.profiles ?? []).map(normalizeProfileForPc3);
        setProfiles(loaded);
        const lastId = localStorage.getItem(LAST_PROFILE_KEY);
        if (lastId && loaded.some((profile) => profile.id === lastId)) setSelected(lastId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfilesFromPc3();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetWorkoutState() {
    setBaselineReady(false);
    setRoutine(null);
    setCurrentExerciseIndex(0);
    setLastResult(null);
  }

  function handleSelect(id: string) {
    if (deletingId) return;
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    const normalized = normalizeProfileForPc3(profile);
    setSelected(id);
    setActiveProfile(normalized);
    localStorage.setItem(LAST_PROFILE_KEY, normalized.id);
    resetWorkoutState();
    navigate('/mode');
  }

  function handleAddProfile() {
    setCreating(true);
    setNewName('');
  }

  async function handleCreateConfirm() {
    const name = newName.trim();
    if (!name) return;
    const newProfile = normalizeProfileForPc3({
      id: `profile_${Date.now()}`,
      name,
      weight_kg: 0,
      height_cm: 0,
      goal: 'build_habit',
      experience_level: 'beginner',
      weekly_frequency: 'three_four',
      limitations: [],
    });
    setError('');
    try {
      const saved = normalizeProfileForPc3(await createProfile(newProfile));
      setSelected(saved.id);
      setCreating(false);
      setActiveProfile(saved);
      localStorage.setItem(LAST_PROFILE_KEY, saved.id);
      resetWorkoutState();
      await refreshProfiles(saved.id);
      navigate('/baseline-check');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteProfile(id: string, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (deletingId) return;

    setError('');
    setDeletingId(id);
    try {
      await deleteProfile(id);
      if (selected === id) setSelected(null);
      if (activeProfile?.id === id) {
        setActiveProfile(null);
        resetWorkoutState();
      }
      if (localStorage.getItem(LAST_PROFILE_KEY) === id) localStorage.removeItem(LAST_PROFILE_KEY);
      await refreshProfiles(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1 className="glow">Smart Mirror</h1>
        <p className="profile-subtitle">프로필을 만들거나 선택해서 운동 홈으로 들어갑니다.</p>
      </div>

      {loading && <div className="profile-hint">PC3에서 프로필을 불러오는 중입니다...</div>}
      {error && <div className="error-notice">{error}</div>}

      <div className="profile-grid" aria-label="프로필 목록">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className={`profile-tile ${selected === profile.id ? 'selected' : ''}`}
            onClick={() => handleSelect(profile.id)}
          >
            <button
              type="button"
              className="profile-delete"
              disabled={deletingId === profile.id}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => void handleDeleteProfile(profile.id, event)}
              title="삭제"
              aria-label={`${profile.name} 삭제`}
            >
              {deletingId === profile.id ? '...' : 'x'}
            </button>
            <div className="profile-avatar">{profile.name.charAt(0).toUpperCase()}</div>
            <div className="profile-name">{profile.name}</div>
            <div className="profile-meta">운동 홈 열기</div>
          </div>
        ))}

        {profiles.length < MAX_PROFILES && !creating && (
          <div className="profile-tile add-tile" onClick={handleAddProfile}>
            <div className="add-icon">+</div>
            <div className="profile-name">프로필 추가</div>
            <div className="profile-meta">새 사용자 만들기</div>
          </div>
        )}

        {creating && (
          <div className="profile-tile creating-tile">
            <input
              className="new-name-input"
              autoFocus
              placeholder="이름 입력"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreateConfirm();
                if (event.key === 'Escape') setCreating(false);
              }}
            />
            <button className="btn-primary confirm-btn" onClick={() => void handleCreateConfirm()}>
              생성
            </button>
          </div>
        )}
      </div>

      <div className="profile-footer">
        <span className="profile-hint">
          프로필과 운동 기록은 PC3에 저장됩니다. PC1을 다시 켜도 PC3에서 목록을 다시 불러옵니다.
        </span>
      </div>
    </div>
  );
}
