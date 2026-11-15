/**
 * Not in `use-theme.ts`: a server component importing from a `'use client'`
 * module gets a client reference, not the string.
 */
export const THEME_SCRIPT = `(function(){var q=matchMedia('(prefers-color-scheme: light)');function a(){try{var t=localStorage.getItem('stint.theme');if(t==='system')t=q.matches?'light':'dark';if(t==='light'||t==='dark'){var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t}}catch(e){}}a();q.addEventListener('change',a)})()`;

/** Where the dock's fold is kept (`setDockFolded`). */
export const DOCK_FOLD_KEY = 'stint.dock.folded';

/** Stamps the folded dock before first paint, as `THEME_SCRIPT` does the
    theme. */
export const DOCK_FOLD_SCRIPT = `try{if(localStorage.getItem('${DOCK_FOLD_KEY}')==='1')document.documentElement.setAttribute('data-dock-folded','')}catch(e){}`;
