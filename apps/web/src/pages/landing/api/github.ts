import { useEffect, useState } from 'react'
import { GITHUB_REPO } from '@/shared/config'

const CACHE_KEY = `parking-vision:github-stars:${GITHUB_REPO}`

function cached(): number | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw === null ? null : Number(raw)
  } catch {
    return null
  }
}

let request: Promise<number | null> | null = null

/** One unauthenticated GitHub API call per page load, shared by every star button. */
function fetchStars(): Promise<number | null> {
  request ??= fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((repo: { stargazers_count?: unknown } | null) => {
      const stars = typeof repo?.stargazers_count === 'number' ? repo.stargazers_count : null
      if (stars !== null) {
        try {
          sessionStorage.setItem(CACHE_KEY, String(stars))
        } catch {
          /* storage blocked: fetch again next visit */
        }
      }
      return stars
    })
    // offline, rate limited or private: the button works without a count
    .catch(() => null)
  return request
}

/** The repo's star count, or null while unknown (or when GitHub can't be reached). */
export function useGitHubStars(): number | null {
  const [stars, setStars] = useState<number | null>(cached)
  useEffect(() => {
    if (stars !== null) return
    let active = true
    void fetchStars().then((count) => {
      if (active && count !== null) setStars(count)
    })
    return () => {
      active = false
    }
  }, [stars])
  return stars
}

export function formatStars(count: number): string {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`
}

/** For tests: forget the in-flight request. */
export function resetGitHubStars() {
  request = null
}
