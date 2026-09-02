import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { isAccessCodeCorrect } from '../domain/accessCode'

type AccessGateProps = {
  children: ReactNode
}

/**
 * Locks the published site behind the access code. The wrapped app never
 * mounts until the code is correct, so no content or Cesium runtime loads
 * while locked. Unlocking is session-only by design: a reload locks again.
 */
export function AccessGate({ children }: AccessGateProps) {
  const [unlocked, setUnlocked] = useState(false)
  const [attempt, setAttempt] = useState('')
  const [rejected, setRejected] = useState(false)

  if (unlocked) return children

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAccessCodeCorrect(attempt)) {
      setUnlocked(true)
      setRejected(false)
      return
    }
    setRejected(true)
    setAttempt('')
  }

  return (
    <div className="scrap-root access-gate">
      <main className="access-gate__card scrap-polaroid">
        <div className="access-gate__frame bg-[#fffdf8] px-5 pb-5 pt-7 sm:px-8">
          <span className="access-gate__badge" aria-hidden="true">
            <Lock className="size-5" />
          </span>
          <h1 className="scrap-hand mt-4 text-center text-[27px] leading-tight text-[#1b2430]">
            Our World
          </h1>
          <p className="mt-1.5 text-center text-[13.5px] leading-6 text-[#5c6472]">
            这里收着我的旅行记忆，输入密码才能翻开。
          </p>

          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            <label htmlFor="access-code" className="sr-only">
              访问密码
            </label>
            <input
              id="access-code"
              className="access-gate__input w-full rounded-xl border border-[#d9d2c4] bg-white/85 px-4 py-3 text-center text-[21px] tracking-[0.42em] text-[#1b2430] outline-none"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              aria-invalid={rejected}
              aria-describedby={rejected ? 'access-code-error' : undefined}
              placeholder="••••"
              value={attempt}
              onChange={(event) => {
                setAttempt(event.target.value)
                if (rejected) setRejected(false)
              }}
            />
            <button
              type="submit"
              className="access-gate__submit w-full rounded-xl bg-[#1b2430] px-4 py-3 text-[#fffdf6] transition-colors hover:bg-[#2d3a4c]"
            >
              打开
            </button>
          </form>

          <p
            id="access-code-error"
            role="alert"
            className={`access-gate__error${rejected ? '' : ' access-gate__error--idle'}`}
          >
            {rejected ? '密码不对，再试一次。' : ''}
          </p>
        </div>
        <p className="access-gate__foot scrap-hand mt-2.5 text-center text-[13px] text-[#5c6472]">
          私人旅行手账 · 请勿转发
        </p>
      </main>
    </div>
  )
}
