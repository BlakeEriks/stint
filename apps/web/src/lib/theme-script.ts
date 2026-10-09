/**
 * Runs inline in `<head>` on every page (`app/layout.tsx`), before first
 * paint: stamps the stored theme, resolving System to light or dark, and
 * re-stamps on an OS switch while System is stored. It lives here rather
 * than in `useTheme` so the app follows the OS whichever screen is open.
 *
 * Not in `use-theme.ts`: a server component importing from a `'use client'`
 * module gets a client reference, not the string.
 */
export const THEME_SCRIPT = `(function(){var q=matchMedia('(prefers-color-scheme: light)');function a(){try{var t=localStorage.getItem('stint.theme');if(t==='system')t=q.matches?'light':'dark';if(t==='light'||t==='dark'){var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t}}catch(e){}}a();q.addEventListener('change',a)})()`;
