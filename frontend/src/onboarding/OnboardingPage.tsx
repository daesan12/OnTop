import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import maleImage from '../assets/onboarding-character-male.png'
import femaleImage from '../assets/onboarding-character-female.png'
import { completeOnboarding, OnboardingError, type CharacterGender } from '../auth/authFlow'
import { useBgmTrack } from '../audio/bgm'
import './onboarding.css'

const nicknamePattern = /^[가-힣A-Za-z0-9]{2,8}$/

function getViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function OnboardingPage({ onComplete, onReturnToLogin }: {
  onComplete: () => void
  onReturnToLogin: () => void
}) {
  useBgmTrack('onboarding')
  const [viewport, setViewport] = useState(getViewport)
  const [gender, setGender] = useState<CharacterGender>('MALE')
  const [nickname, setNickname] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [saving, setSaving] = useState(false)
  const nicknameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const updateViewport = () => setViewport(getViewport())
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  const compact = viewport.width <= 900
  const scale = Math.min(1, viewport.width / 1920, viewport.height / 1080)
  const stageStyle: CSSProperties | undefined = compact ? undefined : {
    width: 1216 * scale,
    height: 700 * scale,
  }
  const cardStyle: CSSProperties | undefined = compact ? undefined : {
    transform: `scale(${scale})`,
  }
  const validNickname = nicknamePattern.test(nickname)
  const expired = errorCode === 'ONBOARDING_EXPIRED' || errorCode === 'USER_ALREADY_REGISTERED'

  const checkNickname = () => {
    setErrorCode('')
    setFeedback(validNickname
      ? '입력 형식이 맞아요. 실제 중복 여부는 공원 입장 시 확인합니다.'
      : '한글, 영문, 숫자로 2~8자 입력해 주세요.')
    if (!validNickname) nicknameRef.current?.focus()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || !validNickname || !agreed || expired) return
    setSaving(true)
    setFeedback('')
    setErrorCode('')
    try {
      await completeOnboarding(nickname, gender)
      onComplete()
    } catch (error) {
      if (error instanceof OnboardingError) {
        setErrorCode(error.code)
        setFeedback(error.message)
        if (error.code === 'USER_NICKNAME_ALREADY_EXISTS') nicknameRef.current?.focus()
      } else {
        setFeedback('네트워크 연결을 확인하고 다시 시도해 주세요.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="onboarding-page">
      <div className="onboarding-stage" style={stageStyle}>
        <section className="onboarding-card" style={cardStyle} aria-labelledby="onboarding-title">
          <header className="onboarding-header">
            <h1 id="onboarding-title">온탑에서 사용할 모습을 정해주세요</h1>
            <p>나를 닮은 캐릭터와 공원에서 불릴 이름을 정하면 공원에 입장할 수 있어요</p>
          </header>

          <div className="onboarding-columns">
            <div className="onboarding-character-section">
              <h2>캐릭터 선택</h2>
              <div className="onboarding-character-options" role="group" aria-label="캐릭터 선택">
                {([
                  { value: 'MALE' as const, label: '남자 캐릭터', image: maleImage },
                  { value: 'FEMALE' as const, label: '여자 캐릭터', image: femaleImage },
                ]).map((option) => (
                  <button
                    className={`onboarding-character${gender === option.value ? ' onboarding-character--selected' : ''}`}
                    type="button"
                    key={option.value}
                    onClick={() => setGender(option.value)}
                    aria-pressed={gender === option.value}
                  >
                    <span className="onboarding-character__indicator" aria-hidden="true">{gender === option.value ? '✓' : ''}</span>
                    <img src={option.image} alt="" />
                    <span className="onboarding-character__label">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <form className="onboarding-form" onSubmit={submit} noValidate>
              <div className="onboarding-name-section">
                <label htmlFor="onboarding-nickname">닉네임</label>
                <p>공원에서 친구들이 부를 이름이에요.</p>
                <div className="onboarding-name-row">
                  <input
                    id="onboarding-nickname"
                    ref={nicknameRef}
                    value={nickname}
                    onChange={(event) => {
                      setNickname(event.target.value)
                      setFeedback('')
                      setErrorCode('')
                    }}
                    maxLength={8}
                    placeholder="사용할 닉네임을 입력해 주세요"
                    autoComplete="nickname"
                    aria-describedby="onboarding-name-help onboarding-feedback"
                    aria-invalid={Boolean(feedback && (!validNickname || errorCode === 'USER_NICKNAME_ALREADY_EXISTS'))}
                  />
                  <button type="button" onClick={checkNickname} disabled={!nickname || saving} title="입력 형식을 확인합니다. 중복 여부는 입장 시 서버에서 최종 확인합니다.">중복 확인</button>
                </div>
                <div id="onboarding-name-help" className="onboarding-name-help">
                  <span>2~8자 · 한글, 영문, 숫자만 사용 가능</span>
                  <span>{nickname.length} / 8</span>
                </div>
                <p id="onboarding-feedback" className={`onboarding-feedback${errorCode || (feedback && !validNickname) ? ' onboarding-feedback--error' : ''}`} role="status" aria-live="polite">{feedback}</p>
              </div>

              <div className="onboarding-notice">
                <strong>캐릭터 성별은 설정 후 변경할 수 없어요</strong>
                <span>닉네임과 옷은 나중에 마이페이지에서 바꿀 수 있어요</span>
              </div>

              <label className="onboarding-agreement">
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                <span>안내를 확인했고, 이 캐릭터로 시작할게요</span>
              </label>

              <div className="onboarding-submit-area">
                {expired ? (
                  <button className="onboarding-submit" type="button" onClick={onReturnToLogin}>다시 로그인하기</button>
                ) : (
                  <button className="onboarding-submit" type="submit" disabled={!validNickname || !agreed || saving}>
                    {saving ? '설정 저장 중…' : '공원 입장하기'}
                  </button>
                )}
                <p>{validNickname && agreed ? '입장할 때 닉네임 중복 여부를 확인해요' : '닉네임 입력과 안내 동의를 완료해 주세요'}</p>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
