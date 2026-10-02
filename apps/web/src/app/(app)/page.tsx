import { Home } from '@/components/home';

/*
 * Static, like every other section, so switching to it is instant rather
 * than a server round trip each time (Constitution VI). A signed-out visitor
 * is sent to /signin by the first API call's 401, as on every other screen.
 */
export default function Page() {
  return <Home />;
}
